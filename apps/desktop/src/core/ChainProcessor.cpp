#include "ChainProcessor.h"
#include "../audio/BranchGainProcessor.h"
#include "../audio/DryWetMixProcessor.h"
#include "../audio/DuckingProcessor.h"
#include "../audio/LatencyCompensationProcessor.h"
#include "../audio/MidSideMatrixProcessor.h"
#include "../audio/NodeMeterProcessor.h"
#include "../audio/PluginWithMeterWrapper.h"
#include "../utils/ProChainLogger.h"
#include "ParameterDiscovery.h"
#include <cmath>
#include <limits>
#include <set>

// Security limits for chain operations
static constexpr int kMaxChildrenPerGroup = 64;
static constexpr int kMaxTotalPlugins = 128;
static constexpr size_t kMaxPresetBase64Size =
    14 * 1024 * 1024;                                         // ~10MB decoded
static constexpr size_t kMaxPresetSize = 10 * 1024 * 1024;    // 10MB decoded
static constexpr size_t kMaxRecoverySize = 100 * 1024 * 1024; // 100MB
static constexpr int kMaxPendingParams = 2000;

#if JUCE_MAC
#include <objc/message.h>
#include <objc/objc.h>
#endif

//==============================================================================
// Plugin Window for showing native plugin UIs
class ChainProcessor::PluginWindow : public juce::DocumentWindow {
public:
  PluginWindow(juce::AudioProcessorEditor *editor, const juce::String &name,
               ChainNodeId nodeId)
      : DocumentWindow(name, juce::Colours::darkgrey,
                       DocumentWindow::closeButton),
        nodeID(nodeId) {
    setUsingNativeTitleBar(true);
    setContentOwned(editor, true);
    setResizable(editor->isResizable(), false);

    // Standard window flags — appears on taskbar as a real window.
    int styleFlags = juce::ComponentPeer::windowHasTitleBar |
                     juce::ComponentPeer::windowHasCloseButton |
                     juce::ComponentPeer::windowHasDropShadow |
                     juce::ComponentPeer::windowAppearsOnTaskbar;
    addToDesktop(styleFlags);

#if JUCE_MAC
    // Match this child window's NSWindow level to the DAW's host window.
    //
    // DAWs (Ableton, Logic) often place plugin editor windows at an elevated
    // NSWindow level (e.g., floating = 3). Windows created with addToDesktop
    // default to normal level (0). macOS strictly separates z-ordering by
    // level, so toFront() cannot bring a level-0 window above a level-3
    // window — the child plugin appears stuck behind the host editor.
    //
    // Fix: query the current key window's level (which is the DAW/host
    // editor window at this point, before setVisible makes us key) and
    // match it. This keeps child windows in the same z-order tier as the
    // parent, so toFront() works naturally. Unlike the previous hardcoded
    // NSFloatingWindowLevel approach, this adapts to whatever level the
    // host uses and doesn't elevate windows when the host uses normal level.
    if (auto *peer = getPeer()) {
      auto nsView = (id)peer->getNativeHandle();
      if (nsView) {
        auto childNSWindow =
            ((id(*)(id, SEL))objc_msgSend)(nsView, sel_registerName("window"));
        auto nsApp = ((id(*)(id, SEL))objc_msgSend)(
            (id)objc_getClass("NSApplication"),
            sel_registerName("sharedApplication"));
        auto keyWindow = ((id(*)(id, SEL))objc_msgSend)(
            nsApp, sel_registerName("keyWindow"));

        if (childNSWindow && keyWindow && childNSWindow != keyWindow) {
          auto parentLevel = ((long (*)(id, SEL))objc_msgSend)(
              keyWindow, sel_registerName("level"));
          if (parentLevel > 0)
            ((void (*)(id, SEL, long))objc_msgSend)(
                childNSWindow, sel_registerName("setLevel:"), parentLevel);
        }
      }
    }
#endif

    centreWithSize(getWidth(), getHeight());
    setVisible(true);
    toFront(true);
  }

  void closeButtonPressed() override { setVisible(false); }

  ChainNodeId getNodeID() const { return nodeID; }

private:
  ChainNodeId nodeID;
};

//==============================================================================
ChainProcessor::ChainProcessor(PluginManager &pm) : pluginManager(pm) {
  enableAllBuses();

  // Initialize root as an empty Serial group with id=0
  rootNode.id = 0;
  rootNode.name = "Root";
  rootNode.data = GroupData{GroupMode::Serial};

  // Initialize parameter watcher for tracking child plugin knob changes
  parameterWatcher = std::make_unique<PluginParameterWatcher>(
      [this](const juce::String &beforeSnapshot) {
        if (onPluginParameterChangeSettled)
          onPluginParameterChangeSettled(beforeSnapshot);

        // Capture new stable snapshot for next round of changes
        auto alive = aliveFlag;
        juce::Timer::callAfterDelay(100, [this, alive]() {
          if (!alive->load(std::memory_order_acquire))
            return;
          auto snapshot = captureSnapshot();
          auto base64 =
              juce::Base64::toBase64(snapshot.getData(), snapshot.getSize());
          parameterWatcher->updateStableSnapshot(base64);
        });
      });
}

ChainProcessor::~ChainProcessor() noexcept {
  aliveFlag->store(false, std::memory_order_release);

  // Destroy parameter watcher before anything else (it holds listeners)
  parameterWatcher.reset();

  hideAllPluginWindows();

  // Clean up crash recovery temp file on normal exit
  cleanupCrashRecoveryFile();
}

void ChainProcessor::setParameterWatcherSuppressed(bool suppressed) {
  if (parameterWatcher)
    parameterWatcher->setSuppressed(suppressed);
}

void ChainProcessor::clearParameterWatches() {
  if (parameterWatcher)
    parameterWatcher->clearWatches();
}

void ChainProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
  currentSampleRate = sampleRate;
  currentBlockSize = samplesPerBlock;
  AudioProcessorGraph::prepareToPlay(sampleRate, samplesPerBlock);

  // If we're already inside rebuildGraph(), the DAW is calling prepareToPlay()
  // synchronously in response to setLatencySamples(). Don't re-enter
  // rebuildGraph(); instead flag that another rebuild is needed after the
  // current one finishes.
  if (isRebuilding_) {
    PCLOG("prepareToPlay — skipping rebuildGraph (re-entrant, will rebuild "
          "after current)");
    rebuildAgainAfterCurrent_ = true;
    return;
  }

  // Full prepare: SR/block-size changed — all existing plugin nodes must be
  // re-prepared.
  lastRebuildCaller_ = "prepareToPlay";
  rebuildGraph(true);
}

void ChainProcessor::releaseResources() {
  AudioProcessorGraph::releaseResources();
}

void ChainProcessor::processBlock(juce::AudioBuffer<float> &buffer,
                                  juce::MidiBuffer &midi) {
  // Set audioThreadBusy so state-serialization callers (getStateInformation,
  // restoreChainFromXml) can spin-wait for the audio thread to finish its
  // current callback before they call suspendProcessing(true).
  // Topology-change callers (addPlugin, removeNode, etc.) no longer suspend
  // audio; they rely on JUCE's atomic render-sequence swap instead.
  audioThreadBusy.store(true, std::memory_order_release);

  if (isSuspended()) {
    buffer.clear();
    audioThreadBusy.store(false, std::memory_order_release);
    return;
  }

  AudioProcessorGraph::processBlock(buffer, midi);

  // Check if any hosted plugin reported a latency change.
  // Done inside the audioThreadBusy bracket so getNodes() is safe to iterate
  // (the message thread spin-waits on this flag before modifying the graph).
  if (!latencyRefreshNeeded.load(std::memory_order_relaxed)) {
    const auto &meterWrappers = meterWrapperBuffers[meterWrapperReadIndex.load(
        std::memory_order_acquire)];
    for (const auto &entry : meterWrappers) {
      if (entry.wrapper->hasLatencyChanged()) {
        latencyRefreshNeeded.store(true, std::memory_order_release);
        break;
      }
    }
  }

  audioThreadBusy.store(false, std::memory_order_release);
}

//==============================================================================
// Tree-based API
//==============================================================================

bool ChainProcessor::addPlugin(const juce::PluginDescription &desc,
                               ChainNodeId parentId, int insertIndex) {
  jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

  // Validate parent BEFORE acquiring lock (read-only check)
  ChainNode *parent = nullptr;
  {
    const juce::SpinLock::ScopedLockType lock(treeLock);
    parent = ChainNodeHelpers::findById(rootNode, parentId);
    if (!parent || !parent->isGroup())
      return false;
  }

  // Create plugin instance WITHOUT holding lock (can take seconds!)
  PCLOG("addPlugin — loading " + desc.name + " (" + desc.pluginFormatName +
        ")");
  juce::String errorMessage;
  auto instance = pluginManager.createPluginInstance(
      desc, currentSampleRate, currentBlockSize, errorMessage);
  if (!instance) {
    PCLOG("addPlugin — FAILED to create " + desc.name + ": " + errorMessage);
    return false;
  }

  // Wrap plugin with integrated metering — wrapper always declares stereo
  // to the graph and handles channel expansion internally if plugin needs more.
  auto wrapper = std::make_unique<PluginWithMeterWrapper>(std::move(instance));

  auto node = std::make_unique<ChainNode>();
  node->id = nextNodeId++;
  node->name = desc.name;
  PluginLeaf leaf;
  leaf.description = desc;
  leaf.bypassed = false;

  if (auto graphNode = addNode(std::move(wrapper))) {
    leaf.graphNodeId = graphNode->nodeID;
  } else {
    return false;
  }

  node->data = std::move(leaf);

  // Acquire lock only for tree modification
  {
    const juce::SpinLock::ScopedLockType lock(treeLock);

    // Re-validate parent (it could have been deleted during plugin load)
    parent = ChainNodeHelpers::findById(rootNode, parentId);
    if (!parent || !parent->isGroup())
      return false;

    auto &children = parent->getGroup().children;

    // M-15: Limit children per group to prevent resource exhaustion
    if (children.size() >= static_cast<size_t>(kMaxChildrenPerGroup)) {
      PCLOG("addPlugin — rejected: group already has " +
            juce::String(children.size()) + " children (max " +
            juce::String(kMaxChildrenPerGroup) + ")");
      return false;
    }

    if (insertIndex < 0 || insertIndex >= static_cast<int>(children.size()))
      children.push_back(std::move(node));
    else
      children.insert(children.begin() + insertIndex, std::move(node));

    cachedSlotsDirty = true;
  }

  // rebuildGraph() pre-warms the new plugin on the message thread before
  // activating it in the render sequence — no audio suspension or startup
  // silence for existing plugins.
  rebuildGraph();

  PCLOG("addPlugin — notifying chain changed");
  notifyChainChanged();
  if (onParameterBindingChanged) {
    PCLOG("addPlugin — rebinding parameters");
    onParameterBindingChanged();
  }
  PCLOG("addPlugin — done for " + desc.name);
  return true;
}

ChainNodeId ChainProcessor::addDryPath(ChainNodeId parentId, int insertIndex) {
  jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());
  PCLOG("addDryPath — parentId=" + juce::String(parentId));

  ChainNodeId newId = -1;

  {
    const juce::SpinLock::ScopedLockType lock(treeLock);

    auto *parent = ChainNodeHelpers::findById(rootNode, parentId);
    if (!parent || !parent->isGroup() ||
        (parent->getGroup().mode != GroupMode::Parallel &&
         parent->getGroup().mode != GroupMode::FXSelector))
      return -1;

    auto node = std::make_unique<ChainNode>();
    node->id = nextNodeId++;
    node->name = "Dry Path";

    PluginLeaf leaf;
    leaf.isDryPath = true;
    node->data = std::move(leaf);

    newId = node->id;

    auto &children = parent->getGroup().children;
    if (insertIndex < 0 || insertIndex >= static_cast<int>(children.size()))
      children.push_back(std::move(node));
    else
      children.insert(children.begin() + insertIndex, std::move(node));

    cachedSlotsDirty = true;
  }

  rebuildGraph();
  notifyChainChanged();

  PCLOG("addDryPath — done, new nodeId=" + juce::String(newId));
  return newId;
}

bool ChainProcessor::removeNode(ChainNodeId nodeId) {
  jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());
  PCLOG("removeNode — nodeId=" + juce::String(nodeId));

  if (nodeId == 0)
    return false; // Can't remove root

  // Perform tree manipulation with lock held briefly
  {
    const juce::SpinLock::ScopedLockType lock(treeLock);

    auto *parent = ChainNodeHelpers::findParent(rootNode, nodeId);
    if (!parent || !parent->isGroup())
      return false;

    auto &children = parent->getGroup().children;
    for (auto it = children.begin(); it != children.end(); ++it) {
      if ((*it)->id == nodeId) {
        // Close any open windows for plugins in this subtree
        std::vector<const PluginLeaf *> plugins;
        ChainNodeHelpers::collectPlugins(**it, plugins);

        // Collect all ChainNodeIds in the subtree for window cleanup
        std::vector<ChainNodeId> nodeIdsToRemove;
        std::function<void(const ChainNode &)> collectNodeIds =
            [&](const ChainNode &node) {
              nodeIdsToRemove.push_back(node.id);
              if (node.isGroup()) {
                for (const auto &child : node.getGroup().children)
                  collectNodeIds(*child);
              }
            };
        collectNodeIds(**it);

        // Remove graph nodes
        if (onBeforeDeletePlugin)
          onBeforeDeletePlugin();

        for (auto *plug : plugins)
          AudioProcessorGraph::removeNode(plug->graphNodeId);

        // Close windows by direct ChainNodeId match
        for (int w = pluginWindows.size() - 1; w >= 0; --w) {
          ChainNodeId windowNodeId = pluginWindows[w]->getNodeID();
          if (std::find(nodeIdsToRemove.begin(), nodeIdsToRemove.end(),
                        windowNodeId) != nodeIdsToRemove.end()) {
            pluginWindows.remove(w);
          }
        }

        // If it's a group, remove all graph nodes in the subtree
        // (Plugin graph nodes already removed above)

        children.erase(it);
        break;
      }
    }

    cachedSlotsDirty = true;
  } // Release lock before rebuildGraph

  // Rebuild graph WITHOUT holding lock
  rebuildGraph();

  notifyChainChanged();
  if (onParameterBindingChanged)
    onParameterBindingChanged();
  return true;
}

bool ChainProcessor::duplicateNode(ChainNodeId nodeId) {
  jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

  // Gather info WITHOUT holding lock
  juce::PluginDescription description;
  juce::String nodeName;
  bool bypassed = false;
  juce::AudioProcessorGraph::NodeID graphNodeId;
  ChainNodeId parentId = 0;
  int childIndex = -1;

  {
    const juce::SpinLock::ScopedLockType lock(treeLock);

    auto *node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node || !node->isPlugin())
      return false;

    auto *parent = ChainNodeHelpers::findParent(rootNode, nodeId);
    if (!parent || !parent->isGroup())
      return false;

    parentId = parent->id;
    childIndex = ChainNodeHelpers::findChildIndex(*parent, nodeId);
    if (childIndex < 0)
      return false;

    const auto &srcLeaf = node->getPlugin();
    description = srcLeaf.description;
    nodeName = node->name;
    bypassed = srcLeaf.bypassed;
    graphNodeId = srcLeaf.graphNodeId;
  }

  // Capture source plugin state WITHOUT holding lock
  juce::MemoryBlock stateBlock;
  if (auto *srcGraphNode = getNodeForId(graphNodeId)) {
    if (auto *srcProc = srcGraphNode->getProcessor()) {
      // Suspend processing during state capture to prevent corruption
      srcProc->suspendProcessing(true);
      srcProc->getStateInformation(stateBlock);
      srcProc->suspendProcessing(false);
    }
  }

  // Create a new plugin instance WITHOUT holding lock (can take seconds!)
  juce::String errorMessage;
  auto instance = pluginManager.createPluginInstance(
      description, currentSampleRate, currentBlockSize, errorMessage);
  if (!instance)
    return false;

  auto wrapper = std::make_unique<PluginWithMeterWrapper>(std::move(instance));

  auto newNode = std::make_unique<ChainNode>();
  newNode->id = nextNodeId++;
  newNode->name = nodeName;
  PluginLeaf newLeaf;
  newLeaf.description = description;
  newLeaf.bypassed = bypassed;

  // Store state to be applied AFTER prepareToPlay (deferred state restoration)
  if (stateBlock.getSize() > 0)
    newLeaf.pendingPresetData = stateBlock.toBase64Encoding();

  if (auto graphNode = addNode(std::move(wrapper)))
    newLeaf.graphNodeId = graphNode->nodeID;
  else
    return false;

  newNode->data = std::move(newLeaf);

  // Acquire lock only for tree modification
  {
    const juce::SpinLock::ScopedLockType lock(treeLock);

    // Re-validate parent (it could have changed during plugin load)
    auto *parent = ChainNodeHelpers::findById(rootNode, parentId);
    if (!parent || !parent->isGroup())
      return false;

    // Insert right after the source node
    auto &children = parent->getGroup().children;
    children.insert(children.begin() + childIndex + 1, std::move(newNode));

    cachedSlotsDirty = true;
  }

  rebuildGraph();

  // CRITICAL: Apply pending preset data AFTER rebuildGraph() has called
  // prepareToPlay() on all plugins. This ensures the duplicated plugin is fully
  // initialized before state restoration.
  std::vector<PluginLeaf *> allPluginsForState;
  ChainNodeHelpers::collectPluginsMut(rootNode, allPluginsForState);
  for (auto *plug : allPluginsForState) {
    if (plug->pendingPresetData.isNotEmpty()) {
      if (auto gNode = getNodeForId(plug->graphNodeId)) {
        if (auto *processor = gNode->getProcessor()) {
          juce::MemoryBlock state;
          state.fromBase64Encoding(plug->pendingPresetData);
          PCLOG("setStateInfo — " + plug->description.name + " (" +
                juce::String(static_cast<int>(state.getSize())) + " bytes)");
          processor->setStateInformation(state.getData(),
                                         static_cast<int>(state.getSize()));
          PCLOG("setStateInfo — " + plug->description.name + " done");
        }
      }
      plug->pendingPresetData.clear(); // Clear after applying
    }
  }

  // Clear automation bindings for the duplicated slot
  // The duplicated plugin is inserted at childIndex + 1, which becomes
  // a new slot index after rebuildGraph() recalculates the flat list.
  // We call onUnbindSlot to ensure the duplicated plugin starts without
  // inherited DAW automation mappings.
  if (onUnbindSlot) {
    // Calculate the flat slot index for the duplicated node
    // This is approximate - the exact index depends on the tree structure
    // The onParameterBindingChanged callback will do a full rebind anyway
    onUnbindSlot(childIndex + 1);
  }

  notifyChainChanged();
  if (onParameterBindingChanged)
    onParameterBindingChanged();
  return true;
}

bool ChainProcessor::moveNode(ChainNodeId nodeId, ChainNodeId newParentId,
                              int newIndex) {
  jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

  if (nodeId == 0)
    return false;

  // Perform tree manipulation with lock held briefly
  {
    const juce::SpinLock::ScopedLockType lock(treeLock);

    // Can't move a node into its own subtree
    auto *nodePtr = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!nodePtr)
      return false;

    if (ChainNodeHelpers::isDescendant(*nodePtr, newParentId))
      return false;

    auto *newParent = ChainNodeHelpers::findById(rootNode, newParentId);
    if (!newParent || !newParent->isGroup())
      return false;

    auto *oldParent = ChainNodeHelpers::findParent(rootNode, nodeId);
    if (!oldParent || !oldParent->isGroup())
      return false;

    // Extract the node from old parent
    std::unique_ptr<ChainNode> extracted;
    auto &oldChildren = oldParent->getGroup().children;
    for (auto it = oldChildren.begin(); it != oldChildren.end(); ++it) {
      if ((*it)->id == nodeId) {
        extracted = std::move(*it);
        oldChildren.erase(it);
        break;
      }
    }

    if (!extracted)
      return false;

    // Insert into new parent
    auto &newChildren = newParent->getGroup().children;
    if (newIndex < 0 || newIndex >= static_cast<int>(newChildren.size()))
      newChildren.push_back(std::move(extracted));
    else
      newChildren.insert(newChildren.begin() + newIndex, std::move(extracted));

    cachedSlotsDirty = true;
  } // Release lock before rebuildGraph

  // Rebuild graph WITHOUT holding lock
  rebuildGraph();

  notifyChainChanged();
  if (onParameterBindingChanged)
    onParameterBindingChanged();
  return true;
}

ChainNodeId ChainProcessor::insertNodeTree(std::unique_ptr<ChainNode> node,
                                           ChainNodeId parentId,
                                           int insertIndex) {
  jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

  if (!node)
    return -1;

  ChainNodeId newNodeId = -1;

  // Perform tree manipulation with lock held briefly
  {
    const juce::SpinLock::ScopedLockType lock(treeLock);

    auto *parent = ChainNodeHelpers::findById(rootNode, parentId);
    if (!parent || !parent->isGroup())
      return -1;

    // Reassign all IDs in the tree to avoid collisions
    std::function<void(ChainNode &)> reassignIds = [&](ChainNode &n) {
      n.id = nextNodeId++;
      if (n.isGroup()) {
        for (auto &child : n.getGroup().children)
          reassignIds(*child);
      }
    };
    reassignIds(*node);
    newNodeId = node->id;

    // Insert into parent
    auto &children = parent->getGroup().children;
    if (insertIndex < 0 || insertIndex >= static_cast<int>(children.size()))
      children.push_back(std::move(node));
    else
      children.insert(children.begin() + insertIndex, std::move(node));

    cachedSlotsDirty = true;
  } // Release lock before rebuildGraph

  // Rebuild graph WITHOUT holding lock (can take 100-500ms)
  rebuildGraph();

  // Apply any pending preset data after graph is built
  std::vector<PluginLeaf *> allPlugins;
  ChainNodeHelpers::collectPluginsMut(rootNode, allPlugins);
  for (auto *plug : allPlugins) {
    if (plug->pendingPresetData.isNotEmpty()) {
      if (auto gNode = getNodeForId(plug->graphNodeId)) {
        if (auto *processor = gNode->getProcessor()) {
          juce::MemoryBlock state;
          state.fromBase64Encoding(plug->pendingPresetData);
          PCLOG("setStateInfo — " + plug->description.name + " (" +
                juce::String(static_cast<int>(state.getSize())) + " bytes)");
          processor->setStateInformation(state.getData(),
                                         static_cast<int>(state.getSize()));
          PCLOG("setStateInfo — " + plug->description.name + " done");
        }
      }
      plug->pendingPresetData.clear();
    }
  }

  notifyChainChanged();
  if (onParameterBindingChanged)
    onParameterBindingChanged();

  return newNodeId;
}

ChainNodeId
ChainProcessor::createGroup(const std::vector<ChainNodeId> &childIds,
                            GroupMode mode, const juce::String &name) {
  jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

  if (childIds.empty())
    return -1;

  ChainNodeId groupId = -1;

  // Perform tree manipulation with lock held briefly
  {
    const juce::SpinLock::ScopedLockType lock(treeLock);

    // All children must share the same parent
    auto *firstParent = ChainNodeHelpers::findParent(rootNode, childIds[0]);
    if (!firstParent || !firstParent->isGroup())
      return -1;

    for (size_t i = 1; i < childIds.size(); ++i) {
      auto *parent = ChainNodeHelpers::findParent(rootNode, childIds[i]);
      if (parent != firstParent)
        return -1; // Children must share the same parent
    }

    // Find the earliest position among the children
    auto &parentChildren = firstParent->getGroup().children;
    int earliestIndex = static_cast<int>(parentChildren.size());
    for (auto id : childIds) {
      int idx = ChainNodeHelpers::findChildIndex(*firstParent, id);
      if (idx >= 0 && idx < earliestIndex)
        earliestIndex = idx;
    }

    // Extract the children (preserve their original order)
    std::vector<std::unique_ptr<ChainNode>> extracted;
    for (auto it = parentChildren.begin(); it != parentChildren.end();) {
      bool found = false;
      for (auto id : childIds) {
        if ((*it)->id == id) {
          extracted.push_back(std::move(*it));
          it = parentChildren.erase(it);
          found = true;
          break;
        }
      }
      if (!found)
        ++it;
    }

    // Create the group node
    auto group = std::make_unique<ChainNode>();
    group->id = nextNodeId++;
    group->name = name.isEmpty() ? "Group" : name;

    GroupData groupData;
    groupData.mode = mode;
    groupData.dryWetMix = 1.0f;
    groupData.children = std::move(extracted);
    group->data = std::move(groupData);

    // Insert at the earliest position
    if (earliestIndex >= static_cast<int>(parentChildren.size()))
      parentChildren.push_back(std::move(group));
    else
      parentChildren.insert(parentChildren.begin() + earliestIndex,
                            std::move(group));

    groupId = parentChildren[static_cast<size_t>(earliestIndex)]->id;

    // Auto-insert a dry path as the first child for parallel groups
    if (mode == GroupMode::Parallel) {
      auto *groupNode = ChainNodeHelpers::findById(rootNode, groupId);
      if (groupNode && groupNode->isGroup()) {
        auto dryNode = std::make_unique<ChainNode>();
        dryNode->id = nextNodeId++;
        dryNode->name = "Dry Path";

        PluginLeaf dryLeaf;
        dryLeaf.isDryPath = true;
        dryNode->data = std::move(dryLeaf);

        groupNode->getGroup().children.insert(
            groupNode->getGroup().children.begin(), std::move(dryNode));
      }
    }

    cachedSlotsDirty = true;
  } // Release lock before rebuildGraph

  // Rebuild graph WITHOUT holding lock
  rebuildGraph();

  notifyChainChanged();
  if (onParameterBindingChanged)
    onParameterBindingChanged();
  return groupId;
}

bool ChainProcessor::dissolveGroup(ChainNodeId groupId) {
  jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

  if (groupId == 0)
    return false;

  // Perform tree manipulation with lock held briefly
  {
    const juce::SpinLock::ScopedLockType lock(treeLock);

    auto *parent = ChainNodeHelpers::findParent(rootNode, groupId);
    if (!parent || !parent->isGroup())
      return false;

    auto *groupNode = ChainNodeHelpers::findById(rootNode, groupId);
    if (!groupNode || !groupNode->isGroup())
      return false;

    auto &parentChildren = parent->getGroup().children;

    // Find the group's position
    int groupIndex = ChainNodeHelpers::findChildIndex(*parent, groupId);
    if (groupIndex < 0)
      return false;

    // Extract group's children
    auto groupChildren = std::move(groupNode->getGroup().children);

    // Remove the group from parent
    parentChildren.erase(parentChildren.begin() + groupIndex);

    // Insert the group's children at the same position
    for (size_t i = 0; i < groupChildren.size(); ++i) {
      parentChildren.insert(parentChildren.begin() + groupIndex +
                                static_cast<int>(i),
                            std::move(groupChildren[i]));
    }

    cachedSlotsDirty = true;
  } // Release lock before rebuildGraph

  // Rebuild graph WITHOUT holding lock
  rebuildGraph();

  notifyChainChanged();
  if (onParameterBindingChanged)
    onParameterBindingChanged();
  return true;
}

bool ChainProcessor::setGroupMode(ChainNodeId groupId, GroupMode mode) {
  auto *node = ChainNodeHelpers::findById(rootNode, groupId);
  if (!node || !node->isGroup())
    return false;

  node->getGroup().mode = mode;

  rebuildGraph();

  notifyChainChanged();
  return true;
}

bool ChainProcessor::setGroupDryWet(ChainNodeId groupId, float mix) {
  auto *node = ChainNodeHelpers::findById(rootNode, groupId);
  if (!node || !node->isGroup())
    return false;

  node->getGroup().dryWetMix = juce::jlimit(0.0f, 1.0f, mix);

  // If the dry/wet mix node exists, update it directly (no rebuild needed)
  auto &group = node->getGroup();
  if (group.dryWetMixNodeId.uid != 0) {
    if (auto gNode = getNodeForId(group.dryWetMixNodeId)) {
      if (auto *proc =
              dynamic_cast<DryWetMixProcessor *>(gNode->getProcessor()))
        proc->setMix(group.dryWetMix);
    }
  }

  notifyParameterChanged();
  return true;
}

bool ChainProcessor::setGroupWetGain(ChainNodeId groupId, float gainDb) {
  auto *node = ChainNodeHelpers::findById(rootNode, groupId);
  if (!node || !node->isGroup())
    return false;

  auto &group = node->getGroup();
  group.wetGainDb = juce::jlimit(-60.0f, 24.0f, gainDb);

  // Update DryWetMixProcessor directly (no rebuild needed)
  if (group.dryWetMixNodeId.uid != 0) {
    if (auto gNode = getNodeForId(group.dryWetMixNodeId)) {
      if (auto *proc =
              dynamic_cast<DryWetMixProcessor *>(gNode->getProcessor()))
        proc->setWetGainDb(group.wetGainDb);
    }
  }

  notifyParameterChanged();
  return true;
}

bool ChainProcessor::setGroupDucking(ChainNodeId groupId, bool enabled,
                                     float thrDb, float atkMs, float relMs) {
  auto *node = ChainNodeHelpers::findById(rootNode, groupId);
  if (!node || !node->isGroup())
    return false;

  auto &group = node->getGroup();

  // Only allow ducking on parallel groups
  if (group.mode != GroupMode::Parallel)
    return false;

  bool wasEnabled = group.duckEnabled;
  group.duckEnabled = enabled;
  group.duckThresholdDb = juce::jlimit(-60.0f, 0.0f, thrDb);
  group.duckAttackMs = juce::jlimit(0.1f, 500.0f, atkMs);
  group.duckReleaseMs = juce::jlimit(50.0f, 5000.0f, relMs);

  if (enabled && group.duckingNodeId.uid != 0) {
    // Processor exists — update params in-place (no rebuild)
    if (auto gNode = getNodeForId(group.duckingNodeId)) {
      if (auto *proc =
              dynamic_cast<DuckingProcessor *>(gNode->getProcessor())) {
        proc->setThresholdDb(group.duckThresholdDb);
        proc->setAttackMs(group.duckAttackMs);
        proc->setReleaseMs(group.duckReleaseMs);
      }
    } else {
      // Stale node ID — node was removed in a previous rebuild.
      // Clear the ID and schedule a rebuild to re-insert the ducking processor.
      group.duckingNodeId = {};
      scheduleRebuild();
      return true;
    }
  } else if (enabled && !wasEnabled) {
    // Need to rebuild graph to insert the ducking processor
    scheduleRebuild();
    return true;
  } else if (!enabled && wasEnabled) {
    // Need to rebuild graph to remove the ducking processor
    scheduleRebuild();
    return true;
  }

  notifyChainChanged();
  return true;
}

bool ChainProcessor::setBranchGain(ChainNodeId nodeId, float gainDb) {
  auto *node = ChainNodeHelpers::findById(rootNode, nodeId);
  if (!node)
    return false;

  node->branchGainDb = juce::jlimit(-60.0f, 24.0f, gainDb);

  // Update the branch gain processor if it exists (no rebuild needed)
  auto *parent = ChainNodeHelpers::findParent(rootNode, nodeId);
  if (parent && parent->isGroup() &&
      parent->getGroup().mode == GroupMode::Parallel) {
    int childIndex = ChainNodeHelpers::findChildIndex(*parent, nodeId);
    applyBranchEffectiveGain(*node, childIndex, parent->getGroup());
  }

  notifyParameterChanged();
  return true;
}

bool ChainProcessor::setBranchMute(ChainNodeId nodeId, bool mute) {
  auto *node = ChainNodeHelpers::findById(rootNode, nodeId);
  if (!node)
    return false;

  node->mute.store(mute, std::memory_order_relaxed);

  // In/Out toggle: set dry/wet mix to 0.0 (fully dry = effect disabled, signal
  // passes through) The plugin stays loaded and uses CPU (unlike bypass which
  // disconnects it entirely). This preserves latency compensation and allows
  // instant A/B comparison with no audio dropouts.
  if (node->isPlugin()) {
    auto &leaf = node->getPlugin();
    if (auto gNode = getNodeForId(leaf.pluginDryWetNodeId)) {
      if (auto *proc =
              dynamic_cast<DryWetMixProcessor *>(gNode->getProcessor())) {
        // When "out": fully dry (0.0) — signal passes through unprocessed
        // When "in": restore the user's configured dry/wet mix
        proc->setMix(mute ? 0.0f : leaf.dryWetMix);
      }
    }
  }

  // Parallel branch: update branch gain accounting for mute + solo state
  auto *parent = ChainNodeHelpers::findParent(rootNode, nodeId);
  if (parent && parent->isGroup() &&
      parent->getGroup().mode == GroupMode::Parallel) {
    int childIndex = ChainNodeHelpers::findChildIndex(*parent, nodeId);
    applyBranchEffectiveGain(*node, childIndex, parent->getGroup());
  }

  notifyChainChanged();
  return true;
}

// Compute and apply effective BranchGainProcessor gain for a branch,
// taking solo and mute state into account.
// Solo logic: if any sibling is soloed, only soloed branches are audible.
void ChainProcessor::applyBranchEffectiveGain(ChainNode &branch,
                                              int branchIndex,
                                              GroupData &parentGroup) {
  // Check if any child in the parent group is soloed
  bool anySoloed = false;
  for (const auto &child : parentGroup.children)
    if (child->solo) {
      anySoloed = true;
      break;
    }

  float targetGain;
  if (anySoloed)
    // Solo active: only soloed branches pass audio; others silenced
    targetGain = branch.solo ? branch.branchGainDb : -60.0f;
  else
    // Normal mode: respect user mute, otherwise use stored gain
    targetGain = branch.mute.load(std::memory_order_relaxed)
                     ? -60.0f
                     : branch.branchGainDb;

  if (branchIndex >= 0 &&
      branchIndex < static_cast<int>(parentGroup.branchGainNodeIds.size())) {
    if (auto *gNode = getNodeForId(
            parentGroup.branchGainNodeIds[static_cast<size_t>(branchIndex)])) {
      if (auto *proc =
              dynamic_cast<BranchGainProcessor *>(gNode->getProcessor()))
        proc->setGainDb(targetGain);
    }
  }
}

bool ChainProcessor::setBranchSolo(ChainNodeId nodeId, bool solo) {
  {
    const juce::SpinLock::ScopedLockType lock(treeLock);
    auto *node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node)
      return false;

    node->solo = solo;

    // Apply effective gains for all branches in the parent parallel group
    auto *parent = ChainNodeHelpers::findParent(rootNode, nodeId);
    if (parent && parent->isGroup() &&
        parent->getGroup().mode == GroupMode::Parallel) {
      auto &group = parent->getGroup();
      for (int i = 0; i < static_cast<int>(group.children.size()); ++i)
        applyBranchEffectiveGain(*group.children[static_cast<size_t>(i)], i,
                                 group);
    }
  }

  notifyChainChanged();
  return true;
}

bool ChainProcessor::setActiveBranch(ChainNodeId groupId, int branchIndex) {
  auto *node = ChainNodeHelpers::findById(rootNode, groupId);
  if (!node || !node->isGroup())
    return false;

  auto &group = node->getGroup();
  if (group.mode != GroupMode::FXSelector)
    return false;

  if (group.children.empty())
    return false;

  int newIndex =
      juce::jlimit(0, static_cast<int>(group.children.size()) - 1, branchIndex);
  group.activeChildIndex = newIndex;

  // Update BranchGainProcessors directly — SmoothedValue handles crossfade, no
  // rebuild needed
  for (int i = 0; i < static_cast<int>(group.branchGainNodeIds.size()); ++i) {
    auto &gainNodeId = group.branchGainNodeIds[static_cast<size_t>(i)];
    if (gainNodeId.uid == 0)
      continue;

    if (auto gNode = getNodeForId(gainNodeId)) {
      if (auto *proc =
              dynamic_cast<BranchGainProcessor *>(gNode->getProcessor())) {
        float targetDb =
            (i == newIndex)
                ? group.children[static_cast<size_t>(i)]->branchGainDb
                : -60.0f;
        proc->setGainDb(targetDb);
      }
    }
  }

  notifyChainChanged();
  return true;
}

// =============================================
// Per-plugin controls (gain staging, dry/wet, sidechain)
// =============================================

bool ChainProcessor::setNodeInputGain(ChainNodeId nodeId, float gainDb) {
  auto *node = ChainNodeHelpers::findById(rootNode, nodeId);
  if (!node || !node->isPlugin())
    return false;

  auto &leaf = node->getPlugin();
  leaf.inputGainDb = juce::jlimit(-60.0f, 24.0f, gainDb);

  // Gain nodes are always wired — just update the processor value (no rebuild
  // needed)
  if (auto gNode = getNodeForId(leaf.inputGainNodeId)) {
    if (auto *proc = dynamic_cast<BranchGainProcessor *>(gNode->getProcessor()))
      proc->setGainDb(leaf.inputGainDb);
  }

  notifyParameterChanged();
  return true;
}

bool ChainProcessor::setNodeOutputGain(ChainNodeId nodeId, float gainDb) {
  auto *node = ChainNodeHelpers::findById(rootNode, nodeId);
  if (!node || !node->isPlugin())
    return false;

  auto &leaf = node->getPlugin();
  leaf.outputGainDb = juce::jlimit(-60.0f, 24.0f, gainDb);

  // Gain nodes are always wired — just update the processor value (no rebuild
  // needed)
  if (auto gNode = getNodeForId(leaf.outputGainNodeId)) {
    if (auto *proc = dynamic_cast<BranchGainProcessor *>(gNode->getProcessor()))
      proc->setGainDb(leaf.outputGainDb);
  }

  notifyParameterChanged();
  return true;
}

bool ChainProcessor::setNodeAutoGain(ChainNodeId nodeId, bool enabled) {
  auto *node = ChainNodeHelpers::findById(rootNode, nodeId);
  if (!node || !node->isPlugin())
    return false;

  auto &leaf = node->getPlugin();

  if (enabled) {
    // Enabling: just set the flag, the timer loop will drive compensation
    leaf.autoGainEnabled = true;
  } else {
    // Disabling: bake the current auto-computed gain as the manual value
    // (the output gain already holds the compensation value, so just clear the flag)
    leaf.autoGainEnabled = false;
  }

  notifyChainChanged();
  return true;
}

bool ChainProcessor::getNodeAutoGain(ChainNodeId nodeId) const {
  auto *node = ChainNodeHelpers::findById(rootNode, nodeId);
  if (!node || !node->isPlugin())
    return false;

  return node->getPlugin().autoGainEnabled;
}

bool ChainProcessor::setNodeDryWet(ChainNodeId nodeId, float mix) {
  auto *node = ChainNodeHelpers::findById(rootNode, nodeId);
  if (!node || !node->isPlugin())
    return false;

  auto &leaf = node->getPlugin();
  leaf.dryWetMix = juce::jlimit(0.0f, 1.0f, mix);

  // Update existing DryWetMixProcessor (always wired since init)
  // If muted, keep the processor at 0.0 (fully dry) — the stored value will be
  // restored when the user unmutes
  if (!node->mute.load(std::memory_order_relaxed)) {
    if (auto gNode = getNodeForId(leaf.pluginDryWetNodeId)) {
      if (auto *proc =
              dynamic_cast<DryWetMixProcessor *>(gNode->getProcessor()))
        proc->setMix(leaf.dryWetMix);
    }
  }

  notifyParameterChanged();
  return true;
}

bool ChainProcessor::setNodeMidSideMode(ChainNodeId nodeId, int mode) {
  if (mode < 0 || mode > 3)
    return false;

  auto *node = ChainNodeHelpers::findById(rootNode, nodeId);
  if (!node || !node->isPlugin())
    return false;

  auto &leaf = node->getPlugin();
  leaf.midSideMode = static_cast<MidSideMode>(mode);

  // Requires graph rebuild to insert/remove M/S encode/decode nodes
  rebuildGraph();

  notifyChainChanged();
  return true;
}

void ChainProcessor::setNodeBypassed(ChainNodeId nodeId, bool bypassed) {
  {
    const juce::SpinLock::ScopedLockType lock(treeLock);
    auto *node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node)
      return;

    if (node->isPlugin())
      node->getPlugin().bypassed = bypassed;
    else if (node->isGroup())
      node->getGroup().bypassed = bypassed;
    else
      return;
  }

  // Deferred rebuild — coalesces rapid bypass toggles (e.g. setAllBypass).
  // ~16ms delay is imperceptible. Full rebuild needed because bypassed plugins
  // are disconnected in wireNode() for zero CPU and correct latency reporting.
  scheduleRebuild();
}

std::vector<PluginLeaf *> ChainProcessor::getFlatPluginList() {
  std::vector<PluginLeaf *> result;
  ChainNodeHelpers::collectPluginsMut(rootNode, result);
  return result;
}

std::vector<const PluginLeaf *> ChainProcessor::getFlatPluginList() const {
  std::vector<const PluginLeaf *> result;
  ChainNodeHelpers::collectPlugins(rootNode, result);
  return result;
}

std::vector<ChainNodeId> ChainProcessor::getFlatPluginNodeIds() const {
  std::vector<ChainNodeId> result;
  struct Collector {
    static void collect(const ChainNode &node, std::vector<ChainNodeId> &ids) {
      if (node.isPlugin())
        ids.push_back(node.id);
      else if (node.isGroup())
        for (const auto &child : node.getGroup().children)
          collect(*child, ids);
    }
  };
  Collector::collect(rootNode, result);
  return result;
}

//==============================================================================
// Backward-compatible flat API
//==============================================================================

bool ChainProcessor::addPlugin(const juce::PluginDescription &desc,
                               int insertIndex) {
  return addPlugin(desc, 0, insertIndex); // Add to root group
}

bool ChainProcessor::removePlugin(int slotIndex) {
  auto nodeId = getNodeIdByFlatIndex(slotIndex);
  if (nodeId < 0)
    return false;

  // Hide window by slot index before removing
  hidePluginWindow(slotIndex);

  return removeNode(nodeId);
}

bool ChainProcessor::movePlugin(int fromIndex, int toIndex) {
  jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

  // Perform tree manipulation with lock held briefly
  {
    const juce::SpinLock::ScopedLockType lock(treeLock);

    // For flat API compat, move within the root group
    auto &rootChildren = rootNode.getGroup().children;
    if (fromIndex < 0 || fromIndex >= static_cast<int>(rootChildren.size()) ||
        toIndex < 0 || toIndex >= static_cast<int>(rootChildren.size()) ||
        fromIndex == toIndex)
      return false;

    auto node = std::move(rootChildren[static_cast<size_t>(fromIndex)]);
    rootChildren.erase(rootChildren.begin() + fromIndex);
    rootChildren.insert(rootChildren.begin() + toIndex, std::move(node));

    cachedSlotsDirty = true;
  } // Release lock before rebuildGraph

  // Rebuild graph WITHOUT holding lock
  rebuildGraph();

  notifyChainChanged();
  if (onParameterBindingChanged)
    onParameterBindingChanged();
  return true;
}

void ChainProcessor::setSlotBypassed(int slotIndex, bool bypassed) {
  auto nodeId = getNodeIdByFlatIndex(slotIndex);
  if (nodeId >= 0)
    setNodeBypassed(nodeId, bypassed);
}

void ChainProcessor::showPluginWindow(ChainNodeId nodeId) {
  auto *node = ChainNodeHelpers::findById(rootNode, nodeId);

  // If not found as node ID, try as flat slot index (backward compat)
  if (!node || !node->isPlugin()) {
    auto resolvedId = getNodeIdByFlatIndex(nodeId);
    if (resolvedId >= 0) {
      node = ChainNodeHelpers::findById(rootNode, resolvedId);
      if (node && node->isPlugin())
        nodeId = resolvedId;
      else
        return;
    } else {
      return;
    }
  }

  // Check if window already exists
  for (auto *window : pluginWindows) {
    if (window->getNodeID() == nodeId) {
      window->setVisible(true);
      window->toFront(true);
      return;
    }
  }

  if (auto gNode = getNodeForId(node->getPlugin().graphNodeId)) {
    // PHASE 7: Unwrap to get the raw plugin for editor creation
    juce::AudioProcessor *processor = nullptr;
    if (auto *wrapperProc =
            dynamic_cast<PluginWithMeterWrapper *>(gNode->getProcessor())) {
      processor = wrapperProc->getWrappedPlugin();
    } else {
      // Fallback for non-wrapped plugins (shouldn't happen with Phase 7)
      processor = gNode->getProcessor();
    }

    if (processor && processor->hasEditor()) {
      if (auto *editor = processor->createEditor()) {
        auto windowName =
            node->getPlugin().description.name + " [" + node->name + "]";
        pluginWindows.add(new PluginWindow(editor, windowName, nodeId));
      }
    }
  }
}

void ChainProcessor::hidePluginWindow(ChainNodeId nodeId) {
  // Try as node ID first
  for (int i = pluginWindows.size() - 1; i >= 0; --i) {
    if (pluginWindows[i]->getNodeID() == nodeId) {
      pluginWindows.remove(i);
      return;
    }
  }

  // Fallback: try as flat slot index
  auto resolvedId = getNodeIdByFlatIndex(nodeId);
  if (resolvedId >= 0) {
    for (int i = pluginWindows.size() - 1; i >= 0; --i) {
      if (pluginWindows[i]->getNodeID() == resolvedId) {
        pluginWindows.remove(i);
        return;
      }
    }
  }
}

void ChainProcessor::hideAllPluginWindows() { pluginWindows.clear(); }

//==============================================================================
// Chain-level toggle controls
//==============================================================================

void ChainProcessor::toggleAllBypass() {
  auto state = getBypassState();

  // If ANY are active (not bypassed), bypass all. If ALL are bypassed, enable
  // all.
  bool shouldBypass = !state.allBypassed;
  setAllBypass(shouldBypass);
}

void ChainProcessor::setAllBypass(bool bypassed) {
  {
    const juce::SpinLock::ScopedLockType lock(treeLock);
    std::vector<PluginLeaf *> plugins;
    ChainNodeHelpers::collectPluginsMut(rootNode, plugins);

    for (auto *leaf : plugins)
      leaf->bypassed = bypassed;
  }

  // Single deferred rebuild for all bypass changes
  scheduleRebuild();
}

ChainProcessor::BypassState ChainProcessor::getBypassState() const {
  std::vector<const PluginLeaf *> plugins;
  ChainNodeHelpers::collectPlugins(rootNode, plugins);

  BypassState state;
  if (plugins.empty())
    return state;

  bool allBypassed = true;
  bool anyBypassed = false;

  for (const auto *leaf : plugins) {
    if (leaf->bypassed)
      anyBypassed = true;
    else
      allBypassed = false;
  }

  state.allBypassed = allBypassed;
  state.anyBypassed = anyBypassed;
  return state;
}

//==============================================================================
// PHASE 2: Conditional Metering - Set global meter mode
//==============================================================================

void ChainProcessor::setGlobalMeterMode(MeterMode mode) {
  // Only called from the message thread (via WebViewBridge), so no lock needed.
  // Tree mutations also only happen on the message thread — no concurrent
  // access.
  jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

  const bool enableLufs = (mode == MeterMode::FullLUFS);

  // Collect meter node IDs from the tree (lightweight — just reading IDs)
  std::vector<juce::AudioProcessorGraph::NodeID> meterNodeIds;
  std::function<void(const ChainNode &)> collectMeterIds =
      [&](const ChainNode &node) {
        if (node.isPlugin()) {
          const auto &leaf = node.getPlugin();
          if (leaf.meterNodeId != juce::AudioProcessorGraph::NodeID())
            meterNodeIds.push_back(leaf.meterNodeId);
          if (leaf.inputMeterNodeId != juce::AudioProcessorGraph::NodeID())
            meterNodeIds.push_back(leaf.inputMeterNodeId);
        } else if (node.isGroup()) {
          for (const auto &child : node.getGroup().children)
            collectMeterIds(*child);
        }
      };

  collectMeterIds(rootNode);

  // Now do the heavyweight getNodeForId + dynamic_cast without any lock
  for (auto nodeId : meterNodeIds) {
    if (auto *meterNode = getNodeForId(nodeId)) {
      if (auto *meterProc =
              dynamic_cast<NodeMeterProcessor *>(meterNode->getProcessor()))
        meterProc->setEnableLUFS(enableLufs);
    }
  }
}

int ChainProcessor::getNumSlots() const {
  return ChainNodeHelpers::countPlugins(rootNode);
}

const PluginSlot *ChainProcessor::getSlot(int index) const {
  if (cachedSlotsDirty)
    rebuildCachedSlots();

  if (index >= 0 && index < static_cast<int>(cachedSlots.size()))
    return cachedSlots[static_cast<size_t>(index)].get();
  return nullptr;
}

PluginSlot *ChainProcessor::getSlot(int index) {
  if (cachedSlotsDirty)
    rebuildCachedSlots();

  if (index >= 0 && index < static_cast<int>(cachedSlots.size()))
    return cachedSlots[static_cast<size_t>(index)].get();
  return nullptr;
}

juce::AudioProcessor *ChainProcessor::getSlotProcessor(int slotIndex) {
  auto *leaf = getPluginByFlatIndex(slotIndex);
  if (!leaf)
    return nullptr;

  if (auto gNode = getNodeForId(leaf->graphNodeId)) {
    // Unwrap PluginWithMeterWrapper to return the raw plugin instance
    // (callers need parameter access which lives on the wrapped plugin)
    if (auto *wrapper =
            dynamic_cast<PluginWithMeterWrapper *>(gNode->getProcessor()))
      return wrapper->getWrappedPlugin();
    return gNode->getProcessor();
  }

  return nullptr;
}

juce::AudioProcessor *ChainProcessor::getNodeProcessor(ChainNodeId nodeId) {
  auto *node = ChainNodeHelpers::findById(rootNode, nodeId);
  if (!node || !node->isPlugin())
    return nullptr;

  if (auto gNode = getNodeForId(node->getPlugin().graphNodeId)) {
    // Unwrap PluginWithMeterWrapper to return the raw plugin instance
    if (auto *wrapper =
            dynamic_cast<PluginWithMeterWrapper *>(gNode->getProcessor()))
      return wrapper->getWrappedPlugin();
    return gNode->getProcessor();
  }

  return nullptr;
}

//==============================================================================
// Graph wiring
//==============================================================================

void ChainProcessor::removeUtilityNodes(UpdateKind update) {
  for (auto nodeId : utilityNodes)
    AudioProcessorGraph::removeNode(nodeId, update);
  utilityNodes.clear();
}

void ChainProcessor::rebuildGraph(bool fullPrepare) {
  auto rebuildStartTime = juce::Time::getMillisecondCounterHiRes();
  auto childCount = rootNode.isGroup()
                        ? static_cast<int>(rootNode.getGroup().children.size())
                        : -1;
  PCLOG("rebuildGraph — start (nodes=" + juce::String(getNodes().size()) +
        " fullPrepare=" + juce::String(fullPrepare ? 1 : 0) +
        " rootChildren=" + juce::String(childCount) +
        " caller=" + juce::String(lastRebuildCaller_) + " treeModInProgress=" +
        juce::String(treeModificationInProgress_ ? 1 : 0) + ")");
  // Reset caller tag so next untagged call shows "treeMutation" (default)
  lastRebuildCaller_ = "treeMutation";
  jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

  // Re-entrancy guard: if we're already rebuilding (e.g., DAW called
  // prepareToPlay synchronously from setLatencySamples), skip and let the outer
  // call handle it.
  if (isRebuilding_) {
    PCLOG("rebuildGraph — skipping (re-entrant call detected)");
    rebuildAgainAfterCurrent_ = true;
    return;
  }

  isRebuilding_ = true;
  rebuildAgainAfterCurrent_ = false;

  // -----------------------------------------------------------------------
  // Zero-dip architecture:
  // Snapshot which PluginWithMeterWrapper nodes already exist in the graph
  // (i.e., they were prepared on a previous rebuild). Existing plugin nodes
  // do NOT need prepareToPlay() for topology-only changes — calling it would
  // reset their startupSilenceBlocks counter and cause brief audio dropouts.
  // New nodes are pre-warmed on the message thread BEFORE rebuild() activates
  // them in the render sequence, so they are ready immediately with no silence.
  // fullPrepare=true (called from ChainProcessor::prepareToPlay) skips this
  // optimisation and re-prepares every node with the new sample rate / block
  // size.
  // -----------------------------------------------------------------------
  std::set<juce::AudioProcessorGraph::NodeID> alreadyPrepared;
  if (!fullPrepare) {
    for (auto *graphNode : getNodes())
      if (dynamic_cast<PluginWithMeterWrapper *>(graphNode->getProcessor()))
        alreadyPrepared.insert(graphNode->nodeID);
  }

  // JUCE's rebuild() uses RenderSequenceExchange — a wait-free try-lock swap of
  // the render sequence pointer. The audio thread keeps running on the OLD
  // sequence until rebuild() is called; the new sequence takes effect on the
  // very next callback. No suspendProcessing() needed for topology changes.

  // NOTE: Do NOT call releaseResources() here. The old render sequence may
  // still be referenced by the audio thread until rebuild() atomically swaps
  // it. Calling releaseResources() before that swap invalidates buffers
  // mid-render → crash. prepareToPlay() after rebuild() handles
  // reinitialization safely.

  // Use UpdateKind::none for all intermediate operations to avoid rebuilding
  // the internal render sequence after every single change. We call rebuild()
  // once at the end for an atomic, glitch-free update.
  constexpr auto deferred = UpdateKind::none;

  // Remove all connections
  for (auto &connection : getConnections())
    removeConnection(connection, deferred);

  // Remove utility nodes from previous wiring
  removeUtilityNodes(deferred);

  // Remove I/O nodes if they exist
  if (audioInputNode.uid != 0)
    AudioProcessorGraph::removeNode(audioInputNode, deferred);
  if (audioOutputNode.uid != 0)
    AudioProcessorGraph::removeNode(audioOutputNode, deferred);
  // Create I/O nodes (audio only — no MIDI needed for an effects host)
  if (auto audioIn = addNode(
          std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
              juce::AudioProcessorGraph::AudioGraphIOProcessor::audioInputNode),
          {}, deferred))
    audioInputNode = audioIn->nodeID;

  if (auto audioOut = addNode(
          std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
              juce::AudioProcessorGraph::AudioGraphIOProcessor::
                  audioOutputNode),
          {}, deferred))
    audioOutputNode = audioOut->nodeID;

  // Wire the root group (all wire* methods now use deferred updates)
  auto result = wireNode(rootNode, audioInputNode);

  // Connect last output to audio output
  addConnection({{result.audioOut, 0}, {audioOutputNode, 0}}, deferred);
  addConnection({{result.audioOut, 1}, {audioOutputNode, 1}}, deferred);

  // Pre-warm NEW plugin nodes BEFORE activating them in the render sequence.
  // Because they aren't in the render sequence yet, calling prepareToPlay() and
  // processBlock() here is thread-safe (audio thread cannot reach them).
  // Running the warmup blocks on the message thread consumes
  // startupSilenceBlocks so the plugins produce correct output the instant they
  // enter the audio path.
  //
  // Also wire the onLatencyDetected callback on every wrapper (new and
  // existing) so that latency changes reported by the plugin's
  // audioProcessorChanged() listener — which fires on the message thread even
  // with the transport stopped — propagate directly to latencyRefreshNeeded
  // without requiring processBlock() to be running. This closes the gap where
  // e.g. Pro-Q 4 enabling its spectral mode while stopped would never trigger a
  // PDC update in the DAW.
  for (auto *graphNode : getNodes()) {
    if (auto *wrapper =
            dynamic_cast<PluginWithMeterWrapper *>(graphNode->getProcessor())) {
      wrapper->onLatencyDetected = [this]() {
        latencyRefreshNeeded.store(true, std::memory_order_release);
      };
    }
  }

  for (auto *graphNode : getNodes()) {
    if (alreadyPrepared.count(graphNode->nodeID))
      continue;
    if (auto *wrapper =
            dynamic_cast<PluginWithMeterWrapper *>(graphNode->getProcessor())) {
      // Propagate the DAW play head to the wrapper BEFORE prepareToPlay.
      // The wrapper isn't in the render sequence yet, so JUCE hasn't set its
      // play head. Without this, wrappedPlugin->setPlayHead(getPlayHead())
      // inside prepareToPlay and processBlock both propagate nullptr, which
      // means AU transport callbacks (e.g. from CFRunLoopTimer) during
      // AudioUnitInitialize see a null play head. JUCE's getFromPlayHead()
      // should return {} for nullptr, but certain JUCE 8 paths dereference
      // without checking, producing KERN_INVALID_ADDRESS (crash 4).
      wrapper->setPlayHead(getPlayHead());

      wrapper->prepareToPlay(currentSampleRate, currentBlockSize);

      // Consume warmup blocks synchronously — fast (< 1ms for most plugins)
      if (wrapper->getStartupSilenceBlocks() > 0) {
        juce::AudioBuffer<float> warmupBuf(2, currentBlockSize);
        juce::MidiBuffer emptyMidi;
        while (wrapper->getStartupSilenceBlocks() > 0) {
          warmupBuf.clear();
          wrapper->processBlock(warmupBuf, emptyMidi);
        }
        PCLOG("rebuildGraph — pre-warmed new plugin: " +
              juce::String(graphNode->getProcessor()->getName()));
      }
    }
  }

  // Single atomic rebuild of the render sequence.
  // After this call the audio thread uses the new topology on its next
  // callback.
  rebuild();

  // Assert no cycles in debug builds
  jassert(!detectCycles());

  // Selective prepareToPlay after rebuild:
  //   • New plugin nodes: already pre-warmed above — skip to avoid
  //   double-prepare. • Existing plugin nodes: only re-prepare when
  //   fullPrepare=true (SR/block-size change). • Utility / I-O nodes: always
  //   prepare — they were freshly created during wiring.
  for (auto *graphNode : getNodes()) {
    auto *proc = graphNode->getProcessor();
    if (!proc)
      continue;

    if (dynamic_cast<PluginWithMeterWrapper *>(proc)) {
      // New plugins were pre-warmed before rebuild() — nothing more to do.
      if (alreadyPrepared.count(graphNode->nodeID) == 0)
        continue;
      // Existing plugins only need re-preparation on full prepare.
      if (fullPrepare)
        proc->prepareToPlay(currentSampleRate, currentBlockSize);
    } else {
      // Utility/IO nodes are freshly created each rebuild — always prepare.
      proc->prepareToPlay(currentSampleRate, currentBlockSize);
    }
  }

  // PHASE 5: Invalidate latency cache after graph rebuild
  invalidateLatencyCache();

  // Capture the JUCE graph's internally-computed latency BEFORE we overwrite
  // it.  The RenderSequenceBuilder set this value during the graph build via
  // AudioProcessorGraph::setLatencySamples().  If it differs from our
  // computeNodeLatency() walk, internal PDC alignment won't match what we
  // report to the DAW — a potential root cause for sync issues.
  int juceGraphLatency = AudioProcessorGraph::getLatencySamples();

  // CRITICAL FIX: Report updated total latency to DAW after graph changes.
  // Safety net: if the tree is in a transitional state (modification in
  // progress), skip reporting latency to the DAW to avoid PDC yo-yo. The
  // actual rebuild after tree modification completes will report the correct
  // latency.
  int totalLatency = getTotalLatencySamples();
  if (!treeModificationInProgress_)
    setLatencySamples(totalLatency);

  auto rebuildElapsedMs = juce::Time::getMillisecondCounterHiRes() - rebuildStartTime;
  PCLOG("rebuildGraph — done (nodes=" + juce::String(getNodes().size()) +
        " latency=" + juce::String(totalLatency) +
        " juceGraphLatency=" + juce::String(juceGraphLatency) +
        " elapsed=" + juce::String(rebuildElapsedMs, 1) + "ms" +
        (totalLatency != juceGraphLatency ? " *** MISMATCH ***" : "") +
        (treeModificationInProgress_ ? " SKIPPED-PDC-REPORT" : "") + ")");

  // Log per-plugin latency breakdown for diagnostics
  {
    auto plugins = getFlatPluginList();
    juce::String latencyBreakdown;
    for (auto *plug : plugins) {
      if (plug && plug->graphNodeId.uid != 0) {
        if (auto gNode = getNodeForId(plug->graphNodeId)) {
          if (auto *proc = gNode->getProcessor()) {
            int lat = proc->getLatencySamples();
            if (lat > 0)
              latencyBreakdown +=
                  " " + plug->description.name + "=" + juce::String(lat);
          }
        }
      }
    }
    if (latencyBreakdown.isNotEmpty())
      PCLOG("rebuildGraph — latency breakdown:" + latencyBreakdown);
  }

  // Re-register parameter watcher on all plugin instances
  if (parameterWatcher) {
    parameterWatcher->clearWatches();
    auto plugins = getFlatPluginList();
    for (auto *leaf : plugins) {
      if (leaf && leaf->graphNodeId.uid != 0) {
        if (auto *graphNode = getNodeForId(leaf->graphNodeId)) {
          // Unwrap to watch the raw plugin's parameters (wrapper has none)
          if (auto *wrapper = dynamic_cast<PluginWithMeterWrapper *>(
                  graphNode->getProcessor()))
            parameterWatcher->watchProcessor(wrapper->getWrappedPlugin());
          else if (auto *proc = graphNode->getProcessor())
            parameterWatcher->watchProcessor(proc);
        }
      }
    }

    // Schedule deferred stable snapshot update (after prepareToPlay settles)
    auto alive = aliveFlag;
    juce::Timer::callAfterDelay(100, [this, alive]() {
      if (!alive->load(std::memory_order_acquire))
        return;
      auto snapshot = captureSnapshot();
      auto base64 =
          juce::Base64::toBase64(snapshot.getData(), snapshot.getSize());
      parameterWatcher->updateStableSnapshot(base64);
    });
  }

  // Update cached meter wrapper pointers (avoids DFS + dynamic_cast in
  // processBlock)
  updateMeterWrapperCache();

  // Clear re-entrancy guard. If prepareToPlay() was called re-entrantly during
  // this rebuild (e.g., DAW responded to setLatencySamples()), perform one
  // additional rebuild now with the updated sample rate / block size.
  isRebuilding_ = false;

  if (rebuildAgainAfterCurrent_) {
    PCLOG("rebuildGraph — performing deferred re-entrant rebuild "
          "(fullPrepare=true)");
    rebuildAgainAfterCurrent_ = false;
    // The re-entrant call came from prepareToPlay() triggered by
    // setLatencySamples(). A new sample rate or block size may be in effect —
    // always do a full prepare.
    lastRebuildCaller_ = "reentrant-deferred";
    rebuildGraph(true);
  }
}

// ---------------------------------------------------------------------------
// Deferred rebuild — coalesces rapid graph mutations into a single rebuild.
// Posts ONE callAsync callback. If multiple scheduleRebuild() calls happen
// before the callback fires, only one rebuild occurs.
// ---------------------------------------------------------------------------
void ChainProcessor::scheduleRebuild() {
  jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

  // If inside a batch, just flag and let endBatch() handle it
  if (batchDepth > 0) {
    rebuildNeeded.store(true, std::memory_order_relaxed);
    return;
  }

  rebuildNeeded.store(true, std::memory_order_relaxed);

  // Only post one callback — guard with rebuildScheduled
  bool expected = false;
  if (rebuildScheduled.compare_exchange_strong(expected, true,
                                               std::memory_order_acq_rel)) {
    auto alive = aliveFlag;
    juce::MessageManager::callAsync([this, alive]() {
      if (!alive->load(std::memory_order_acquire))
        return;

      rebuildScheduled.store(false, std::memory_order_release);

      if (rebuildNeeded.exchange(false, std::memory_order_acq_rel)) {
        lastRebuildCaller_ = "scheduleRebuild";
        rebuildGraph();
        notifyChainChanged();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Batch API — suppresses individual rebuilds during multi-operation sequences.
// Nests: beginBatch() can be called multiple times; only the final endBatch()
// triggers the rebuild.
// ---------------------------------------------------------------------------
void ChainProcessor::beginBatch() {
  jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

  ++batchDepth;
}

void ChainProcessor::endBatch() {
  jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());
  jassert(batchDepth > 0);

  --batchDepth;

  if (batchDepth == 0) {
    if (rebuildNeeded.exchange(false, std::memory_order_acq_rel)) {
      lastRebuildCaller_ = "endBatch";
      rebuildGraph();
    }
    notifyChainChanged();
  }
}

void ChainProcessor::updateMeterWrapperCache() {
  // Double-buffer pattern: write to the back buffer, then atomically swap.
  // This ensures readers (audio thread in processBlock, message thread in
  // getNodeMeterReadings) always see a consistent snapshot without locks.
  int writeIndex = 1 - meterWrapperReadIndex.load(std::memory_order_acquire);
  auto &writeBuffer = meterWrapperBuffers[writeIndex];
  writeBuffer.clear();

  std::function<void(const ChainNode &)> collect = [&](const ChainNode &node) {
    if (node.isPlugin()) {
      const auto &leaf = node.getPlugin();
      if (leaf.graphNodeId != juce::AudioProcessorGraph::NodeID()) {
        if (auto *graphNode = getNodeForId(leaf.graphNodeId)) {
          if (auto *wrapper = dynamic_cast<PluginWithMeterWrapper *>(
                  graphNode->getProcessor()))
            writeBuffer.push_back({node.id, wrapper, leaf.bypassed});
        }
      }
    } else if (node.isGroup()) {
      for (const auto &child : node.getGroup().children)
        collect(*child);
    }
  };

  collect(rootNode);

  // Atomically publish the new buffer to readers
  meterWrapperReadIndex.store(writeIndex, std::memory_order_release);
}

void ChainProcessor::wireMidSidePlugin(PluginLeaf &leaf, NodeID encodeNodeId,
                                       NodeID pluginNodeId, NodeID decodeNodeId,
                                       int processChannel, int bypassChannel,
                                       int pluginLatency) {
  // Route encode[processChannel] → plugin ch0 AND ch1 (mono-through-stereo)
  addConnection({{encodeNodeId, processChannel}, {pluginNodeId, 0}},
                UpdateKind::none);
  addConnection({{encodeNodeId, processChannel}, {pluginNodeId, 1}},
                UpdateKind::none);

  // Plugin output ch0 → decode[processChannel]
  addConnection({{pluginNodeId, 0}, {decodeNodeId, processChannel}},
                UpdateKind::none);

  // ALWAYS create a dedicated bypass delay node (even if latency=0).
  // This guarantees the bypass signal gets its own buffer in the graph,
  // preventing buffer aliasing when the graph reuses encode output buffers.
  auto bypassProc =
      std::make_unique<LatencyCompensationProcessor>(pluginLatency);
  if (auto bypassNode = addNode(std::move(bypassProc), {}, UpdateKind::none)) {
    leaf.msBypassDelayNodeId = bypassNode->nodeID;
    utilityNodes.insert(bypassNode->nodeID);

    // Feed encode[bypassChannel] into bypass delay ch0 (mono is enough)
    addConnection({{encodeNodeId, bypassChannel}, {bypassNode->nodeID, 0}},
                  UpdateKind::none);

    // Bypass delay ch0 → decode[bypassChannel]
    addConnection({{bypassNode->nodeID, 0}, {decodeNodeId, bypassChannel}},
                  UpdateKind::none);

    DBG("M/S bypass node created: nodeID="
        << (int)bypassNode->nodeID.uid << " latency=" << pluginLatency
        << " processChannel=" << processChannel
        << " bypassChannel=" << bypassChannel);
  }
}

WireResult ChainProcessor::wireNode(ChainNode &node, NodeID audioIn,
                                    int depth) {
  if (depth > kMaxChainDepth) {
    PCLOG("wireNode — max depth exceeded (" + juce::String(depth) +
          "), passthrough");
    return {audioIn, 0};
  }

  if (node.isPlugin()) {
    auto &leaf = node.getPlugin();

    // Dry path nodes are empty passthrough branches (used in parallel groups)
    if (leaf.isDryPath)
      return {audioIn, 0};

    // Bypassed plugins: in parallel groups, disconnect entirely (mute).
    // In serial groups, pass through (bypass).
    if (leaf.bypassed) {
      if (isInParallelGroup(node.id)) {
        return {{}, 0}; // Disconnect entirely (mute)
      } else {
        return {audioIn, 0}; // Passthrough in serial
      }
    }

    auto pluginNodeId = leaf.graphNodeId;

    // If plugin failed to instantiate, pass through like a bypassed plugin
    if (pluginNodeId == juce::AudioProcessorGraph::NodeID())
      return {audioIn, 0};

    // Reset utility node IDs (they are recreated each rebuild)
    leaf.inputGainNodeId = {};
    leaf.outputGainNodeId = {};
    leaf.pluginDryWetNodeId = {};
    leaf.msEncodeNodeId = {};
    leaf.msDecodeNodeId = {};
    leaf.msBypassDelayNodeId = {};

    // Query plugin latency once — used for dry/wet delay compensation and
    // returned in WireResult
    int pluginLatencySamples = 0;
    if (auto gNode = getNodeForId(pluginNodeId))
      if (auto *proc = gNode->getProcessor())
        pluginLatencySamples = proc->getLatencySamples();

    NodeID currentAudioIn = audioIn;

    bool useInputGain =
        true; // Always wire to avoid rebuild when gain changes from 0
    bool useOutputGain =
        true; // Always wire to avoid rebuild when gain changes from 0
    bool useDryWet = true; // Always wire DryWetMixProcessor to avoid audio
                           // dropout on first knob move
    bool useMidSide = leaf.midSideMode != MidSideMode::Off;

    // --- Input Gain node ---
    if (useInputGain) {
      auto inGainProc = std::make_unique<BranchGainProcessor>();
      inGainProc->setGainDb(leaf.inputGainDb);
      if (auto inGainNode =
              addNode(std::move(inGainProc), {}, UpdateKind::none)) {
        leaf.inputGainNodeId = inGainNode->nodeID;
        utilityNodes.insert(inGainNode->nodeID);

        addConnection({{currentAudioIn, 0}, {inGainNode->nodeID, 0}},
                      UpdateKind::none);
        addConnection({{currentAudioIn, 1}, {inGainNode->nodeID, 1}},
                      UpdateKind::none);
        currentAudioIn = inGainNode->nodeID;
      }
    }

    // --- Per-plugin dry/wet: save dry source before M/S encode ---
    NodeID drySource = currentAudioIn; // for dry path (original L/R)

    // --- Mid/Side processing ---
    if (useMidSide) {
      PCLOG("M/S wireNode — mode=" + juce::String(static_cast<int>(leaf.midSideMode))
            + " pluginNodeId=" + juce::String(pluginNodeId.uid)
            + " audioIn=" + juce::String(currentAudioIn.uid));

      // Create M/S encode node (L/R → Mid/Side)
      auto encodeProc = std::make_unique<MidSideMatrixProcessor>();
      auto encodeNode = addNode(std::move(encodeProc), {}, UpdateKind::none);
      if (encodeNode) {
        leaf.msEncodeNodeId = encodeNode->nodeID;
        utilityNodes.insert(encodeNode->nodeID);

        // Wire input → encoder
        bool encInL = addConnection({{currentAudioIn, 0}, {encodeNode->nodeID, 0}},
                      UpdateKind::none);
        bool encInR = addConnection({{currentAudioIn, 1}, {encodeNode->nodeID, 1}},
                      UpdateKind::none);
        PCLOG("M/S encode connections: inL=" + juce::String(encInL ? 1 : 0)
              + " inR=" + juce::String(encInR ? 1 : 0)
              + " encodeNodeId=" + juce::String(encodeNode->nodeID.uid));

        // Use pre-computed plugin latency for bypass delay
        int pluginLatency = pluginLatencySamples;

        // Create M/S decode node (Mid/Side → L/R)
        auto decodeProc = std::make_unique<MidSideMatrixProcessor>();
        auto decodeNode = addNode(std::move(decodeProc), {}, UpdateKind::none);
        if (decodeNode) {
          leaf.msDecodeNodeId = decodeNode->nodeID;
          utilityNodes.insert(decodeNode->nodeID);

          PCLOG("M/S decode node created: decodeNodeId=" + juce::String(decodeNode->nodeID.uid));

          if (leaf.midSideMode == MidSideMode::MidSide) {
            // Full M/S: encode ch0(mid)→plugin ch0, encode ch1(side)→plugin ch1
            bool e2pL = addConnection({{encodeNode->nodeID, 0}, {pluginNodeId, 0}},
                          UpdateKind::none);
            bool e2pR = addConnection({{encodeNode->nodeID, 1}, {pluginNodeId, 1}},
                          UpdateKind::none);
            // Plugin L→decode ch0, plugin R→decode ch1
            bool p2dL = addConnection({{pluginNodeId, 0}, {decodeNode->nodeID, 0}},
                          UpdateKind::none);
            bool p2dR = addConnection({{pluginNodeId, 1}, {decodeNode->nodeID, 1}},
                          UpdateKind::none);
            PCLOG("M/S MidSide connections: e2pL=" + juce::String(e2pL ? 1 : 0)
                  + " e2pR=" + juce::String(e2pR ? 1 : 0)
                  + " p2dL=" + juce::String(p2dL ? 1 : 0)
                  + " p2dR=" + juce::String(p2dR ? 1 : 0));
          } else if (leaf.midSideMode == MidSideMode::MidOnly) {
            // Mid Only: process mid (ch0), bypass side (ch1)
            wireMidSidePlugin(leaf, encodeNode->nodeID, pluginNodeId,
                              decodeNode->nodeID, /*processChannel=*/0,
                              /*bypassChannel=*/1, pluginLatency);
          } else // SideOnly
          {
            // Side Only: process side (ch1), bypass mid (ch0)
            wireMidSidePlugin(leaf, encodeNode->nodeID, pluginNodeId,
                              decodeNode->nodeID, /*processChannel=*/1,
                              /*bypassChannel=*/0, pluginLatency);
          }

          // M/S decode output becomes the audio output
          NodeID currentAudioOut = decodeNode->nodeID;

          // --- Per-plugin dry/wet mix (after M/S decode) ---
          if (useDryWet) {
            auto mixProc = std::make_unique<DryWetMixProcessor>();
            // If muted, force fully dry (0.0) so the effect is disabled
            mixProc->setMix(node.mute.load(std::memory_order_relaxed)
                                ? 0.0f
                                : leaf.dryWetMix);

            if (auto mixNode =
                    addNode(std::move(mixProc), {}, UpdateKind::none)) {
              leaf.pluginDryWetNodeId = mixNode->nodeID;
              utilityNodes.insert(mixNode->nodeID);

              // Compute total M/S path latency for dry delay
              int msPathLatency =
                  pluginLatency; // encode/decode are zero-latency
              NodeID dryDelayOut = drySource;
              if (msPathLatency > 0) {
                auto delayProc = std::make_unique<LatencyCompensationProcessor>(
                    msPathLatency);
                if (auto delayNode =
                        addNode(std::move(delayProc), {}, UpdateKind::none)) {
                  utilityNodes.insert(delayNode->nodeID);
                  addConnection({{drySource, 0}, {delayNode->nodeID, 0}},
                                UpdateKind::none);
                  addConnection({{drySource, 1}, {delayNode->nodeID, 1}},
                                UpdateKind::none);
                  dryDelayOut = delayNode->nodeID;
                }
              }

              // DryWetMixProcessor: ch0-1 = dry (original L/R), ch2-3 = wet
              // (decoded L/R)
              {
                bool msDryL = addConnection(
                    {{dryDelayOut, 0}, {mixNode->nodeID, 0}}, UpdateKind::none);
                bool msDryR = addConnection(
                    {{dryDelayOut, 1}, {mixNode->nodeID, 1}}, UpdateKind::none);
                bool msWetL = addConnection(
                    {{decodeNode->nodeID, 0}, {mixNode->nodeID, 2}},
                    UpdateKind::none);
                bool msWetR = addConnection(
                    {{decodeNode->nodeID, 1}, {mixNode->nodeID, 3}},
                    UpdateKind::none);
                PCLOG("M/S DryWetMix connections: dryL=" +
                      juce::String(msDryL ? 1 : 0) +
                      " dryR=" + juce::String(msDryR ? 1 : 0) +
                      " wetL=" + juce::String(msWetL ? 1 : 0) +
                      " wetR=" + juce::String(msWetR ? 1 : 0) +
                      " drySource=" + juce::String(dryDelayOut.uid) +
                      " decodeNode=" + juce::String(decodeNode->nodeID.uid) +
                      " mixNode=" + juce::String(mixNode->nodeID.uid));
                if (!msDryL || !msDryR || !msWetL || !msWetR) {
                  PCLOG("ERROR M/S DryWetMix connection FAILED!");
                }
              }

              currentAudioOut = mixNode->nodeID;
            }
          }

          // --- Output Gain node ---
          if (useOutputGain) {
            auto outGainProc = std::make_unique<BranchGainProcessor>();
            outGainProc->setGainDb(leaf.outputGainDb);
            if (auto outGainNode =
                    addNode(std::move(outGainProc), {}, UpdateKind::none)) {
              leaf.outputGainNodeId = outGainNode->nodeID;
              utilityNodes.insert(outGainNode->nodeID);

              addConnection({{currentAudioOut, 0}, {outGainNode->nodeID, 0}},
                            UpdateKind::none);
              addConnection({{currentAudioOut, 1}, {outGainNode->nodeID, 1}},
                            UpdateKind::none);
              currentAudioOut = outGainNode->nodeID;
            }
          }

          return {currentAudioOut, pluginLatencySamples};
        }
      }
      // If M/S node creation failed, fall through to normal wiring
    }

    // --- Normal (non-M/S) wiring: connect audio to plugin ---
    addConnection({{currentAudioIn, 0}, {pluginNodeId, 0}}, UpdateKind::none);
    addConnection({{currentAudioIn, 1}, {pluginNodeId, 1}}, UpdateKind::none);

    NodeID currentAudioOut = pluginNodeId;

    // --- Per-plugin dry/wet mix ---
    if (useDryWet) {
      auto mixProc = std::make_unique<DryWetMixProcessor>();
      // If muted, force fully dry (0.0) so the effect is disabled
      mixProc->setMix(
          node.mute.load(std::memory_order_relaxed) ? 0.0f : leaf.dryWetMix);

      if (auto mixNode = addNode(std::move(mixProc), {}, UpdateKind::none)) {
        leaf.pluginDryWetNodeId = mixNode->nodeID;
        utilityNodes.insert(mixNode->nodeID);

        // Use pre-computed plugin latency for dry path delay
        NodeID dryDelayOut = drySource;
        if (pluginLatencySamples > 0) {
          auto delayProc = std::make_unique<LatencyCompensationProcessor>(
              pluginLatencySamples);
          if (auto delayNode =
                  addNode(std::move(delayProc), {}, UpdateKind::none)) {
            utilityNodes.insert(delayNode->nodeID);
            addConnection({{drySource, 0}, {delayNode->nodeID, 0}},
                          UpdateKind::none);
            addConnection({{drySource, 1}, {delayNode->nodeID, 1}},
                          UpdateKind::none);
            dryDelayOut = delayNode->nodeID;
          }
        }

        // DryWetMixProcessor: ch0-1 = dry, ch2-3 = wet
        bool dryL = addConnection({{dryDelayOut, 0}, {mixNode->nodeID, 0}},
                                  UpdateKind::none);
        bool dryR = addConnection({{dryDelayOut, 1}, {mixNode->nodeID, 1}},
                                  UpdateKind::none);
        bool wetL = addConnection({{pluginNodeId, 0}, {mixNode->nodeID, 2}},
                                  UpdateKind::none);
        bool wetR = addConnection({{pluginNodeId, 1}, {mixNode->nodeID, 3}},
                                  UpdateKind::none);

        if (!dryL || !dryR || !wetL || !wetR) {
          auto *mixProc = mixNode->getProcessor();
          PCLOG(
              "ERROR DryWetMix connection failed for plugin node " +
              juce::String(pluginNodeId.uid) + " -> mix node " +
              juce::String(mixNode->nodeID.uid) +
              " dryL=" + juce::String(dryL ? 1 : 0) +
              " dryR=" + juce::String(dryR ? 1 : 0) +
              " wetL=" + juce::String(wetL ? 1 : 0) +
              " wetR=" + juce::String(wetR ? 1 : 0) + " mixTotalIn=" +
              juce::String(mixProc ? mixProc->getTotalNumInputChannels() : -1) +
              " mixTotalOut=" +
              juce::String(mixProc ? mixProc->getTotalNumOutputChannels()
                                   : -1) +
              " mixBusCount=" +
              juce::String(mixProc ? mixProc->getBusCount(true) : -1));
        }

        currentAudioOut = mixNode->nodeID;
      }
    }

    // --- Output Gain node ---
    if (useOutputGain) {
      auto outGainProc = std::make_unique<BranchGainProcessor>();
      outGainProc->setGainDb(leaf.outputGainDb);
      if (auto outGainNode =
              addNode(std::move(outGainProc), {}, UpdateKind::none)) {
        leaf.outputGainNodeId = outGainNode->nodeID;
        utilityNodes.insert(outGainNode->nodeID);

        addConnection({{currentAudioOut, 0}, {outGainNode->nodeID, 0}},
                      UpdateKind::none);
        addConnection({{currentAudioOut, 1}, {outGainNode->nodeID, 1}},
                      UpdateKind::none);
        currentAudioOut = outGainNode->nodeID;
      }
    }

    return {currentAudioOut, pluginLatencySamples};
  } else if (node.isGroup()) {
    auto &group = node.getGroup();
    if (group.mode == GroupMode::Serial)
      return wireSerialGroup(node, audioIn, depth);
    else if (group.mode == GroupMode::MidSide)
      return wireMidSideGroup(node, audioIn, depth);
    else if (group.mode == GroupMode::FXSelector)
      return wireFXSelectorGroup(node, audioIn, depth);
    else
      return wireParallelGroup(node, audioIn, depth);
  }

  // Shouldn't reach here, but passthrough
  return {audioIn, 0};
}

WireResult ChainProcessor::wireSerialGroup(ChainNode &node, NodeID audioIn,
                                           int depth) {
  auto &group = node.getGroup();
  auto &children = group.children;

  // Bypassed group = passthrough (zero CPU, zero latency)
  if (group.bypassed)
    return {audioIn, 0};

  // Empty group = passthrough
  if (children.empty())
    return {audioIn, 0};

  bool useDryWet =
      (node.id != 0); // Always wire DryWetMixProcessor for non-root groups to
                      // avoid dropout/silent failure on first knob move

  if (!useDryWet) {
    // Root node: simple serial chain, no dry/wet
    NodeID prevAudio = audioIn;
    int totalLatency = 0;

    for (auto &child : children) {
      auto result = wireNode(*child, prevAudio, depth + 1);
      prevAudio = result.audioOut;
      totalLatency += result.latency;
    }

    // Ducking removed from serial groups — only parallel groups support ducking
    return {prevAudio, totalLatency};
  }

  // Dry/wet mode: create a DryWetMixProcessor
  auto mixProc = std::make_unique<DryWetMixProcessor>();
  mixProc->setMix(group.dryWetMix);
  mixProc->setWetGainDb(group.wetGainDb);

  auto mixNode = addNode(std::move(mixProc), {}, UpdateKind::none);
  if (!mixNode)
    return {audioIn, 0};

  group.dryWetMixNodeId = mixNode->nodeID;
  utilityNodes.insert(mixNode->nodeID);

  // Wet path: wire children in series, accumulate latency from wireNode results
  NodeID prevAudio = audioIn;
  int wetLatency = 0;

  for (auto &child : children) {
    auto result = wireNode(*child, prevAudio, depth + 1);
    prevAudio = result.audioOut;
    wetLatency += result.latency;
  }

  // Dry path: insert delay if wet path has latency
  NodeID drySource = audioIn;
  if (wetLatency > 0) {
    auto dryDelayProc =
        std::make_unique<LatencyCompensationProcessor>(wetLatency);
    auto dryDelayNode = addNode(std::move(dryDelayProc), {}, UpdateKind::none);
    if (dryDelayNode) {
      utilityNodes.insert(dryDelayNode->nodeID);
      addConnection({{audioIn, 0}, {dryDelayNode->nodeID, 0}},
                    UpdateKind::none);
      addConnection({{audioIn, 1}, {dryDelayNode->nodeID, 1}},
                    UpdateKind::none);
      drySource = dryDelayNode->nodeID;
    }
  }

  // Connect dry path to mix node channels 0-1
  bool sgDryL =
      addConnection({{drySource, 0}, {mixNode->nodeID, 0}}, UpdateKind::none);
  bool sgDryR =
      addConnection({{drySource, 1}, {mixNode->nodeID, 1}}, UpdateKind::none);

  // Connect wet path to mix node channels 2-3
  bool sgWetL =
      addConnection({{prevAudio, 0}, {mixNode->nodeID, 2}}, UpdateKind::none);
  bool sgWetR =
      addConnection({{prevAudio, 1}, {mixNode->nodeID, 3}}, UpdateKind::none);

  if (!sgDryL || !sgDryR || !sgWetL || !sgWetR) {
    auto *mixProc = mixNode->getProcessor();
    PCLOG("ERROR SerialGroup DryWetMix connection failed: group=" +
          juce::String(node.id) + " dryL=" + juce::String(sgDryL ? 1 : 0) +
          " dryR=" + juce::String(sgDryR ? 1 : 0) +
          " wetL=" + juce::String(sgWetL ? 1 : 0) +
          " wetR=" + juce::String(sgWetR ? 1 : 0) + " mixTotalIn=" +
          juce::String(mixProc ? mixProc->getTotalNumInputChannels() : -1));
  }

  // Ducking removed from serial groups — only parallel groups support ducking
  return {mixNode->nodeID, wetLatency};
}

WireResult ChainProcessor::wireParallelGroup(ChainNode &node, NodeID audioIn,
                                             int depth) {
  auto &group = node.getGroup();
  auto &children = group.children;

  // Bypassed group = passthrough (zero CPU, zero latency)
  if (group.bypassed)
    return {audioIn, 0};

  // Empty group = passthrough
  if (children.empty())
    return {audioIn, 0};

  // Determine if any branch is soloed (solo overrides mute)
  bool anySoloed = false;
  for (const auto &child : children)
    if (child->solo) {
      anySoloed = true;
      break;
    }

  // Count active branches for gain compensation.
  // When soloing: only soloed branches are active.
  // Otherwise: active = not muted.
  int activeBranches = 0;
  for (const auto &child : children) {
    bool isActive =
        anySoloed ? child->solo : !child->mute.load(std::memory_order_relaxed);
    if (isActive)
      activeBranches++;
  }

  if (activeBranches == 0) {
    // All branches muted/silenced - passthrough silence
    auto silenceProc = std::make_unique<BranchGainProcessor>();
    silenceProc->setGainDb(-60.0f);
    auto silenceNode = addNode(std::move(silenceProc), {}, UpdateKind::none);
    if (silenceNode) {
      utilityNodes.insert(silenceNode->nodeID);
      addConnection({{audioIn, 0}, {silenceNode->nodeID, 0}}, UpdateKind::none);
      addConnection({{audioIn, 1}, {silenceNode->nodeID, 1}}, UpdateKind::none);
      return {silenceNode->nodeID, 0};
    }
    return {audioIn, 0};
  }

  // Create sum compensation gain node at the output
  float compensationDb =
      -20.0f * std::log10(static_cast<float>(activeBranches));
  auto sumGainProc = std::make_unique<BranchGainProcessor>();
  sumGainProc->setGainDb(compensationDb);

  auto sumGainNode = addNode(std::move(sumGainProc), {}, UpdateKind::none);
  if (!sumGainNode)
    return {audioIn, 0};

  group.sumGainNodeId = sumGainNode->nodeID;
  utilityNodes.insert(sumGainNode->nodeID);

  // Clear branch node ID vectors
  group.branchGainNodeIds.clear();

  // Wire all branches: input → branchGain → child → [delayComp] → sumGain
  // Insert LatencyCompensationProcessor delay nodes on shorter branches
  // so all branches arrive time-aligned at the sum point.

  struct BranchInfo {
    WireResult result;
    bool active;
  };
  std::vector<BranchInfo> branchInfos;

  // Pass 1: Wire all branches, collect per-branch results (latency is in
  // WireResult)
  for (size_t i = 0; i < children.size(); ++i) {
    auto &child = children[i];

    bool isActive =
        anySoloed ? child->solo : !child->mute.load(std::memory_order_relaxed);

    if (!isActive) {
      group.branchGainNodeIds.push_back({});
      branchInfos.push_back({{}, false});
      continue;
    }

    // Create per-branch gain processor with effective gain (mute + solo aware)
    float effectiveGain =
        (anySoloed && !child->solo) ? -60.0f : child->branchGainDb;
    auto branchGainProc = std::make_unique<BranchGainProcessor>();
    branchGainProc->setGainDb(effectiveGain);

    auto branchGainNode =
        addNode(std::move(branchGainProc), {}, UpdateKind::none);
    if (!branchGainNode) {
      group.branchGainNodeIds.push_back({});
      branchInfos.push_back({{}, false});
      continue;
    }

    group.branchGainNodeIds.push_back(branchGainNode->nodeID);
    utilityNodes.insert(branchGainNode->nodeID);

    // Fan-out: connect input to branch gain
    addConnection({{audioIn, 0}, {branchGainNode->nodeID, 0}},
                  UpdateKind::none);
    addConnection({{audioIn, 1}, {branchGainNode->nodeID, 1}},
                  UpdateKind::none);

    // Wire child after branch gain — latency is returned in result
    auto result = wireNode(*child, branchGainNode->nodeID, depth + 1);
    branchInfos.push_back({result, true});
  }

  // Pass 2: Find max latency, insert compensation delays, connect to sumGain
  int maxBranchLatency = 0;
  for (const auto &bi : branchInfos)
    if (bi.active)
      maxBranchLatency = std::max(maxBranchLatency, bi.result.latency);

  for (const auto &bi : branchInfos) {
    if (!bi.active)
      continue;

    NodeID connectFrom = bi.result.audioOut;
    int delayNeeded = maxBranchLatency - bi.result.latency;

    if (delayNeeded > 0) {
      auto delayProc =
          std::make_unique<LatencyCompensationProcessor>(delayNeeded);
      auto delayNode = addNode(std::move(delayProc), {}, UpdateKind::none);
      if (delayNode) {
        utilityNodes.insert(delayNode->nodeID);
        addConnection({{bi.result.audioOut, 0}, {delayNode->nodeID, 0}},
                      UpdateKind::none);
        addConnection({{bi.result.audioOut, 1}, {delayNode->nodeID, 1}},
                      UpdateKind::none);
        connectFrom = delayNode->nodeID;
      }
    }

    // Fan-in: connect branch output to sum gain node
    // (AudioProcessorGraph auto-sums multiple connections to the same input)
    addConnection({{connectFrom, 0}, {sumGainNode->nodeID, 0}},
                  UpdateKind::none);
    addConnection({{connectFrom, 1}, {sumGainNode->nodeID, 1}},
                  UpdateKind::none);
  }

  // Insert DuckingProcessor after sumGain if ducking is enabled
  // The ducking processor receives the group output on ch0-1 and
  // the pre-group signal (audioIn) on ch2-3 as sidechain reference
  //
  // Reset duckingNodeId unconditionally so stale IDs from a prior rebuild
  // never cause setGroupDucking() to take the "update in-place" path when
  // ducking is re-enabled after a disable.
  group.duckingNodeId = {};

  if (group.duckEnabled) {
    auto duckProc = std::make_unique<DuckingProcessor>();
    duckProc->setThresholdDb(group.duckThresholdDb);
    duckProc->setAttackMs(group.duckAttackMs);
    duckProc->setReleaseMs(group.duckReleaseMs);

    auto duckNode = addNode(std::move(duckProc), {}, UpdateKind::none);
    if (duckNode) {
      group.duckingNodeId = duckNode->nodeID;
      utilityNodes.insert(duckNode->nodeID);

      // Connect sumGain output → ducking ch0-1 (audio to be ducked)
      addConnection({{sumGainNode->nodeID, 0}, {duckNode->nodeID, 0}},
                    UpdateKind::none);
      addConnection({{sumGainNode->nodeID, 1}, {duckNode->nodeID, 1}},
                    UpdateKind::none);

      // Connect pre-group signal → ducking ch2-3 (sidechain reference)
      addConnection({{audioIn, 0}, {duckNode->nodeID, 2}}, UpdateKind::none);
      addConnection({{audioIn, 1}, {duckNode->nodeID, 3}}, UpdateKind::none);

      return {duckNode->nodeID, maxBranchLatency};
    }
  }

  return {sumGainNode->nodeID, maxBranchLatency};
}

WireResult ChainProcessor::wireMidSideGroup(ChainNode &node, NodeID audioIn,
                                            int depth) {
  auto &group = node.getGroup();
  auto &children = group.children;

  // Need at least 2 children: [0]=Mid branch, [1]=Side branch
  // Fewer children: fall back to passthrough
  if (children.size() < 2) {
    if (children.size() == 1)
      return wireNode(*children[0], audioIn, depth + 1);
    return {audioIn, 0};
  }

  // --- M/S Encode node ---
  auto encodeProc = std::make_unique<MidSideMatrixProcessor>();
  auto encodeNode = addNode(std::move(encodeProc), {}, UpdateKind::none);
  if (!encodeNode)
    return {audioIn, 0};

  group.msEncodeNodeId = encodeNode->nodeID;
  utilityNodes.insert(encodeNode->nodeID);

  addConnection({{audioIn, 0}, {encodeNode->nodeID, 0}}, UpdateKind::none);
  addConnection({{audioIn, 1}, {encodeNode->nodeID, 1}}, UpdateKind::none);

  // --- Branch 0: Mid (ch0 of encode → duplicated to both inputs) ---
  // Add a BranchGainProcessor as a channel adapter for Branch 0
  auto midGainProc = std::make_unique<BranchGainProcessor>();
  midGainProc->setGainDb(children[0]->branchGainDb);
  auto midAdapterNode = addNode(std::move(midGainProc), {}, UpdateKind::none);
  if (!midAdapterNode)
    return {audioIn, 0};
  utilityNodes.insert(midAdapterNode->nodeID);
  // Route encode ch0 (Mid) to both L and R of branch 0 input
  addConnection({{encodeNode->nodeID, 0}, {midAdapterNode->nodeID, 0}},
                UpdateKind::none);
  addConnection({{encodeNode->nodeID, 0}, {midAdapterNode->nodeID, 1}},
                UpdateKind::none);

  auto midResult = wireNode(*children[0], midAdapterNode->nodeID, depth + 1);
  // If branch returns invalid node (bypassed/disconnected), fall back to
  // adapter passthrough
  if (midResult.audioOut.uid == 0)
    midResult = {midAdapterNode->nodeID, 0};

  // --- Branch 1: Side (ch1 of encode → duplicated to both inputs) ---
  auto sideGainProc = std::make_unique<BranchGainProcessor>();
  sideGainProc->setGainDb(children[1]->branchGainDb);
  auto sideAdapterNode = addNode(std::move(sideGainProc), {}, UpdateKind::none);
  if (!sideAdapterNode)
    return {audioIn, 0};
  utilityNodes.insert(sideAdapterNode->nodeID);
  // Route encode ch1 (Side) to both L and R of branch 1 input
  addConnection({{encodeNode->nodeID, 1}, {sideAdapterNode->nodeID, 0}},
                UpdateKind::none);
  addConnection({{encodeNode->nodeID, 1}, {sideAdapterNode->nodeID, 1}},
                UpdateKind::none);

  auto sideResult = wireNode(*children[1], sideAdapterNode->nodeID, depth + 1);
  // If branch returns invalid node (bypassed/disconnected), fall back to
  // adapter passthrough
  if (sideResult.audioOut.uid == 0)
    sideResult = {sideAdapterNode->nodeID, 0};

  // --- Latency compensation ---
  int maxLatency = std::max(midResult.latency, sideResult.latency);

  NodeID midConnect = midResult.audioOut;
  NodeID sideConnect = sideResult.audioOut;

  if (midResult.latency < maxLatency) {
    int delay = maxLatency - midResult.latency;
    auto delayProc = std::make_unique<LatencyCompensationProcessor>(delay);
    auto delayNode = addNode(std::move(delayProc), {}, UpdateKind::none);
    if (delayNode) {
      utilityNodes.insert(delayNode->nodeID);
      addConnection({{midConnect, 0}, {delayNode->nodeID, 0}},
                    UpdateKind::none);
      addConnection({{midConnect, 1}, {delayNode->nodeID, 1}},
                    UpdateKind::none);
      midConnect = delayNode->nodeID;
    }
  }

  if (sideResult.latency < maxLatency) {
    int delay = maxLatency - sideResult.latency;
    auto delayProc = std::make_unique<LatencyCompensationProcessor>(delay);
    auto delayNode = addNode(std::move(delayProc), {}, UpdateKind::none);
    if (delayNode) {
      utilityNodes.insert(delayNode->nodeID);
      addConnection({{sideConnect, 0}, {delayNode->nodeID, 0}},
                    UpdateKind::none);
      addConnection({{sideConnect, 1}, {delayNode->nodeID, 1}},
                    UpdateKind::none);
      sideConnect = delayNode->nodeID;
    }
  }

  // --- M/S Decode node ---
  auto decodeProc = std::make_unique<MidSideMatrixProcessor>();
  auto decodeNode = addNode(std::move(decodeProc), {}, UpdateKind::none);
  if (!decodeNode)
    return {audioIn, 0};

  group.msDecodeNodeId = decodeNode->nodeID;
  utilityNodes.insert(decodeNode->nodeID);

  // Mid branch ch0 → decode ch0, Side branch ch0 → decode ch1
  addConnection({{midConnect, 0}, {decodeNode->nodeID, 0}}, UpdateKind::none);
  addConnection({{sideConnect, 0}, {decodeNode->nodeID, 1}}, UpdateKind::none);

  return {decodeNode->nodeID, maxLatency};
}

WireResult ChainProcessor::wireFXSelectorGroup(ChainNode &node, NodeID audioIn,
                                               int depth) {
  auto &group = node.getGroup();
  auto &children = group.children;

  if (children.empty())
    return {audioIn, 0};

  // Clamp activeChildIndex to valid range
  int active = juce::jlimit(0, static_cast<int>(children.size()) - 1,
                            group.activeChildIndex);
  group.activeChildIndex = active;

  // Output sum node (no gain compensation — only one branch active at a time)
  auto sumProc = std::make_unique<BranchGainProcessor>();
  sumProc->setGainDb(0.0f);
  auto sumNode = addNode(std::move(sumProc), {}, UpdateKind::none);
  if (!sumNode)
    return {audioIn, 0};

  group.sumGainNodeId = sumNode->nodeID;
  utilityNodes.insert(sumNode->nodeID);

  group.branchGainNodeIds.clear();

  struct BranchInfo {
    WireResult result;
    bool valid;
  };
  std::vector<BranchInfo> branchInfos;

  // Pass 1: Wire all branches. Active branch gets its branchGainDb, others get
  // -60dB.
  for (size_t i = 0; i < children.size(); ++i) {
    auto &child = children[i];
    bool isActive = (static_cast<int>(i) == active);

    auto branchGainProc = std::make_unique<BranchGainProcessor>();
    branchGainProc->setGainDb(isActive ? child->branchGainDb : -60.0f);

    auto branchGainNode =
        addNode(std::move(branchGainProc), {}, UpdateKind::none);
    if (!branchGainNode) {
      group.branchGainNodeIds.push_back({});
      branchInfos.push_back({{}, false});
      continue;
    }

    group.branchGainNodeIds.push_back(branchGainNode->nodeID);
    utilityNodes.insert(branchGainNode->nodeID);

    addConnection({{audioIn, 0}, {branchGainNode->nodeID, 0}},
                  UpdateKind::none);
    addConnection({{audioIn, 1}, {branchGainNode->nodeID, 1}},
                  UpdateKind::none);

    auto result = wireNode(*child, branchGainNode->nodeID, depth + 1);
    // Bypass/empty branch: fall back to adapter passthrough
    if (result.audioOut.uid == 0)
      result = {branchGainNode->nodeID, 0};

    branchInfos.push_back({result, true});
  }

  // Pass 2: Latency compensation + connect all branches to sumGain
  int maxBranchLatency = 0;
  for (const auto &bi : branchInfos)
    if (bi.valid)
      maxBranchLatency = std::max(maxBranchLatency, bi.result.latency);

  for (const auto &bi : branchInfos) {
    if (!bi.valid)
      continue;

    NodeID connectFrom = bi.result.audioOut;
    int delayNeeded = maxBranchLatency - bi.result.latency;

    if (delayNeeded > 0) {
      auto delayProc =
          std::make_unique<LatencyCompensationProcessor>(delayNeeded);
      auto delayNode = addNode(std::move(delayProc), {}, UpdateKind::none);
      if (delayNode) {
        utilityNodes.insert(delayNode->nodeID);
        addConnection({{bi.result.audioOut, 0}, {delayNode->nodeID, 0}},
                      UpdateKind::none);
        addConnection({{bi.result.audioOut, 1}, {delayNode->nodeID, 1}},
                      UpdateKind::none);
        connectFrom = delayNode->nodeID;
      }
    }

    addConnection({{connectFrom, 0}, {sumNode->nodeID, 0}}, UpdateKind::none);
    addConnection({{connectFrom, 1}, {sumNode->nodeID, 1}}, UpdateKind::none);
  }

  return {sumNode->nodeID, maxBranchLatency};
}

//==============================================================================
// Helper
//==============================================================================

bool ChainProcessor::isInParallelGroup(ChainNodeId id) const {
  // Find the parent of this node
  auto *parent =
      ChainNodeHelpers::findParent(const_cast<ChainNode &>(rootNode), id);
  if (!parent)
    return false; // Root node or not found

  // Check if parent is a parallel, M/S, or FX Selector group (branches all
  // disconnect on bypass)
  if (parent->isGroup() && (parent->getGroup().mode == GroupMode::Parallel ||
                            parent->getGroup().mode == GroupMode::MidSide ||
                            parent->getGroup().mode == GroupMode::FXSelector))
    return true;

  return false;
}

bool ChainProcessor::detectCycles() const {
  // Build adjacency list once — O(E) — then DFS in O(V+E)
  std::map<juce::AudioProcessorGraph::NodeID,
           std::vector<juce::AudioProcessorGraph::NodeID>>
      adj;

  for (auto *node : getNodes())
    adj[node->nodeID]; // ensure every node has an entry

  for (const auto &conn : getConnections())
    adj[conn.source.nodeID].push_back(conn.destination.nodeID);

  // DFS with color marking (0=white/unvisited, 1=gray/visiting, 2=black/done)
  std::map<juce::AudioProcessorGraph::NodeID, int> colors;
  for (const auto &[id, _] : adj)
    colors[id] = 0;

  std::function<bool(juce::AudioProcessorGraph::NodeID)> dfs;
  dfs = [&](juce::AudioProcessorGraph::NodeID id) -> bool {
    colors[id] = 1; // gray (visiting)

    for (auto dest : adj[id]) {
      auto destColor = colors[dest];
      if (destColor == 1) // Back edge = cycle
        return true;
      if (destColor == 0 && dfs(dest))
        return true;
    }

    colors[id] = 2; // black (done)
    return false;
  };

  for (const auto &[id, _] : adj)
    if (colors[id] == 0 && dfs(id))
      return true;

  return false;
}

//==============================================================================
// Latency
//==============================================================================

// PHASE 5: Latency caching (eliminates redundant O(N) tree traversals at 500ms
// intervals)
int ChainProcessor::getTotalLatencySamples() const {
  // Check if cache is valid
  if (!latencyCacheDirty.load(std::memory_order_acquire)) {
    return cachedTotalLatency.load(std::memory_order_relaxed);
  }

  // Compute and cache
  int latency = computeNodeLatency(rootNode, 0);

  // Sanity-check total chain latency. Even with many serial plugins in
  // linear-phase mode, exceeding 2 seconds at 192kHz is implausible.
  constexpr int kMaxTotalLatency = 384000; // 2s @ 192kHz
  if (latency > kMaxTotalLatency) {
    PCLOG("WARNING: total chain latency " + juce::String(latency) +
          " exceeds " + juce::String(kMaxTotalLatency) + " samples - clamping");
    latency = kMaxTotalLatency;
  }

  cachedTotalLatency.store(latency, std::memory_order_relaxed);
  latencyCacheDirty.store(false, std::memory_order_release);

  return latency;
}

double ChainProcessor::getTotalTailLengthSeconds() const {
  double maxTail = 0.0;
  for (auto *graphNode : getNodes()) {
    if (auto *wrapper =
            dynamic_cast<PluginWithMeterWrapper *>(graphNode->getProcessor())) {
      if (auto *plugin = wrapper->getWrappedPlugin()) {
        double tail = plugin->getTailLengthSeconds();
        if (std::isinf(tail))
          return std::numeric_limits<double>::infinity();
        maxTail = std::max(maxTail, tail);
      }
    }
  }
  return maxTail;
}

void ChainProcessor::invalidateLatencyCache() {
  latencyCacheDirty.store(true, std::memory_order_release);
}

void ChainProcessor::refreshLatencyCompensation() {
  // PHASE 7: Handle dynamic latency changes (e.g., Auto-Tune mode toggle,
  // lookahead parameter change, preset swap that alters PDC).
  PCLOG("refreshLatencyCompensation — entered (treeModInProgress=" +
        juce::String(treeModificationInProgress_ ? 1 : 0) + ")");
  jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

  // CRITICAL: Skip if the tree is being modified (e.g., setStateInformation or
  // importChainWithPresets is clearing and repopulating rootNode.children).
  // On macOS, AU plugin instantiation can pump the run loop, allowing this
  // timer-triggered function to fire mid-operation when the tree is empty or
  // partially built. Rebuilding in that state produces a stripped graph with
  // latency=0, causing a PDC yo-yo (e.g. 5748→0→5748) that creates audible
  // dropouts in Ableton/Logic.
  if (treeModificationInProgress_) {
    PCLOG(
        "refreshLatencyCompensation — skipped (tree modification in progress)");
    // Don't clear latencyRefreshNeeded — let the next timer tick retry after
    // the tree modification completes and its own rebuildGraph() runs.
    return;
  }

  // CRITICAL: Acknowledge all wrapper latency flags BEFORE rebuild.
  // Otherwise the audio thread re-sets latencyRefreshNeeded during the rebuild,
  // causing an infinite rebuild loop on the next timer tick.
  for (auto *node : getNodes()) {
    if (auto *wrapper =
            dynamic_cast<PluginWithMeterWrapper *>(node->getProcessor()))
      wrapper->acknowledgeLatencyChange();
  }

  // No suspendProcessing() needed — rebuildGraph() uses the zero-dip
  // architecture (ref-counted JUCE nodes, atomic RenderSequenceExchange swap).
  lastRebuildCaller_ = "refreshLatencyCompensation";
  rebuildGraph();

  // CRITICAL FIX: Notify the outer PluginProcessor of the new total latency.
  // rebuildGraph() calls setLatencySamples() on the ChainProcessor (the
  // internal AudioProcessorGraph) but Ableton/Logic only see the outer
  // PluginProcessor. The only path to update the DAW's PDC is via
  // onLatencyChanged(), which is registered by PluginProcessor. Without this
  // call, dynamic latency changes (lookahead toggle, preset swap) silently
  // desync ProChain from all other tracks.
  notifyChainChanged();
}

void ChainProcessor::clearGraph() {
  if (onBeforeDeletePlugin)
    onBeforeDeletePlugin();

  // Remove all connections and nodes from the AudioProcessorGraph
  // so the render sequence is empty before destruction.
  constexpr auto deferred = UpdateKind::none;
  for (auto &conn : getConnections())
    removeConnection(conn, deferred);
  clear();   // AudioProcessorGraph::clear() removes all nodes
  rebuild(); // Rebuild render sequence (now empty)
}

int ChainProcessor::computeNodeLatency(const ChainNode &node, int depth) const {
  // Upper bound: 5 seconds at 192kHz = 960000 samples.
  // Any single plugin reporting more than this is almost certainly a bug.
  constexpr int kMaxPluginLatency = 960000;

  if (depth > 64) {
    jassertfalse; // Stack overflow prevention
    return 0;
  }

  if (node.isPlugin()) {
    // Bypassed plugins are fully disconnected from the graph,
    // so they contribute zero latency to the signal path.
    if (node.getPlugin().bypassed)
      return 0;

    if (auto gNode = getNodeForId(node.getPlugin().graphNodeId)) {
      if (auto *processor = gNode->getProcessor()) {
        int lat = processor->getLatencySamples();
        if (lat < 0 || lat > kMaxPluginLatency) {
          PCLOG("WARNING: plugin '" + processor->getName() +
                "' reports anomalous latency=" + juce::String(lat) +
                " - clamping to [0, " + juce::String(kMaxPluginLatency) + "]");
          lat = juce::jlimit(0, kMaxPluginLatency, lat);
        }
        return lat;
      }
    }
    return 0;
  }

  if (node.isGroup()) {
    const auto &group = node.getGroup();
    // Bypassed groups contribute zero latency
    if (group.bypassed)
      return 0;
    if (group.children.empty())
      return 0;

    if (group.mode == GroupMode::Serial) {
      int total = 0;
      for (const auto &child : group.children)
        total += computeNodeLatency(*child, depth + 1);
      return total;
    } else // Parallel
    {
      // For parallel groups, the latency is the maximum of all branches
      int maxLatency = 0;
      for (const auto &child : group.children) {
        int branchLatency = computeNodeLatency(*child, depth + 1);
        maxLatency = std::max(maxLatency, branchLatency);
      }
      return maxLatency;
    }
  }

  return 0;
}

//==============================================================================
// Per-node meter readings
//==============================================================================

const std::vector<ChainProcessor::NodeMeterData> &
ChainProcessor::getNodeMeterReadings() const {
  // PHASE 3: Reuse preallocated cache instead of allocating new vector at 30Hz
  cachedMeterReadings.clear(); // Doesn't deallocate capacity, just resets size

  // Read from the front buffer (safe: updateMeterWrapperCache writes to the
  // back buffer then swaps)
  const auto &meterWrappers = meterWrapperBuffers[meterWrapperReadIndex.load(
      std::memory_order_acquire)];
  for (const auto &entry : meterWrappers) {
    // Bypass state is cached in the entry — no O(N) DFS needed
    if (entry.bypassed)
      continue;

    NodeMeterData meterData{entry.nodeId, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.0f};

    // Output meter (from wrapper)
    auto outputReadings = entry.wrapper->getOutputMeter().getReadings();
    meterData.peakL = outputReadings.peakL;
    meterData.peakR = outputReadings.peakR;
    meterData.peakHoldL = outputReadings.peakHoldL;
    meterData.peakHoldR = outputReadings.peakHoldR;
    meterData.rmsL = outputReadings.rmsL;
    meterData.rmsR = outputReadings.rmsR;

    // Input meter (from wrapper)
    auto inputReadings = entry.wrapper->getInputMeter().getReadings();
    meterData.inputPeakL = inputReadings.peakL;
    meterData.inputPeakR = inputReadings.peakR;
    meterData.inputPeakHoldL = inputReadings.peakHoldL;
    meterData.inputPeakHoldR = inputReadings.peakHoldR;
    meterData.inputRmsL = inputReadings.rmsL;
    meterData.inputRmsR = inputReadings.rmsR;

    // LUFS readings
    meterData.inputLufs = inputReadings.lufsShort;
    meterData.outputLufs = outputReadings.lufsShort;

    // Calculate latency in milliseconds
    auto *plugin = entry.wrapper->getWrappedPlugin();
    if (plugin && getSampleRate() > 0) {
      int latencySamples = plugin->getLatencySamples();
      meterData.latencyMs =
          (latencySamples / static_cast<float>(getSampleRate())) * 1000.0f;
    }

    cachedMeterReadings.push_back(meterData);
  }

  return cachedMeterReadings;
}

void ChainProcessor::resetAllNodePeaks() {
  std::function<void(const ChainNode &)> resetNode =
      [&](const ChainNode &node) {
        if (node.isPlugin()) {
          const auto &leaf = node.getPlugin();
          if (!leaf.bypassed &&
              leaf.graphNodeId != juce::AudioProcessorGraph::NodeID()) {
            if (auto *graphNode = getNodeForId(leaf.graphNodeId)) {
              if (auto *wrapper = dynamic_cast<PluginWithMeterWrapper *>(
                      graphNode->getProcessor())) {
                wrapper->getOutputMeter().reset();
                wrapper->getInputMeter().reset();
              }
            }
          }
        } else if (node.isGroup()) {
          for (const auto &child : node.getGroup().children)
            resetNode(*child);
        }
      };

  resetNode(rootNode);
}

//==============================================================================
// Serialization
//==============================================================================

void ChainProcessor::nodeToXml(const ChainNode &node, juce::XmlElement &parent,
                               int depth) const {
  if (depth > kMaxChainDepth)
    return;

  auto *nodeXml = parent.createNewChildElement("Node");
  nodeXml->setAttribute("id", node.id);

  if (node.isPlugin()) {
    nodeXml->setAttribute("type", "plugin");
    nodeXml->setAttribute("bypassed", node.getPlugin().bypassed);
    nodeXml->setAttribute("isDryPath", node.getPlugin().isDryPath);
    nodeXml->setAttribute("branchGainDb",
                          static_cast<double>(node.branchGainDb));
    nodeXml->setAttribute("mute", node.mute.load(std::memory_order_relaxed));
    nodeXml->setAttribute("solo", node.solo);

    // Per-plugin controls
    nodeXml->setAttribute("inputGainDb",
                          static_cast<double>(node.getPlugin().inputGainDb));
    nodeXml->setAttribute("outputGainDb",
                          static_cast<double>(node.getPlugin().outputGainDb));
    nodeXml->setAttribute("pluginDryWet",
                          static_cast<double>(node.getPlugin().dryWetMix));
    nodeXml->setAttribute("midSideMode",
                          static_cast<int>(node.getPlugin().midSideMode));

    if (auto descXml = node.getPlugin().description.createXml())
      nodeXml->addChildElement(descXml.release());

    if (auto gNode = getNodeForId(node.getPlugin().graphNodeId)) {
      if (auto *processor = gNode->getProcessor()) {
        try {
          juce::MemoryBlock state;
          processor->getStateInformation(state);
          // Only save state if it's not empty (prevents issues with
          // uninitialized plugins)
          if (state.getSize() > 0) {
            nodeXml->setAttribute("state", state.toBase64Encoding());
          } else {
            DBG("WARNING: Plugin " + node.getPlugin().description.name +
                " returned empty state during snapshot");
          }
        } catch (const std::exception &e) {
          DBG("ERROR: Plugin " + node.getPlugin().description.name +
              " crashed during state save: " + juce::String(e.what()));
          // Continue with other plugins - don't let one bad plugin crash the
          // whole snapshot
        } catch (...) {
          DBG("ERROR: Plugin " + node.getPlugin().description.name +
              " crashed during state save (unknown exception)");
          // Continue with other plugins
        }
      }
    }
  } else if (node.isGroup()) {
    nodeXml->setAttribute("type", "group");
    nodeXml->setAttribute(
        "mode", node.getGroup().mode == GroupMode::Serial       ? "serial"
                : node.getGroup().mode == GroupMode::MidSide    ? "midside"
                : node.getGroup().mode == GroupMode::FXSelector ? "fxselector"
                                                                : "parallel");
    if (node.getGroup().mode == GroupMode::FXSelector)
      nodeXml->setAttribute("activeChildIndex",
                            node.getGroup().activeChildIndex);
    nodeXml->setAttribute("dryWet",
                          static_cast<double>(node.getGroup().dryWetMix));
    nodeXml->setAttribute("wetGainDb",
                          static_cast<double>(node.getGroup().wetGainDb));
    nodeXml->setAttribute("duckEnabled", node.getGroup().duckEnabled ? 1 : 0);
    nodeXml->setAttribute("duckThresholdDb",
                          static_cast<double>(node.getGroup().duckThresholdDb));
    nodeXml->setAttribute("duckAttackMs",
                          static_cast<double>(node.getGroup().duckAttackMs));
    nodeXml->setAttribute("duckReleaseMs",
                          static_cast<double>(node.getGroup().duckReleaseMs));
    nodeXml->setAttribute("name", node.name);
    nodeXml->setAttribute("collapsed", node.collapsed);
    nodeXml->setAttribute("groupBypassed", node.getGroup().bypassed ? 1 : 0);

    for (const auto &child : node.getGroup().children)
      nodeToXml(*child, *nodeXml, depth + 1);
  }
}

std::vector<juce::PluginDescription> ChainProcessor::collectFormatCandidates(
    const juce::PluginDescription &desc) const {
  const auto &savedFormat = desc.pluginFormatName;
  std::vector<juce::PluginDescription> candidates;
  std::set<juce::String> seen; // dedup by fileOrIdentifier

  auto addCandidate = [&](const juce::PluginDescription &d) {
    if (seen.insert(d.fileOrIdentifier).second)
      candidates.push_back(d);
  };

  const auto normName = PluginManager::normalizePluginName(desc.name);
  const auto normMfr =
      PluginManager::normalizeManufacturer(desc.manufacturerName);

  // Tiers 1-3: scan KnownPluginList
  for (const auto &known : pluginManager.getKnownPlugins().getTypes()) {
    const bool exactName = known.name.equalsIgnoreCase(desc.name);
    const bool normNameMatch =
        PluginManager::normalizePluginName(known.name) == normName;
    const bool exactMfr =
        known.manufacturerName.equalsIgnoreCase(desc.manufacturerName);
    const bool normMfrMatch =
        PluginManager::normalizeManufacturer(known.manufacturerName) == normMfr;

    // Tier 1: exact name + exact manufacturer
    if (exactName && exactMfr) {
      addCandidate(known);
      continue;
    }
    // Tier 2: exact name + normalized manufacturer
    if (exactName && normMfrMatch) {
      addCandidate(known);
      continue;
    }
    // Tier 3: normalized name + normalized manufacturer
    if (normNameMatch && normMfrMatch) {
      addCandidate(known);
      continue;
    }
  }

  // Tier 4: catalog alias lookup (only if Tiers 1-3 found nothing in a
  // different format)
  bool hasAltFormat = false;
  for (const auto &c : candidates)
    if (!c.pluginFormatName.equalsIgnoreCase(savedFormat)) {
      hasAltFormat = true;
      break;
    }

  if (!hasAltFormat) {
    auto aliasCandidates = pluginManager.getCrossFormatCandidates(
        desc.name, desc.manufacturerName);
    for (const auto &d : aliasCandidates)
      addCandidate(d);
  }

  // Sort: same format first → VST3 → AU
  std::stable_sort(
      candidates.begin(), candidates.end(),
      [&](const juce::PluginDescription &a, const juce::PluginDescription &b) {
        bool aMatch = a.pluginFormatName.equalsIgnoreCase(savedFormat);
        bool bMatch = b.pluginFormatName.equalsIgnoreCase(savedFormat);
        if (aMatch != bMatch)
          return aMatch;
        bool aVst3 = a.pluginFormatName.equalsIgnoreCase("VST3");
        bool bVst3 = b.pluginFormatName.equalsIgnoreCase("VST3");
        return aVst3 && !bVst3;
      });

  return candidates;
}

std::unique_ptr<ChainNode>
ChainProcessor::xmlToNode(const juce::XmlElement &xml, int depth) {
  if (depth > kMaxChainDepth)
    return nullptr;

  auto node = std::make_unique<ChainNode>();
  node->id = xml.getIntAttribute("id", nextNodeId++);

  // Track the highest ID seen so nextNodeId stays ahead
  if (node->id >= nextNodeId)
    nextNodeId = node->id + 1;

  auto type = xml.getStringAttribute("type");

  if (type == "plugin") {
    node->branchGainDb =
        static_cast<float>(xml.getDoubleAttribute("branchGainDb", 0.0));
    node->mute.store(xml.getBoolAttribute("mute", false),
                     std::memory_order_relaxed);
    node->solo = xml.getBoolAttribute("solo", false);

    PluginLeaf leaf;

    // Per-plugin controls (backward-compatible: defaults for old presets)
    leaf.inputGainDb =
        static_cast<float>(xml.getDoubleAttribute("inputGainDb", 0.0));
    leaf.outputGainDb =
        static_cast<float>(xml.getDoubleAttribute("outputGainDb", 0.0));
    leaf.dryWetMix =
        static_cast<float>(xml.getDoubleAttribute("pluginDryWet", 1.0));
    leaf.midSideMode =
        static_cast<MidSideMode>(xml.getIntAttribute("midSideMode", 0));
    leaf.bypassed = xml.getBoolAttribute("bypassed", false);
    leaf.isDryPath = xml.getBoolAttribute("isDryPath", false);

    // Dry path nodes have no plugin to instantiate
    if (leaf.isDryPath) {
      node->name = "Dry Path";
      node->data = std::move(leaf);
      return node;
    }

    if (auto *descXml = xml.getChildByName("PLUGIN")) {
      leaf.description.loadFromXml(*descXml);
      node->name = leaf.description.name;

      // TEMP: Skip crashing plugin during state restoration
      // Remove this block once the project has been re-saved without it
      if (leaf.description.name.containsIgnoreCase("Timeless 3")) {
        PCLOG("xmlToNode — SKIPPING " + leaf.description.name +
              " (temporary blocklist)");
        return nullptr;
      }

      juce::String errorMessage;
      auto instance = pluginManager.createPluginInstance(
          leaf.description, currentSampleRate, currentBlockSize, errorMessage);

      // Fallback: if direct instantiation failed, try matching by
      // name+manufacturer from the known plugins list (handles cross-format
      // presets, e.g. VST3→AU)
      if (!instance) {
        PCLOG("xmlToNode — direct load failed for \"" + leaf.description.name +
              "\" (" + leaf.description.pluginFormatName +
              "): " + errorMessage + " — trying name match...");
        auto candidates = collectFormatCandidates(leaf.description);
        const auto &savedFormat = leaf.description.pluginFormatName;
        auto stateBase64Peek = xml.getStringAttribute("state");
        for (const auto &knownDesc : candidates) {
          juce::String fallbackError;
          instance = pluginManager.createPluginInstance(
              knownDesc, currentSampleRate, currentBlockSize, fallbackError);
          if (instance) {
            PCLOG("xmlToNode — fallback matched: " + knownDesc.name + " (" +
                  knownDesc.pluginFormatName + ")");
            if (!knownDesc.pluginFormatName.equalsIgnoreCase(savedFormat)) {
              importFormatSubstitutions.push_back(
                  {knownDesc.name, savedFormat, knownDesc.pluginFormatName,
                   stateBase64Peek.isNotEmpty()});
            }
            leaf.description = knownDesc;
            break;
          }
        }
        if (!instance)
          PCLOG("xmlToNode — no match found for \"" + leaf.description.name +
                "\"");
      }

      if (instance) {
        instance->prepareToPlay(currentSampleRate, currentBlockSize);

        // Store preset data to be applied AFTER prepareToPlay (deferred state
        // restoration)
        auto stateBase64 = xml.getStringAttribute("state");
        if (stateBase64.isNotEmpty()) {
          juce::MemoryBlock state;
          state.fromBase64Encoding(stateBase64);

          // Validate size (reject presets > 10MB)
          const size_t maxPresetSize = 10 * 1024 * 1024;
          if (state.getSize() > maxPresetSize) {
            DBG("Preset state too large: " + juce::String(state.getSize()) +
                " bytes");
          } else {
            // Store as base64 for deferred restoration
            leaf.pendingPresetData = stateBase64;
          }
        }

        auto wrapper =
            std::make_unique<PluginWithMeterWrapper>(std::move(instance));
        if (auto graphNode = addNode(std::move(wrapper)))
          leaf.graphNodeId = graphNode->nodeID;
      }
    }

    node->data = std::move(leaf);
  } else if (type == "group") {
    node->name = xml.getStringAttribute("name", "Group");
    node->collapsed = xml.getBoolAttribute("collapsed", false);

    GroupData group;
    auto modeStr = xml.getStringAttribute("mode");
    group.mode = modeStr == "parallel"     ? GroupMode::Parallel
                 : modeStr == "midside"    ? GroupMode::MidSide
                 : modeStr == "fxselector" ? GroupMode::FXSelector
                                           : GroupMode::Serial;
    if (group.mode == GroupMode::FXSelector)
      group.activeChildIndex = xml.getIntAttribute("activeChildIndex", 0);
    group.dryWetMix = static_cast<float>(xml.getDoubleAttribute("dryWet", 1.0));
    group.wetGainDb =
        static_cast<float>(xml.getDoubleAttribute("wetGainDb", 0.0));
    // New duck fields
    if (xml.hasAttribute("duckEnabled")) {
      group.duckEnabled = xml.getIntAttribute("duckEnabled", 0) != 0;
      group.duckThresholdDb =
          static_cast<float>(xml.getDoubleAttribute("duckThresholdDb", -20.0));
      group.duckAttackMs =
          static_cast<float>(xml.getDoubleAttribute("duckAttackMs", 5.0));
      group.duckReleaseMs =
          static_cast<float>(xml.getDoubleAttribute("duckReleaseMs", 200.0));
    } else if (xml.hasAttribute("duckAmount")) {
      // Backward compat: old duckAmount > 0 → duckEnabled = true (parallel
      // only)
      float oldAmount =
          static_cast<float>(xml.getDoubleAttribute("duckAmount", 0.0));
      group.duckEnabled =
          (oldAmount > 0.001f) && (group.mode == GroupMode::Parallel);
      group.duckThresholdDb = -20.0f;
      group.duckAttackMs = 5.0f;
      group.duckReleaseMs =
          static_cast<float>(xml.getDoubleAttribute("duckReleaseMs", 200.0));
    }
    // Group bypass (backward-compatible: defaults to false for old presets)
    group.bypassed = xml.getIntAttribute("groupBypassed", 0) != 0;

    for (auto *childXml : xml.getChildWithTagNameIterator("Node")) {
      // M-15: Limit children per group
      if (group.children.size() >= static_cast<size_t>(kMaxChildrenPerGroup))
        break;

      if (auto child = xmlToNode(*childXml, depth + 1))
        group.children.push_back(std::move(child));
    }

    node->data = std::move(group);
  }

  return node;
}

juce::var ChainProcessor::nodeToJson(const ChainNode &node, int depth) const {
  if (depth > kMaxChainDepth)
    return {};

  auto *obj = new juce::DynamicObject();
  obj->setProperty("id", node.id);

  if (node.isPlugin()) {
    obj->setProperty("type", "plugin");
    obj->setProperty("name", node.getPlugin().description.name);
    obj->setProperty("format", node.getPlugin().description.pluginFormatName);
    obj->setProperty("uid", node.getPlugin().description.uniqueId);
    obj->setProperty("fileOrIdentifier",
                     node.getPlugin().description.fileOrIdentifier);
    obj->setProperty("bypassed", node.getPlugin().bypassed);
    obj->setProperty("isDryPath", node.getPlugin().isDryPath);
    obj->setProperty("manufacturer",
                     node.getPlugin().description.manufacturerName);
    obj->setProperty("branchGainDb", node.branchGainDb);
    obj->setProperty("mute", node.mute.load());
    obj->setProperty("solo", node.solo);

    // Per-plugin controls
    auto &leaf = node.getPlugin();
    obj->setProperty("inputGainDb", leaf.inputGainDb);
    obj->setProperty("outputGainDb", leaf.outputGainDb);
    obj->setProperty("pluginDryWet", leaf.dryWetMix);
    obj->setProperty("midSideMode", static_cast<int>(leaf.midSideMode));
    obj->setProperty("autoGainEnabled", leaf.autoGainEnabled);

    // Per-plugin latency (Team 2)
    if (leaf.graphNodeId.uid != 0) {
      if (auto *proc = getNodeForId(leaf.graphNodeId)) {
        if (auto *audioProc = proc->getProcessor())
          obj->setProperty("latency", audioProc->getLatencySamples());
      }
    }
  } else if (node.isGroup()) {
    obj->setProperty("type", "group");
    obj->setProperty("name", node.name);
    obj->setProperty(
        "mode", node.getGroup().mode == GroupMode::Serial       ? "serial"
                : node.getGroup().mode == GroupMode::MidSide    ? "midside"
                : node.getGroup().mode == GroupMode::FXSelector ? "fxselector"
                                                                : "parallel");
    obj->setProperty("dryWet", node.getGroup().dryWetMix);
    obj->setProperty("wetGainDb", node.getGroup().wetGainDb);
    obj->setProperty("duckEnabled", node.getGroup().duckEnabled);
    obj->setProperty("duckThresholdDb", node.getGroup().duckThresholdDb);
    obj->setProperty("duckAttackMs", node.getGroup().duckAttackMs);
    obj->setProperty("duckReleaseMs", node.getGroup().duckReleaseMs);
    obj->setProperty("bypassed", node.getGroup().bypassed);
    obj->setProperty("collapsed", node.collapsed);
    if (node.getGroup().mode == GroupMode::FXSelector)
      obj->setProperty("activeChildIndex", node.getGroup().activeChildIndex);

    juce::Array<juce::var> childrenArr;
    for (const auto &child : node.getGroup().children)
      childrenArr.add(nodeToJson(*child, depth + 1));
    obj->setProperty("children", childrenArr);
  }

  return juce::var(obj);
}

juce::var ChainProcessor::nodeToJsonWithPresets(const ChainNode &node,
                                                int depth) const {
  if (depth > kMaxChainDepth)
    return {};

  auto *obj = new juce::DynamicObject();
  obj->setProperty("id", node.id);

  if (node.isPlugin()) {
    auto &leaf = node.getPlugin();
    obj->setProperty("type", "plugin");
    obj->setProperty("name", leaf.description.name);
    obj->setProperty("manufacturer", leaf.description.manufacturerName);
    obj->setProperty("format", leaf.description.pluginFormatName);
    obj->setProperty("uid", leaf.description.uniqueId);
    obj->setProperty("fileOrIdentifier", leaf.description.fileOrIdentifier);
    obj->setProperty("version", leaf.description.version);
    obj->setProperty("bypassed", leaf.bypassed);
    obj->setProperty("isDryPath", leaf.isDryPath);
    obj->setProperty("isInstrument", leaf.description.isInstrument);
    obj->setProperty("numInputChannels", leaf.description.numInputChannels);
    obj->setProperty("numOutputChannels", leaf.description.numOutputChannels);
    obj->setProperty("branchGainDb", node.branchGainDb);
    obj->setProperty("mute", node.mute.load());

    // Per-plugin controls
    obj->setProperty("inputGainDb", leaf.inputGainDb);
    obj->setProperty("outputGainDb", leaf.outputGainDb);
    obj->setProperty("pluginDryWet", leaf.dryWetMix);
    obj->setProperty("midSideMode", static_cast<int>(leaf.midSideMode));

    if (auto gNode = getNodeForId(leaf.graphNodeId)) {
      if (auto *processor = gNode->getProcessor()) {
        juce::MemoryBlock state;
        processor->getStateInformation(state);
        obj->setProperty("presetData", state.toBase64Encoding());
        obj->setProperty("presetSizeBytes", static_cast<int>(state.getSize()));
      }
    }
  } else if (node.isGroup()) {
    obj->setProperty("type", "group");
    obj->setProperty("name", node.name);
    obj->setProperty(
        "mode", node.getGroup().mode == GroupMode::Serial       ? "serial"
                : node.getGroup().mode == GroupMode::MidSide    ? "midside"
                : node.getGroup().mode == GroupMode::FXSelector ? "fxselector"
                                                                : "parallel");
    obj->setProperty("dryWet", node.getGroup().dryWetMix);
    obj->setProperty("wetGainDb", node.getGroup().wetGainDb);
    obj->setProperty("duckEnabled", node.getGroup().duckEnabled);
    obj->setProperty("duckThresholdDb", node.getGroup().duckThresholdDb);
    obj->setProperty("duckAttackMs", node.getGroup().duckAttackMs);
    obj->setProperty("duckReleaseMs", node.getGroup().duckReleaseMs);
    obj->setProperty("bypassed", node.getGroup().bypassed);
    obj->setProperty("collapsed", node.collapsed);
    if (node.getGroup().mode == GroupMode::FXSelector)
      obj->setProperty("activeChildIndex", node.getGroup().activeChildIndex);

    juce::Array<juce::var> childrenArr;
    for (const auto &child : node.getGroup().children)
      childrenArr.add(nodeToJsonWithPresets(*child, depth + 1));
    obj->setProperty("children", childrenArr);
  }

  return juce::var(obj);
}

std::unique_ptr<ChainNode> ChainProcessor::jsonToNode(const juce::var &json,
                                                      int depth) {
  if (depth > kMaxChainDepth)
    return nullptr;

  if (!json.isObject())
    return nullptr;

  auto *obj = json.getDynamicObject();
  if (!obj)
    return nullptr;

  auto node = std::make_unique<ChainNode>();
  node->id = static_cast<int>(obj->getProperty("id"));
  if (node->id >= nextNodeId)
    nextNodeId = node->id + 1;

  auto type = obj->getProperty("type").toString();

  if (type == "plugin") {
    node->name = obj->getProperty("name").toString();
    node->branchGainDb = static_cast<float>(obj->getProperty("branchGainDb"));
    node->mute.store(static_cast<bool>(obj->getProperty("mute")),
                     std::memory_order_relaxed);

    PluginLeaf leaf;
    leaf.bypassed = static_cast<bool>(obj->getProperty("bypassed"));
    leaf.isDryPath = static_cast<bool>(obj->getProperty("isDryPath"));

    // Dry path nodes have no plugin to instantiate
    if (leaf.isDryPath) {
      node->name = "Dry Path";
      node->data = std::move(leaf);
      return node;
    }

    // Per-plugin controls (backward-compatible: defaults if missing)
    leaf.inputGainDb = static_cast<float>(obj->getProperty("inputGainDb"));
    leaf.outputGainDb = static_cast<float>(obj->getProperty("outputGainDb"));
    leaf.dryWetMix = obj->hasProperty("pluginDryWet")
                         ? static_cast<float>(obj->getProperty("pluginDryWet"))
                         : 1.0f;
    leaf.midSideMode = obj->hasProperty("midSideMode")
                           ? static_cast<MidSideMode>(static_cast<int>(
                                 obj->getProperty("midSideMode")))
                           : MidSideMode::Off;

    // Build plugin description
    juce::PluginDescription desc;
    desc.name = obj->getProperty("name").toString();
    desc.manufacturerName = obj->getProperty("manufacturer").toString();
    desc.pluginFormatName = obj->getProperty("format").toString();
    desc.uniqueId = static_cast<int>(obj->getProperty("uid"));
    desc.fileOrIdentifier = obj->getProperty("fileOrIdentifier").toString();
    desc.version = obj->getProperty("version").toString();
    desc.isInstrument = static_cast<bool>(obj->getProperty("isInstrument"));
    desc.numInputChannels =
        static_cast<int>(obj->getProperty("numInputChannels"));
    desc.numOutputChannels =
        static_cast<int>(obj->getProperty("numOutputChannels"));
    leaf.description = desc;

    // Try to find matching plugin in user's system (multi-tier + catalog
    // aliases)
    auto candidates = collectFormatCandidates(desc);
    auto presetDataPeek = obj->getProperty("presetData").toString();

    juce::String errorMessage;
    std::unique_ptr<juce::AudioPluginInstance> instance;
    if (!candidates.empty()) {
      for (const auto &cand : candidates) {
        juce::String candError;
        instance = pluginManager.createPluginInstance(
            cand, currentSampleRate, currentBlockSize, candError);
        if (instance) {
          if (!cand.pluginFormatName.equalsIgnoreCase(desc.pluginFormatName)) {
            importFormatSubstitutions.push_back(
                {cand.name, desc.pluginFormatName, cand.pluginFormatName,
                 presetDataPeek.isNotEmpty()});
          }
          leaf.description = cand;
          break;
        }
      }
    } else {
      // No known match — try with the original desc directly
      instance = pluginManager.createPluginInstance(
          desc, currentSampleRate, currentBlockSize, errorMessage);
    }

    if (instance) {
      instance->prepareToPlay(currentSampleRate, currentBlockSize);

      // Store preset data to be applied AFTER prepareToPlay (deferred state
      // restoration)
      auto presetData = obj->getProperty("presetData").toString();
      if (presetData.isNotEmpty()) {
        // M-11: Reject oversized base64 preset data (~10MB decoded)
        if (presetData.length() > static_cast<int>(kMaxPresetBase64Size)) {
          DBG("jsonToNode — preset data too large (" +
              juce::String(presetData.length()) + " chars), discarding");
          presetData = juce::String();
        } else {
          leaf.pendingPresetData = presetData;
        }
      }

      // Parse parameter hints from seeded chains (only when no binary preset)
      auto paramsVar = obj->getProperty("parameters");
      if (paramsVar.isArray() && presetData.isEmpty()) {
        // L-9: Cap pending parameters to prevent resource exhaustion
        int paramCount = std::min(
            static_cast<int>(paramsVar.getArray()->size()), kMaxPendingParams);
        for (int i = 0; i < paramCount; ++i) {
          const auto &pVar = (*paramsVar.getArray())[i];
          if (!pVar.isObject())
            continue;
          PendingParameter pp;
          pp.name = pVar.getProperty("name", "").toString();
          pp.semantic = pVar.getProperty("semantic", "").toString();
          pp.unit = pVar.getProperty("unit", "").toString();
          auto valStr = pVar.getProperty("value", "").toString();
          if (valStr.isNotEmpty()) {
            pp.physicalValue = valStr.getFloatValue();
            pp.hasPhysicalValue = true;
          }
          pp.normalizedValue =
              static_cast<float>(pVar.getProperty("normalizedValue", 0.0));
          leaf.pendingParameters.push_back(pp);
        }
      }

      auto wrapper =
          std::make_unique<PluginWithMeterWrapper>(std::move(instance));
      if (auto graphNode = addNode(std::move(wrapper)))
        leaf.graphNodeId = graphNode->nodeID;
    } else {
      // Track failure for import result reporting
      importFailures.push_back(
          {importSlotCounter, desc.name,
           !candidates.empty() ? "load_error" : "not_found"});
    }
    importSlotCounter++;

    node->data = std::move(leaf);
  } else if (type == "group") {
    node->name = obj->getProperty("name").toString();
    node->collapsed = static_cast<bool>(obj->getProperty("collapsed"));

    GroupData group;
    auto modeStrJ = obj->getProperty("mode").toString();
    group.mode = modeStrJ == "parallel"     ? GroupMode::Parallel
                 : modeStrJ == "midside"    ? GroupMode::MidSide
                 : modeStrJ == "fxselector" ? GroupMode::FXSelector
                                            : GroupMode::Serial;
    if (group.mode == GroupMode::FXSelector &&
        obj->hasProperty("activeChildIndex"))
      group.activeChildIndex =
          static_cast<int>(obj->getProperty("activeChildIndex"));
    group.dryWetMix = static_cast<float>(obj->getProperty("dryWet"));
    // New duck fields
    if (obj->hasProperty("duckEnabled")) {
      group.duckEnabled = static_cast<bool>(obj->getProperty("duckEnabled"));
      group.duckThresholdDb =
          obj->hasProperty("duckThresholdDb")
              ? static_cast<float>(obj->getProperty("duckThresholdDb"))
              : -20.0f;
      group.duckAttackMs =
          obj->hasProperty("duckAttackMs")
              ? static_cast<float>(obj->getProperty("duckAttackMs"))
              : 5.0f;
      group.duckReleaseMs =
          obj->hasProperty("duckReleaseMs")
              ? static_cast<float>(obj->getProperty("duckReleaseMs"))
              : 200.0f;
    } else if (obj->hasProperty("duckAmount")) {
      // Backward compat: old duckAmount > 0 → duckEnabled = true (parallel
      // only)
      float oldAmount = static_cast<float>(obj->getProperty("duckAmount"));
      group.duckEnabled =
          (oldAmount > 0.001f) && (group.mode == GroupMode::Parallel);
      group.duckThresholdDb = -20.0f;
      group.duckAttackMs = 5.0f;
      group.duckReleaseMs =
          obj->hasProperty("duckReleaseMs")
              ? static_cast<float>(obj->getProperty("duckReleaseMs"))
              : 200.0f;
    }
    // Group bypass (backward-compatible: defaults to false for old chains)
    if (obj->hasProperty("bypassed"))
      group.bypassed = static_cast<bool>(obj->getProperty("bypassed"));

    auto childrenVar = obj->getProperty("children");
    if (childrenVar.isArray()) {
      for (const auto &childVar : *childrenVar.getArray()) {
        // M-15: Limit children per group
        if (group.children.size() >= static_cast<size_t>(kMaxChildrenPerGroup))
          break;

        if (auto child = jsonToNode(childVar, depth + 1))
          group.children.push_back(std::move(child));
      }
    }

    node->data = std::move(group);
  }

  return node;
}

juce::var ChainProcessor::getChainStateAsJson() const {
  // Emit tree-structured JSON with backward compat
  auto *result = new juce::DynamicObject();

  // Defensive check: rootNode should always be a group, but verify to avoid
  // std::bad_variant_access
  if (!rootNode.isGroup()) {
    jassertfalse; // This should never happen! Log in debug builds.
    DBG("ERROR: rootNode is not a group! This indicates memory corruption or a "
        "threading bug.");
    result->setProperty("nodes", juce::Array<juce::var>());
    result->setProperty("slots", juce::Array<juce::var>());
    result->setProperty("numSlots", 0);
    return juce::var(result);
  }

  // Tree format (new)
  juce::Array<juce::var> nodesArray;
  for (const auto &child : rootNode.getGroup().children)
    nodesArray.add(nodeToJson(*child));
  result->setProperty("nodes", nodesArray);

  // Also emit flat slots for backward compat
  juce::Array<juce::var> slotsArray;
  std::vector<const PluginLeaf *> flatPlugins;
  ChainNodeHelpers::collectPlugins(rootNode, flatPlugins);

  for (size_t i = 0; i < flatPlugins.size(); ++i) {
    auto *obj = new juce::DynamicObject();
    obj->setProperty("index", static_cast<int>(i));
    obj->setProperty("name", flatPlugins[i]->description.name);
    obj->setProperty("format", flatPlugins[i]->description.pluginFormatName);
    obj->setProperty("uid", flatPlugins[i]->description.uniqueId);
    obj->setProperty("fileOrIdentifier",
                     flatPlugins[i]->description.fileOrIdentifier);
    obj->setProperty("bypassed", flatPlugins[i]->bypassed);
    obj->setProperty("manufacturer",
                     flatPlugins[i]->description.manufacturerName);
    slotsArray.add(juce::var(obj));
  }
  result->setProperty("slots", slotsArray);
  result->setProperty("numSlots", static_cast<int>(flatPlugins.size()));
  result->setProperty("totalLatencySamples", getTotalLatencySamples());
  result->setProperty("sampleRate", getSampleRate());

  return juce::var(result);
}

void ChainProcessor::serializeStateNoSuspend(juce::MemoryBlock &destData) {
  // Best-effort serialization without suspending the audio thread.
  // Used for crash recovery saves and undo snapshots where a brief data race
  // between this call and the audio thread's processBlock() on individual
  // plugin state is acceptable — far preferable to a guaranteed 50ms audio
  // dropout.
  std::lock_guard<std::mutex> lock(stateMutex);

  auto xml = std::make_unique<juce::XmlElement>("ChainState");
  xml->setAttribute("version", 2);

  if (rootNode.isGroup()) {
    for (const auto &child : rootNode.getGroup().children)
      nodeToXml(*child, *xml);
  }

  copyXmlToBinary(*xml, destData);
}

void ChainProcessor::getStateInformation(juce::MemoryBlock &destData) {
  // Use mutex to prevent multiple concurrent saves (DAW save + manual export)
  std::lock_guard<std::mutex> lock(stateMutex);

  // Suspend audio processing to prevent concurrent tree modifications
  // while we serialize. This ensures atomicity without holding SpinLock
  // for 500-2000ms (which would freeze the audio thread).
  suspendProcessing(true);

  // CRITICAL: suspendProcessing(true) only sets a flag — the audio thread's
  // current processBlock() call runs to completion before it checks the flag.
  // We must wait for the in-flight audio block to finish before calling
  // getStateInformation() on hosted plugins, otherwise we race with their
  // processBlock() (many third-party plugins are not thread-safe between
  // processBlock and getStateInformation). At 44100Hz / 1024 samples,
  // one block takes ~23ms; two blocks give a comfortable margin.
  juce::Thread::sleep(50);

  auto xml = std::make_unique<juce::XmlElement>("ChainState");
  xml->setAttribute("version", 2);

  // Serialize tree (can take 500-2000ms for many plugins)
  // Safe because suspendProcessing() prevents concurrent modifications
  if (rootNode.isGroup()) {
    for (const auto &child : rootNode.getGroup().children)
      nodeToXml(*child, *xml);
  } else {
    jassertfalse; // This should never happen!
    DBG("ERROR: rootNode is not a group in getStateInformation!");
  }

  copyXmlToBinary(*xml, destData);

  suspendProcessing(false);
}

void ChainProcessor::setStateInformation(const void *data, int sizeInBytes) {
  // Check for crash recovery file first
  // If it exists and is recent (less than 5 minutes old), it likely contains
  // parameter changes that were made after the last DAW save
  auto recoveryFile = getCrashRecoveryFile();
  if (recoveryFile.existsAsFile()) {
    auto fileAge =
        juce::Time::getCurrentTime() - recoveryFile.getLastModificationTime();
    auto fiveMinutes = juce::RelativeTime::minutes(5);

    if (fileAge < fiveMinutes) {
      // Recovery file is recent - try to restore from it
      DBG("ProChain: Found recent crash recovery file, attempting restore...");

      juce::MemoryBlock recoveryState;
      if (recoveryFile.loadFileAsData(recoveryState) &&
          recoveryState.getSize() > 0) {
        // L-5: Reject oversized recovery files
        if (recoveryState.getSize() > kMaxRecoverySize) {
          DBG("ProChain: Recovery file too large (" +
              juce::String(static_cast<int64_t>(recoveryState.getSize())) +
              " bytes), ignoring");
          recoveryState.reset();
        }

        // Use the recovery file state instead of the DAW state
        // This preserves parameter changes made after the last manual save
        if (recoveryState.getSize() > 0) {
          data = recoveryState.getData();
          sizeInBytes = static_cast<int>(recoveryState.getSize());

          DBG("ProChain: Successfully loaded crash recovery state (" +
              juce::String(sizeInBytes) + " bytes)");
        }
      }
    }

    // Clean up recovery file after successful restore (whether used or not)
    recoveryFile.deleteFile();
  }

  if (auto xml = getXmlFromBinary(data, sizeInBytes)) {
    if (xml->hasTagName("ChainState")) {
      // CRITICAL: Suspend audio BEFORE any graph modifications.
      suspendProcessing(true);

      // RAII guard: prevent latency-refresh timer from triggering a rebuild
      // while the tree is being cleared and repopulated (AU instantiation can
      // pump the macOS run loop, allowing timer callbacks to fire
      // mid-operation). The guard ensures the flag is always cleared even if
      // an exception or early return occurs.
      {
        TreeModificationGuard treeGuard(treeModificationInProgress_);

        // Clear existing chain
        hideAllPluginWindows();

        if (onBeforeDeletePlugin)
          onBeforeDeletePlugin();

        // Remove all plugin graph nodes
        std::vector<PluginLeaf *> allPlugins;
        ChainNodeHelpers::collectPluginsMut(rootNode, allPlugins);
        for (auto *plug : allPlugins)
          AudioProcessorGraph::removeNode(plug->graphNodeId);

        // Defensive check: rootNode should always be a group
        if (!rootNode.isGroup()) {
          jassertfalse; // This should never happen!
          DBG("ERROR: rootNode is not a group in setStateInformation! "
              "Reinitializing.");
          rootNode.data = GroupData{GroupMode::Serial};
        }

        rootNode.getGroup().children.clear();

        int version = xml->getIntAttribute("version", 1);

        if (version >= 2) {
          // V2: read recursive Node elements
          for (auto *nodeXml : xml->getChildWithTagNameIterator("Node")) {
            // M-15: Limit children per group
            if (rootNode.getGroup().children.size() >=
                static_cast<size_t>(kMaxChildrenPerGroup))
              break;

            if (auto child = xmlToNode(*nodeXml))
              rootNode.getGroup().children.push_back(std::move(child));
          }
        } else {
          // V1 backward compat: read flat <Slot> elements
          for (auto *slotXml : xml->getChildWithTagNameIterator("Slot")) {
            if (auto *descXml = slotXml->getChildByName("PLUGIN")) {
              juce::PluginDescription desc;
              desc.loadFromXml(*descXml);

              // Create as a simple V2 plugin node XML and parse it
              auto pluginXml = std::make_unique<juce::XmlElement>("Node");
              pluginXml->setAttribute("id", nextNodeId);
              pluginXml->setAttribute("type", "plugin");
              pluginXml->setAttribute(
                  "bypassed", slotXml->getBoolAttribute("bypassed", false));
              pluginXml->addChildElement(new juce::XmlElement(*descXml));

              auto stateBase64 = slotXml->getStringAttribute("state");
              if (stateBase64.isNotEmpty())
                pluginXml->setAttribute("state", stateBase64);

              if (auto child = xmlToNode(*pluginXml))
                rootNode.getGroup().children.push_back(std::move(child));
            }
          }
        }

        cachedSlotsDirty = true;
      } // TreeModificationGuard — flag cleared, safe to rebuild
      lastRebuildCaller_ = "setStateInformation";
      rebuildGraph();

      // CRITICAL: Apply pending preset data AFTER rebuildGraph() has called
      // prepareToPlay() on all plugins. This ensures plugins are fully
      // initialized before state restoration, preventing memory corruption.
      std::vector<PluginLeaf *> allPluginsForState;
      ChainNodeHelpers::collectPluginsMut(rootNode, allPluginsForState);
      for (auto *plug : allPluginsForState) {
        if (plug->pendingPresetData.isNotEmpty()) {
          if (auto gNode = getNodeForId(plug->graphNodeId)) {
            if (auto *processor = gNode->getProcessor()) {
              juce::MemoryBlock state;
              state.fromBase64Encoding(plug->pendingPresetData);
              PCLOG("setStateInfo — " + plug->description.name + " (" +
                    juce::String(static_cast<int>(state.getSize())) +
                    " bytes)");
              processor->setStateInformation(state.getData(),
                                             static_cast<int>(state.getSize()));
              PCLOG("setStateInfo — " + plug->description.name + " done");
            }
          }
          plug->pendingPresetData.clear(); // Clear after applying
        }
      }

      suspendProcessing(false);

      // CRITICAL FIX: Invalidate the latency cache AFTER preset application.
      // rebuildGraph() computed latency using plugins' DEFAULT latency values
      // (e.g., Auto-Tune reports 2566 by default). Preset restoration may
      // change plugin latency (e.g., Auto-Tune's low-latency mode → 112).
      // Without this invalidation, notifyChainChanged() captures the stale
      // cached value (5748) instead of the correct post-preset value (3294),
      // causing Ableton's PDC to be off by thousands of samples.
      invalidateLatencyCache();

      // Also update the internal graph's latency so it matches reality
      int postPresetLatency = getTotalLatencySamples();
      setLatencySamples(postPresetLatency);
      PCLOG("setStateInformation — post-preset latency=" +
            juce::String(postPresetLatency));

      notifyChainChanged();
      if (onParameterBindingChanged)
        onParameterBindingChanged();
    }
  }
}

//==============================================================================
// Preset-level tree serialization
//==============================================================================

std::unique_ptr<juce::XmlElement> ChainProcessor::serializeChainToXml() const {
  auto xml = std::make_unique<juce::XmlElement>("ChainTree");
  xml->setAttribute("version", 2);

  // Defensive check: rootNode should always be a group
  if (rootNode.isGroup()) {
    for (const auto &child : rootNode.getGroup().children)
      nodeToXml(*child, *xml);
  } else {
    jassertfalse; // This should never happen!
    DBG("ERROR: rootNode is not a group in serializeChainToXml!");
  }

  return xml;
}

ChainProcessor::RestoreResult
ChainProcessor::restoreChainFromXml(const juce::XmlElement &chainXml) {
  RestoreResult result;
  importFormatSubstitutions.clear();
  int version = chainXml.getIntAttribute("version", 1);

  // CRITICAL: Suspend audio processing BEFORE modifying the graph.
  // xmlToNode() calls addNode() which triggers sync render-sequence updates;
  // without suspending first, the audio thread processes partial chains →
  // crash.
  suspendProcessing(true);

  // RAII guard: prevent latency-refresh timer from triggering a rebuild while
  // the tree is being cleared and repopulated.
  {
    TreeModificationGuard treeGuard(treeModificationInProgress_);

    // Clear existing chain (same logic as setStateInformation)
    hideAllPluginWindows();

    if (onBeforeDeletePlugin)
      onBeforeDeletePlugin();

    std::vector<PluginLeaf *> allPlugins;
    ChainNodeHelpers::collectPluginsMut(rootNode, allPlugins);
    for (auto *plug : allPlugins)
      AudioProcessorGraph::removeNode(plug->graphNodeId);

    // Defensive check: rootNode should always be a group
    if (!rootNode.isGroup()) {
      jassertfalse; // This should never happen!
      DBG("ERROR: rootNode is not a group in restoreChainFromXml! "
          "Reinitializing.");
      rootNode.data = GroupData{GroupMode::Serial};
    }

    rootNode.getGroup().children.clear();

    if (version >= 2) {
      // V2: read recursive Node elements
      for (auto *nodeXml : chainXml.getChildWithTagNameIterator("Node")) {
        if (auto child = xmlToNode(*nodeXml))
          rootNode.getGroup().children.push_back(std::move(child));
      }
    } else {
      // V1 backward compat: read flat <Slot> elements
      for (auto *slotXml : chainXml.getChildWithTagNameIterator("Slot")) {
        if (auto *descXml = slotXml->getChildByName("PLUGIN")) {
          auto pluginXml = std::make_unique<juce::XmlElement>("Node");
          pluginXml->setAttribute("id", nextNodeId);
          pluginXml->setAttribute("type", "plugin");
          pluginXml->setAttribute("bypassed",
                                  slotXml->getBoolAttribute("bypassed", false));
          pluginXml->addChildElement(new juce::XmlElement(*descXml));

          auto stateBase64 = slotXml->getStringAttribute("state");
          if (stateBase64.isNotEmpty())
            pluginXml->setAttribute("state", stateBase64);

          if (auto child = xmlToNode(*pluginXml))
            rootNode.getGroup().children.push_back(std::move(child));
        }
      }
    }

    // Scan for missing plugins (failed to instantiate = no valid graph node)
    std::vector<const PluginLeaf *> flatPlugins;
    ChainNodeHelpers::collectPlugins(rootNode, flatPlugins);
    for (const auto *plug : flatPlugins) {
      if (plug->graphNodeId == juce::AudioProcessorGraph::NodeID())
        result.missingPlugins.add(plug->description.name);
    }

    cachedSlotsDirty = true;
  } // TreeModificationGuard — flag cleared, safe to rebuild
  lastRebuildCaller_ = "restoreChainFromXml";
  rebuildGraph();

  // CRITICAL: Apply pending preset data AFTER rebuildGraph() has called
  // prepareToPlay() on all plugins. This ensures plugins are fully initialized
  // before state restoration, preventing memory corruption.
  std::vector<PluginLeaf *> allPluginsForState;
  ChainNodeHelpers::collectPluginsMut(rootNode, allPluginsForState);
  for (auto *plug : allPluginsForState) {
    if (plug->pendingPresetData.isNotEmpty()) {
      if (auto gNode = getNodeForId(plug->graphNodeId)) {
        if (auto *processor = gNode->getProcessor()) {
          juce::MemoryBlock state;
          state.fromBase64Encoding(plug->pendingPresetData);
          PCLOG("setStateInfo — " + plug->description.name + " (" +
                juce::String(static_cast<int>(state.getSize())) + " bytes)");
          processor->setStateInformation(state.getData(),
                                         static_cast<int>(state.getSize()));
          PCLOG("setStateInfo — " + plug->description.name + " done");
        }
      }
      plug->pendingPresetData.clear(); // Clear after applying
    }
  }

  suspendProcessing(false);

  // CRITICAL FIX: Same as setStateInformation — invalidate latency cache
  // after preset application so notifyChainChanged() reports correct values.
  invalidateLatencyCache();
  int postPresetLatency = getTotalLatencySamples();
  setLatencySamples(postPresetLatency);
  PCLOG("restoreChainFromXml — post-preset latency=" +
        juce::String(postPresetLatency));

  notifyChainChanged();
  if (onParameterBindingChanged)
    onParameterBindingChanged();

  result.formatSubstitutions = std::move(importFormatSubstitutions);
  result.success = true;
  return result;
}

juce::MemoryBlock ChainProcessor::captureSnapshot() const {
  // Use no-suspend path: this is called for undo/redo baseline snapshots and
  // post-prepareToPlay stable state — contexts where a brief race with the
  // audio thread is acceptable and avoiding the 50ms dropout is critical.
  juce::MemoryBlock snapshot;
  const_cast<ChainProcessor *>(this)->serializeStateNoSuspend(snapshot);
  return snapshot;
}

void ChainProcessor::restoreSnapshot(const juce::MemoryBlock &snapshot) {
  setStateInformation(snapshot.getData(), static_cast<int>(snapshot.getSize()));
}

//==============================================================================
// Cloud Sharing
//==============================================================================

juce::var ChainProcessor::exportChainWithPresets() const {
  auto *result = new juce::DynamicObject();
  result->setProperty("version", 2);

  // Defensive check: rootNode should always be a group
  if (!rootNode.isGroup()) {
    jassertfalse; // This should never happen!
    DBG("ERROR: rootNode is not a group in exportChainWithPresets!");
    result->setProperty("nodes", juce::Array<juce::var>());
    result->setProperty("slots", juce::Array<juce::var>());
    result->setProperty("numSlots", 0);
    return juce::var(result);
  }

  juce::Array<juce::var> nodesArray;
  for (const auto &child : rootNode.getGroup().children)
    nodesArray.add(nodeToJsonWithPresets(*child));
  result->setProperty("nodes", nodesArray);
  result->setProperty("numSlots", ChainNodeHelpers::countPlugins(rootNode));

  // Also emit flat slots for V1 backward compat consumers
  juce::Array<juce::var> slotsArray;
  std::vector<const PluginLeaf *> flatPlugins;
  ChainNodeHelpers::collectPlugins(rootNode, flatPlugins);

  for (size_t i = 0; i < flatPlugins.size(); ++i) {
    auto *obj = new juce::DynamicObject();
    obj->setProperty("index", static_cast<int>(i));
    obj->setProperty("name", flatPlugins[i]->description.name);
    obj->setProperty("manufacturer",
                     flatPlugins[i]->description.manufacturerName);
    obj->setProperty("format", flatPlugins[i]->description.pluginFormatName);
    obj->setProperty("uid", flatPlugins[i]->description.uniqueId);
    obj->setProperty("fileOrIdentifier",
                     flatPlugins[i]->description.fileOrIdentifier);
    obj->setProperty("version", flatPlugins[i]->description.version);
    obj->setProperty("bypassed", flatPlugins[i]->bypassed);
    obj->setProperty("isInstrument", flatPlugins[i]->description.isInstrument);
    obj->setProperty("numInputChannels",
                     flatPlugins[i]->description.numInputChannels);
    obj->setProperty("numOutputChannels",
                     flatPlugins[i]->description.numOutputChannels);

    if (auto gNode = getNodeForId(flatPlugins[i]->graphNodeId)) {
      if (auto *processor = gNode->getProcessor()) {
        juce::MemoryBlock state;
        processor->getStateInformation(state);
        obj->setProperty("presetData", state.toBase64Encoding());
        obj->setProperty("presetSizeBytes", static_cast<int>(state.getSize()));
      }
    }

    slotsArray.add(juce::var(obj));
  }
  result->setProperty("slots", slotsArray);

  return juce::var(result);
}

void ChainProcessor::applyPendingParameters(
    juce::AudioProcessor *processor,
    const std::vector<PendingParameter> &pending,
    const juce::String &pluginName, const juce::String &manufacturer) {
  auto &params = processor->getParameters();
  if (params.isEmpty())
    return;

  // Try semantic matching via ParameterDiscovery
  auto discoveredMap = ParameterDiscovery::discoverParameterMap(
      processor, pluginName, manufacturer);

  // Build semantic→index lookup from discovered map
  std::map<juce::String, int> semanticToIndex;
  for (const auto &dp : discoveredMap.parameters)
    if (dp.matched && dp.semantic.isNotEmpty())
      semanticToIndex[dp.semantic] = dp.juceParamIndex;

  PCLOG("applyPendingParameters: " + pluginName + " — " +
        juce::String(static_cast<int>(pending.size())) + " pending, " +
        juce::String(params.size()) + " plugin params, " +
        juce::String(static_cast<int>(semanticToIndex.size())) +
        " semantic matches");

  int applied = 0;

  for (const auto &pp : pending) {
    int targetIndex = -1;
    float targetValue = pp.normalizedValue; // fallback

    // Tier 1: Semantic match
    if (pp.semantic.isNotEmpty()) {
      auto it = semanticToIndex.find(pp.semantic);
      if (it != semanticToIndex.end()) {
        targetIndex = it->second;
        // If we have a physical value, renormalize using the plugin's actual
        // range
        if (pp.hasPhysicalValue && targetIndex >= 0 &&
            targetIndex < params.size()) {
          auto *param = params[targetIndex];
          if (auto *ranged =
                  dynamic_cast<juce::RangedAudioParameter *>(param)) {
            auto &range = ranged->getNormalisableRange();
            targetValue = range.convertTo0to1(
                juce::jlimit(range.start, range.end, pp.physicalValue));
          }
        }
      }
    }

    // Tier 2: Fuzzy name match fallback
    if (targetIndex < 0 && pp.name.isNotEmpty()) {
      auto ppName = pp.name.toLowerCase();
      for (int i = 0; i < params.size(); ++i) {
        auto paramName = params[i]->getName(256).toLowerCase();
        if (paramName == ppName || paramName.contains(ppName) ||
            ppName.contains(paramName)) {
          targetIndex = i;
          break;
        }
      }
    }

    if (targetIndex >= 0 && targetIndex < params.size()) {
      auto *param = params[targetIndex];
      float clamped = juce::jlimit(0.0f, 1.0f, targetValue);
      param->setValueNotifyingHost(clamped);
      applied++;
    }
  }

  // Auto-activate EQ bands that had parameters set.
  // FabFilter Pro-Q (and similar) use a "Band N Used" parameter to activate
  // bands — setting freq/gain/Q without activating the band has no visible
  // effect.
  std::set<int> activatedBands;
  for (const auto &pp : pending) {
    if (pp.semantic.startsWith("eq_band_")) {
      // Extract band number from semantic like "eq_band_3_freq"
      auto afterPrefix = pp.semantic.substring(8); // after "eq_band_"
      int bandNum = afterPrefix.getIntValue();
      if (bandNum > 0 && activatedBands.find(bandNum) == activatedBands.end()) {
        // Search for "Band N Used" parameter
        auto usedName = "Band " + juce::String(bandNum) + " Used";
        for (int i = 0; i < params.size(); ++i) {
          if (params[i]->getName(64).equalsIgnoreCase(usedName)) {
            if (params[i]->getValue() < 0.5f)
              params[i]->setValueNotifyingHost(1.0f);
            activatedBands.insert(bandNum);
            break;
          }
        }
      }
    }
  }

  PCLOG("applyPendingParameters: " + pluginName + " — applied " +
        juce::String(applied) + "/" +
        juce::String(static_cast<int>(pending.size())) + " bands activated: " +
        juce::String(static_cast<int>(activatedBands.size())));
}

ChainProcessor::ImportResult
ChainProcessor::importChainWithPresets(const juce::var &data) {
  ImportResult result;

  if (!data.isObject())
    return result;

  auto *obj = data.getDynamicObject();
  if (!obj)
    return result;

  int version = static_cast<int>(obj->getProperty("version"));

  // Reset per-import failure tracking
  importFailures.clear();
  importFormatSubstitutions.clear();
  importSlotCounter = 0;

  // CRITICAL: Suspend audio BEFORE any graph modifications.
  suspendProcessing(true);

  // RAII guard: prevent latency-refresh timer from triggering a rebuild while
  // the tree is being cleared and repopulated.
  {
    TreeModificationGuard treeGuard(treeModificationInProgress_);

    // Clear existing chain
    hideAllPluginWindows();

    if (onBeforeDeletePlugin)
      onBeforeDeletePlugin();

    std::vector<PluginLeaf *> allPlugins;
    ChainNodeHelpers::collectPluginsMut(rootNode, allPlugins);
    for (auto *plug : allPlugins)
      AudioProcessorGraph::removeNode(plug->graphNodeId);

    // Defensive check: rootNode should always be a group
    if (!rootNode.isGroup()) {
      jassertfalse; // This should never happen!
      DBG("ERROR: rootNode is not a group in importChainWithPresets! "
          "Reinitializing.");
      rootNode.data = GroupData{GroupMode::Serial};
    }

    rootNode.getGroup().children.clear();

    if (version >= 2 && obj->hasProperty("nodes")) {
      // V2: import tree structure
      auto nodesVar = obj->getProperty("nodes");
      if (nodesVar.isArray()) {
        for (const auto &nodeVar : *nodesVar.getArray()) {
          if (auto child = jsonToNode(nodeVar))
            rootNode.getGroup().children.push_back(std::move(child));
        }
      }
    } else {
      // V1: import flat slots
      auto slotsVar = obj->getProperty("slots");
      if (!slotsVar.isArray()) {
        // Guard destructor clears treeModificationInProgress_
        suspendProcessing(false);
        return result;
      }

      for (const auto &slotVar : *slotsVar.getArray()) {
        if (auto child = jsonToNode(slotVar))
          rootNode.getGroup().children.push_back(std::move(child));
      }
    }

    // M-16: Reject imports with too many plugins
    int totalPlugins = ChainNodeHelpers::countPlugins(rootNode);
    if (totalPlugins > kMaxTotalPlugins) {
      DBG("importChainWithPresets — too many plugins (" +
          juce::String(totalPlugins) + ", max " +
          juce::String(kMaxTotalPlugins) + "), rejecting");
      std::vector<PluginLeaf *> addedPlugins;
      ChainNodeHelpers::collectPluginsMut(rootNode, addedPlugins);
      for (auto *plug : addedPlugins)
        AudioProcessorGraph::removeNode(plug->graphNodeId);
      rootNode.getGroup().children.clear();
      cachedSlotsDirty = true;
      // Guard destructor clears treeModificationInProgress_
      suspendProcessing(false);
      return result;
    }

    cachedSlotsDirty = true;
  } // TreeModificationGuard — flag cleared, safe to rebuild
  lastRebuildCaller_ = "importChainWithPresets";
  rebuildGraph();

  // CRITICAL: Apply pending preset data AFTER rebuildGraph() has called
  // prepareToPlay() on all plugins. This ensures plugins are fully initialized
  // before state restoration, preventing memory corruption.
  std::vector<PluginLeaf *> allPluginsForState;
  ChainNodeHelpers::collectPluginsMut(rootNode, allPluginsForState);
  for (auto *plug : allPluginsForState) {
    if (plug->pendingPresetData.isNotEmpty()) {
      if (auto gNode = getNodeForId(plug->graphNodeId)) {
        if (auto *processor = gNode->getProcessor()) {
          juce::MemoryBlock state;
          state.fromBase64Encoding(plug->pendingPresetData);

          // M-11: Skip oversized preset data (defense-in-depth)
          if (state.getSize() > kMaxPresetSize) {
            DBG("importChainWithPresets — preset too large for " +
                plug->description.name + " (" + juce::String(state.getSize()) +
                " bytes), skipping");
          } else {
            PCLOG("setStateInfo — " + plug->description.name + " (" +
                  juce::String(static_cast<int>(state.getSize())) + " bytes)");
            processor->setStateInformation(state.getData(),
                                           static_cast<int>(state.getSize()));
            PCLOG("setStateInfo — " + plug->description.name + " done");
          }
        }
      }
      plug->pendingPresetData.clear(); // Clear after applying
    }
  }

  // Apply pending parameters for slots without binary presetData (seeded
  // chains)
  for (auto *plug : allPluginsForState) {
    if (!plug->pendingParameters.empty()) {
      if (auto gNode = getNodeForId(plug->graphNodeId)) {
        // Unwrap PluginWithMeterWrapper to access the real plugin's parameters
        juce::AudioProcessor *proc = nullptr;
        if (auto *wrapper =
                dynamic_cast<PluginWithMeterWrapper *>(gNode->getProcessor()))
          proc = wrapper->getWrappedPlugin();
        else
          proc = gNode->getProcessor();

        if (proc != nullptr) {
          applyPendingParameters(proc, plug->pendingParameters,
                                 plug->description.name,
                                 plug->description.manufacturerName);
        }
      }
      plug->pendingParameters.clear();
    }
  }

  suspendProcessing(false);

  // CRITICAL FIX: Same as setStateInformation — invalidate latency cache
  // after preset application so notifyChainChanged() reports correct values.
  invalidateLatencyCache();
  int postPresetLatency = getTotalLatencySamples();
  setLatencySamples(postPresetLatency);
  PCLOG("importChainWithPresets — post-preset latency=" +
        juce::String(postPresetLatency));

  // Build import result
  result.totalSlots = importSlotCounter;
  result.failures = std::move(importFailures);
  result.formatSubstitutions = std::move(importFormatSubstitutions);
  result.failedSlots = static_cast<int>(result.failures.size());
  result.loadedSlots = result.totalSlots - result.failedSlots;
  result.success =
      true; // chain structure loaded (even if some plugins missing)

  notifyChainChanged();
  if (onParameterBindingChanged)
    onParameterBindingChanged();
  return result;
}

juce::String ChainProcessor::getSlotPresetData(int slotIndex) const {
  auto *leaf = getPluginByFlatIndex(slotIndex);
  if (!leaf)
    return {};

  if (auto gNode = getNodeForId(leaf->graphNodeId)) {
    if (auto *processor = gNode->getProcessor()) {
      juce::MemoryBlock state;
      processor->getStateInformation(state);
      return state.toBase64Encoding();
    }
  }

  return {};
}

bool ChainProcessor::setSlotPresetData(int slotIndex,
                                       const juce::String &base64Data) {
  auto *leaf = getPluginByFlatIndex(slotIndex);
  if (!leaf || base64Data.isEmpty())
    return false;

  juce::MemoryBlock state;
  state.fromBase64Encoding(base64Data);

  if (auto gNode = getNodeForId(leaf->graphNodeId)) {
    if (auto *processor = gNode->getProcessor()) {
      processor->setStateInformation(state.getData(),
                                     static_cast<int>(state.getSize()));
      return true;
    }
  }

  return false;
}

//==============================================================================
// Crash Recovery - Async State Persistence
//==============================================================================

juce::File ChainProcessor::getCrashRecoveryFile() const {
  auto tempDir = juce::File::getSpecialLocation(juce::File::tempDirectory);

  // Use unique identifier based on this processor's memory address
  // This ensures each plugin instance has its own recovery file
  auto uniqueId = juce::String::toHexString(
      reinterpret_cast<juce::pointer_sized_int>(this));

  return tempDir.getChildFile("ProChain_Recovery_" + uniqueId + ".dat");
}

void ChainProcessor::saveCrashRecoveryStateAsync() {
  // Throttle: Skip if we saved less than 2 seconds ago
  auto now = juce::Time::currentTimeMillis();
  auto lastSave = lastCrashRecoverySaveTime.load();

  if (now - lastSave < kMinCrashRecoverySaveIntervalMs) {
    // Schedule a delayed save to catch the final state
    juce::Timer::callAfterDelay(kMinCrashRecoverySaveIntervalMs,
                                [this, alive = aliveFlag]() {
                                  if (alive->load(std::memory_order_acquire) &&
                                      !pendingCrashRecoverySave.load())
                                    saveCrashRecoveryStateAsync();
                                });
    return;
  }

  // Skip if already saving
  if (pendingCrashRecoverySave.exchange(true))
    return;

  lastCrashRecoverySaveTime.store(now);

  // CRITICAL: Defer serialization to the next message loop iteration.
  // This function is often called from notifyChainChanged() inside addPlugin(),
  // right after suspendProcessing(false) resumed the audio thread. If we call
  // getStateInformation() synchronously here, it calls suspendProcessing(true)
  // which only sets a FLAG — it does NOT wait for the current audio block to
  // finish. The audio thread continues its current processBlock() while we
  // start calling getStateInformation() on each hosted plugin, causing a data
  // race that crashes third-party plugins (e.g., Maag EQ4, or any plugin
  // without thread-safe state access). By deferring to callAsync, we let the
  // current bridge callback complete, the audio thread finishes its in-flight
  // block, and the next iteration's suspendProcessing(true) takes effect before
  // any audio processing begins.
  auto alive = aliveFlag;
  juce::MessageManager::callAsync([this, alive]() {
    if (!alive->load(std::memory_order_acquire)) {
      pendingCrashRecoverySave.store(false);
      return;
    }

    // Use no-suspend serialization — crash recovery is best-effort and a
    // brief race with processBlock() on individual plugins is acceptable.
    // The old path called getStateInformation() which suspends + sleeps 50ms,
    // causing an audible dropout on every parameter change.
    juce::MemoryBlock crashState;
    serializeStateNoSuspend(crashState);

    // M-10: Capture file path before launching thread to avoid TOCTOU on `this`
    auto recoveryFile = getCrashRecoveryFile();

    juce::Thread::launch([capturedState = std::move(crashState), recoveryFile,
                          alive2 = alive,
                          pendingFlag = &pendingCrashRecoverySave]() {
      if (alive2->load(std::memory_order_acquire)) {
        juce::FileOutputStream stream(recoveryFile);
        if (stream.openedOk()) {
          stream.write(capturedState.getData(), capturedState.getSize());
          stream.flush();
        }
      }
      pendingFlag->store(false);
    });
  });
}

void ChainProcessor::performCrashRecoverySave(
    const juce::MemoryBlock &stateData) {
  // Write to temp file (1-5ms on SSD)
  auto file = getCrashRecoveryFile();

  juce::FileOutputStream stream(file);
  if (stream.openedOk()) {
    stream.write(stateData.getData(), stateData.getSize());
    stream.flush();
  }

  pendingCrashRecoverySave.store(false);
}

bool ChainProcessor::tryRestoreCrashRecoveryState() {
  auto file = getCrashRecoveryFile();

  if (!file.existsAsFile())
    return false;

  juce::MemoryBlock state;

  if (!file.loadFileAsData(state))
    return false;

  if (state.getSize() == 0)
    return false;

  // L-5: Reject oversized recovery files
  if (state.getSize() > kMaxRecoverySize) {
    DBG("ProChain: Recovery file too large (" + juce::String(state.getSize()) +
        " bytes), ignoring");
    return false;
  }

  // Restore the state
  setStateInformation(state.getData(), static_cast<int>(state.getSize()));

  DBG("ProChain: Restored chain state from crash recovery file");

  return true;
}

void ChainProcessor::cleanupCrashRecoveryFile() {
  auto file = getCrashRecoveryFile();

  if (file.existsAsFile()) {
    file.deleteFile();
    DBG("ProChain: Cleaned up crash recovery file");
  }
}

//==============================================================================
// Flat index helpers
//==============================================================================

PluginLeaf *ChainProcessor::getPluginByFlatIndex(int index) {
  std::vector<PluginLeaf *> plugins;
  ChainNodeHelpers::collectPluginsMut(rootNode, plugins);

  if (index >= 0 && index < static_cast<int>(plugins.size()))
    return plugins[static_cast<size_t>(index)];
  return nullptr;
}

const PluginLeaf *ChainProcessor::getPluginByFlatIndex(int index) const {
  std::vector<const PluginLeaf *> plugins;
  ChainNodeHelpers::collectPlugins(rootNode, plugins);

  if (index >= 0 && index < static_cast<int>(plugins.size()))
    return plugins[static_cast<size_t>(index)];
  return nullptr;
}

ChainNodeId ChainProcessor::getNodeIdByFlatIndex(int index) const {
  // Walk the tree via DFS to find the nth plugin and return its owning
  // ChainNode's ID
  struct DFSHelper {
    static ChainNodeId find(const ChainNode &node, int &remaining) {
      if (node.isPlugin()) {
        if (remaining == 0)
          return node.id;
        remaining--;
        return -1;
      }

      if (node.isGroup()) {
        for (const auto &child : node.getGroup().children) {
          auto result = find(*child, remaining);
          if (result >= 0)
            return result;
        }
      }
      return -1;
    }
  };

  int remaining = index;
  return DFSHelper::find(rootNode, remaining);
}

void ChainProcessor::rebuildCachedSlots() const {
  cachedSlots.clear();

  std::vector<const PluginLeaf *> plugins;
  ChainNodeHelpers::collectPlugins(rootNode, plugins);

  for (const auto *leaf : plugins) {
    auto slot = std::make_unique<PluginSlot>();
    slot->description = leaf->description;
    slot->nodeId = leaf->graphNodeId;
    slot->bypassed = leaf->bypassed;
    cachedSlots.push_back(std::move(slot));
  }

  cachedSlotsDirty = false;
}

//==============================================================================
// Notifications
//==============================================================================

void ChainProcessor::notifyParameterChanged() {
  // Lightweight notification for continuous parameter changes (dry/wet, gain).
  // Only triggers crash-recovery save (already throttled to 2s).
  // Does NOT emit onChainChanged (full state serialization + UI push) — the UI
  // updates optimistically from the JS side for these parameters.
  saveCrashRecoveryStateAsync();
}

void ChainProcessor::notifyChainChanged() {
  auto weak = aliveFlag;

  // Trigger async crash recovery save (throttled, runs on background thread)
  saveCrashRecoveryStateAsync();

  // Report latency change to outer PluginProcessor via async callback.
  // MUST remain async: synchronous dispatch causes Ableton to call
  // prepareToPlay() mid-stack via PropertyChanged, triggering cascading
  // re-entrancy that produces a stripped graph (54→14 nodes, latency=0).
  // The async gap is acceptable — the cache invalidation fixes in
  // setStateInformation/restoreChainFromXml ensure the correct post-preset
  // latency is captured here, even if delivery is deferred one message loop.
  if (onLatencyChanged) {
    int latency = getTotalLatencySamples();
    juce::MessageManager::callAsync([this, weak, latency]() {
      if (*weak && onLatencyChanged)
        onLatencyChanged(latency);
    });
  }

  if (onChainChanged) {
    juce::MessageManager::callAsync([this, weak]() {
      if (*weak && onChainChanged)
        onChainChanged();
    });
  }
}
