#include "ChainProcessor.h"
#include "ParameterDiscovery.h"
#include "../audio/DryWetMixProcessor.h"
#include "../audio/BranchGainProcessor.h"
#include "../audio/DuckingProcessor.h"
#include "../audio/NodeMeterProcessor.h"
#include "../audio/LatencyCompensationProcessor.h"
#include "../audio/MidSideMatrixProcessor.h"
#include "../audio/PluginWithMeterWrapper.h"
#include "../utils/ProChainLogger.h"
#include <cmath>
#include <set>

#if JUCE_MAC
 #include <objc/objc.h>
 #include <objc/message.h>
#endif

//==============================================================================
// Plugin Window for showing native plugin UIs
class ChainProcessor::PluginWindow : public juce::DocumentWindow
{
public:
    PluginWindow(juce::AudioProcessorEditor* editor, const juce::String& name, ChainNodeId nodeId)
        : DocumentWindow(name, juce::Colours::darkgrey, DocumentWindow::closeButton),
          nodeID(nodeId)
    {
        setUsingNativeTitleBar(true);
        setContentOwned(editor, true);
        setResizable(editor->isResizable(), false);

        // Standard window flags — appears on taskbar as a real window.
        int styleFlags = juce::ComponentPeer::windowHasTitleBar
                       | juce::ComponentPeer::windowHasCloseButton
                       | juce::ComponentPeer::windowHasDropShadow
                       | juce::ComponentPeer::windowAppearsOnTaskbar;
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
        if (auto* peer = getPeer())
        {
            auto nsView = (id) peer->getNativeHandle();
            if (nsView)
            {
                auto childNSWindow = ((id (*)(id, SEL))objc_msgSend)(nsView, sel_registerName("window"));
                auto nsApp = ((id (*)(id, SEL))objc_msgSend)(
                    (id)objc_getClass("NSApplication"), sel_registerName("sharedApplication"));
                auto keyWindow = ((id (*)(id, SEL))objc_msgSend)(nsApp, sel_registerName("keyWindow"));

                if (childNSWindow && keyWindow && childNSWindow != keyWindow)
                {
                    auto parentLevel = ((long (*)(id, SEL))objc_msgSend)(keyWindow, sel_registerName("level"));
                    if (parentLevel > 0)
                        ((void (*)(id, SEL, long))objc_msgSend)(childNSWindow, sel_registerName("setLevel:"), parentLevel);
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
ChainProcessor::ChainProcessor(PluginManager& pm)
    : pluginManager(pm)
{
    enableAllBuses();

    // Initialize root as an empty Serial group with id=0
    rootNode.id = 0;
    rootNode.name = "Root";
    rootNode.data = GroupData{ GroupMode::Serial };

    // Initialize parameter watcher for tracking child plugin knob changes
    parameterWatcher = std::make_unique<PluginParameterWatcher>(
        [this](const juce::String& beforeSnapshot) {
            if (onPluginParameterChangeSettled)
                onPluginParameterChangeSettled(beforeSnapshot);

            // Capture new stable snapshot for next round of changes
            auto alive = aliveFlag;
            juce::Timer::callAfterDelay(100, [this, alive]() {
                if (!alive->load(std::memory_order_acquire)) return;
                auto snapshot = captureSnapshot();
                auto base64 = juce::Base64::toBase64(snapshot.getData(), snapshot.getSize());
                parameterWatcher->updateStableSnapshot(base64);
            });
        });
}

ChainProcessor::~ChainProcessor() noexcept
{
    aliveFlag->store(false, std::memory_order_release);

    // Destroy parameter watcher before anything else (it holds listeners)
    parameterWatcher.reset();

    hideAllPluginWindows();

    // Clean up crash recovery temp file on normal exit
    cleanupCrashRecoveryFile();
}

void ChainProcessor::setParameterWatcherSuppressed(bool suppressed)
{
    if (parameterWatcher)
        parameterWatcher->setSuppressed(suppressed);
}

void ChainProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate;
    currentBlockSize = samplesPerBlock;
    AudioProcessorGraph::prepareToPlay(sampleRate, samplesPerBlock);
    rebuildGraph();
}

void ChainProcessor::releaseResources()
{
    AudioProcessorGraph::releaseResources();
}

void ChainProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    // CRITICAL: Set audioThreadBusy BEFORE checking isSuspended() to close the
    // TOCTOU race — otherwise the message thread can slip suspendProcessing(true)
    // between the check and the flag, then the rebuildGraph() spin-wait sees
    // audioThreadBusy==false and proceeds to tear down the graph mid-render.
    audioThreadBusy.store(true, std::memory_order_release);

    if (isSuspended())
    {
        buffer.clear();
        audioThreadBusy.store(false, std::memory_order_release);
        return;
    }

    AudioProcessorGraph::processBlock(buffer, midi);

    // Check if any hosted plugin reported a latency change.
    // Done inside the audioThreadBusy bracket so getNodes() is safe to iterate
    // (the message thread spin-waits on this flag before modifying the graph).
    if (!latencyRefreshNeeded.load(std::memory_order_relaxed))
    {
        for (const auto& [nodeId, wrapper] : cachedMeterWrappers)
        {
            if (wrapper->hasLatencyChanged())
            {
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

bool ChainProcessor::addPlugin(const juce::PluginDescription& desc, ChainNodeId parentId, int insertIndex)
{
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    // Validate parent BEFORE acquiring lock (read-only check)
    ChainNode* parent = nullptr;
    {
        const juce::SpinLock::ScopedLockType lock(treeLock);
        parent = ChainNodeHelpers::findById(rootNode, parentId);
        if (!parent || !parent->isGroup())
            return false;
    }

    // Create plugin instance WITHOUT holding lock (can take seconds!)
    PCLOG("addPlugin — loading " + desc.name + " (" + desc.pluginFormatName + ")");
    juce::String errorMessage;
    auto instance = pluginManager.createPluginInstance(desc, currentSampleRate, currentBlockSize, errorMessage);
    if (!instance)
    {
        PCLOG("addPlugin — FAILED to create " + desc.name + ": " + errorMessage);
        return false;
    }

    // Pre-prepare so the plugin initializes its bus layout (needed for sidechain plugins).
    // Without this, PluginWithMeterWrapper defaults to stereo and the graph allocates
    // 2-channel buffers — but sidechain plugins (Pro-L 2, etc.) expect 4 channels,
    // causing a crash in AudioUnitPluginInstance::processAudio when it tries to clear
    // channels that don't exist in the buffer.
    instance->prepareToPlay(currentSampleRate, currentBlockSize);

    // PHASE 7: Wrap plugin with integrated metering (reduces 3 nodes to 1)
    auto wrapper = std::make_unique<PluginWithMeterWrapper>(std::move(instance));

    auto node = std::make_unique<ChainNode>();
    node->id = nextNodeId++;
    node->name = desc.name;
    PluginLeaf leaf;
    leaf.description = desc;
    leaf.bypassed = false;

    if (auto graphNode = addNode(std::move(wrapper)))
    {
        leaf.graphNodeId = graphNode->nodeID;
    }
    else
    {
        return false;
    }

    node->data = std::move(leaf);

    suspendProcessing(true);

    // Acquire lock only for tree modification
    {
        const juce::SpinLock::ScopedLockType lock(treeLock);

        // Re-validate parent (it could have been deleted during plugin load)
        parent = ChainNodeHelpers::findById(rootNode, parentId);
        if (!parent || !parent->isGroup())
        {
            suspendProcessing(false);
            return false;
        }

        auto& children = parent->getGroup().children;
        if (insertIndex < 0 || insertIndex >= static_cast<int>(children.size()))
            children.push_back(std::move(node));
        else
            children.insert(children.begin() + insertIndex, std::move(node));

        cachedSlotsDirty = true;
    }

    rebuildGraph();

    PCLOG("addPlugin — resuming audio processing");
    suspendProcessing(false);

    PCLOG("addPlugin — notifying chain changed");
    notifyChainChanged();
    if (onParameterBindingChanged)
    {
        PCLOG("addPlugin — rebinding parameters");
        onParameterBindingChanged();
    }
    PCLOG("addPlugin — done for " + desc.name);
    return true;
}

ChainNodeId ChainProcessor::addDryPath(ChainNodeId parentId, int insertIndex)
{
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());
    PCLOG("addDryPath — parentId=" + juce::String(parentId));

    suspendProcessing(true);

    ChainNodeId newId = -1;

    {
        const juce::SpinLock::ScopedLockType lock(treeLock);

        auto* parent = ChainNodeHelpers::findById(rootNode, parentId);
        if (!parent || !parent->isGroup() || parent->getGroup().mode != GroupMode::Parallel)
        {
            suspendProcessing(false);
            return -1;
        }

        auto node = std::make_unique<ChainNode>();
        node->id = nextNodeId++;
        node->name = "Dry Path";

        PluginLeaf leaf;
        leaf.isDryPath = true;
        node->data = std::move(leaf);

        newId = node->id;

        auto& children = parent->getGroup().children;
        if (insertIndex < 0 || insertIndex >= static_cast<int>(children.size()))
            children.push_back(std::move(node));
        else
            children.insert(children.begin() + insertIndex, std::move(node));

        cachedSlotsDirty = true;
    }

    rebuildGraph();
    suspendProcessing(false);
    notifyChainChanged();

    PCLOG("addDryPath — done, new nodeId=" + juce::String(newId));
    return newId;
}

bool ChainProcessor::removeNode(ChainNodeId nodeId)
{
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());
    PCLOG("removeNode — nodeId=" + juce::String(nodeId));

    if (nodeId == 0)
        return false; // Can't remove root

    suspendProcessing(true);

    // Perform tree manipulation with lock held briefly
    {
        const juce::SpinLock::ScopedLockType lock(treeLock);

        auto* parent = ChainNodeHelpers::findParent(rootNode, nodeId);
        if (!parent || !parent->isGroup())
        {
            suspendProcessing(false);
            return false;
        }

        auto& children = parent->getGroup().children;
        for (auto it = children.begin(); it != children.end(); ++it)
        {
            if ((*it)->id == nodeId)
            {
                // Close any open windows for plugins in this subtree
                std::vector<const PluginLeaf*> plugins;
                ChainNodeHelpers::collectPlugins(**it, plugins);

                // Collect all ChainNodeIds in the subtree for window cleanup
                std::vector<ChainNodeId> nodeIdsToRemove;
                std::function<void(const ChainNode&)> collectNodeIds = [&](const ChainNode& node) {
                    nodeIdsToRemove.push_back(node.id);
                    if (node.isGroup())
                    {
                        for (const auto& child : node.getGroup().children)
                            collectNodeIds(*child);
                    }
                };
                collectNodeIds(**it);

                // Remove graph nodes
                for (auto* plug : plugins)
                    AudioProcessorGraph::removeNode(plug->graphNodeId);

                // Close windows by direct ChainNodeId match
                for (int w = pluginWindows.size() - 1; w >= 0; --w)
                {
                    ChainNodeId windowNodeId = pluginWindows[w]->getNodeID();
                    if (std::find(nodeIdsToRemove.begin(), nodeIdsToRemove.end(), windowNodeId) != nodeIdsToRemove.end())
                    {
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
    }  // Release lock before rebuildGraph

    // Rebuild graph WITHOUT holding lock (can take 100-500ms)
    rebuildGraph();

    suspendProcessing(false);

    notifyChainChanged();
    if (onParameterBindingChanged)
        onParameterBindingChanged();
    return true;
}

bool ChainProcessor::duplicateNode(ChainNodeId nodeId)
{
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

        auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
        if (!node || !node->isPlugin())
            return false;

        auto* parent = ChainNodeHelpers::findParent(rootNode, nodeId);
        if (!parent || !parent->isGroup())
            return false;

        parentId = parent->id;
        childIndex = ChainNodeHelpers::findChildIndex(*parent, nodeId);
        if (childIndex < 0)
            return false;

        const auto& srcLeaf = node->getPlugin();
        description = srcLeaf.description;
        nodeName = node->name;
        bypassed = srcLeaf.bypassed;
        graphNodeId = srcLeaf.graphNodeId;
    }

    // Capture source plugin state WITHOUT holding lock
    juce::MemoryBlock stateBlock;
    if (auto* srcGraphNode = getNodeForId(graphNodeId))
    {
        if (auto* srcProc = srcGraphNode->getProcessor())
        {
            // Suspend processing during state capture to prevent corruption
            srcProc->suspendProcessing(true);
            srcProc->getStateInformation(stateBlock);
            srcProc->suspendProcessing(false);
        }
    }

    // Create a new plugin instance WITHOUT holding lock (can take seconds!)
    juce::String errorMessage;
    auto instance = pluginManager.createPluginInstance(description, currentSampleRate, currentBlockSize, errorMessage);
    if (!instance)
        return false;

    // Pre-prepare so bus layout is initialized (sidechain plugins need correct channel count)
    instance->prepareToPlay(currentSampleRate, currentBlockSize);

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

    suspendProcessing(true);

    // Acquire lock only for tree modification
    {
        const juce::SpinLock::ScopedLockType lock(treeLock);

        // Re-validate parent (it could have changed during plugin load)
        auto* parent = ChainNodeHelpers::findById(rootNode, parentId);
        if (!parent || !parent->isGroup())
        {
            suspendProcessing(false);
            return false;
        }

        // Insert right after the source node
        auto& children = parent->getGroup().children;
        children.insert(children.begin() + childIndex + 1, std::move(newNode));

        cachedSlotsDirty = true;
    }

    rebuildGraph();

    // CRITICAL: Apply pending preset data AFTER rebuildGraph() has called prepareToPlay() on all plugins.
    // This ensures the duplicated plugin is fully initialized before state restoration.
    std::vector<PluginLeaf*> allPluginsForState;
    ChainNodeHelpers::collectPluginsMut(rootNode, allPluginsForState);
    for (auto* plug : allPluginsForState)
    {
        if (plug->pendingPresetData.isNotEmpty())
        {
            if (auto gNode = getNodeForId(plug->graphNodeId))
            {
                if (auto* processor = gNode->getProcessor())
                {
                    juce::MemoryBlock state;
                    state.fromBase64Encoding(plug->pendingPresetData);
                    PCLOG("setStateInfo — " + plug->description.name + " (" + juce::String(static_cast<int>(state.getSize())) + " bytes)");
                    processor->setStateInformation(state.getData(), static_cast<int>(state.getSize()));
                    PCLOG("setStateInfo — " + plug->description.name + " done");
                }
            }
            plug->pendingPresetData.clear();  // Clear after applying
        }
    }

    suspendProcessing(false);

    // Clear automation bindings for the duplicated slot
    // The duplicated plugin is inserted at childIndex + 1, which becomes
    // a new slot index after rebuildGraph() recalculates the flat list.
    // We call onUnbindSlot to ensure the duplicated plugin starts without
    // inherited DAW automation mappings.
    if (onUnbindSlot)
    {
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

bool ChainProcessor::moveNode(ChainNodeId nodeId, ChainNodeId newParentId, int newIndex)
{
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    if (nodeId == 0)
        return false;

    suspendProcessing(true);

    // Perform tree manipulation with lock held briefly
    {
        const juce::SpinLock::ScopedLockType lock(treeLock);

        // Can't move a node into its own subtree
        auto* nodePtr = ChainNodeHelpers::findById(rootNode, nodeId);
        if (!nodePtr)
        {
            suspendProcessing(false);
            return false;
        }

        if (ChainNodeHelpers::isDescendant(*nodePtr, newParentId))
        {
            suspendProcessing(false);
            return false;
        }

        auto* newParent = ChainNodeHelpers::findById(rootNode, newParentId);
        if (!newParent || !newParent->isGroup())
        {
            suspendProcessing(false);
            return false;
        }

        auto* oldParent = ChainNodeHelpers::findParent(rootNode, nodeId);
        if (!oldParent || !oldParent->isGroup())
        {
            suspendProcessing(false);
            return false;
        }

        // Extract the node from old parent
        std::unique_ptr<ChainNode> extracted;
        auto& oldChildren = oldParent->getGroup().children;
        for (auto it = oldChildren.begin(); it != oldChildren.end(); ++it)
        {
            if ((*it)->id == nodeId)
            {
                extracted = std::move(*it);
                oldChildren.erase(it);
                break;
            }
        }

        if (!extracted)
        {
            suspendProcessing(false);
            return false;
        }

        // Insert into new parent
        auto& newChildren = newParent->getGroup().children;
        if (newIndex < 0 || newIndex >= static_cast<int>(newChildren.size()))
            newChildren.push_back(std::move(extracted));
        else
            newChildren.insert(newChildren.begin() + newIndex, std::move(extracted));

        cachedSlotsDirty = true;
    }  // Release lock before rebuildGraph

    // Rebuild graph WITHOUT holding lock (can take 100-500ms)
    rebuildGraph();

    suspendProcessing(false);

    notifyChainChanged();
    if (onParameterBindingChanged)
        onParameterBindingChanged();
    return true;
}

ChainNodeId ChainProcessor::insertNodeTree(std::unique_ptr<ChainNode> node, ChainNodeId parentId, int insertIndex)
{
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    if (!node)
        return -1;

    suspendProcessing(true);

    ChainNodeId newNodeId = -1;

    // Perform tree manipulation with lock held briefly
    {
        const juce::SpinLock::ScopedLockType lock(treeLock);

        auto* parent = ChainNodeHelpers::findById(rootNode, parentId);
        if (!parent || !parent->isGroup())
        {
            suspendProcessing(false);
            return -1;
        }

        // Reassign all IDs in the tree to avoid collisions
        std::function<void(ChainNode&)> reassignIds = [&](ChainNode& n) {
            n.id = nextNodeId++;
            if (n.isGroup())
            {
                for (auto& child : n.getGroup().children)
                    reassignIds(*child);
            }
        };
        reassignIds(*node);
        newNodeId = node->id;

        // Insert into parent
        auto& children = parent->getGroup().children;
        if (insertIndex < 0 || insertIndex >= static_cast<int>(children.size()))
            children.push_back(std::move(node));
        else
            children.insert(children.begin() + insertIndex, std::move(node));

        cachedSlotsDirty = true;
    }  // Release lock before rebuildGraph

    // Rebuild graph WITHOUT holding lock (can take 100-500ms)
    rebuildGraph();

    // Apply any pending preset data after graph is built
    std::vector<PluginLeaf*> allPlugins;
    ChainNodeHelpers::collectPluginsMut(rootNode, allPlugins);
    for (auto* plug : allPlugins)
    {
        if (plug->pendingPresetData.isNotEmpty())
        {
            if (auto gNode = getNodeForId(plug->graphNodeId))
            {
                if (auto* processor = gNode->getProcessor())
                {
                    juce::MemoryBlock state;
                    state.fromBase64Encoding(plug->pendingPresetData);
                    PCLOG("setStateInfo — " + plug->description.name + " (" + juce::String(static_cast<int>(state.getSize())) + " bytes)");
                    processor->setStateInformation(state.getData(), static_cast<int>(state.getSize()));
                    PCLOG("setStateInfo — " + plug->description.name + " done");
                }
            }
            plug->pendingPresetData.clear();
        }
    }

    suspendProcessing(false);

    notifyChainChanged();
    if (onParameterBindingChanged)
        onParameterBindingChanged();

    return newNodeId;
}

ChainNodeId ChainProcessor::createGroup(const std::vector<ChainNodeId>& childIds, GroupMode mode, const juce::String& name)
{
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    if (childIds.empty())
        return -1;

    suspendProcessing(true);

    ChainNodeId groupId = -1;

    // Perform tree manipulation with lock held briefly
    {
        const juce::SpinLock::ScopedLockType lock(treeLock);

        // All children must share the same parent
        auto* firstParent = ChainNodeHelpers::findParent(rootNode, childIds[0]);
        if (!firstParent || !firstParent->isGroup())
        {
            suspendProcessing(false);
            return -1;
        }

        for (size_t i = 1; i < childIds.size(); ++i)
        {
            auto* parent = ChainNodeHelpers::findParent(rootNode, childIds[i]);
            if (parent != firstParent)
            {
                suspendProcessing(false);
                return -1; // Children must share the same parent
            }
        }

        // Find the earliest position among the children
        auto& parentChildren = firstParent->getGroup().children;
        int earliestIndex = static_cast<int>(parentChildren.size());
        for (auto id : childIds)
        {
            int idx = ChainNodeHelpers::findChildIndex(*firstParent, id);
            if (idx >= 0 && idx < earliestIndex)
                earliestIndex = idx;
        }

        // Extract the children (preserve their original order)
        std::vector<std::unique_ptr<ChainNode>> extracted;
        for (auto it = parentChildren.begin(); it != parentChildren.end(); )
        {
            bool found = false;
            for (auto id : childIds)
            {
                if ((*it)->id == id)
                {
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
            parentChildren.insert(parentChildren.begin() + earliestIndex, std::move(group));

        groupId = parentChildren[static_cast<size_t>(earliestIndex)]->id;

        // Auto-insert a dry path as the first child for parallel groups
        if (mode == GroupMode::Parallel)
        {
            auto* groupNode = ChainNodeHelpers::findById(rootNode, groupId);
            if (groupNode && groupNode->isGroup())
            {
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
    }  // Release lock before rebuildGraph

    // Rebuild graph WITHOUT holding lock (can take 100-500ms)
    rebuildGraph();

    suspendProcessing(false);

    notifyChainChanged();
    if (onParameterBindingChanged)
        onParameterBindingChanged();
    return groupId;
}

bool ChainProcessor::dissolveGroup(ChainNodeId groupId)
{
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    if (groupId == 0)
        return false;

    suspendProcessing(true);

    // Perform tree manipulation with lock held briefly
    {
        const juce::SpinLock::ScopedLockType lock(treeLock);

        auto* parent = ChainNodeHelpers::findParent(rootNode, groupId);
        if (!parent || !parent->isGroup())
        {
            suspendProcessing(false);
            return false;
        }

        auto* groupNode = ChainNodeHelpers::findById(rootNode, groupId);
        if (!groupNode || !groupNode->isGroup())
        {
            suspendProcessing(false);
            return false;
        }

        auto& parentChildren = parent->getGroup().children;

        // Find the group's position
        int groupIndex = ChainNodeHelpers::findChildIndex(*parent, groupId);
        if (groupIndex < 0)
        {
            suspendProcessing(false);
            return false;
        }

        // Extract group's children
        auto groupChildren = std::move(groupNode->getGroup().children);

        // Remove the group from parent
        parentChildren.erase(parentChildren.begin() + groupIndex);

        // Insert the group's children at the same position
        for (size_t i = 0; i < groupChildren.size(); ++i)
        {
            parentChildren.insert(parentChildren.begin() + groupIndex + static_cast<int>(i),
                                  std::move(groupChildren[i]));
        }

        cachedSlotsDirty = true;
    }  // Release lock before rebuildGraph

    // Rebuild graph WITHOUT holding lock (can take 100-500ms)
    rebuildGraph();

    suspendProcessing(false);

    notifyChainChanged();
    if (onParameterBindingChanged)
        onParameterBindingChanged();
    return true;
}

bool ChainProcessor::setGroupMode(ChainNodeId groupId, GroupMode mode)
{
    auto* node = ChainNodeHelpers::findById(rootNode, groupId);
    if (!node || !node->isGroup())
        return false;

    node->getGroup().mode = mode;

    // CRITICAL: Suspend audio processing before rebuilding graph to prevent crashes
    suspendProcessing(true);
    rebuildGraph();
    suspendProcessing(false);

    notifyChainChanged();
    return true;
}

bool ChainProcessor::setGroupDryWet(ChainNodeId groupId, float mix)
{
    auto* node = ChainNodeHelpers::findById(rootNode, groupId);
    if (!node || !node->isGroup())
        return false;

    node->getGroup().dryWetMix = juce::jlimit(0.0f, 1.0f, mix);

    // If the dry/wet mix node exists, update it directly (no rebuild needed)
    auto& group = node->getGroup();
    if (group.dryWetMixNodeId.uid != 0)
    {
        if (auto gNode = getNodeForId(group.dryWetMixNodeId))
        {
            if (auto* proc = dynamic_cast<DryWetMixProcessor*>(gNode->getProcessor()))
                proc->setMix(group.dryWetMix);
        }
    }

    notifyChainChanged();
    return true;
}

bool ChainProcessor::setGroupDucking(ChainNodeId groupId, float amount, float relMs)
{
    auto* node = ChainNodeHelpers::findById(rootNode, groupId);
    if (!node || !node->isGroup())
        return false;

    auto& group = node->getGroup();
    group.duckAmount = juce::jlimit(0.0f, 1.0f, amount);
    group.duckReleaseMs = juce::jlimit(50.0f, 1000.0f, relMs);

    // Update the ducking processor if it exists (no rebuild needed)
    if (group.duckingNodeId.uid != 0)
    {
        if (auto gNode = getNodeForId(group.duckingNodeId))
        {
            if (auto* proc = dynamic_cast<DuckingProcessor*>(gNode->getProcessor()))
            {
                proc->setDuckAmount(group.duckAmount);
                proc->setReleaseMs(group.duckReleaseMs);
            }
        }
    }
    else if (group.duckAmount > 0.001f)
    {
        // Need to rebuild graph to insert the ducking processor — use deferred rebuild
        scheduleRebuild();
        return true;
    }

    notifyChainChanged();
    return true;
}

bool ChainProcessor::setBranchGain(ChainNodeId nodeId, float gainDb)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node)
        return false;

    node->branchGainDb = juce::jlimit(-60.0f, 24.0f, gainDb);

    // Update the branch gain processor if it exists (no rebuild needed)
    auto* parent = ChainNodeHelpers::findParent(rootNode, nodeId);
    if (parent && parent->isGroup() && parent->getGroup().mode == GroupMode::Parallel)
    {
        int childIndex = ChainNodeHelpers::findChildIndex(*parent, nodeId);
        auto& branchGainIds = parent->getGroup().branchGainNodeIds;
        if (childIndex >= 0 && childIndex < static_cast<int>(branchGainIds.size()))
        {
            if (auto gNode = getNodeForId(branchGainIds[static_cast<size_t>(childIndex)]))
            {
                if (auto* proc = dynamic_cast<BranchGainProcessor*>(gNode->getProcessor()))
                    proc->setGainDb(node->branchGainDb);
            }
        }
    }

    notifyChainChanged();
    return true;
}

bool ChainProcessor::setBranchSolo(ChainNodeId nodeId, bool solo)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node)
        return false;

    node->solo.store(solo, std::memory_order_relaxed);

    // Solo by adjusting gain on ALL branches WITHOUT rebuilding the graph
    // This allows smooth, DAW-automatable solo with no audio dropouts
    // All plugins stay active and use CPU (unlike bypass which disconnects them)
    auto* parent = ChainNodeHelpers::findParent(rootNode, nodeId);
    if (parent && parent->isGroup() && parent->getGroup().mode == GroupMode::Parallel)
    {
        // Check if any branch is soloed
        bool anySoloed = false;
        for (const auto& child : parent->getGroup().children)
        {
            if (child->solo.load(std::memory_order_relaxed))
            {
                anySoloed = true;
                break;
            }
        }

        // Update gain for all branches based on solo/mute state
        auto& branchGainIds = parent->getGroup().branchGainNodeIds;
        for (size_t i = 0; i < parent->getGroup().children.size(); ++i)
        {
            auto& child = parent->getGroup().children[i];
            if (i < branchGainIds.size())
            {
                if (auto gNode = getNodeForId(branchGainIds[i]))
                {
                    if (auto* proc = dynamic_cast<BranchGainProcessor*>(gNode->getProcessor()))
                    {
                        bool shouldMute = false;

                        // If any branch is soloed, mute all non-soloed branches
                        if (anySoloed && !child->solo.load(std::memory_order_relaxed))
                            shouldMute = true;

                        // Explicitly muted branches stay muted (unless soloed)
                        if (child->mute.load(std::memory_order_relaxed) &&
                            !(anySoloed && child->solo.load(std::memory_order_relaxed)))
                            shouldMute = true;

                        float targetGain = shouldMute ? -60.0f : child->branchGainDb;
                        proc->setGainDb(targetGain);
                    }
                }
            }
        }
    }

    notifyChainChanged();
    return true;
}

bool ChainProcessor::setBranchMute(ChainNodeId nodeId, bool mute)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node)
        return false;

    node->mute.store(mute, std::memory_order_relaxed);

    // Per-plugin mute: set dry/wet mix to 0.0 (fully dry = effect disabled, signal passes through)
    // The plugin stays loaded and uses CPU (unlike bypass which disconnects it entirely).
    // This preserves latency compensation and allows instant A/B comparison.
    if (node->isPlugin())
    {
        auto& leaf = node->getPlugin();
        if (auto gNode = getNodeForId(leaf.pluginDryWetNodeId))
        {
            if (auto* proc = dynamic_cast<DryWetMixProcessor*>(gNode->getProcessor()))
            {
                // When muted: fully dry (0.0) — signal passes through unprocessed
                // When unmuted: restore the user's configured dry/wet mix
                proc->setMix(mute ? 0.0f : leaf.dryWetMix);
            }
        }
    }

    // Parallel branch mute: also set branch gain to -∞ for branch-level silencing
    auto* parent = ChainNodeHelpers::findParent(rootNode, nodeId);
    if (parent && parent->isGroup() && parent->getGroup().mode == GroupMode::Parallel)
    {
        int childIndex = ChainNodeHelpers::findChildIndex(*parent, nodeId);
        auto& branchGainIds = parent->getGroup().branchGainNodeIds;
        if (childIndex >= 0 && childIndex < static_cast<int>(branchGainIds.size()))
        {
            if (auto gNode = getNodeForId(branchGainIds[static_cast<size_t>(childIndex)]))
            {
                if (auto* proc = dynamic_cast<BranchGainProcessor*>(gNode->getProcessor()))
                {
                    // Check if any branch is soloed
                    bool anySoloed = false;
                    for (const auto& child : parent->getGroup().children)
                    {
                        if (child->solo.load(std::memory_order_relaxed))
                        {
                            anySoloed = true;
                            break;
                        }
                    }

                    bool shouldMute = mute;
                    // If soloed and this branch is NOT soloed, it should be muted
                    if (anySoloed && !node->solo.load(std::memory_order_relaxed))
                        shouldMute = true;
                    // Unless this branch is soloed (solo overrides mute)
                    if (anySoloed && node->solo.load(std::memory_order_relaxed))
                        shouldMute = false;

                    float targetGain = shouldMute ? -60.0f : node->branchGainDb;
                    proc->setGainDb(targetGain);
                }
            }
        }
    }

    notifyChainChanged();
    return true;
}

// =============================================
// Per-plugin controls (gain staging, dry/wet, sidechain)
// =============================================

bool ChainProcessor::setNodeInputGain(ChainNodeId nodeId, float gainDb)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node || !node->isPlugin())
        return false;

    auto& leaf = node->getPlugin();
    leaf.inputGainDb = juce::jlimit(-60.0f, 24.0f, gainDb);

    // Gain nodes are always wired — just update the processor value (no rebuild needed)
    if (auto gNode = getNodeForId(leaf.inputGainNodeId))
    {
        if (auto* proc = dynamic_cast<BranchGainProcessor*>(gNode->getProcessor()))
            proc->setGainDb(leaf.inputGainDb);
    }

    notifyChainChanged();
    return true;
}

bool ChainProcessor::setNodeOutputGain(ChainNodeId nodeId, float gainDb)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node || !node->isPlugin())
        return false;

    auto& leaf = node->getPlugin();
    leaf.outputGainDb = juce::jlimit(-60.0f, 24.0f, gainDb);

    // Gain nodes are always wired — just update the processor value (no rebuild needed)
    if (auto gNode = getNodeForId(leaf.outputGainNodeId))
    {
        if (auto* proc = dynamic_cast<BranchGainProcessor*>(gNode->getProcessor()))
            proc->setGainDb(leaf.outputGainDb);
    }

    notifyChainChanged();
    return true;
}

bool ChainProcessor::setNodeDryWet(ChainNodeId nodeId, float mix)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node || !node->isPlugin())
        return false;

    auto& leaf = node->getPlugin();
    leaf.dryWetMix = juce::jlimit(0.0f, 1.0f, mix);

    // Update existing DryWetMixProcessor (always wired since init)
    // If muted, keep the processor at 0.0 (fully dry) — the stored value will be
    // restored when the user unmutes
    if (!node->mute.load(std::memory_order_relaxed))
    {
        if (auto gNode = getNodeForId(leaf.pluginDryWetNodeId))
        {
            if (auto* proc = dynamic_cast<DryWetMixProcessor*>(gNode->getProcessor()))
                proc->setMix(leaf.dryWetMix);
        }
    }

    notifyChainChanged();
    return true;
}

bool ChainProcessor::setNodeSidechainSource(ChainNodeId nodeId, int source)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node || !node->isPlugin())
        return false;

    auto& leaf = node->getPlugin();
    leaf.sidechainSource = juce::jlimit(0, 1, source);

    // Update the wrapper's SC buffer assignment
    if (auto gNode = getNodeForId(leaf.graphNodeId))
    {
        if (auto* wrapper = dynamic_cast<PluginWithMeterWrapper*>(gNode->getProcessor()))
            wrapper->setSidechainBuffer(leaf.sidechainSource == 1 ? externalSidechainBuffer : nullptr);
    }

    notifyChainChanged();
    return true;
}

bool ChainProcessor::setNodeMidSideMode(ChainNodeId nodeId, int mode)
{
    if (mode < 0 || mode > 3)
        return false;

    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node || !node->isPlugin())
        return false;

    auto& leaf = node->getPlugin();
    leaf.midSideMode = static_cast<MidSideMode>(mode);

    // Requires graph rebuild to insert/remove M/S encode/decode nodes
    suspendProcessing(true);
    rebuildGraph();
    suspendProcessing(false);

    notifyChainChanged();
    return true;
}

void ChainProcessor::setNodeBypassed(ChainNodeId nodeId, bool bypassed)
{
    {
        const juce::SpinLock::ScopedLockType lock(treeLock);
        auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
        if (!node || !node->isPlugin())
            return;

        node->getPlugin().bypassed = bypassed;
    }

    // Deferred rebuild — coalesces rapid bypass toggles (e.g. setAllBypass).
    // ~16ms delay is imperceptible. Full rebuild needed because bypassed plugins
    // are disconnected in wireNode() for zero CPU and correct latency reporting.
    scheduleRebuild();
}

std::vector<PluginLeaf*> ChainProcessor::getFlatPluginList()
{
    std::vector<PluginLeaf*> result;
    ChainNodeHelpers::collectPluginsMut(rootNode, result);
    return result;
}

std::vector<const PluginLeaf*> ChainProcessor::getFlatPluginList() const
{
    std::vector<const PluginLeaf*> result;
    ChainNodeHelpers::collectPlugins(rootNode, result);
    return result;
}

std::vector<ChainNodeId> ChainProcessor::getFlatPluginNodeIds() const
{
    std::vector<ChainNodeId> result;
    struct Collector {
        static void collect(const ChainNode& node, std::vector<ChainNodeId>& ids) {
            if (node.isPlugin())
                ids.push_back(node.id);
            else if (node.isGroup())
                for (const auto& child : node.getGroup().children)
                    collect(*child, ids);
        }
    };
    Collector::collect(rootNode, result);
    return result;
}

//==============================================================================
// Backward-compatible flat API
//==============================================================================

bool ChainProcessor::addPlugin(const juce::PluginDescription& desc, int insertIndex)
{
    return addPlugin(desc, 0, insertIndex); // Add to root group
}

bool ChainProcessor::removePlugin(int slotIndex)
{
    auto nodeId = getNodeIdByFlatIndex(slotIndex);
    if (nodeId < 0)
        return false;

    // Hide window by slot index before removing
    hidePluginWindow(slotIndex);

    return removeNode(nodeId);
}

bool ChainProcessor::movePlugin(int fromIndex, int toIndex)
{
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    suspendProcessing(true);

    // Perform tree manipulation with lock held briefly
    {
        const juce::SpinLock::ScopedLockType lock(treeLock);

        // For flat API compat, move within the root group
        auto& rootChildren = rootNode.getGroup().children;
        if (fromIndex < 0 || fromIndex >= static_cast<int>(rootChildren.size()) ||
            toIndex < 0 || toIndex >= static_cast<int>(rootChildren.size()) ||
            fromIndex == toIndex)
        {
            suspendProcessing(false);
            return false;
        }

        auto node = std::move(rootChildren[static_cast<size_t>(fromIndex)]);
        rootChildren.erase(rootChildren.begin() + fromIndex);
        rootChildren.insert(rootChildren.begin() + toIndex, std::move(node));

        cachedSlotsDirty = true;
    }  // Release lock before rebuildGraph

    // Rebuild graph WITHOUT holding lock (can take 100-500ms)
    rebuildGraph();

    suspendProcessing(false);

    notifyChainChanged();
    if (onParameterBindingChanged)
        onParameterBindingChanged();
    return true;
}

void ChainProcessor::setSlotBypassed(int slotIndex, bool bypassed)
{
    auto nodeId = getNodeIdByFlatIndex(slotIndex);
    if (nodeId >= 0)
        setNodeBypassed(nodeId, bypassed);
}

void ChainProcessor::showPluginWindow(ChainNodeId nodeId)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);

    // If not found as node ID, try as flat slot index (backward compat)
    if (!node || !node->isPlugin())
    {
        auto resolvedId = getNodeIdByFlatIndex(nodeId);
        if (resolvedId >= 0)
        {
            node = ChainNodeHelpers::findById(rootNode, resolvedId);
            if (node && node->isPlugin())
                nodeId = resolvedId;
            else
                return;
        }
        else
        {
            return;
        }
    }

    // Check if window already exists
    for (auto* window : pluginWindows)
    {
        if (window->getNodeID() == nodeId)
        {
            window->setVisible(true);
            window->toFront(true);
            return;
        }
    }

    if (auto gNode = getNodeForId(node->getPlugin().graphNodeId))
    {
        // PHASE 7: Unwrap to get the raw plugin for editor creation
        juce::AudioProcessor* processor = nullptr;
        if (auto* wrapperProc = dynamic_cast<PluginWithMeterWrapper*>(gNode->getProcessor()))
        {
            processor = wrapperProc->getWrappedPlugin();
        }
        else
        {
            // Fallback for non-wrapped plugins (shouldn't happen with Phase 7)
            processor = gNode->getProcessor();
        }

        if (processor && processor->hasEditor())
        {
            if (auto* editor = processor->createEditor())
            {
                auto windowName = node->getPlugin().description.name + " [" + node->name + "]";
                pluginWindows.add(new PluginWindow(editor, windowName, nodeId));
            }
        }
    }
}

void ChainProcessor::hidePluginWindow(ChainNodeId nodeId)
{
    // Try as node ID first
    for (int i = pluginWindows.size() - 1; i >= 0; --i)
    {
        if (pluginWindows[i]->getNodeID() == nodeId)
        {
            pluginWindows.remove(i);
            return;
        }
    }

    // Fallback: try as flat slot index
    auto resolvedId = getNodeIdByFlatIndex(nodeId);
    if (resolvedId >= 0)
    {
        for (int i = pluginWindows.size() - 1; i >= 0; --i)
        {
            if (pluginWindows[i]->getNodeID() == resolvedId)
            {
                pluginWindows.remove(i);
                return;
            }
        }
    }
}

void ChainProcessor::hideAllPluginWindows()
{
    pluginWindows.clear();
}

//==============================================================================
// Chain-level toggle controls
//==============================================================================

void ChainProcessor::toggleAllBypass()
{
    auto state = getBypassState();

    // If ANY are active (not bypassed), bypass all. If ALL are bypassed, enable all.
    bool shouldBypass = !state.allBypassed;
    setAllBypass(shouldBypass);
}

void ChainProcessor::setAllBypass(bool bypassed)
{
    std::vector<PluginLeaf*> plugins;
    ChainNodeHelpers::collectPluginsMut(rootNode, plugins);

    for (auto* leaf : plugins)
        leaf->bypassed = bypassed;

    // Single deferred rebuild for all bypass changes
    scheduleRebuild();
}

ChainProcessor::BypassState ChainProcessor::getBypassState() const
{
    std::vector<const PluginLeaf*> plugins;
    ChainNodeHelpers::collectPlugins(rootNode, plugins);

    BypassState state;
    if (plugins.empty())
        return state;

    bool allBypassed = true;
    bool anyBypassed = false;

    for (const auto* leaf : plugins)
    {
        if (leaf->bypassed)
            anyBypassed = true;
        else
            allBypassed = false;
    }

    state.allBypassed = allBypassed;
    state.anyBypassed = anyBypassed;
    return state;
}

void ChainProcessor::toggleAllPluginWindows()
{
    auto state = getWindowState();

    // If any are open, close all. If none open, open all.
    if (state.openCount > 0)
        setAllPluginWindows(false);
    else
        setAllPluginWindows(true);
}

void ChainProcessor::setAllPluginWindows(bool open)
{
    if (!open)
    {
        pluginWindows.clear();
        return;
    }

    // Open all plugin windows by recursively walking the tree
    std::function<void(ChainNode&)> openWindows = [&](ChainNode& node) {
        if (node.isPlugin())
        {
            showPluginWindow(node.id);
        }
        else if (node.isGroup())
        {
            for (auto& child : node.getGroup().children)
                openWindows(*child);
        }
    };

    openWindows(rootNode);
}

ChainProcessor::WindowState ChainProcessor::getWindowState() const
{
    WindowState state;
    state.totalCount = ChainNodeHelpers::countPlugins(rootNode);
    state.openCount = pluginWindows.size();
    return state;
}

//==============================================================================
// PHASE 2: Conditional Metering - Set global meter mode
//==============================================================================

void ChainProcessor::setGlobalMeterMode(MeterMode mode)
{
    const bool enableLufs = (mode == MeterMode::FullLUFS);

    // Recursively walk the tree and update all meter nodes
    std::function<void(ChainNode&)> updateMeters = [&](ChainNode& node) {
        if (node.isPlugin())
        {
            auto& leaf = node.getPlugin();

            // Update output meter
            if (auto* meterNode = getNodeForId(leaf.meterNodeId))
            {
                if (auto* meterProc = dynamic_cast<NodeMeterProcessor*>(meterNode->getProcessor()))
                {
                    meterProc->setEnableLUFS(enableLufs);
                }
            }

            // Update input meter
            if (auto* inputMeterNode = getNodeForId(leaf.inputMeterNodeId))
            {
                if (auto* inputMeterProc = dynamic_cast<NodeMeterProcessor*>(inputMeterNode->getProcessor()))
                {
                    inputMeterProc->setEnableLUFS(enableLufs);
                }
            }
        }
        else if (node.isGroup())
        {
            for (auto& child : node.getGroup().children)
                updateMeters(*child);
        }
    };

    juce::SpinLock::ScopedLockType lock(treeLock);
    updateMeters(rootNode);
}

int ChainProcessor::getNumSlots() const
{
    return ChainNodeHelpers::countPlugins(rootNode);
}

const PluginSlot* ChainProcessor::getSlot(int index) const
{
    if (cachedSlotsDirty)
        rebuildCachedSlots();

    if (index >= 0 && index < static_cast<int>(cachedSlots.size()))
        return cachedSlots[static_cast<size_t>(index)].get();
    return nullptr;
}

PluginSlot* ChainProcessor::getSlot(int index)
{
    if (cachedSlotsDirty)
        rebuildCachedSlots();

    if (index >= 0 && index < static_cast<int>(cachedSlots.size()))
        return cachedSlots[static_cast<size_t>(index)].get();
    return nullptr;
}

juce::AudioProcessor* ChainProcessor::getSlotProcessor(int slotIndex)
{
    auto* leaf = getPluginByFlatIndex(slotIndex);
    if (!leaf)
        return nullptr;

    if (auto gNode = getNodeForId(leaf->graphNodeId))
    {
        // Unwrap PluginWithMeterWrapper to return the raw plugin instance
        // (callers need parameter access which lives on the wrapped plugin)
        if (auto* wrapper = dynamic_cast<PluginWithMeterWrapper*>(gNode->getProcessor()))
            return wrapper->getWrappedPlugin();
        return gNode->getProcessor();
    }

    return nullptr;
}

juce::AudioProcessor* ChainProcessor::getNodeProcessor(ChainNodeId nodeId)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node || !node->isPlugin())
        return nullptr;

    if (auto gNode = getNodeForId(node->getPlugin().graphNodeId))
    {
        // Unwrap PluginWithMeterWrapper to return the raw plugin instance
        if (auto* wrapper = dynamic_cast<PluginWithMeterWrapper*>(gNode->getProcessor()))
            return wrapper->getWrappedPlugin();
        return gNode->getProcessor();
    }

    return nullptr;
}

//==============================================================================
// Graph wiring
//==============================================================================

void ChainProcessor::removeUtilityNodes(UpdateKind update)
{
    for (auto nodeId : utilityNodes)
        AudioProcessorGraph::removeNode(nodeId, update);
    utilityNodes.clear();
}

void ChainProcessor::rebuildGraph()
{
    PCLOG("rebuildGraph — start (nodes=" + juce::String(getNodes().size()) + ")");
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    // JUCE's rebuild() uses RenderSequenceExchange which does a wait-free
    // try-lock swap of the render sequence pointer. The audio thread finishes
    // its current callback on the old sequence; the new one takes effect next call.
    // No spin-wait needed — suspendProcessing(true) is sufficient.

    // NOTE: Do NOT call releaseResources() here. The old render sequence may still
    // be referenced by the audio thread until rebuild() atomically swaps it.
    // Calling releaseResources() before that swap invalidates buffers mid-render → crash.
    // prepareToPlay() after rebuild() handles reinitialization safely.

    // Use UpdateKind::none for all intermediate operations to avoid rebuilding
    // the internal render sequence after every single change. We call rebuild()
    // once at the end for an atomic, glitch-free update.
    constexpr auto deferred = UpdateKind::none;

    // Remove all connections
    for (auto& connection : getConnections())
        removeConnection(connection, deferred);

    // Remove utility nodes from previous wiring
    removeUtilityNodes(deferred);

    // Remove I/O nodes if they exist
    if (audioInputNode.uid != 0)
        AudioProcessorGraph::removeNode(audioInputNode, deferred);
    if (audioOutputNode.uid != 0)
        AudioProcessorGraph::removeNode(audioOutputNode, deferred);
    // Create I/O nodes (audio only — no MIDI needed for an effects host)
    if (auto audioIn = addNode(std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
            juce::AudioProcessorGraph::AudioGraphIOProcessor::audioInputNode), {}, deferred))
        audioInputNode = audioIn->nodeID;

    if (auto audioOut = addNode(std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
            juce::AudioProcessorGraph::AudioGraphIOProcessor::audioOutputNode), {}, deferred))
        audioOutputNode = audioOut->nodeID;

    // Wire the root group (all wire* methods now use deferred updates)
    auto result = wireNode(rootNode, audioInputNode);

    // Connect last output to audio output
    addConnection({{result.audioOut, 0}, {audioOutputNode, 0}}, deferred);
    addConnection({{result.audioOut, 1}, {audioOutputNode, 1}}, deferred);

    // Single atomic rebuild of the render sequence
    rebuild();

    // Assert no cycles in debug builds
    jassert(!detectCycles());

    // Re-prepare all plugin instances after rewiring
    for (auto* node : getNodes())
    {
        if (auto* proc = node->getProcessor())
            proc->prepareToPlay(currentSampleRate, currentBlockSize);
    }

    // PHASE 5: Invalidate latency cache after graph rebuild
    invalidateLatencyCache();

    // CRITICAL FIX: Report updated total latency to DAW after graph changes
    int totalLatency = getTotalLatencySamples();
    setLatencySamples(totalLatency);

    PCLOG("rebuildGraph — done (nodes=" + juce::String(getNodes().size())
          + " latency=" + juce::String(totalLatency) + ")");

    // Re-register parameter watcher on all plugin instances
    if (parameterWatcher)
    {
        parameterWatcher->clearWatches();
        auto plugins = getFlatPluginList();
        for (auto* leaf : plugins)
        {
            if (leaf && leaf->graphNodeId.uid != 0)
            {
                if (auto* graphNode = getNodeForId(leaf->graphNodeId))
                {
                    // Unwrap to watch the raw plugin's parameters (wrapper has none)
                    if (auto* wrapper = dynamic_cast<PluginWithMeterWrapper*>(graphNode->getProcessor()))
                        parameterWatcher->watchProcessor(wrapper->getWrappedPlugin());
                    else if (auto* proc = graphNode->getProcessor())
                        parameterWatcher->watchProcessor(proc);
                }
            }
        }

        // Schedule deferred stable snapshot update (after prepareToPlay settles)
        auto alive = aliveFlag;
        juce::Timer::callAfterDelay(100, [this, alive]() {
            if (!alive->load(std::memory_order_acquire)) return;
            auto snapshot = captureSnapshot();
            auto base64 = juce::Base64::toBase64(snapshot.getData(), snapshot.getSize());
            parameterWatcher->updateStableSnapshot(base64);
        });
    }

    // Update cached meter wrapper pointers (avoids DFS + dynamic_cast in processBlock)
    updateMeterWrapperCache();
}

// ---------------------------------------------------------------------------
// Deferred rebuild — coalesces rapid graph mutations into a single rebuild.
// Posts ONE callAsync callback. If multiple scheduleRebuild() calls happen
// before the callback fires, only one rebuild occurs.
// ---------------------------------------------------------------------------
void ChainProcessor::scheduleRebuild()
{
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    // If inside a batch, just flag and let endBatch() handle it
    if (batchDepth > 0)
    {
        rebuildNeeded.store(true, std::memory_order_relaxed);
        return;
    }

    rebuildNeeded.store(true, std::memory_order_relaxed);

    // Only post one callback — guard with rebuildScheduled
    bool expected = false;
    if (rebuildScheduled.compare_exchange_strong(expected, true, std::memory_order_acq_rel))
    {
        auto alive = aliveFlag;
        juce::MessageManager::callAsync([this, alive]() {
            if (!alive->load(std::memory_order_acquire))
                return;

            rebuildScheduled.store(false, std::memory_order_release);

            if (rebuildNeeded.exchange(false, std::memory_order_acq_rel))
            {
                suspendProcessing(true);
                rebuildGraph();
                suspendProcessing(false);
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
void ChainProcessor::beginBatch()
{
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    if (batchDepth == 0)
        suspendProcessing(true);

    ++batchDepth;
}

void ChainProcessor::endBatch()
{
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());
    jassert(batchDepth > 0);

    --batchDepth;

    if (batchDepth == 0)
    {
        if (rebuildNeeded.exchange(false, std::memory_order_acq_rel))
        {
            rebuildGraph();
        }
        suspendProcessing(false);
        notifyChainChanged();
    }
}

void ChainProcessor::updateMeterWrapperCache()
{
    cachedMeterWrappers.clear();

    std::function<void(const ChainNode&)> collect = [&](const ChainNode& node)
    {
        if (node.isPlugin())
        {
            const auto& leaf = node.getPlugin();
            if (leaf.graphNodeId != juce::AudioProcessorGraph::NodeID())
            {
                if (auto* graphNode = getNodeForId(leaf.graphNodeId))
                {
                    if (auto* wrapper = dynamic_cast<PluginWithMeterWrapper*>(graphNode->getProcessor()))
                        cachedMeterWrappers.emplace_back(node.id, wrapper);
                }
            }
        }
        else if (node.isGroup())
        {
            for (const auto& child : node.getGroup().children)
                collect(*child);
        }
    };

    collect(rootNode);
}

void ChainProcessor::wireMidSidePlugin(
    PluginLeaf& leaf, NodeID encodeNodeId, NodeID pluginNodeId, NodeID decodeNodeId,
    int processChannel, int bypassChannel, int pluginLatency)
{
    // Route encode[processChannel] → plugin ch0 AND ch1 (mono-through-stereo)
    addConnection({{encodeNodeId, processChannel}, {pluginNodeId, 0}}, UpdateKind::none);
    addConnection({{encodeNodeId, processChannel}, {pluginNodeId, 1}}, UpdateKind::none);

    // Plugin output ch0 → decode[processChannel]
    addConnection({{pluginNodeId, 0}, {decodeNodeId, processChannel}}, UpdateKind::none);

    // ALWAYS create a dedicated bypass delay node (even if latency=0).
    // This guarantees the bypass signal gets its own buffer in the graph,
    // preventing buffer aliasing when the graph reuses encode output buffers.
    auto bypassProc = std::make_unique<LatencyCompensationProcessor>(pluginLatency);
    if (auto bypassNode = addNode(std::move(bypassProc), {}, UpdateKind::none))
    {
        leaf.msBypassDelayNodeId = bypassNode->nodeID;
        utilityNodes.insert(bypassNode->nodeID);

        // Feed encode[bypassChannel] into bypass delay ch0 (mono is enough)
        addConnection({{encodeNodeId, bypassChannel}, {bypassNode->nodeID, 0}}, UpdateKind::none);

        // Bypass delay ch0 → decode[bypassChannel]
        addConnection({{bypassNode->nodeID, 0}, {decodeNodeId, bypassChannel}}, UpdateKind::none);

        DBG("M/S bypass node created: nodeID=" << (int)bypassNode->nodeID.uid
            << " latency=" << pluginLatency
            << " processChannel=" << processChannel
            << " bypassChannel=" << bypassChannel);
    }
}

WireResult ChainProcessor::wireNode(ChainNode& node, NodeID audioIn)
{
    if (node.isPlugin())
    {
        auto& leaf = node.getPlugin();

        // Dry path nodes are empty passthrough branches (used in parallel groups)
        if (leaf.isDryPath)
            return { audioIn };

        // Bypassed plugins: in parallel groups, disconnect entirely (mute).
        // In serial groups, pass through (bypass).
        if (leaf.bypassed)
        {
            if (isInParallelGroup(node.id))
            {
                return { {} };  // Disconnect entirely (mute)
            }
            else
            {
                return { audioIn };  // Passthrough in serial
            }
        }

        auto pluginNodeId = leaf.graphNodeId;

        // If plugin failed to instantiate, pass through like a bypassed plugin
        if (pluginNodeId == juce::AudioProcessorGraph::NodeID())
            return { audioIn };

        // Reset utility node IDs (they are recreated each rebuild)
        leaf.inputGainNodeId = {};
        leaf.outputGainNodeId = {};
        leaf.pluginDryWetNodeId = {};
        leaf.msEncodeNodeId = {};
        leaf.msDecodeNodeId = {};
        leaf.msBypassDelayNodeId = {};

        // Set sidechain buffer on the wrapper if SC source is external
        if (auto gNode = getNodeForId(pluginNodeId))
        {
            if (auto* wrapper = dynamic_cast<PluginWithMeterWrapper*>(gNode->getProcessor()))
                wrapper->setSidechainBuffer(leaf.sidechainSource == 1 ? externalSidechainBuffer : nullptr);
        }

        bool useInputGain = true;   // Always wire to avoid rebuild when gain changes from 0
        bool useOutputGain = true;  // Always wire to avoid rebuild when gain changes from 0
        bool useDryWet = true;      // Always wire DryWetMixProcessor to avoid audio dropout on first knob move
        bool useMidSide = leaf.midSideMode != MidSideMode::Off;

        NodeID currentAudioIn = audioIn;

        // --- Input Gain node ---
        if (useInputGain)
        {
            auto inGainProc = std::make_unique<BranchGainProcessor>();
            inGainProc->setGainDb(leaf.inputGainDb);
            if (auto inGainNode = addNode(std::move(inGainProc), {}, UpdateKind::none))
            {
                leaf.inputGainNodeId = inGainNode->nodeID;
                utilityNodes.insert(inGainNode->nodeID);

                addConnection({{currentAudioIn, 0}, {inGainNode->nodeID, 0}}, UpdateKind::none);
                addConnection({{currentAudioIn, 1}, {inGainNode->nodeID, 1}}, UpdateKind::none);
                currentAudioIn = inGainNode->nodeID;
            }
        }

        // --- Per-plugin dry/wet: save dry source before M/S encode ---
        NodeID drySource = currentAudioIn;  // for dry path (original L/R)

        // --- Mid/Side processing ---
        if (useMidSide)
        {
            // Create M/S encode node (L/R → Mid/Side)
            auto encodeProc = std::make_unique<MidSideMatrixProcessor>();
            auto encodeNode = addNode(std::move(encodeProc), {}, UpdateKind::none);
            if (encodeNode)
            {
                leaf.msEncodeNodeId = encodeNode->nodeID;
                utilityNodes.insert(encodeNode->nodeID);

                // Wire input → encoder
                addConnection({{currentAudioIn, 0}, {encodeNode->nodeID, 0}}, UpdateKind::none);
                addConnection({{currentAudioIn, 1}, {encodeNode->nodeID, 1}}, UpdateKind::none);

                // Get plugin latency for bypass delay
                int pluginLatency = 0;
                if (auto gNode = getNodeForId(pluginNodeId))
                    if (auto* proc = gNode->getProcessor())
                        pluginLatency = proc->getLatencySamples();

                // Create M/S decode node (Mid/Side → L/R)
                auto decodeProc = std::make_unique<MidSideMatrixProcessor>();
                auto decodeNode = addNode(std::move(decodeProc), {}, UpdateKind::none);
                if (decodeNode)
                {
                    leaf.msDecodeNodeId = decodeNode->nodeID;
                    utilityNodes.insert(decodeNode->nodeID);

                    if (leaf.midSideMode == MidSideMode::MidSide)
                    {
                        // Full M/S: encode ch0(mid)→plugin ch0, encode ch1(side)→plugin ch1
                        addConnection({{encodeNode->nodeID, 0}, {pluginNodeId, 0}}, UpdateKind::none);
                        addConnection({{encodeNode->nodeID, 1}, {pluginNodeId, 1}}, UpdateKind::none);
                        // Plugin L→decode ch0, plugin R→decode ch1
                        addConnection({{pluginNodeId, 0}, {decodeNode->nodeID, 0}}, UpdateKind::none);
                        addConnection({{pluginNodeId, 1}, {decodeNode->nodeID, 1}}, UpdateKind::none);
                    }
                    else if (leaf.midSideMode == MidSideMode::MidOnly)
                    {
                        // Mid Only: process mid (ch0), bypass side (ch1)
                        wireMidSidePlugin(leaf, encodeNode->nodeID, pluginNodeId,
                                          decodeNode->nodeID, /*processChannel=*/0,
                                          /*bypassChannel=*/1, pluginLatency);
                    }
                    else // SideOnly
                    {
                        // Side Only: process side (ch1), bypass mid (ch0)
                        wireMidSidePlugin(leaf, encodeNode->nodeID, pluginNodeId,
                                          decodeNode->nodeID, /*processChannel=*/1,
                                          /*bypassChannel=*/0, pluginLatency);
                    }

                    // M/S decode output becomes the audio output
                    NodeID currentAudioOut = decodeNode->nodeID;

                    // --- Per-plugin dry/wet mix (after M/S decode) ---
                    if (useDryWet)
                    {
                        auto mixProc = std::make_unique<DryWetMixProcessor>();
                        // If muted, force fully dry (0.0) so the effect is disabled
                        mixProc->setMix(node.mute.load(std::memory_order_relaxed) ? 0.0f : leaf.dryWetMix);

                        if (auto mixNode = addNode(std::move(mixProc), {}, UpdateKind::none))
                        {
                            leaf.pluginDryWetNodeId = mixNode->nodeID;
                            utilityNodes.insert(mixNode->nodeID);

                            // Compute total M/S path latency for dry delay
                            int msPathLatency = pluginLatency; // encode/decode are zero-latency
                            NodeID dryDelayOut = drySource;
                            if (msPathLatency > 0)
                            {
                                auto delayProc = std::make_unique<LatencyCompensationProcessor>(msPathLatency);
                                if (auto delayNode = addNode(std::move(delayProc), {}, UpdateKind::none))
                                {
                                    utilityNodes.insert(delayNode->nodeID);
                                    addConnection({{drySource, 0}, {delayNode->nodeID, 0}}, UpdateKind::none);
                                    addConnection({{drySource, 1}, {delayNode->nodeID, 1}}, UpdateKind::none);
                                    dryDelayOut = delayNode->nodeID;
                                }
                            }

                            // DryWetMixProcessor: ch0-1 = dry (original L/R), ch2-3 = wet (decoded L/R)
                            addConnection({{dryDelayOut, 0}, {mixNode->nodeID, 0}}, UpdateKind::none);
                            addConnection({{dryDelayOut, 1}, {mixNode->nodeID, 1}}, UpdateKind::none);
                            addConnection({{decodeNode->nodeID, 0}, {mixNode->nodeID, 2}}, UpdateKind::none);
                            addConnection({{decodeNode->nodeID, 1}, {mixNode->nodeID, 3}}, UpdateKind::none);

                            currentAudioOut = mixNode->nodeID;
                        }
                    }

                    // --- Output Gain node ---
                    if (useOutputGain)
                    {
                        auto outGainProc = std::make_unique<BranchGainProcessor>();
                        outGainProc->setGainDb(leaf.outputGainDb);
                        if (auto outGainNode = addNode(std::move(outGainProc), {}, UpdateKind::none))
                        {
                            leaf.outputGainNodeId = outGainNode->nodeID;
                            utilityNodes.insert(outGainNode->nodeID);

                            addConnection({{currentAudioOut, 0}, {outGainNode->nodeID, 0}}, UpdateKind::none);
                            addConnection({{currentAudioOut, 1}, {outGainNode->nodeID, 1}}, UpdateKind::none);
                            currentAudioOut = outGainNode->nodeID;
                        }
                    }

                    return { currentAudioOut };
                }
            }
            // If M/S node creation failed, fall through to normal wiring
        }

        // --- Normal (non-M/S) wiring: connect audio to plugin ---
        addConnection({{currentAudioIn, 0}, {pluginNodeId, 0}}, UpdateKind::none);
        addConnection({{currentAudioIn, 1}, {pluginNodeId, 1}}, UpdateKind::none);

        NodeID currentAudioOut = pluginNodeId;

        // --- Per-plugin dry/wet mix ---
        if (useDryWet)
        {
            auto mixProc = std::make_unique<DryWetMixProcessor>();
            // If muted, force fully dry (0.0) so the effect is disabled
            mixProc->setMix(node.mute.load(std::memory_order_relaxed) ? 0.0f : leaf.dryWetMix);

            if (auto mixNode = addNode(std::move(mixProc), {}, UpdateKind::none))
            {
                leaf.pluginDryWetNodeId = mixNode->nodeID;
                utilityNodes.insert(mixNode->nodeID);

                // Compute plugin latency for dry path delay
                int pluginLatency = 0;
                if (auto gNode = getNodeForId(pluginNodeId))
                    if (auto* proc = gNode->getProcessor())
                        pluginLatency = proc->getLatencySamples();

                NodeID dryDelayOut = drySource;
                if (pluginLatency > 0)
                {
                    auto delayProc = std::make_unique<LatencyCompensationProcessor>(pluginLatency);
                    if (auto delayNode = addNode(std::move(delayProc), {}, UpdateKind::none))
                    {
                        utilityNodes.insert(delayNode->nodeID);
                        addConnection({{drySource, 0}, {delayNode->nodeID, 0}}, UpdateKind::none);
                        addConnection({{drySource, 1}, {delayNode->nodeID, 1}}, UpdateKind::none);
                        dryDelayOut = delayNode->nodeID;
                    }
                }

                // DryWetMixProcessor: ch0-1 = dry, ch2-3 = wet
                addConnection({{dryDelayOut, 0}, {mixNode->nodeID, 0}}, UpdateKind::none);
                addConnection({{dryDelayOut, 1}, {mixNode->nodeID, 1}}, UpdateKind::none);
                addConnection({{pluginNodeId, 0}, {mixNode->nodeID, 2}}, UpdateKind::none);
                addConnection({{pluginNodeId, 1}, {mixNode->nodeID, 3}}, UpdateKind::none);

                currentAudioOut = mixNode->nodeID;
            }
        }

        // --- Output Gain node ---
        if (useOutputGain)
        {
            auto outGainProc = std::make_unique<BranchGainProcessor>();
            outGainProc->setGainDb(leaf.outputGainDb);
            if (auto outGainNode = addNode(std::move(outGainProc), {}, UpdateKind::none))
            {
                leaf.outputGainNodeId = outGainNode->nodeID;
                utilityNodes.insert(outGainNode->nodeID);

                addConnection({{currentAudioOut, 0}, {outGainNode->nodeID, 0}}, UpdateKind::none);
                addConnection({{currentAudioOut, 1}, {outGainNode->nodeID, 1}}, UpdateKind::none);
                currentAudioOut = outGainNode->nodeID;
            }
        }

        return { currentAudioOut };
    }
    else if (node.isGroup())
    {
        auto& group = node.getGroup();
        if (group.mode == GroupMode::Serial)
            return wireSerialGroup(node, audioIn);
        else
            return wireParallelGroup(node, audioIn);
    }

    // Shouldn't reach here, but passthrough
    return { audioIn };
}

WireResult ChainProcessor::wireSerialGroup(ChainNode& node, NodeID audioIn)
{
    auto& group = node.getGroup();
    auto& children = group.children;

    // Empty group = passthrough
    if (children.empty())
        return { audioIn };

    bool useDryWet = (node.id != 0); // Always wire DryWetMixProcessor for non-root groups to avoid dropout/silent failure on first knob move

    if (!useDryWet)
    {
        // Root node: simple serial chain, no dry/wet
        NodeID prevAudio = audioIn;

        for (auto& child : children)
        {
            auto result = wireNode(*child, prevAudio);
            prevAudio = result.audioOut;
        }

        // Insert DuckingProcessor after last child if duck amount > 0
        // Sidechain reference is the pre-group signal (audioIn)
        if (group.duckAmount > 0.001f)
        {
            auto duckProc = std::make_unique<DuckingProcessor>();
            duckProc->setDuckAmount(group.duckAmount);
            duckProc->setReleaseMs(group.duckReleaseMs);

            auto duckNode = addNode(std::move(duckProc), {}, UpdateKind::none);
            if (duckNode)
            {
                group.duckingNodeId = duckNode->nodeID;
                utilityNodes.insert(duckNode->nodeID);

                // Connect chain output → ducking ch0-1 (audio to be ducked)
                addConnection({{prevAudio, 0}, {duckNode->nodeID, 0}}, UpdateKind::none);
                addConnection({{prevAudio, 1}, {duckNode->nodeID, 1}}, UpdateKind::none);

                // Connect pre-group signal → ducking ch2-3 (sidechain reference)
                addConnection({{audioIn, 0}, {duckNode->nodeID, 2}}, UpdateKind::none);
                addConnection({{audioIn, 1}, {duckNode->nodeID, 3}}, UpdateKind::none);

                return { duckNode->nodeID };
            }
        }

        return { prevAudio };
    }

    // Dry/wet mode: create a DryWetMixProcessor
    auto mixProc = std::make_unique<DryWetMixProcessor>();
    mixProc->setMix(group.dryWetMix);

    auto mixNode = addNode(std::move(mixProc), {}, UpdateKind::none);
    if (!mixNode)
        return { audioIn };

    group.dryWetMixNodeId = mixNode->nodeID;
    utilityNodes.insert(mixNode->nodeID);

    // Compute wet path latency
    int wetLatency = 0;
    for (const auto& child : children)
        wetLatency += computeNodeLatency(*child);

    // Dry path: insert delay if wet path has latency
    NodeID drySource = audioIn;
    if (wetLatency > 0)
    {
        auto dryDelayProc = std::make_unique<LatencyCompensationProcessor>(wetLatency);
        auto dryDelayNode = addNode(std::move(dryDelayProc), {}, UpdateKind::none);
        if (dryDelayNode)
        {
            utilityNodes.insert(dryDelayNode->nodeID);
            addConnection({{audioIn, 0}, {dryDelayNode->nodeID, 0}}, UpdateKind::none);
            addConnection({{audioIn, 1}, {dryDelayNode->nodeID, 1}}, UpdateKind::none);
            drySource = dryDelayNode->nodeID;
        }
    }

    // Connect dry path to mix node channels 0-1
    addConnection({{drySource, 0}, {mixNode->nodeID, 0}}, UpdateKind::none);
    addConnection({{drySource, 1}, {mixNode->nodeID, 1}}, UpdateKind::none);

    // Wet path: wire children in series, then connect to mix node channels 2-3
    NodeID prevAudio = audioIn;

    for (auto& child : children)
    {
        auto result = wireNode(*child, prevAudio);
        prevAudio = result.audioOut;
    }

    addConnection({{prevAudio, 0}, {mixNode->nodeID, 2}}, UpdateKind::none);
    addConnection({{prevAudio, 1}, {mixNode->nodeID, 3}}, UpdateKind::none);

    // Insert DuckingProcessor after DryWetMix if duck amount > 0
    // Sidechain reference is the pre-group signal (audioIn)
    if (group.duckAmount > 0.001f)
    {
        auto duckProc = std::make_unique<DuckingProcessor>();
        duckProc->setDuckAmount(group.duckAmount);
        duckProc->setReleaseMs(group.duckReleaseMs);

        auto duckNode = addNode(std::move(duckProc), {}, UpdateKind::none);
        if (duckNode)
        {
            group.duckingNodeId = duckNode->nodeID;
            utilityNodes.insert(duckNode->nodeID);

            // Connect DryWetMix output → ducking ch0-1 (audio to be ducked)
            addConnection({{mixNode->nodeID, 0}, {duckNode->nodeID, 0}}, UpdateKind::none);
            addConnection({{mixNode->nodeID, 1}, {duckNode->nodeID, 1}}, UpdateKind::none);

            // Connect pre-group signal → ducking ch2-3 (sidechain reference)
            addConnection({{audioIn, 0}, {duckNode->nodeID, 2}}, UpdateKind::none);
            addConnection({{audioIn, 1}, {duckNode->nodeID, 3}}, UpdateKind::none);

            return { duckNode->nodeID };
        }
    }

    return { mixNode->nodeID };
}

WireResult ChainProcessor::wireParallelGroup(ChainNode& node, NodeID audioIn)
{
    auto& group = node.getGroup();
    auto& children = group.children;

    // Empty group = passthrough
    if (children.empty())
        return { audioIn };

    // Determine solo state: if any child is soloed, only soloed children play
    bool anySoloed = false;
    for (const auto& child : children)
    {
        if (child->solo)
        {
            anySoloed = true;
            break;
        }
    }

    // Count active branches for gain compensation
    int activeBranches = 0;
    for (const auto& child : children)
    {
        bool isActive = true;
        if (anySoloed && !child->solo)
            isActive = false;
        if (child->mute && !(anySoloed && child->solo))
            isActive = false;
        if (isActive)
            activeBranches++;
    }

    if (activeBranches == 0)
    {
        // All branches muted/silenced - passthrough silence
        auto silenceProc = std::make_unique<BranchGainProcessor>();
        silenceProc->setGainDb(-60.0f);
        auto silenceNode = addNode(std::move(silenceProc), {}, UpdateKind::none);
        if (silenceNode)
        {
            utilityNodes.insert(silenceNode->nodeID);
            addConnection({{audioIn, 0}, {silenceNode->nodeID, 0}}, UpdateKind::none);
            addConnection({{audioIn, 1}, {silenceNode->nodeID, 1}}, UpdateKind::none);
            return { silenceNode->nodeID };
        }
        return { audioIn };
    }

    // Create sum compensation gain node at the output
    float compensationDb = -20.0f * std::log10(static_cast<float>(activeBranches));
    auto sumGainProc = std::make_unique<BranchGainProcessor>();
    sumGainProc->setGainDb(compensationDb);

    auto sumGainNode = addNode(std::move(sumGainProc), {}, UpdateKind::none);
    if (!sumGainNode)
        return { audioIn };

    group.sumGainNodeId = sumGainNode->nodeID;
    utilityNodes.insert(sumGainNode->nodeID);

    // Clear branch node ID vectors
    group.branchGainNodeIds.clear();

    // Wire all branches: input → branchGain → child → [delayComp] → sumGain
    // Insert LatencyCompensationProcessor delay nodes on shorter branches
    // so all branches arrive time-aligned at the sum point.

    struct BranchInfo {
        WireResult result;
        int latency;
        bool active;
    };
    std::vector<BranchInfo> branchInfos;

    // Pass 1: Wire all branches, collect per-branch results and latency
    for (size_t i = 0; i < children.size(); ++i)
    {
        auto& child = children[i];

        bool isActive = true;
        if (anySoloed && !child->solo)
            isActive = false;
        if (child->mute && !(anySoloed && child->solo))
            isActive = false;

        if (!isActive)
        {
            group.branchGainNodeIds.push_back({});
            branchInfos.push_back({{}, 0, false});
            continue;
        }

        // Create per-branch gain processor
        auto branchGainProc = std::make_unique<BranchGainProcessor>();
        branchGainProc->setGainDb(child->branchGainDb);

        auto branchGainNode = addNode(std::move(branchGainProc), {}, UpdateKind::none);
        if (!branchGainNode)
        {
            group.branchGainNodeIds.push_back({});
            branchInfos.push_back({{}, 0, false});
            continue;
        }

        group.branchGainNodeIds.push_back(branchGainNode->nodeID);
        utilityNodes.insert(branchGainNode->nodeID);

        // Fan-out: connect input to branch gain
        addConnection({{audioIn, 0}, {branchGainNode->nodeID, 0}}, UpdateKind::none);
        addConnection({{audioIn, 1}, {branchGainNode->nodeID, 1}}, UpdateKind::none);

        // Wire child after branch gain
        auto result = wireNode(*child, branchGainNode->nodeID);
        int branchLatency = computeNodeLatency(*child);
        branchInfos.push_back({result, branchLatency, true});
    }

    // Pass 2: Find max latency, insert compensation delays, connect to sumGain
    int maxBranchLatency = 0;
    for (const auto& bi : branchInfos)
        if (bi.active)
            maxBranchLatency = std::max(maxBranchLatency, bi.latency);

    for (const auto& bi : branchInfos)
    {
        if (!bi.active)
            continue;

        NodeID connectFrom = bi.result.audioOut;
        int delayNeeded = maxBranchLatency - bi.latency;

        if (delayNeeded > 0)
        {
            auto delayProc = std::make_unique<LatencyCompensationProcessor>(delayNeeded);
            auto delayNode = addNode(std::move(delayProc), {}, UpdateKind::none);
            if (delayNode)
            {
                utilityNodes.insert(delayNode->nodeID);
                addConnection({{bi.result.audioOut, 0}, {delayNode->nodeID, 0}}, UpdateKind::none);
                addConnection({{bi.result.audioOut, 1}, {delayNode->nodeID, 1}}, UpdateKind::none);
                connectFrom = delayNode->nodeID;
            }
        }

        // Fan-in: connect branch output to sum gain node
        // (AudioProcessorGraph auto-sums multiple connections to the same input)
        addConnection({{connectFrom, 0}, {sumGainNode->nodeID, 0}}, UpdateKind::none);
        addConnection({{connectFrom, 1}, {sumGainNode->nodeID, 1}}, UpdateKind::none);
    }

    // Insert DuckingProcessor after sumGain if duck amount > 0
    // The ducking processor receives the group output on ch0-1 and
    // the pre-group signal (audioIn) on ch2-3 as sidechain reference
    if (group.duckAmount > 0.001f)
    {
        auto duckProc = std::make_unique<DuckingProcessor>();
        duckProc->setDuckAmount(group.duckAmount);
        duckProc->setReleaseMs(group.duckReleaseMs);

        auto duckNode = addNode(std::move(duckProc), {}, UpdateKind::none);
        if (duckNode)
        {
            group.duckingNodeId = duckNode->nodeID;
            utilityNodes.insert(duckNode->nodeID);

            // Connect sumGain output → ducking ch0-1 (audio to be ducked)
            addConnection({{sumGainNode->nodeID, 0}, {duckNode->nodeID, 0}}, UpdateKind::none);
            addConnection({{sumGainNode->nodeID, 1}, {duckNode->nodeID, 1}}, UpdateKind::none);

            // Connect pre-group signal → ducking ch2-3 (sidechain reference)
            addConnection({{audioIn, 0}, {duckNode->nodeID, 2}}, UpdateKind::none);
            addConnection({{audioIn, 1}, {duckNode->nodeID, 3}}, UpdateKind::none);

            return { duckNode->nodeID };
        }
    }

    return { sumGainNode->nodeID };
}

//==============================================================================
// Helper
//==============================================================================

bool ChainProcessor::isInParallelGroup(ChainNodeId id) const
{
    // Find the parent of this node
    auto* parent = ChainNodeHelpers::findParent(const_cast<ChainNode&>(rootNode), id);
    if (!parent)
        return false;  // Root node or not found

    // Check if parent is a parallel group
    if (parent->isGroup() && parent->getGroup().mode == GroupMode::Parallel)
        return true;

    return false;
}

bool ChainProcessor::detectCycles() const
{
    // Use DFS with color marking (white=unvisited, gray=visiting, black=done)
    std::map<juce::AudioProcessorGraph::NodeID, int> colors;

    for (auto* node : getNodes())
        colors[node->nodeID] = 0;  // white

    std::function<bool(juce::AudioProcessorGraph::NodeID)> dfs;
    dfs = [&](juce::AudioProcessorGraph::NodeID id) -> bool
    {
        colors[id] = 1;  // gray (visiting)

        for (auto& conn : getConnections())
        {
            if (conn.source.nodeID == id)
            {
                auto destColor = colors[conn.destination.nodeID];
                if (destColor == 1)  // Back edge = cycle
                    return true;
                if (destColor == 0 && dfs(conn.destination.nodeID))
                    return true;
            }
        }

        colors[id] = 2;  // black (done)
        return false;
    };

    for (auto* node : getNodes())
        if (colors[node->nodeID] == 0 && dfs(node->nodeID))
            return true;

    return false;
}

//==============================================================================
// Latency
//==============================================================================

// PHASE 5: Latency caching (eliminates redundant O(N) tree traversals at 500ms intervals)
int ChainProcessor::getTotalLatencySamples() const
{
    // Check if cache is valid
    if (!latencyCacheDirty.load(std::memory_order_acquire))
    {
        return cachedTotalLatency.load(std::memory_order_relaxed);
    }

    // Compute and cache
    int latency = computeNodeLatency(rootNode, 0);
    cachedTotalLatency.store(latency, std::memory_order_relaxed);
    latencyCacheDirty.store(false, std::memory_order_release);

    return latency;
}

void ChainProcessor::invalidateLatencyCache()
{
    latencyCacheDirty.store(true, std::memory_order_release);
}

void ChainProcessor::refreshLatencyCompensation()
{
    // PHASE 7: Handle dynamic latency changes (e.g., Auto-Tune mode toggle)
    // This rebuilds the graph to update internal delay compensation
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    // CRITICAL: Acknowledge all wrapper latency flags BEFORE rebuild.
    // Otherwise the audio thread re-sets latencyRefreshNeeded during the rebuild,
    // causing an infinite rebuild loop on the next timer tick.
    for (auto* node : getNodes())
    {
        if (auto* wrapper = dynamic_cast<PluginWithMeterWrapper*>(node->getProcessor()))
            wrapper->acknowledgeLatencyChange();
    }

    suspendProcessing(true);
    rebuildGraph();
    suspendProcessing(false);

    // Note: rebuildGraph() already calls setLatencySamples() at the end
}

void ChainProcessor::clearGraph()
{
    // Remove all connections and nodes from the AudioProcessorGraph
    // so the render sequence is empty before destruction.
    constexpr auto deferred = UpdateKind::none;
    for (auto& conn : getConnections())
        removeConnection(conn, deferred);
    clear();    // AudioProcessorGraph::clear() removes all nodes
    rebuild();  // Rebuild render sequence (now empty)
}

int ChainProcessor::computeNodeLatency(const ChainNode& node, int depth) const
{
    if (depth > 64)
    {
        jassertfalse;  // Stack overflow prevention
        return 0;
    }

    if (node.isPlugin())
    {
        // Bypassed plugins are fully disconnected from the graph,
        // so they contribute zero latency to the signal path.
        if (node.getPlugin().bypassed)
            return 0;

        if (auto gNode = getNodeForId(node.getPlugin().graphNodeId))
        {
            if (auto* processor = gNode->getProcessor())
                return processor->getLatencySamples();
        }
        return 0;
    }

    if (node.isGroup())
    {
        const auto& group = node.getGroup();
        if (group.children.empty())
            return 0;

        if (group.mode == GroupMode::Serial)
        {
            int total = 0;
            for (const auto& child : group.children)
                total += computeNodeLatency(*child, depth + 1);
            return total;
        }
        else // Parallel
        {
            // For parallel groups, the latency is the maximum of all branches
            int maxLatency = 0;
            for (const auto& child : group.children)
            {
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

const std::vector<ChainProcessor::NodeMeterData>& ChainProcessor::getNodeMeterReadings() const
{
    // PHASE 3: Reuse preallocated cache instead of allocating new vector at 30Hz
    cachedMeterReadings.clear();  // Doesn't deallocate capacity, just resets size

    // Use cached wrapper pointers to avoid DFS + dynamic_cast at 30Hz
    for (const auto& [nodeId, wrapper] : cachedMeterWrappers)
    {
        // Find the node to check bypassed state
        auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
        if (!node || !node->isPlugin() || node->getPlugin().bypassed)
            continue;

        NodeMeterData entry { nodeId, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.0f };

        // Output meter (from wrapper)
        auto outputReadings = wrapper->getOutputMeter().getReadings();
        entry.peakL = outputReadings.peakL;
        entry.peakR = outputReadings.peakR;
        entry.peakHoldL = outputReadings.peakHoldL;
        entry.peakHoldR = outputReadings.peakHoldR;
        entry.rmsL = outputReadings.rmsL;
        entry.rmsR = outputReadings.rmsR;

        // Input meter (from wrapper)
        auto inputReadings = wrapper->getInputMeter().getReadings();
        entry.inputPeakL = inputReadings.peakL;
        entry.inputPeakR = inputReadings.peakR;
        entry.inputPeakHoldL = inputReadings.peakHoldL;
        entry.inputPeakHoldR = inputReadings.peakHoldR;
        entry.inputRmsL = inputReadings.rmsL;
        entry.inputRmsR = inputReadings.rmsR;

        // Calculate latency in milliseconds
        auto* plugin = wrapper->getWrappedPlugin();
        if (plugin && getSampleRate() > 0)
        {
            int latencySamples = plugin->getLatencySamples();
            entry.latencyMs = (latencySamples / static_cast<float>(getSampleRate())) * 1000.0f;
        }

        cachedMeterReadings.push_back(entry);
    }

    return cachedMeterReadings;
}

void ChainProcessor::resetAllNodePeaks()
{
    std::function<void(const ChainNode&)> resetNode = [&](const ChainNode& node)
    {
        if (node.isPlugin())
        {
            const auto& leaf = node.getPlugin();
            if (!leaf.bypassed && leaf.graphNodeId != juce::AudioProcessorGraph::NodeID())
            {
                if (auto* graphNode = getNodeForId(leaf.graphNodeId))
                {
                    if (auto* wrapper = dynamic_cast<PluginWithMeterWrapper*>(graphNode->getProcessor()))
                    {
                        wrapper->getOutputMeter().reset();
                        wrapper->getInputMeter().reset();
                    }
                }
            }
        }
        else if (node.isGroup())
        {
            for (const auto& child : node.getGroup().children)
                resetNode(*child);
        }
    };

    resetNode(rootNode);
}

//==============================================================================
// Serialization
//==============================================================================

void ChainProcessor::nodeToXml(const ChainNode& node, juce::XmlElement& parent) const
{
    auto* nodeXml = parent.createNewChildElement("Node");
    nodeXml->setAttribute("id", node.id);

    if (node.isPlugin())
    {
        nodeXml->setAttribute("type", "plugin");
        nodeXml->setAttribute("bypassed", node.getPlugin().bypassed);
        nodeXml->setAttribute("isDryPath", node.getPlugin().isDryPath);
        nodeXml->setAttribute("branchGainDb", static_cast<double>(node.branchGainDb));
        nodeXml->setAttribute("solo", node.solo.load(std::memory_order_relaxed));
        nodeXml->setAttribute("mute", node.mute.load(std::memory_order_relaxed));

        // Per-plugin controls
        nodeXml->setAttribute("inputGainDb", static_cast<double>(node.getPlugin().inputGainDb));
        nodeXml->setAttribute("outputGainDb", static_cast<double>(node.getPlugin().outputGainDb));
        nodeXml->setAttribute("pluginDryWet", static_cast<double>(node.getPlugin().dryWetMix));
        nodeXml->setAttribute("sidechainSource", node.getPlugin().sidechainSource);
        nodeXml->setAttribute("midSideMode", static_cast<int>(node.getPlugin().midSideMode));

        if (auto descXml = node.getPlugin().description.createXml())
            nodeXml->addChildElement(descXml.release());

        if (auto gNode = getNodeForId(node.getPlugin().graphNodeId))
        {
            if (auto* processor = gNode->getProcessor())
            {
                try
                {
                    juce::MemoryBlock state;
                    processor->getStateInformation(state);
                    // Only save state if it's not empty (prevents issues with uninitialized plugins)
                    if (state.getSize() > 0)
                    {
                        nodeXml->setAttribute("state", state.toBase64Encoding());
                    }
                    else
                    {
                        DBG("WARNING: Plugin " + node.getPlugin().description.name + " returned empty state during snapshot");
                    }
                }
                catch (const std::exception& e)
                {
                    DBG("ERROR: Plugin " + node.getPlugin().description.name + " crashed during state save: " + juce::String(e.what()));
                    // Continue with other plugins - don't let one bad plugin crash the whole snapshot
                }
                catch (...)
                {
                    DBG("ERROR: Plugin " + node.getPlugin().description.name + " crashed during state save (unknown exception)");
                    // Continue with other plugins
                }
            }
        }
    }
    else if (node.isGroup())
    {
        nodeXml->setAttribute("type", "group");
        nodeXml->setAttribute("mode", node.getGroup().mode == GroupMode::Serial ? "serial" : "parallel");
        nodeXml->setAttribute("dryWet", static_cast<double>(node.getGroup().dryWetMix));
        nodeXml->setAttribute("duckAmount", static_cast<double>(node.getGroup().duckAmount));
        nodeXml->setAttribute("duckReleaseMs", static_cast<double>(node.getGroup().duckReleaseMs));
        nodeXml->setAttribute("name", node.name);
        nodeXml->setAttribute("collapsed", node.collapsed);

        for (const auto& child : node.getGroup().children)
            nodeToXml(*child, *nodeXml);
    }
}

std::unique_ptr<ChainNode> ChainProcessor::xmlToNode(const juce::XmlElement& xml)
{
    auto node = std::make_unique<ChainNode>();
    node->id = xml.getIntAttribute("id", nextNodeId++);

    // Track the highest ID seen so nextNodeId stays ahead
    if (node->id >= nextNodeId)
        nextNodeId = node->id + 1;

    auto type = xml.getStringAttribute("type");

    if (type == "plugin")
    {
        node->branchGainDb = static_cast<float>(xml.getDoubleAttribute("branchGainDb", 0.0));
        node->solo.store(xml.getBoolAttribute("solo", false), std::memory_order_relaxed);
        node->mute.store(xml.getBoolAttribute("mute", false), std::memory_order_relaxed);

        PluginLeaf leaf;

        // Per-plugin controls (backward-compatible: defaults for old presets)
        leaf.inputGainDb = static_cast<float>(xml.getDoubleAttribute("inputGainDb", 0.0));
        leaf.outputGainDb = static_cast<float>(xml.getDoubleAttribute("outputGainDb", 0.0));
        leaf.dryWetMix = static_cast<float>(xml.getDoubleAttribute("pluginDryWet", 1.0));
        leaf.sidechainSource = xml.getIntAttribute("sidechainSource", 0);
        leaf.midSideMode = static_cast<MidSideMode>(xml.getIntAttribute("midSideMode", 0));
        leaf.bypassed = xml.getBoolAttribute("bypassed", false);
        leaf.isDryPath = xml.getBoolAttribute("isDryPath", false);

        // Dry path nodes have no plugin to instantiate
        if (leaf.isDryPath)
        {
            node->name = "Dry Path";
            node->data = std::move(leaf);
            return node;
        }

        if (auto* descXml = xml.getChildByName("PLUGIN"))
        {
            leaf.description.loadFromXml(*descXml);
            node->name = leaf.description.name;

            juce::String errorMessage;
            auto instance = pluginManager.createPluginInstance(
                leaf.description, currentSampleRate, currentBlockSize, errorMessage);

            // Fallback: if direct instantiation failed, try matching by name+manufacturer
            // from the known plugins list (handles cross-format presets, e.g. VST3→AU)
            if (!instance)
            {
                PCLOG("xmlToNode — direct load failed for \"" + leaf.description.name
                      + "\" (" + leaf.description.pluginFormatName + "): " + errorMessage
                      + " — trying name match...");
                for (const auto& knownDesc : pluginManager.getKnownPlugins().getTypes())
                {
                    if (knownDesc.name.equalsIgnoreCase(leaf.description.name) &&
                        knownDesc.manufacturerName.equalsIgnoreCase(leaf.description.manufacturerName))
                    {
                        juce::String fallbackError;
                        instance = pluginManager.createPluginInstance(
                            knownDesc, currentSampleRate, currentBlockSize, fallbackError);
                        if (instance)
                        {
                            PCLOG("xmlToNode — fallback matched: " + knownDesc.name
                                  + " (" + knownDesc.pluginFormatName + ")");
                            leaf.description = knownDesc;
                            break;
                        }
                    }
                }
                if (!instance)
                    PCLOG("xmlToNode — no match found for \"" + leaf.description.name + "\"");
            }

            if (instance)
            {
                // Pre-prepare so bus layout is initialized (sidechain plugins need correct channel count)
                instance->prepareToPlay(currentSampleRate, currentBlockSize);

                // Store preset data to be applied AFTER prepareToPlay (deferred state restoration)
                auto stateBase64 = xml.getStringAttribute("state");
                if (stateBase64.isNotEmpty())
                {
                    juce::MemoryBlock state;
                    state.fromBase64Encoding(stateBase64);

                    // Validate size (reject presets > 10MB)
                    const size_t maxPresetSize = 10 * 1024 * 1024;
                    if (state.getSize() > maxPresetSize)
                    {
                        DBG("Preset state too large: " + juce::String(state.getSize()) + " bytes");
                    }
                    else
                    {
                        // Store as base64 for deferred restoration
                        leaf.pendingPresetData = stateBase64;
                    }
                }

                auto wrapper = std::make_unique<PluginWithMeterWrapper>(std::move(instance));
                if (auto graphNode = addNode(std::move(wrapper)))
                    leaf.graphNodeId = graphNode->nodeID;
            }
        }

        node->data = std::move(leaf);
    }
    else if (type == "group")
    {
        node->name = xml.getStringAttribute("name", "Group");
        node->collapsed = xml.getBoolAttribute("collapsed", false);

        GroupData group;
        group.mode = xml.getStringAttribute("mode") == "parallel" ? GroupMode::Parallel : GroupMode::Serial;
        group.dryWetMix = static_cast<float>(xml.getDoubleAttribute("dryWet", 1.0));
        group.duckAmount = static_cast<float>(xml.getDoubleAttribute("duckAmount", 0.0));
        group.duckReleaseMs = static_cast<float>(xml.getDoubleAttribute("duckReleaseMs", 200.0));

        for (auto* childXml : xml.getChildWithTagNameIterator("Node"))
        {
            if (auto child = xmlToNode(*childXml))
                group.children.push_back(std::move(child));
        }

        node->data = std::move(group);
    }

    return node;
}

juce::var ChainProcessor::nodeToJson(const ChainNode& node) const
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty("id", node.id);

    if (node.isPlugin())
    {
        obj->setProperty("type", "plugin");
        obj->setProperty("name", node.getPlugin().description.name);
        obj->setProperty("format", node.getPlugin().description.pluginFormatName);
        obj->setProperty("uid", node.getPlugin().description.uniqueId);
        obj->setProperty("fileOrIdentifier", node.getPlugin().description.fileOrIdentifier);
        obj->setProperty("bypassed", node.getPlugin().bypassed);
        obj->setProperty("isDryPath", node.getPlugin().isDryPath);
        obj->setProperty("manufacturer", node.getPlugin().description.manufacturerName);
        obj->setProperty("branchGainDb", node.branchGainDb);
        obj->setProperty("solo", node.solo.load());
        obj->setProperty("mute", node.mute.load());

        // Per-plugin controls
        auto& leaf = node.getPlugin();
        obj->setProperty("inputGainDb", leaf.inputGainDb);
        obj->setProperty("outputGainDb", leaf.outputGainDb);
        obj->setProperty("pluginDryWet", leaf.dryWetMix);
        obj->setProperty("sidechainSource", leaf.sidechainSource);
        obj->setProperty("midSideMode", static_cast<int>(leaf.midSideMode));

        // Detect SC support from wrapped plugin
        bool hasSC = false;
        if (auto gNode = getNodeForId(leaf.graphNodeId))
            if (auto* wrapper = dynamic_cast<PluginWithMeterWrapper*>(gNode->getProcessor()))
                if (auto* plugin = wrapper->getWrappedPlugin())
                    hasSC = plugin->getTotalNumInputChannels() > 2;
        obj->setProperty("hasSidechain", hasSC);
    }
    else if (node.isGroup())
    {
        obj->setProperty("type", "group");
        obj->setProperty("name", node.name);
        obj->setProperty("mode", node.getGroup().mode == GroupMode::Serial ? "serial" : "parallel");
        obj->setProperty("dryWet", node.getGroup().dryWetMix);
        obj->setProperty("duckAmount", node.getGroup().duckAmount);
        obj->setProperty("duckReleaseMs", node.getGroup().duckReleaseMs);
        obj->setProperty("collapsed", node.collapsed);

        juce::Array<juce::var> childrenArr;
        for (const auto& child : node.getGroup().children)
            childrenArr.add(nodeToJson(*child));
        obj->setProperty("children", childrenArr);
    }

    return juce::var(obj);
}

juce::var ChainProcessor::nodeToJsonWithPresets(const ChainNode& node) const
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty("id", node.id);

    if (node.isPlugin())
    {
        auto& leaf = node.getPlugin();
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
        obj->setProperty("solo", node.solo.load());
        obj->setProperty("mute", node.mute.load());

        // Per-plugin controls
        obj->setProperty("inputGainDb", leaf.inputGainDb);
        obj->setProperty("outputGainDb", leaf.outputGainDb);
        obj->setProperty("pluginDryWet", leaf.dryWetMix);
        obj->setProperty("sidechainSource", leaf.sidechainSource);
        obj->setProperty("midSideMode", static_cast<int>(leaf.midSideMode));

        if (auto gNode = getNodeForId(leaf.graphNodeId))
        {
            if (auto* processor = gNode->getProcessor())
            {
                juce::MemoryBlock state;
                processor->getStateInformation(state);
                obj->setProperty("presetData", state.toBase64Encoding());
                obj->setProperty("presetSizeBytes", static_cast<int>(state.getSize()));
            }
        }
    }
    else if (node.isGroup())
    {
        obj->setProperty("type", "group");
        obj->setProperty("name", node.name);
        obj->setProperty("mode", node.getGroup().mode == GroupMode::Serial ? "serial" : "parallel");
        obj->setProperty("dryWet", node.getGroup().dryWetMix);
        obj->setProperty("duckAmount", node.getGroup().duckAmount);
        obj->setProperty("duckReleaseMs", node.getGroup().duckReleaseMs);
        obj->setProperty("collapsed", node.collapsed);

        juce::Array<juce::var> childrenArr;
        for (const auto& child : node.getGroup().children)
            childrenArr.add(nodeToJsonWithPresets(*child));
        obj->setProperty("children", childrenArr);
    }

    return juce::var(obj);
}

std::unique_ptr<ChainNode> ChainProcessor::jsonToNode(const juce::var& json)
{
    if (!json.isObject())
        return nullptr;

    auto* obj = json.getDynamicObject();
    if (!obj)
        return nullptr;

    auto node = std::make_unique<ChainNode>();
    node->id = static_cast<int>(obj->getProperty("id"));
    if (node->id >= nextNodeId)
        nextNodeId = node->id + 1;

    auto type = obj->getProperty("type").toString();

    if (type == "plugin")
    {
        node->name = obj->getProperty("name").toString();
        node->branchGainDb = static_cast<float>(obj->getProperty("branchGainDb"));
        node->solo.store(static_cast<bool>(obj->getProperty("solo")), std::memory_order_relaxed);
        node->mute.store(static_cast<bool>(obj->getProperty("mute")), std::memory_order_relaxed);

        PluginLeaf leaf;
        leaf.bypassed = static_cast<bool>(obj->getProperty("bypassed"));
        leaf.isDryPath = static_cast<bool>(obj->getProperty("isDryPath"));

        // Dry path nodes have no plugin to instantiate
        if (leaf.isDryPath)
        {
            node->name = "Dry Path";
            node->data = std::move(leaf);
            return node;
        }

        // Per-plugin controls (backward-compatible: defaults if missing)
        leaf.inputGainDb = static_cast<float>(obj->getProperty("inputGainDb"));
        leaf.outputGainDb = static_cast<float>(obj->getProperty("outputGainDb"));
        leaf.dryWetMix = obj->hasProperty("pluginDryWet")
            ? static_cast<float>(obj->getProperty("pluginDryWet")) : 1.0f;
        leaf.sidechainSource = static_cast<int>(obj->getProperty("sidechainSource"));
        leaf.midSideMode = obj->hasProperty("midSideMode")
            ? static_cast<MidSideMode>(static_cast<int>(obj->getProperty("midSideMode"))) : MidSideMode::Off;

        // Build plugin description
        juce::PluginDescription desc;
        desc.name = obj->getProperty("name").toString();
        desc.manufacturerName = obj->getProperty("manufacturer").toString();
        desc.pluginFormatName = obj->getProperty("format").toString();
        desc.uniqueId = static_cast<int>(obj->getProperty("uid"));
        desc.fileOrIdentifier = obj->getProperty("fileOrIdentifier").toString();
        desc.version = obj->getProperty("version").toString();
        desc.isInstrument = static_cast<bool>(obj->getProperty("isInstrument"));
        desc.numInputChannels = static_cast<int>(obj->getProperty("numInputChannels"));
        desc.numOutputChannels = static_cast<int>(obj->getProperty("numOutputChannels"));
        leaf.description = desc;

        // Try to find matching plugin in user's system
        auto& knownPlugins = pluginManager.getKnownPlugins();
        juce::PluginDescription* matchedDesc = nullptr;

        for (auto& knownType : knownPlugins.getTypes())
        {
            if (knownType.name.equalsIgnoreCase(desc.name) &&
                knownType.manufacturerName.equalsIgnoreCase(desc.manufacturerName))
            {
                matchedDesc = &knownType;
                break;
            }
        }

        const auto& descToUse = matchedDesc ? *matchedDesc : desc;

        juce::String errorMessage;
        auto instance = pluginManager.createPluginInstance(
            descToUse, currentSampleRate, currentBlockSize, errorMessage);

        if (instance)
        {
            // Pre-prepare so bus layout is initialized (sidechain plugins need correct channel count)
            instance->prepareToPlay(currentSampleRate, currentBlockSize);

            // Store preset data to be applied AFTER prepareToPlay (deferred state restoration)
            auto presetData = obj->getProperty("presetData").toString();
            if (presetData.isNotEmpty())
            {
                leaf.pendingPresetData = presetData;
            }

            // Parse parameter hints from seeded chains (only when no binary preset)
            auto paramsVar = obj->getProperty("parameters");
            if (paramsVar.isArray() && presetData.isEmpty())
            {
                for (const auto& pVar : *paramsVar.getArray())
                {
                    if (!pVar.isObject()) continue;
                    PendingParameter pp;
                    pp.name = pVar.getProperty("name", "").toString();
                    pp.semantic = pVar.getProperty("semantic", "").toString();
                    pp.unit = pVar.getProperty("unit", "").toString();
                    auto valStr = pVar.getProperty("value", "").toString();
                    if (valStr.isNotEmpty())
                    {
                        pp.physicalValue = valStr.getFloatValue();
                        pp.hasPhysicalValue = true;
                    }
                    pp.normalizedValue = static_cast<float>(pVar.getProperty("normalizedValue", 0.0));
                    leaf.pendingParameters.push_back(pp);
                }
            }

            auto wrapper = std::make_unique<PluginWithMeterWrapper>(std::move(instance));
            if (auto graphNode = addNode(std::move(wrapper)))
                leaf.graphNodeId = graphNode->nodeID;
        }
        else
        {
            // Track failure for import result reporting
            importFailures.push_back({ importSlotCounter, desc.name,
                matchedDesc ? "load_error" : "not_found" });
        }
        importSlotCounter++;

        node->data = std::move(leaf);
    }
    else if (type == "group")
    {
        node->name = obj->getProperty("name").toString();
        node->collapsed = static_cast<bool>(obj->getProperty("collapsed"));

        GroupData group;
        group.mode = obj->getProperty("mode").toString() == "parallel" ? GroupMode::Parallel : GroupMode::Serial;
        group.dryWetMix = static_cast<float>(obj->getProperty("dryWet"));
        group.duckAmount = static_cast<float>(obj->getProperty("duckAmount"));
        group.duckReleaseMs = obj->hasProperty("duckReleaseMs")
            ? static_cast<float>(obj->getProperty("duckReleaseMs"))
            : 200.0f;

        auto childrenVar = obj->getProperty("children");
        if (childrenVar.isArray())
        {
            for (const auto& childVar : *childrenVar.getArray())
            {
                if (auto child = jsonToNode(childVar))
                    group.children.push_back(std::move(child));
            }
        }

        node->data = std::move(group);
    }

    return node;
}

juce::var ChainProcessor::getChainStateAsJson() const
{
    // Emit tree-structured JSON with backward compat
    auto* result = new juce::DynamicObject();

    // Defensive check: rootNode should always be a group, but verify to avoid std::bad_variant_access
    if (!rootNode.isGroup())
    {
        jassertfalse; // This should never happen! Log in debug builds.
        DBG("ERROR: rootNode is not a group! This indicates memory corruption or a threading bug.");
        result->setProperty("nodes", juce::Array<juce::var>());
        result->setProperty("slots", juce::Array<juce::var>());
        result->setProperty("numSlots", 0);
        return juce::var(result);
    }

    // Tree format (new)
    juce::Array<juce::var> nodesArray;
    for (const auto& child : rootNode.getGroup().children)
        nodesArray.add(nodeToJson(*child));
    result->setProperty("nodes", nodesArray);

    // Also emit flat slots for backward compat
    juce::Array<juce::var> slotsArray;
    std::vector<const PluginLeaf*> flatPlugins;
    ChainNodeHelpers::collectPlugins(rootNode, flatPlugins);

    for (size_t i = 0; i < flatPlugins.size(); ++i)
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("index", static_cast<int>(i));
        obj->setProperty("name", flatPlugins[i]->description.name);
        obj->setProperty("format", flatPlugins[i]->description.pluginFormatName);
        obj->setProperty("uid", flatPlugins[i]->description.uniqueId);
        obj->setProperty("fileOrIdentifier", flatPlugins[i]->description.fileOrIdentifier);
        obj->setProperty("bypassed", flatPlugins[i]->bypassed);
        obj->setProperty("manufacturer", flatPlugins[i]->description.manufacturerName);
        slotsArray.add(juce::var(obj));
    }
    result->setProperty("slots", slotsArray);
    result->setProperty("numSlots", static_cast<int>(flatPlugins.size()));

    return juce::var(result);
}

void ChainProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    // Use mutex to prevent multiple concurrent saves (DAW save + manual export)
    std::lock_guard<std::mutex> lock(stateMutex);

    // Suspend audio processing to prevent concurrent tree modifications
    // while we serialize. This ensures atomicity without holding SpinLock
    // for 500-2000ms (which would freeze the audio thread).
    suspendProcessing(true);

    auto xml = std::make_unique<juce::XmlElement>("ChainState");
    xml->setAttribute("version", 2);

    // Serialize tree (can take 500-2000ms for many plugins)
    // Safe because suspendProcessing() prevents concurrent modifications
    if (rootNode.isGroup())
    {
        for (const auto& child : rootNode.getGroup().children)
            nodeToXml(*child, *xml);
    }
    else
    {
        jassertfalse; // This should never happen!
        DBG("ERROR: rootNode is not a group in getStateInformation!");
    }

    copyXmlToBinary(*xml, destData);

    suspendProcessing(false);
}

void ChainProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    // Check for crash recovery file first
    // If it exists and is recent (less than 5 minutes old), it likely contains
    // parameter changes that were made after the last DAW save
    auto recoveryFile = getCrashRecoveryFile();
    if (recoveryFile.existsAsFile())
    {
        auto fileAge = juce::Time::getCurrentTime() - recoveryFile.getLastModificationTime();
        auto fiveMinutes = juce::RelativeTime::minutes(5);

        if (fileAge < fiveMinutes)
        {
            // Recovery file is recent - try to restore from it
            DBG("ProChain: Found recent crash recovery file, attempting restore...");

            juce::MemoryBlock recoveryState;
            if (recoveryFile.loadFileAsData(recoveryState) && recoveryState.getSize() > 0)
            {
                // Use the recovery file state instead of the DAW state
                // This preserves parameter changes made after the last manual save
                data = recoveryState.getData();
                sizeInBytes = static_cast<int>(recoveryState.getSize());

                DBG("ProChain: Successfully loaded crash recovery state (" +
                    juce::String(sizeInBytes) + " bytes)");
            }
        }

        // Clean up recovery file after successful restore (whether used or not)
        recoveryFile.deleteFile();
    }

    if (auto xml = getXmlFromBinary(data, sizeInBytes))
    {
        if (xml->hasTagName("ChainState"))
        {
            // CRITICAL: Suspend audio BEFORE any graph modifications.
            suspendProcessing(true);

            // Clear existing chain
            hideAllPluginWindows();

            // Remove all plugin graph nodes
            std::vector<PluginLeaf*> allPlugins;
            ChainNodeHelpers::collectPluginsMut(rootNode, allPlugins);
            for (auto* plug : allPlugins)
                AudioProcessorGraph::removeNode(plug->graphNodeId);

            // Defensive check: rootNode should always be a group
            if (!rootNode.isGroup())
            {
                jassertfalse; // This should never happen!
                DBG("ERROR: rootNode is not a group in setStateInformation! Reinitializing.");
                rootNode.data = GroupData{ GroupMode::Serial };
            }

            rootNode.getGroup().children.clear();

            int version = xml->getIntAttribute("version", 1);

            if (version >= 2)
            {
                // V2: read recursive Node elements
                for (auto* nodeXml : xml->getChildWithTagNameIterator("Node"))
                {
                    if (auto child = xmlToNode(*nodeXml))
                        rootNode.getGroup().children.push_back(std::move(child));
                }
            }
            else
            {
                // V1 backward compat: read flat <Slot> elements
                for (auto* slotXml : xml->getChildWithTagNameIterator("Slot"))
                {
                    if (auto* descXml = slotXml->getChildByName("PLUGIN"))
                    {
                        juce::PluginDescription desc;
                        desc.loadFromXml(*descXml);

                        // Create as a simple V2 plugin node XML and parse it
                        auto pluginXml = std::make_unique<juce::XmlElement>("Node");
                        pluginXml->setAttribute("id", nextNodeId);
                        pluginXml->setAttribute("type", "plugin");
                        pluginXml->setAttribute("bypassed", slotXml->getBoolAttribute("bypassed", false));
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
            rebuildGraph();

            // CRITICAL: Apply pending preset data AFTER rebuildGraph() has called prepareToPlay() on all plugins.
            // This ensures plugins are fully initialized before state restoration, preventing memory corruption.
            std::vector<PluginLeaf*> allPluginsForState;
            ChainNodeHelpers::collectPluginsMut(rootNode, allPluginsForState);
            for (auto* plug : allPluginsForState)
            {
                if (plug->pendingPresetData.isNotEmpty())
                {
                    if (auto gNode = getNodeForId(plug->graphNodeId))
                    {
                        if (auto* processor = gNode->getProcessor())
                        {
                            juce::MemoryBlock state;
                            state.fromBase64Encoding(plug->pendingPresetData);
                            PCLOG("setStateInfo — " + plug->description.name + " (" + juce::String(static_cast<int>(state.getSize())) + " bytes)");
                    processor->setStateInformation(state.getData(), static_cast<int>(state.getSize()));
                    PCLOG("setStateInfo — " + plug->description.name + " done");
                        }
                    }
                    plug->pendingPresetData.clear();  // Clear after applying
                }
            }

            suspendProcessing(false);

            notifyChainChanged();
            if (onParameterBindingChanged)
                onParameterBindingChanged();
        }
    }
}

//==============================================================================
// Preset-level tree serialization
//==============================================================================

std::unique_ptr<juce::XmlElement> ChainProcessor::serializeChainToXml() const
{
    auto xml = std::make_unique<juce::XmlElement>("ChainTree");
    xml->setAttribute("version", 2);

    // Defensive check: rootNode should always be a group
    if (rootNode.isGroup())
    {
        for (const auto& child : rootNode.getGroup().children)
            nodeToXml(*child, *xml);
    }
    else
    {
        jassertfalse; // This should never happen!
        DBG("ERROR: rootNode is not a group in serializeChainToXml!");
    }

    return xml;
}

ChainProcessor::RestoreResult ChainProcessor::restoreChainFromXml(const juce::XmlElement& chainXml)
{
    RestoreResult result;
    int version = chainXml.getIntAttribute("version", 1);

    // CRITICAL: Suspend audio processing BEFORE modifying the graph.
    // xmlToNode() calls addNode() which triggers sync render-sequence updates;
    // without suspending first, the audio thread processes partial chains → crash.
    suspendProcessing(true);

    // Clear existing chain (same logic as setStateInformation)
    hideAllPluginWindows();

    std::vector<PluginLeaf*> allPlugins;
    ChainNodeHelpers::collectPluginsMut(rootNode, allPlugins);
    for (auto* plug : allPlugins)
        AudioProcessorGraph::removeNode(plug->graphNodeId);

    // Defensive check: rootNode should always be a group
    if (!rootNode.isGroup())
    {
        jassertfalse; // This should never happen!
        DBG("ERROR: rootNode is not a group in restoreChainFromXml! Reinitializing.");
        rootNode.data = GroupData{ GroupMode::Serial };
    }

    rootNode.getGroup().children.clear();

    if (version >= 2)
    {
        // V2: read recursive Node elements
        for (auto* nodeXml : chainXml.getChildWithTagNameIterator("Node"))
        {
            if (auto child = xmlToNode(*nodeXml))
                rootNode.getGroup().children.push_back(std::move(child));
        }
    }
    else
    {
        // V1 backward compat: read flat <Slot> elements
        for (auto* slotXml : chainXml.getChildWithTagNameIterator("Slot"))
        {
            if (auto* descXml = slotXml->getChildByName("PLUGIN"))
            {
                auto pluginXml = std::make_unique<juce::XmlElement>("Node");
                pluginXml->setAttribute("id", nextNodeId);
                pluginXml->setAttribute("type", "plugin");
                pluginXml->setAttribute("bypassed", slotXml->getBoolAttribute("bypassed", false));
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
    std::vector<const PluginLeaf*> flatPlugins;
    ChainNodeHelpers::collectPlugins(rootNode, flatPlugins);
    for (const auto* plug : flatPlugins)
    {
        if (plug->graphNodeId == juce::AudioProcessorGraph::NodeID())
            result.missingPlugins.add(plug->description.name);
    }

    cachedSlotsDirty = true;
    rebuildGraph();

    // CRITICAL: Apply pending preset data AFTER rebuildGraph() has called prepareToPlay() on all plugins.
    // This ensures plugins are fully initialized before state restoration, preventing memory corruption.
    std::vector<PluginLeaf*> allPluginsForState;
    ChainNodeHelpers::collectPluginsMut(rootNode, allPluginsForState);
    for (auto* plug : allPluginsForState)
    {
        if (plug->pendingPresetData.isNotEmpty())
        {
            if (auto gNode = getNodeForId(plug->graphNodeId))
            {
                if (auto* processor = gNode->getProcessor())
                {
                    juce::MemoryBlock state;
                    state.fromBase64Encoding(plug->pendingPresetData);
                    PCLOG("setStateInfo — " + plug->description.name + " (" + juce::String(static_cast<int>(state.getSize())) + " bytes)");
                    processor->setStateInformation(state.getData(), static_cast<int>(state.getSize()));
                    PCLOG("setStateInfo — " + plug->description.name + " done");
                }
            }
            plug->pendingPresetData.clear();  // Clear after applying
        }
    }

    suspendProcessing(false);

    notifyChainChanged();
    if (onParameterBindingChanged)
        onParameterBindingChanged();

    result.success = true;
    return result;
}

juce::MemoryBlock ChainProcessor::captureSnapshot() const
{
    juce::MemoryBlock snapshot;
    // const_cast needed because JUCE's getStateInformation isn't const
    const_cast<ChainProcessor*>(this)->getStateInformation(snapshot);
    return snapshot;
}

void ChainProcessor::restoreSnapshot(const juce::MemoryBlock& snapshot)
{
    setStateInformation(snapshot.getData(), static_cast<int>(snapshot.getSize()));
}

//==============================================================================
// Cloud Sharing
//==============================================================================

juce::var ChainProcessor::exportChainWithPresets() const
{
    auto* result = new juce::DynamicObject();
    result->setProperty("version", 2);

    // Defensive check: rootNode should always be a group
    if (!rootNode.isGroup())
    {
        jassertfalse; // This should never happen!
        DBG("ERROR: rootNode is not a group in exportChainWithPresets!");
        result->setProperty("nodes", juce::Array<juce::var>());
        result->setProperty("slots", juce::Array<juce::var>());
        result->setProperty("numSlots", 0);
        return juce::var(result);
    }

    juce::Array<juce::var> nodesArray;
    for (const auto& child : rootNode.getGroup().children)
        nodesArray.add(nodeToJsonWithPresets(*child));
    result->setProperty("nodes", nodesArray);
    result->setProperty("numSlots", ChainNodeHelpers::countPlugins(rootNode));

    // Also emit flat slots for V1 backward compat consumers
    juce::Array<juce::var> slotsArray;
    std::vector<const PluginLeaf*> flatPlugins;
    ChainNodeHelpers::collectPlugins(rootNode, flatPlugins);

    for (size_t i = 0; i < flatPlugins.size(); ++i)
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("index", static_cast<int>(i));
        obj->setProperty("name", flatPlugins[i]->description.name);
        obj->setProperty("manufacturer", flatPlugins[i]->description.manufacturerName);
        obj->setProperty("format", flatPlugins[i]->description.pluginFormatName);
        obj->setProperty("uid", flatPlugins[i]->description.uniqueId);
        obj->setProperty("fileOrIdentifier", flatPlugins[i]->description.fileOrIdentifier);
        obj->setProperty("version", flatPlugins[i]->description.version);
        obj->setProperty("bypassed", flatPlugins[i]->bypassed);
        obj->setProperty("isInstrument", flatPlugins[i]->description.isInstrument);
        obj->setProperty("numInputChannels", flatPlugins[i]->description.numInputChannels);
        obj->setProperty("numOutputChannels", flatPlugins[i]->description.numOutputChannels);

        if (auto gNode = getNodeForId(flatPlugins[i]->graphNodeId))
        {
            if (auto* processor = gNode->getProcessor())
            {
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
    juce::AudioProcessor* processor,
    const std::vector<PendingParameter>& pending,
    const juce::String& pluginName,
    const juce::String& manufacturer)
{
    auto& params = processor->getParameters();
    if (params.isEmpty()) return;

    // Try semantic matching via ParameterDiscovery
    auto discoveredMap = ParameterDiscovery::discoverParameterMap(
        processor, pluginName, manufacturer);

    // Build semantic→index lookup from discovered map
    std::map<juce::String, int> semanticToIndex;
    for (const auto& dp : discoveredMap.parameters)
        if (dp.matched && dp.semantic.isNotEmpty())
            semanticToIndex[dp.semantic] = dp.juceParamIndex;

    PCLOG("applyPendingParameters: " + pluginName +
          " — " + juce::String(static_cast<int>(pending.size())) + " pending, " +
          juce::String(params.size()) + " plugin params, " +
          juce::String(static_cast<int>(semanticToIndex.size())) + " semantic matches");

    int applied = 0;

    for (const auto& pp : pending)
    {
        int targetIndex = -1;
        float targetValue = pp.normalizedValue; // fallback

        // Tier 1: Semantic match
        if (pp.semantic.isNotEmpty())
        {
            auto it = semanticToIndex.find(pp.semantic);
            if (it != semanticToIndex.end())
            {
                targetIndex = it->second;
                // If we have a physical value, renormalize using the plugin's actual range
                if (pp.hasPhysicalValue && targetIndex >= 0 && targetIndex < params.size())
                {
                    auto* param = params[targetIndex];
                    if (auto* ranged = dynamic_cast<juce::RangedAudioParameter*>(param))
                    {
                        auto& range = ranged->getNormalisableRange();
                        targetValue = range.convertTo0to1(
                            juce::jlimit(range.start, range.end, pp.physicalValue));
                    }
                }
            }
        }

        // Tier 2: Fuzzy name match fallback
        if (targetIndex < 0 && pp.name.isNotEmpty())
        {
            auto ppName = pp.name.toLowerCase();
            for (int i = 0; i < params.size(); ++i)
            {
                auto paramName = params[i]->getName(256).toLowerCase();
                if (paramName == ppName ||
                    paramName.contains(ppName) ||
                    ppName.contains(paramName))
                {
                    targetIndex = i;
                    break;
                }
            }
        }

        if (targetIndex >= 0 && targetIndex < params.size())
        {
            auto* param = params[targetIndex];
            float clamped = juce::jlimit(0.0f, 1.0f, targetValue);
            param->setValueNotifyingHost(clamped);
            applied++;
        }
    }

    // Auto-activate EQ bands that had parameters set.
    // FabFilter Pro-Q (and similar) use a "Band N Used" parameter to activate bands —
    // setting freq/gain/Q without activating the band has no visible effect.
    std::set<int> activatedBands;
    for (const auto& pp : pending)
    {
        if (pp.semantic.startsWith("eq_band_"))
        {
            // Extract band number from semantic like "eq_band_3_freq"
            auto afterPrefix = pp.semantic.substring(8); // after "eq_band_"
            int bandNum = afterPrefix.getIntValue();
            if (bandNum > 0 && activatedBands.find(bandNum) == activatedBands.end())
            {
                // Search for "Band N Used" parameter
                auto usedName = "Band " + juce::String(bandNum) + " Used";
                for (int i = 0; i < params.size(); ++i)
                {
                    if (params[i]->getName(64).equalsIgnoreCase(usedName))
                    {
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
          juce::String(applied) + "/" + juce::String(static_cast<int>(pending.size())) +
          " bands activated: " + juce::String(static_cast<int>(activatedBands.size())));
}

ChainProcessor::ImportResult ChainProcessor::importChainWithPresets(const juce::var& data)
{
    ImportResult result;

    if (!data.isObject())
        return result;

    auto* obj = data.getDynamicObject();
    if (!obj)
        return result;

    int version = static_cast<int>(obj->getProperty("version"));

    // Reset per-import failure tracking
    importFailures.clear();
    importSlotCounter = 0;

    // CRITICAL: Suspend audio BEFORE any graph modifications.
    suspendProcessing(true);

    // Clear existing chain
    hideAllPluginWindows();
    std::vector<PluginLeaf*> allPlugins;
    ChainNodeHelpers::collectPluginsMut(rootNode, allPlugins);
    for (auto* plug : allPlugins)
        AudioProcessorGraph::removeNode(plug->graphNodeId);

    // Defensive check: rootNode should always be a group
    if (!rootNode.isGroup())
    {
        jassertfalse; // This should never happen!
        DBG("ERROR: rootNode is not a group in importChainWithPresets! Reinitializing.");
        rootNode.data = GroupData{ GroupMode::Serial };
    }

    rootNode.getGroup().children.clear();

    if (version >= 2 && obj->hasProperty("nodes"))
    {
        // V2: import tree structure
        auto nodesVar = obj->getProperty("nodes");
        if (nodesVar.isArray())
        {
            for (const auto& nodeVar : *nodesVar.getArray())
            {
                if (auto child = jsonToNode(nodeVar))
                    rootNode.getGroup().children.push_back(std::move(child));
            }
        }
    }
    else
    {
        // V1: import flat slots
        auto slotsVar = obj->getProperty("slots");
        if (!slotsVar.isArray())
        {
            suspendProcessing(false);
            return result;
        }

        for (const auto& slotVar : *slotsVar.getArray())
        {
            if (auto child = jsonToNode(slotVar))
                rootNode.getGroup().children.push_back(std::move(child));
        }
    }

    cachedSlotsDirty = true;
    rebuildGraph();

    // CRITICAL: Apply pending preset data AFTER rebuildGraph() has called prepareToPlay() on all plugins.
    // This ensures plugins are fully initialized before state restoration, preventing memory corruption.
    std::vector<PluginLeaf*> allPluginsForState;
    ChainNodeHelpers::collectPluginsMut(rootNode, allPluginsForState);
    for (auto* plug : allPluginsForState)
    {
        if (plug->pendingPresetData.isNotEmpty())
        {
            if (auto gNode = getNodeForId(plug->graphNodeId))
            {
                if (auto* processor = gNode->getProcessor())
                {
                    juce::MemoryBlock state;
                    state.fromBase64Encoding(plug->pendingPresetData);
                    PCLOG("setStateInfo — " + plug->description.name + " (" + juce::String(static_cast<int>(state.getSize())) + " bytes)");
                    processor->setStateInformation(state.getData(), static_cast<int>(state.getSize()));
                    PCLOG("setStateInfo — " + plug->description.name + " done");
                }
            }
            plug->pendingPresetData.clear();  // Clear after applying
        }
    }

    // Apply pending parameters for slots without binary presetData (seeded chains)
    for (auto* plug : allPluginsForState)
    {
        if (!plug->pendingParameters.empty())
        {
            if (auto gNode = getNodeForId(plug->graphNodeId))
            {
                // Unwrap PluginWithMeterWrapper to access the real plugin's parameters
                juce::AudioProcessor* proc = nullptr;
                if (auto* wrapper = dynamic_cast<PluginWithMeterWrapper*>(gNode->getProcessor()))
                    proc = wrapper->getWrappedPlugin();
                else
                    proc = gNode->getProcessor();

                if (proc != nullptr)
                {
                    applyPendingParameters(proc, plug->pendingParameters,
                                           plug->description.name,
                                           plug->description.manufacturerName);
                }
            }
            plug->pendingParameters.clear();
        }
    }

    suspendProcessing(false);

    // Build import result
    result.totalSlots = importSlotCounter;
    result.failures = std::move(importFailures);
    result.failedSlots = static_cast<int>(result.failures.size());
    result.loadedSlots = result.totalSlots - result.failedSlots;
    result.success = true; // chain structure loaded (even if some plugins missing)

    notifyChainChanged();
    if (onParameterBindingChanged)
        onParameterBindingChanged();
    return result;
}

juce::String ChainProcessor::getSlotPresetData(int slotIndex) const
{
    auto* leaf = getPluginByFlatIndex(slotIndex);
    if (!leaf)
        return {};

    if (auto gNode = getNodeForId(leaf->graphNodeId))
    {
        if (auto* processor = gNode->getProcessor())
        {
            juce::MemoryBlock state;
            processor->getStateInformation(state);
            return state.toBase64Encoding();
        }
    }

    return {};
}

bool ChainProcessor::setSlotPresetData(int slotIndex, const juce::String& base64Data)
{
    auto* leaf = getPluginByFlatIndex(slotIndex);
    if (!leaf || base64Data.isEmpty())
        return false;

    juce::MemoryBlock state;
    state.fromBase64Encoding(base64Data);

    if (auto gNode = getNodeForId(leaf->graphNodeId))
    {
        if (auto* processor = gNode->getProcessor())
        {
            processor->setStateInformation(state.getData(), static_cast<int>(state.getSize()));
            return true;
        }
    }

    return false;
}

//==============================================================================
// Crash Recovery - Async State Persistence
//==============================================================================

juce::File ChainProcessor::getCrashRecoveryFile() const
{
    auto tempDir = juce::File::getSpecialLocation(juce::File::tempDirectory);

    // Use unique identifier based on this processor's memory address
    // This ensures each plugin instance has its own recovery file
    auto uniqueId = juce::String::toHexString(reinterpret_cast<juce::pointer_sized_int>(this));

    return tempDir.getChildFile("ProChain_Recovery_" + uniqueId + ".dat");
}

void ChainProcessor::saveCrashRecoveryStateAsync()
{
    // Throttle: Skip if we saved less than 2 seconds ago
    auto now = juce::Time::currentTimeMillis();
    auto lastSave = lastCrashRecoverySaveTime.load();

    if (now - lastSave < kMinCrashRecoverySaveIntervalMs)
    {
        // Schedule a delayed save to catch the final state
        juce::Timer::callAfterDelay(kMinCrashRecoverySaveIntervalMs, [this, alive = aliveFlag]() {
            if (alive->load(std::memory_order_acquire) && !pendingCrashRecoverySave.load())
                saveCrashRecoveryStateAsync();
        });
        return;
    }

    // Skip if already saving
    if (pendingCrashRecoverySave.exchange(true))
        return;

    lastCrashRecoverySaveTime.store(now);

    // Serialize on the message thread (safe — tree is not mutated concurrently)
    juce::MemoryBlock crashState;
    getStateInformation(crashState);

    // Capture shared pointer to ensure ChainProcessor outlives the lambda
    auto alive = aliveFlag;

    // Only the file write happens on the background thread
    juce::Thread::launch([this, capturedState = std::move(crashState), alive]() {
        if (alive->load(std::memory_order_acquire))
            performCrashRecoverySave(capturedState);
    });
}

void ChainProcessor::performCrashRecoverySave(const juce::MemoryBlock& stateData)
{
    // Write to temp file (1-5ms on SSD)
    auto file = getCrashRecoveryFile();

    juce::FileOutputStream stream(file);
    if (stream.openedOk())
    {
        stream.write(stateData.getData(), stateData.getSize());
        stream.flush();
    }

    pendingCrashRecoverySave.store(false);
}

bool ChainProcessor::tryRestoreCrashRecoveryState()
{
    auto file = getCrashRecoveryFile();

    if (!file.existsAsFile())
        return false;

    juce::MemoryBlock state;

    if (!file.loadFileAsData(state))
        return false;

    if (state.getSize() == 0)
        return false;

    // Restore the state
    setStateInformation(state.getData(), static_cast<int>(state.getSize()));

    DBG("ProChain: Restored chain state from crash recovery file");

    return true;
}

void ChainProcessor::cleanupCrashRecoveryFile()
{
    auto file = getCrashRecoveryFile();

    if (file.existsAsFile())
    {
        file.deleteFile();
        DBG("ProChain: Cleaned up crash recovery file");
    }
}

//==============================================================================
// Flat index helpers
//==============================================================================

PluginLeaf* ChainProcessor::getPluginByFlatIndex(int index)
{
    std::vector<PluginLeaf*> plugins;
    ChainNodeHelpers::collectPluginsMut(rootNode, plugins);

    if (index >= 0 && index < static_cast<int>(plugins.size()))
        return plugins[static_cast<size_t>(index)];
    return nullptr;
}

const PluginLeaf* ChainProcessor::getPluginByFlatIndex(int index) const
{
    std::vector<const PluginLeaf*> plugins;
    ChainNodeHelpers::collectPlugins(rootNode, plugins);

    if (index >= 0 && index < static_cast<int>(plugins.size()))
        return plugins[static_cast<size_t>(index)];
    return nullptr;
}

ChainNodeId ChainProcessor::getNodeIdByFlatIndex(int index) const
{
    // Walk the tree via DFS to find the nth plugin and return its owning ChainNode's ID
    struct DFSHelper
    {
        static ChainNodeId find(const ChainNode& node, int& remaining)
        {
            if (node.isPlugin())
            {
                if (remaining == 0)
                    return node.id;
                remaining--;
                return -1;
            }

            if (node.isGroup())
            {
                for (const auto& child : node.getGroup().children)
                {
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

void ChainProcessor::rebuildCachedSlots() const
{
    cachedSlots.clear();

    std::vector<const PluginLeaf*> plugins;
    ChainNodeHelpers::collectPlugins(rootNode, plugins);

    for (const auto* leaf : plugins)
    {
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

void ChainProcessor::notifyChainChanged()
{
    auto weak = aliveFlag;

    // Trigger async crash recovery save (throttled, runs on background thread)
    saveCrashRecoveryStateAsync();

    if (onLatencyChanged)
    {
        int latency = getTotalLatencySamples();
        juce::MessageManager::callAsync([this, weak, latency]() {
            if (*weak && onLatencyChanged)
                onLatencyChanged(latency);
        });
    }

    if (onChainChanged)
    {
        juce::MessageManager::callAsync([this, weak]() {
            if (*weak && onChainChanged)
                onChainChanged();
        });
    }
}
