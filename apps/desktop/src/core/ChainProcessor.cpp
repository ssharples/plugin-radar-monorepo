#include "ChainProcessor.h"
#include "HostRestoreAdapter.h"
#include "../audio/DryWetMixProcessor.h"
#include "../audio/BranchGainProcessor.h"
#include "../audio/CrossoverBandProcessor.h"
#include "../audio/NodeMeterProcessor.h"
#include "../audio/LatencyCompensationProcessor.h"
#include <cmath>
#include <stdexcept>

#if JUCE_MAC
 #include <objc/objc.h>
 #include <objc/message.h>
#endif

class ChainProcessor::BlockPlayhead final : public juce::AudioPlayHead
{
public:
    juce::AudioPlayHead* source = nullptr;
    int offset = 0;
    double rate = 44100.0;
    juce::Optional<PositionInfo> getPosition() const override
    {
        if (!source) return {};
        auto p = source->getPosition(); if (!p) return {};
        if (auto samples = p->getTimeInSamples()) p->setTimeInSamples(*samples + offset);
        if (auto seconds = p->getTimeInSeconds()) p->setTimeInSeconds(*seconds + offset / rate);
        if (auto ppq = p->getPpqPosition())
            if (auto bpm = p->getBpm()) p->setPpqPosition(*ppq + offset / rate * *bpm / 60.0);
        return p;
    }
};

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

        // On macOS, the DAW's plugin host window (containing our WebBrowserComponent
        // with its native WKWebView) often sits at a floating window level. Child
        // plugin windows created with addToDesktop are at the normal level by default,
        // so they appear behind the main editor. Raise them to floating level so they
        // can be dragged over the main window.
#if JUCE_MAC
        if (auto* peer = getPeer())
        {
            // getNativeHandle() returns NSView* on macOS, not NSWindow*
            auto nsView = (id) peer->getNativeHandle();
            if (nsView)
            {
                auto nsWindow = ((id (*)(id, SEL))objc_msgSend)(nsView, sel_registerName("window"));
                if (nsWindow)
                {
                    // NSFloatingWindowLevel = 3 (CGWindowLevelForKey(kCGFloatingWindowLevelKey))
                    ((void (*)(id, SEL, long))objc_msgSend)(nsWindow, sel_registerName("setLevel:"), 3);
                }
            }
        }
#endif

        centreWithSize(getWidth(), getHeight());
        setVisible(true);
        toFront(true);
    }

    std::function<void()> onClose;
    void closeButtonPressed() override { if (onClose) onClose(); }

    void activeWindowStatusChanged() override
    {
        // When this window becomes active, ensure it's in front
        if (isActiveWindow())
            toFront(true);
    }

    void mouseDown(const juce::MouseEvent& e) override
    {
        toFront(true);
        DocumentWindow::mouseDown(e);
    }

    ChainNodeId getNodeID() const { return nodeID; }

private:
    ChainNodeId nodeID;
};

//==============================================================================
ChainProcessor::ChainProcessor(PluginManager& pm)
    : pluginManager(pm)
{
    enableAllBuses();

    // JUCE host lifecycle calls (prepare/release/destruction) require stopped
    // callbacks. Structural edits use prepared snapshots while audio is running.
    // Initialize root as an empty Serial group with id=0
    rootNode.id = 0;
    rootNode.name = "Root";
    rootNode.data = GroupData{};
    transitionGain.setCurrentAndTargetValue(1.0f);
    chunkMidi.ensureSize(65536); collectedMidi.ensureSize(65536);
    blockPlayhead = std::make_unique<BlockPlayhead>();
    startTimerHz(60);
}

ChainProcessor::~ChainProcessor()
{
    *aliveFlag = false;
    stopTimer();
    cancelPendingLoads();
    hideAllPluginWindows();
    delete pendingRuntime.exchange(nullptr);
    delete retiredRuntime.exchange(nullptr);
    delete audioRuntime;
}

void ChainProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    if (!juce::MessageManager::getInstance()->isThisTheMessageThread())
    { onHostControlThread([&] { prepareToPlay(sampleRate, samplesPerBlock); }); return; }
    currentSampleRate = sampleRate;
    currentBlockSize = juce::jmax(1, samplesPerBlock);
    setRateAndBufferSizeDetails(sampleRate, currentBlockSize);
    delete pendingRuntime.exchange(nullptr); delete retiredRuntime.exchange(nullptr);
    delete audioRuntime; audioRuntime = nullptr;
    activeRevision.store(0); acknowledgedRevision.store(0); lastAudioTime.store(0);
    preparedNodes.clear(); prepared = true;
    transitionGain.reset(sampleRate, 0.005); transitionGain.setCurrentAndTargetValue(1.0f);
    for (auto n : getNodes())
        if (auto* hosted = dynamic_cast<HostedPluginProcessor*>(n->getProcessor())) hosted->releaseResources();
    rebuildGraph();
}

void ChainProcessor::releaseResources()
{
    if (!juce::MessageManager::getInstance()->isThisTheMessageThread())
    { onHostControlThread([&] { releaseResources(); }); return; }
    lastAudioTime.store(0);
    delete pendingRuntime.exchange(nullptr); delete retiredRuntime.exchange(nullptr);
    delete audioRuntime; audioRuntime = nullptr;
    for (auto n : getNodes()) n->getProcessor()->releaseResources();
    preparedNodes.clear(); prepared = false;
}

void ChainProcessor::publishRuntime(std::unique_ptr<ChainRenderGraph> runtime)
{
    // Announce the compiled latency on the control thread before arming the
    // fade. Rendering must never wait for a UI timer (including offline bounce).
    setLatencySamples(runtime->latency());
    if (onLatencyChanged) onLatencyChanged(runtime->latency());
    acknowledgedRevision.store(runtime->revision);
    delete pendingRuntime.exchange(runtime.release());
    notificationDirty = true; bindingsDirty = true;
}

void ChainProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    if (buffer.getNumSamples() == 0) return;
    lastAudioTime.store(static_cast<int64_t>(juce::Time::getMillisecondCounterHiRes()));
    collectedMidi.clear();
    blockPlayhead->source = getPlayHead(); blockPlayhead->rate = currentSampleRate;
    for (int offset = 0; offset < buffer.getNumSamples(); offset += currentBlockSize)
    {
        const auto count = juce::jmin(currentBlockSize, buffer.getNumSamples() - offset);
        if (pendingRuntime.load() != nullptr && audioRuntime != nullptr)
            transitionGain.setTargetValue(0.0f);
        if ((audioRuntime == nullptr || (!transitionGain.isSmoothing() && transitionGain.getCurrentValue() == 0.0f))
            && retiredRuntime.load() == nullptr)
        {
            if (auto* next = pendingRuntime.exchange(nullptr))
            {
                const bool hadAudio = audioRuntime != nullptr;
                retiredRuntime.store(audioRuntime); audioRuntime = next;
                activeRevision.store(next->revision); activeLatency.store(next->latency());
                primeRemaining = hadAudio ? next->latency() : 0;
                if (!hadAudio) transitionGain.setCurrentAndTargetValue(1.0f);
            }
        }
        float* channels[] = { buffer.getWritePointer(0, offset), buffer.getWritePointer(1, offset) };
        juce::AudioBuffer<float> chunk(channels, 2, count);
        chunkMidi.clear(); chunkMidi.addEvents(midi, offset, count, -offset);
        blockPlayhead->offset = offset; sidechainFeed->offset = offset;
        if (audioRuntime)
        {
            if (resetPending.exchange(false)) audioRuntime->reset();
            audioRuntime->process(chunk, chunkMidi, blockPlayhead->source ? blockPlayhead.get() : nullptr, isNonRealtime());
            if (primeRemaining == 0 && pendingRuntime.load() == nullptr && acknowledgedRevision.load() >= audioRuntime->revision)
                transitionGain.setTargetValue(1.0f);
            if (primeRemaining > 0)
            { chunk.clear(); primeRemaining = juce::jmax(0, primeRemaining - count); }
            for (int i = 0; i < count; ++i)
            {
                const auto gain = transitionGain.getNextValue();
                channels[0][i] *= gain; channels[1][i] *= gain;
            }
        }
        collectedMidi.addEvents(chunkMidi, 0, count, offset);
    }
    midi.swapWith(collectedMidi);
    *sidechainFeed = {};
}

void ChainProcessor::setSidechainInput(const float* left, const float* right, int numSamples) noexcept
{
    sidechainFeed->channels[0] = left; sidechainFeed->channels[1] = right;
    sidechainFeed->numSamples = numSamples; sidechainFeed->offset = 0;
}

void ChainProcessor::reset() { resetPending.store(true); }
void ChainProcessor::setNonRealtime(bool value) noexcept { juce::AudioProcessor::setNonRealtime(value); }
void ChainProcessor::audioWorkgroupContextChanged(const juce::AudioWorkgroup& group)
{
    // Host context/lifecycle calls are serialized with preparation, as in JUCE's
    // AudioProcessorGraph. Keep the context for every future prepared snapshot.
    currentWorkgroup = group;
    for (auto node : getNodes()) node->getProcessor()->audioWorkgroupContextChanged(group);
}

void ChainProcessor::timerCallback()
{
    const bool quiescent = !canRetireTargets || canRetireTargets();
    // The single audio reader publishes this mailbox only AFTER its last call
    // into the old graph. Acquiring it proves audio retirement; the additional
    // pool gate protects independent DAW automation readers of hosted targets.
    if (quiescent) { delete retiredRuntime.exchange(nullptr); retiredTargets.clear(); }
    const auto last = lastAudioTime.load();
    const bool stopped = last == 0 || juce::Time::getMillisecondCounterHiRes() - static_cast<double>(last) > 100.0;
    auto revision = activeRevision.load();
    if (stopped)
        if (auto* next = pendingRuntime.load()) { revision = next->revision; }
    if (revision > notifiedRevision)
    {
        notifiedRevision = revision;
        if (bindingsDirty && onParameterBindingChanged) onParameterBindingChanged();
        bindingsDirty = false;
        if (onChainChanged) onChainChanged();
        notificationDirty = false;
        auto callbacks = std::move(commitCallbacks); commitCallbacks.clear();
        for (auto& [version, callback] : callbacks)
            if (version <= revision) callback();
            else commitCallbacks.emplace(version, std::move(callback));
    }
    bool latencyChanged = false;
    for (auto* leaf : getFlatPluginList())
        if (auto* hosted = getHosted(*leaf); hosted && hosted->hasLatencyChange())
        { hosted->refreshLatency(); latencyChanged = true; }
    if (latencyChanged) rebuildGraph();
}

HostedPluginProcessor* ChainProcessor::getHosted(const PluginLeaf& leaf) const
{
    if (auto n = getNodeForId(leaf.graphNodeId)) return dynamic_cast<HostedPluginProcessor*>(n->getProcessor());
    return nullptr;
}

juce::AudioProcessorGraph::Node::Ptr ChainProcessor::addHostedInstance(std::unique_ptr<juce::AudioPluginInstance> instance,
                                                                    bool bypass, bool suspend, juce::String& error)
{
    if (!instance || !HostedPluginProcessor::configureStereo(*instance, error)) return {};
    auto hosted = std::make_unique<HostedPluginProcessor>(std::move(instance));
    hosted->setSidechainFeed(sidechainFeed);
    hosted->setBypassed(bypass); hosted->setSuspended(suspend);
    hosted->prepareToPlay(currentSampleRate, currentBlockSize);
    auto node = addNode(std::move(hosted), {}, UpdateKind::none);
    if (node) preparedNodes.insert(node->nodeID);
    return node;
}

void ChainProcessor::retirePlugin(const PluginLeaf& leaf)
{
    if (onPluginRetiring) onPluginRetiring(leaf.persistentId);
    if (auto node = AudioProcessorGraph::removeNode(leaf.graphNodeId, UpdateKind::none))
        retiredTargets.emplace_back(leaf.persistentId, std::move(node));
    preparedNodes.erase(leaf.graphNodeId);
}

//==============================================================================
// Tree-based API
//==============================================================================

bool ChainProcessor::addPlugin(const juce::PluginDescription& desc, ChainNodeId parentId, int insertIndex)
{
    cancelPendingLoads();
    if (desc.isInstrument) { lastError = "This release supports stereo effects, not instruments"; return false; }
    juce::String error;
    auto instance = pluginManager.createPluginInstance(desc, currentSampleRate, currentBlockSize, error);
    if (!instance) { lastError = error; return false; }
    const auto success = addPreparedPlugin(desc, std::move(instance), parentId, insertIndex, error);
    if (!success) lastError = error;
    return success;
}

bool ChainProcessor::removeNode(ChainNodeId nodeId)
{
    cancelPendingLoads();
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    if (nodeId == 0)
        return false; // Can't remove root

    auto* parent = ChainNodeHelpers::findParent(rootNode, nodeId);
    if (!parent || !parent->isGroup())
        return false;

    auto& children = parent->getGroup().children;
    for (auto it = children.begin(); it != children.end(); ++it)
    {
        if ((*it)->id == nodeId)
        {
            // Close any open windows for plugins in this subtree
            std::vector<const PluginLeaf*> plugins;
            ChainNodeHelpers::collectPlugins(**it, plugins);
            for (auto* plug : plugins)
            {
                // Remove graph node
                retirePlugin(*plug);
                // Close windows by finding the ChainNode that owns this leaf
                // We search by graphNodeId through open windows
                for (int w = pluginWindows.size() - 1; w >= 0; --w)
                {
                    // Find the node ID that owns this plugin
                    auto* plugNode = ChainNodeHelpers::findById(rootNode, pluginWindows[w]->getNodeID());
                    if (plugNode && plugNode->isPlugin() && plugNode->getPlugin().graphNodeId == plug->graphNodeId)
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
    rebuildGraph();
    notifyChainChanged();
    bindingsDirty = true;
    return true;
}

static bool crossoverIsFull(const ChainNode& group)
{
    return group.isGroup() && group.getGroup().mode == GroupMode::Crossover
        && static_cast<int>(group.getGroup().children.size()) >= kMaxCrossoverBands;
}

bool ChainProcessor::duplicateNode(ChainNodeId nodeId)
{
    cancelPendingLoads();
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node || !node->isPlugin())
        return false;

    auto* parent = ChainNodeHelpers::findParent(rootNode, nodeId);
    if (!parent || !parent->isGroup())
        return false;

    int childIndex = ChainNodeHelpers::findChildIndex(*parent, nodeId);
    if (childIndex < 0 || crossoverIsFull(*parent))
        return false;

    const auto& srcLeaf = node->getPlugin();

    // Capture source plugin state before modifying the graph
    juce::MemoryBlock stateBlock;
    if (auto* srcGraphNode = getNodeForId(srcLeaf.graphNodeId))
    {
        if (auto* srcProc = srcGraphNode->getProcessor())
            srcProc->getStateInformation(stateBlock);
    }

    // Create a new plugin instance with the same description
    juce::String errorMessage;
    auto instance = pluginManager.createPluginInstance(srcLeaf.description, currentSampleRate, currentBlockSize, errorMessage);
    if (!instance)
        return false;

    // Apply source plugin's state to the new instance
    if (stateBlock.getSize() > 0)
        instance->setStateInformation(stateBlock.getData(), static_cast<int>(stateBlock.getSize()));

    auto newNode = std::make_unique<ChainNode>();
    newNode->id = nextNodeId++;
    newNode->name = node->name;
    PluginLeaf newLeaf;
    newLeaf.description = srcLeaf.description;
    newLeaf.bypassed = srcLeaf.bypassed;
    newLeaf.suspended = srcLeaf.suspended;

    if (auto graphNode = addHostedInstance(std::move(instance), newLeaf.bypassed, newLeaf.suspended, errorMessage))
        newLeaf.graphNodeId = graphNode->nodeID;
    else
        return false;

    newNode->data = std::move(newLeaf);

    // Insert right after the source node
    auto& children = parent->getGroup().children;
    children.insert(children.begin() + childIndex + 1, std::move(newNode));

    cachedSlotsDirty = true;
    rebuildGraph();
    notifyChainChanged();
    bindingsDirty = true;
    return true;
}

bool ChainProcessor::moveNode(ChainNodeId nodeId, ChainNodeId newParentId, int newIndex)
{
    cancelPendingLoads();
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    if (nodeId == 0)
        return false;

    // Can't move a node into its own subtree
    auto* nodePtr = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!nodePtr)
        return false;

    if (ChainNodeHelpers::isDescendant(*nodePtr, newParentId))
        return false;

    auto* newParent = ChainNodeHelpers::findById(rootNode, newParentId);
    if (!newParent || !newParent->isGroup())
        return false;

    auto* oldParent = ChainNodeHelpers::findParent(rootNode, nodeId);
    if (!oldParent || !oldParent->isGroup())
        return false;
    if (oldParent != newParent && crossoverIsFull(*newParent))
        return false;

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
        return false;

    // Insert into new parent
    auto& newChildren = newParent->getGroup().children;
    if (newIndex < 0 || newIndex >= static_cast<int>(newChildren.size()))
        newChildren.push_back(std::move(extracted));
    else
        newChildren.insert(newChildren.begin() + newIndex, std::move(extracted));

    cachedSlotsDirty = true;
    rebuildGraph();
    notifyChainChanged();
    bindingsDirty = true;
    return true;
}

ChainNodeId ChainProcessor::createGroup(const std::vector<ChainNodeId>& childIds, GroupMode mode, const juce::String& name)
{
    cancelPendingLoads();
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    if (childIds.empty())
        return -1;

    // All children must share the same parent
    auto* firstParent = ChainNodeHelpers::findParent(rootNode, childIds[0]);
    if (!firstParent || !firstParent->isGroup())
        return -1;

    for (size_t i = 1; i < childIds.size(); ++i)
    {
        auto* parent = ChainNodeHelpers::findParent(rootNode, childIds[i]);
        if (parent != firstParent)
            return -1; // Children must share the same parent
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

    if (mode == GroupMode::Crossover && static_cast<int>(childIds.size()) > kMaxCrossoverBands)
        return -1;

    GroupData groupData;
    groupData.mode = mode;
    groupData.dryWetMix = 1.0f;
    groupData.children = std::move(extracted);
    if (mode == GroupMode::Crossover) CrossoverHelpers::fitFrequencies(groupData);
    group->data = std::move(groupData);

    // Insert at the earliest position
    if (earliestIndex >= static_cast<int>(parentChildren.size()))
        parentChildren.push_back(std::move(group));
    else
        parentChildren.insert(parentChildren.begin() + earliestIndex, std::move(group));

    ChainNodeId groupId = parentChildren[static_cast<size_t>(earliestIndex)]->id;

    cachedSlotsDirty = true;
    rebuildGraph();
    notifyChainChanged();
    bindingsDirty = true;
    return groupId;
}

bool ChainProcessor::dissolveGroup(ChainNodeId groupId)
{
    cancelPendingLoads();
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    if (groupId == 0)
        return false;

    auto* parent = ChainNodeHelpers::findParent(rootNode, groupId);
    if (!parent || !parent->isGroup())
        return false;

    auto* groupNode = ChainNodeHelpers::findById(rootNode, groupId);
    if (!groupNode || !groupNode->isGroup())
        return false;

    auto& parentChildren = parent->getGroup().children;

    // Find the group's position
    int groupIndex = ChainNodeHelpers::findChildIndex(*parent, groupId);
    if (groupIndex < 0)
        return false;

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
    rebuildGraph();
    notifyChainChanged();
    bindingsDirty = true;
    return true;
}

bool ChainProcessor::setGroupMode(ChainNodeId groupId, GroupMode mode)
{
    cancelPendingLoads();
    auto* node = ChainNodeHelpers::findById(rootNode, groupId);
    if (!node || !node->isGroup())
        return false;

    if (mode == GroupMode::Crossover && static_cast<int>(node->getGroup().children.size()) > kMaxCrossoverBands)
        return false;
    node->getGroup().mode = mode;
    if (mode == GroupMode::Crossover) CrossoverHelpers::fitFrequencies(node->getGroup());

    rebuildGraph();
    notifyChainChanged();
    return true;
}

bool ChainProcessor::setCrossoverFrequency(ChainNodeId groupId, int splitIndex, float frequencyHz)
{
    auto* node = ChainNodeHelpers::findById(rootNode, groupId);
    if (!node || !node->isGroup() || node->getGroup().mode != GroupMode::Crossover || !std::isfinite(frequencyHz))
        return false;
    auto& group = node->getGroup();
    CrossoverHelpers::fitFrequencies(group);
    auto& hz = group.crossoverHz;
    if (splitIndex < 0 || splitIndex >= static_cast<int>(hz.size()))
        return false;
    // Keep the split points in order, at least a few percent apart
    const auto i = static_cast<size_t>(splitIndex);
    const auto low = i > 0 ? hz[i - 1] * 1.05f : 20.0f;
    const auto high = i + 1 < hz.size() ? hz[i + 1] / 1.05f : 20000.0f;
    hz[i] = juce::jlimit(low, high, frequencyHz);

    // Update the band filters in place (no rebuild needed)
    for (auto filterId : group.bandFilterNodeIds)
        if (auto gNode = getNodeForId(filterId))
            if (auto* proc = dynamic_cast<CrossoverBandProcessor*>(gNode->getProcessor()))
                proc->setFrequencies(hz);

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

bool ChainProcessor::setBranchGain(ChainNodeId nodeId, float gainDb)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node)
        return false;

    node->branchGainDb = juce::jlimit(-60.0f, 24.0f, gainDb);

    // Update the branch gain processor if it exists (no rebuild needed)
    auto* parent = ChainNodeHelpers::findParent(rootNode, nodeId);
    if (parent && parent->isGroup() && isBranchingMode(parent->getGroup().mode))
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

    node->solo = solo;

    updateBranchGates(rootNode);
    notifyChainChanged();
    return true;
}

bool ChainProcessor::setBranchMute(ChainNodeId nodeId, bool mute)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node)
        return false;

    node->mute = mute;

    updateBranchGates(rootNode);
    notifyChainChanged();
    return true;
}

bool ChainProcessor::setBranchPolarity(ChainNodeId nodeId, bool inverted)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node)
        return false;

    node->polarityInverted = inverted;

    // Update the branch gain processor if it exists (no rebuild needed)
    auto* parent = ChainNodeHelpers::findParent(rootNode, nodeId);
    if (parent && parent->isGroup() && isBranchingMode(parent->getGroup().mode))
    {
        int childIndex = ChainNodeHelpers::findChildIndex(*parent, nodeId);
        auto& branchGainIds = parent->getGroup().branchGainNodeIds;
        if (childIndex >= 0 && childIndex < static_cast<int>(branchGainIds.size()))
            if (auto gNode = getNodeForId(branchGainIds[static_cast<size_t>(childIndex)]))
                if (auto* proc = dynamic_cast<BranchGainProcessor*>(gNode->getProcessor()))
                    proc->setPolarityInverted(inverted);
    }

    notifyChainChanged();
    return true;
}

bool ChainProcessor::setNodeRecallSafe(ChainNodeId nodeId, bool recallSafe)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node || !node->isPlugin())
        return false;

    node->getPlugin().recallSafe = recallSafe;
    notifyChainChanged();
    return true;
}

bool ChainProcessor::setNodeIgnoreLatency(ChainNodeId nodeId, bool ignore)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node || !node->isPlugin())
        return false;

    auto& leaf = node->getPlugin();
    leaf.ignoreLatency = ignore;
    if (auto* hosted = getHosted(leaf))
    {
        hosted->setIgnoreLatency(ignore);
        if (hosted->hasLatencyChange()) { hosted->refreshLatency(); rebuildGraph(); }
    }
    notifyChainChanged();
    return true;
}

bool ChainProcessor::setNodeSidechain(ChainNodeId nodeId, bool useSidechain)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node || !node->isPlugin())
        return false;

    auto& leaf = node->getPlugin();
    auto* hosted = getHosted(leaf);
    if (useSidechain && hosted && !hosted->hasSidechainInput())
        return false;
    leaf.sidechain = useSidechain;
    if (hosted) hosted->setUseSidechain(useSidechain);
    notifyChainChanged();
    return true;
}

void ChainProcessor::setNodeBypassed(ChainNodeId nodeId, bool bypassed)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node || !node->isPlugin())
        return;

    node->getPlugin().bypassed = bypassed;

    if (auto* hosted = getHosted(node->getPlugin())) hosted->setBypassed(bypassed);
    cachedTail.store(computeTail(rootNode));
    notifyChainChanged();
}

std::vector<PluginLeaf*> ChainProcessor::getFlatPluginList()
{
    std::vector<PluginLeaf*> result;
    ChainNodeHelpers::collectPluginsMut(rootNode, result);
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
    hidePluginWindow(nodeId);

    return removeNode(nodeId);
}

bool ChainProcessor::movePlugin(int fromIndex, int toIndex)
{
    cancelPendingLoads();
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    // For flat API compat, move within the root group
    auto& rootChildren = rootNode.getGroup().children;
    if (fromIndex < 0 || fromIndex >= static_cast<int>(rootChildren.size()) ||
        toIndex < 0 || toIndex >= static_cast<int>(rootChildren.size()) ||
        fromIndex == toIndex)
        return false;

    auto node = std::move(rootChildren[static_cast<size_t>(fromIndex)]);
    rootChildren.erase(rootChildren.begin() + fromIndex);
    rootChildren.insert(rootChildren.begin() + toIndex, std::move(node));

    cachedSlotsDirty = true;
    rebuildGraph();
    notifyChainChanged();
    bindingsDirty = true;
    return true;
}

void ChainProcessor::setSlotBypassed(int slotIndex, bool bypassed)
{
    auto nodeId = getNodeIdByFlatIndex(slotIndex);
    if (nodeId >= 0)
        setNodeBypassed(nodeId, bypassed);
}

bool ChainProcessor::isSlotBypassed(int slotIndex) const
{
    auto* leaf = getPluginByFlatIndex(slotIndex);
    return leaf ? leaf->bypassed : false;
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
        if (auto* processor = gNode->getProcessor())
        {
            if (processor->hasEditor())
            {
                if (auto* editor = processor->createEditor())
                {
                    auto windowName = node->getPlugin().description.name + " [" + node->name + "]";
                    auto* window = pluginWindows.add(new PluginWindow(editor, windowName, nodeId));
                    auto alive = aliveFlag;
                    window->onClose = [this, alive, nodeId] {
                        juce::MessageManager::callAsync([this, alive, nodeId] { if (*alive) hidePluginWindow(nodeId); });
                    };
                }
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

void ChainProcessor::closeRetiredPluginWindows(const ChainNode& previous, const std::set<NodeID>& retained)
{
    for (int i = pluginWindows.size() - 1; i >= 0; --i)
    {
        auto* before = ChainNodeHelpers::findById(previous, pluginWindows[i]->getNodeID());
        if (!before || !before->isPlugin() || retained.count(before->getPlugin().graphNodeId) == 0) pluginWindows.remove(i);
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
    { leaf->bypassed = bypassed; if (auto* hosted = getHosted(*leaf)) hosted->setBypassed(bypassed); }
    notifyChainChanged();
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
        return dynamic_cast<HostedPluginProcessor*>(gNode->getProcessor())->plugin();

    return nullptr;
}

juce::AudioProcessor* ChainProcessor::getNodeProcessor(ChainNodeId nodeId)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node || !node->isPlugin())
        return nullptr;

    if (auto gNode = getNodeForId(node->getPlugin().graphNodeId))
        return dynamic_cast<HostedPluginProcessor*>(gNode->getProcessor())->plugin();

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

juce::AudioProcessorGraph::NodeID ChainProcessor::utility(const juce::String& key, std::unique_ptr<juce::AudioProcessor> processor)
{
    usedUtilityKeys.insert(key);
    if (auto found = utilityByKey.find(key); found != utilityByKey.end())
        if (getNodeForId(found->second)) return found->second;
    auto node = addNode(std::move(processor), {}, UpdateKind::none);
    if (!node) throw std::runtime_error("Cannot create routing utility");
    utilityByKey[key] = node->nodeID; utilityNodes.insert(node->nodeID);
    return node->nodeID;
}

void ChainProcessor::connectAudio(NodeID from, NodeID to, int destinationChannel)
{
    for (int c = 0; c < 2; ++c)
        if (!addConnection({{from, c}, {to, destinationChannel + c}}, UpdateKind::none))
            throw std::runtime_error("Invalid stereo audio connection");
}
void ChainProcessor::connectMidi(NodeID from, NodeID to)
{
    if (!addConnection({{from, midiChannelIndex}, {to, midiChannelIndex}}, UpdateKind::none))
        throw std::runtime_error("Invalid MIDI connection");
}

void ChainProcessor::rebuildGraph()
{
    lastError.clear();
    try
    {
        for (auto c : getConnections()) removeConnection(c, UpdateKind::none);
        usedUtilityKeys.clear();
        using IO = AudioProcessorGraph::AudioGraphIOProcessor;
        auto ensureIO = [&](NodeID& id, IO::IODeviceType type)
        {
            if (getNodeForId(id)) return;
            auto io = std::make_unique<IO>(type); io->setParentGraph(this);
            auto n = addNode(std::move(io), {}, UpdateKind::none);
            if (!n) throw std::runtime_error("Cannot create graph I/O");
            id = n->nodeID;
        };
        ensureIO(audioInputNode, IO::audioInputNode); ensureIO(audioOutputNode, IO::audioOutputNode);
        ensureIO(midiInputNode, IO::midiInputNode); ensureIO(midiOutputNode, IO::midiOutputNode);
        const auto output = wireNode(rootNode, audioInputNode, midiInputNode);
        connectAudio(output.audioOut, audioOutputNode); connectMidi(output.midiOut, midiOutputNode);
        for (auto it = utilityByKey.begin(); it != utilityByKey.end();)
        {
            if (usedUtilityKeys.count(it->first) == 0)
            {
                AudioProcessorGraph::removeNode(it->second, UpdateKind::none);
                preparedNodes.erase(it->second); utilityNodes.erase(it->second);
                it = utilityByKey.erase(it);
            }
            else ++it;
        }
        for (auto node : getNodes())
        {
            if (dynamic_cast<IO*>(node->getProcessor())) continue;
            if (preparedNodes.insert(node->nodeID).second)
            {
                node->getProcessor()->setRateAndBufferSizeDetails(currentSampleRate, currentBlockSize);
                node->getProcessor()->prepareToPlay(currentSampleRate, currentBlockSize);
            }
        }
        cachedTail.store(computeTail(rootNode));
        auto runtime = std::make_unique<ChainRenderGraph>(*this, currentSampleRate, currentBlockSize, renderRevision + 1);
        runtime->audioWorkgroupContextChanged(currentWorkgroup);
        ++renderRevision;
        publishRuntime(std::move(runtime));
    }
    catch (const std::exception& e) { lastError = e.what(); }
}

WireResult ChainProcessor::wireNode(ChainNode& node, NodeID audioIn, NodeID midiIn)
{
    if (node.isPlugin())
    {
        auto& leaf = node.getPlugin();
        auto* hosted = getHosted(leaf);
        if (!hosted) return {audioIn, midiIn};
        hosted->setBypassed(leaf.bypassed); hosted->setSuspended(leaf.suspended);
        hosted->setIgnoreLatency(leaf.ignoreLatency);
        hosted->setUseSidechain(leaf.sidechain);
        if (hosted->hasLatencyChange()) hosted->refreshLatency();
        leaf.inputMeterNodeId = utility("plugin:" + leaf.persistentId + ":input", std::make_unique<NodeMeterProcessor>());
        leaf.meterNodeId = utility("plugin:" + leaf.persistentId + ":output", std::make_unique<NodeMeterProcessor>());
        connectAudio(audioIn, leaf.inputMeterNodeId);
        connectAudio(leaf.inputMeterNodeId, leaf.graphNodeId);
        connectAudio(leaf.graphNodeId, leaf.meterNodeId);
        if (hosted->acceptsMidi()) connectMidi(midiIn, leaf.graphNodeId);
        return {leaf.meterNodeId, hosted->producesMidi() ? leaf.graphNodeId : midiIn};
    }
    // Parallel and crossover groups share the branch wiring
    return node.getGroup().mode == GroupMode::Serial ? wireSerialGroup(node, audioIn, midiIn)
                                                    : wireParallelGroup(node, audioIn, midiIn);
}

WireResult ChainProcessor::wireSerialGroup(ChainNode& node, NodeID audioIn, NodeID midiIn)
{
    auto& group = node.getGroup();
    WireResult wet {audioIn, midiIn};
    for (auto& child : group.children) wet = wireNode(*child, wet.audioOut, wet.midiOut);
    if (node.id == 0 || group.children.empty()) return wet;
    group.dryWetMixNodeId = utility("group:" + juce::String(node.id) + ":mix", std::make_unique<DryWetMixProcessor>());
    auto* mix = static_cast<DryWetMixProcessor*>(getNodeForId(group.dryWetMixNodeId)->getProcessor());
    mix->setMix(group.dryWetMix);
    connectAudio(audioIn, group.dryWetMixNodeId, 0); connectAudio(wet.audioOut, group.dryWetMixNodeId, 2);
    return {group.dryWetMixNodeId, wet.midiOut};
}

WireResult ChainProcessor::wireParallelGroup(ChainNode& node, NodeID audioIn, NodeID midiIn)
{
    auto& group = node.getGroup();
    if (group.children.empty()) return {audioIn, midiIn};
    const auto key = "group:" + juce::String(node.id);
    group.sumGainNodeId = utility(key + ":sum", std::make_unique<BranchGainProcessor>());
    group.branchGainNodeIds.clear(); group.branchGateNodeIds.clear(); group.bandFilterNodeIds.clear();
    const bool crossover = group.mode == GroupMode::Crossover;
    if (crossover) CrossoverHelpers::fitFrequencies(group);
    const auto numBands = static_cast<int>(group.children.size());
    for (int band = 0; band < numBands; ++band)
    {
        auto& child = group.children[static_cast<size_t>(band)];
        const auto branchKey = key + ":branch:" + juce::String(child->id);
        auto branchIn = audioIn;
        if (crossover)
        {
            // The band layout is fixed per processor, so the key changes when it does
            auto filter = utility(branchKey + ":band:" + juce::String(band) + "of" + juce::String(numBands),
                                  std::make_unique<CrossoverBandProcessor>(band, numBands));
            static_cast<CrossoverBandProcessor*>(getNodeForId(filter)->getProcessor())->setFrequencies(group.crossoverHz);
            group.bandFilterNodeIds.push_back(filter);
            connectAudio(audioIn, filter);
            branchIn = filter;
        }
        auto inputGain = utility(branchKey + ":gain", std::make_unique<BranchGainProcessor>());
        auto* inputGainProc = static_cast<BranchGainProcessor*>(getNodeForId(inputGain)->getProcessor());
        inputGainProc->setGainDb(child->branchGainDb);
        inputGainProc->setPolarityInverted(child->polarityInverted);
        auto gate = utility(branchKey + ":gate", std::make_unique<BranchGainProcessor>());
        group.branchGainNodeIds.push_back(inputGain); group.branchGateNodeIds.push_back(gate);
        connectAudio(branchIn, inputGain);
        const auto branch = wireNode(*child, inputGain, midiIn);
        connectAudio(branch.audioOut, gate); connectAudio(gate, group.sumGainNodeId);
    }
    updateBranchGates(node);
    group.dryWetMixNodeId = utility(key + ":mix", std::make_unique<DryWetMixProcessor>());
    static_cast<DryWetMixProcessor*>(getNodeForId(group.dryWetMixNodeId)->getProcessor())->setMix(group.dryWetMix);
    connectAudio(audioIn, group.dryWetMixNodeId, 0); connectAudio(group.sumGainNodeId, group.dryWetMixNodeId, 2);
    // Parallel branches receive MIDI for effect control. Only the original stream exits.
    return {group.dryWetMixNodeId, midiIn};
}

void ChainProcessor::updateBranchGates(ChainNode& node)
{
    if (!node.isGroup()) return;
    auto& group = node.getGroup();
    if (isBranchingMode(group.mode))
    {
        bool anySolo = false; for (auto& child : group.children) anySolo |= child->solo;
        int active = 0;
        for (size_t i = 0; i < group.children.size(); ++i)
        {
            const auto& child = group.children[i];
            const bool audible = (!anySolo || child->solo) && (!child->mute || (anySolo && child->solo));
            if (audible) ++active;
            if (i < group.branchGateNodeIds.size())
                if (auto n = getNodeForId(group.branchGateNodeIds[i]))
                    static_cast<BranchGainProcessor*>(n->getProcessor())->setGainDb(audible ? 0.0f : -60.0f);
        }
        if (auto n = getNodeForId(group.sumGainNodeId))
        {
            // Parallel copies are scaled down by the branch count; crossover bands already add up to unity
            const auto sumDb = group.mode == GroupMode::Crossover ? 0.0f : -20.0f * std::log10(static_cast<float>(juce::jmax(1, active)));
            static_cast<BranchGainProcessor*>(n->getProcessor())->setGainDb(active > 0 ? sumDb : -60.0f);
        }
    }
    for (auto& child : group.children) updateBranchGates(*child);
}

double ChainProcessor::computeTail(const ChainNode& node) const
{
    if (node.isPlugin()) { if (auto* p = getHosted(node.getPlugin())) return p->getTailLengthSeconds(); return 0; }
    double result = 0;
    for (const auto& child : node.getGroup().children)
    {
        const auto tail = computeTail(*child);
        if (!std::isfinite(tail)) return tail;
        result = node.getGroup().mode == GroupMode::Serial ? result + tail : juce::jmax(result, tail);
    }
    return result;
}

//==============================================================================
// Latency
//==============================================================================

int ChainProcessor::getTotalLatencySamples() const
{
    return getLatencySamples();
}

int ChainProcessor::computeNodeLatency(const ChainNode& node) const
{
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
                total += computeNodeLatency(*child);
            return total;
        }
        else // Parallel
        {
            // For parallel groups, the latency is the maximum of all branches
            int maxLatency = 0;
            for (const auto& child : group.children)
            {
                int branchLatency = computeNodeLatency(*child);
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

std::vector<ChainProcessor::NodeMeterData> ChainProcessor::getNodeMeterReadings() const
{
    std::vector<NodeMeterData> results;

    std::function<void(const ChainNode&)> collect = [&](const ChainNode& node)
    {
        if (node.isPlugin())
        {
            const auto& leaf = node.getPlugin();
            if (!leaf.bypassed && leaf.meterNodeId != juce::AudioProcessorGraph::NodeID())
            {
                NodeMeterData entry { node.id, 0, 0, 0, 0, 0, 0, 0, 0 };

                // Output meter (after plugin)
                if (auto* graphNode = getNodeForId(leaf.meterNodeId))
                {
                    if (auto* meterProc = dynamic_cast<NodeMeterProcessor*>(graphNode->getProcessor()))
                    {
                        auto r = meterProc->getReadings();
                        entry.peakL = r.peakL;
                        entry.peakR = r.peakR;
                        entry.peakHoldL = r.peakHoldL;
                        entry.peakHoldR = r.peakHoldR;
                    }
                }

                // Input meter (before plugin)
                if (leaf.inputMeterNodeId != juce::AudioProcessorGraph::NodeID())
                {
                    if (auto* inputGraphNode = getNodeForId(leaf.inputMeterNodeId))
                    {
                        if (auto* inputMeter = dynamic_cast<NodeMeterProcessor*>(inputGraphNode->getProcessor()))
                        {
                            auto ir = inputMeter->getReadings();
                            entry.inputPeakL = ir.peakL;
                            entry.inputPeakR = ir.peakR;
                            entry.inputPeakHoldL = ir.peakHoldL;
                            entry.inputPeakHoldR = ir.peakHoldR;
                        }
                    }
                }

                results.push_back(entry);
            }
        }
        else if (node.isGroup())
        {
            for (const auto& child : node.getGroup().children)
                collect(*child);
        }
    };

    collect(rootNode);
    return results;
}

//==============================================================================
// Serialization
//==============================================================================

void ChainProcessor::nodeToXml(const ChainNode& node, juce::XmlElement& parent) const
{
    auto* nodeXml = parent.createNewChildElement("Node");
    nodeXml->setAttribute("id", node.id);
    nodeXml->setAttribute("branchGainDb", static_cast<double>(node.branchGainDb));
    nodeXml->setAttribute("solo", node.solo);
    nodeXml->setAttribute("mute", node.mute);
    if (node.polarityInverted) nodeXml->setAttribute("polarityInverted", true);

    if (node.isPlugin())
    {
        nodeXml->setAttribute("type", "plugin");
        nodeXml->setAttribute("bypassed", node.getPlugin().bypassed);
        nodeXml->setAttribute("suspended", node.getPlugin().suspended);
        if (node.getPlugin().recallSafe) nodeXml->setAttribute("recallSafe", true);
        if (node.getPlugin().ignoreLatency) nodeXml->setAttribute("ignoreLatency", true);
        if (node.getPlugin().sidechain) nodeXml->setAttribute("sidechain", true);
        nodeXml->setAttribute("persistentId", node.getPlugin().persistentId);
        nodeXml->setAttribute("state", node.getPlugin().retainedState);
        nodeXml->setAttribute("branchGainDb", static_cast<double>(node.branchGainDb));
        nodeXml->setAttribute("solo", node.solo);
        nodeXml->setAttribute("mute", node.mute);

        if (auto descXml = node.getPlugin().description.createXml())
            nodeXml->addChildElement(descXml.release());

        if (auto gNode = getNodeForId(node.getPlugin().graphNodeId))
        {
            if (auto* processor = gNode->getProcessor())
            {
                juce::MemoryBlock state;
                processor->getStateInformation(state);
                nodeXml->setAttribute("state", state.toBase64Encoding());
            }
        }
    }
    else if (node.isGroup())
    {
        nodeXml->setAttribute("type", "group");
        nodeXml->setAttribute("mode", groupModeName(node.getGroup().mode));
        if (node.getGroup().mode == GroupMode::Crossover)
            nodeXml->setAttribute("crossover", CrossoverHelpers::toString(node.getGroup().crossoverHz));
        nodeXml->setAttribute("dryWet", static_cast<double>(node.getGroup().dryWetMix));
        nodeXml->setAttribute("name", node.name);
        nodeXml->setAttribute("collapsed", node.collapsed);

        for (const auto& child : node.getGroup().children)
            nodeToXml(*child, *nodeXml);
    }
}

juce::var ChainProcessor::nodeToJson(const ChainNode& node) const
{
    auto* obj = new juce::DynamicObject();
    obj->setProperty("id", node.id);
    obj->setProperty("branchGainDb", node.branchGainDb);
    obj->setProperty("solo", node.solo);
    obj->setProperty("mute", node.mute);
    obj->setProperty("polarityInverted", node.polarityInverted);

    if (node.isPlugin())
    {
        obj->setProperty("type", "plugin");
        obj->setProperty("name", node.getPlugin().description.name);
        obj->setProperty("format", node.getPlugin().description.pluginFormatName);
        obj->setProperty("uid", node.getPlugin().description.uniqueId);
        obj->setProperty("fileOrIdentifier", node.getPlugin().description.fileOrIdentifier);
        obj->setProperty("bypassed", node.getPlugin().bypassed);
        obj->setProperty("suspended", node.getPlugin().suspended);
        obj->setProperty("recallSafe", node.getPlugin().recallSafe);
        obj->setProperty("ignoreLatency", node.getPlugin().ignoreLatency);
        obj->setProperty("sidechain", node.getPlugin().sidechain);
        if (auto* hosted = getHosted(node.getPlugin()))
        {
            obj->setProperty("latencySamples", hosted->getPluginLatencySamples());
            obj->setProperty("hasSidechainInput", hosted->hasSidechainInput());
        }
        obj->setProperty("persistentId", node.getPlugin().persistentId);
        obj->setProperty("loadError", node.getPlugin().loadError);
        obj->setProperty("available", getHosted(node.getPlugin()) != nullptr);
        obj->setProperty("manufacturer", node.getPlugin().description.manufacturerName);
        obj->setProperty("branchGainDb", node.branchGainDb);
        obj->setProperty("solo", node.solo);
        obj->setProperty("mute", node.mute);
    }
    else if (node.isGroup())
    {
        obj->setProperty("type", "group");
        obj->setProperty("name", node.name);
        obj->setProperty("mode", juce::String(groupModeName(node.getGroup().mode)));
        if (node.getGroup().mode == GroupMode::Crossover)
        {
            juce::Array<juce::var> frequencies;
            for (auto f : node.getGroup().crossoverHz) frequencies.add(f);
            obj->setProperty("crossoverFrequencies", frequencies);
            obj->setProperty("crossover", CrossoverHelpers::toString(node.getGroup().crossoverHz));
        }
        obj->setProperty("dryWet", node.getGroup().dryWetMix);
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
    obj->setProperty("branchGainDb", node.branchGainDb);
    obj->setProperty("solo", node.solo);
    obj->setProperty("mute", node.mute);
    obj->setProperty("polarityInverted", node.polarityInverted);

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
        obj->setProperty("suspended", leaf.suspended);
        obj->setProperty("recallSafe", leaf.recallSafe);
        obj->setProperty("ignoreLatency", leaf.ignoreLatency);
        obj->setProperty("sidechain", leaf.sidechain);
        obj->setProperty("persistentId", leaf.persistentId);
        obj->setProperty("presetData", leaf.retainedState);
        obj->setProperty("isInstrument", leaf.description.isInstrument);
        obj->setProperty("numInputChannels", leaf.description.numInputChannels);
        obj->setProperty("numOutputChannels", leaf.description.numOutputChannels);
        obj->setProperty("branchGainDb", node.branchGainDb);
        obj->setProperty("solo", node.solo);
        obj->setProperty("mute", node.mute);

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
        obj->setProperty("mode", juce::String(groupModeName(node.getGroup().mode)));
        if (node.getGroup().mode == GroupMode::Crossover)
        {
            juce::Array<juce::var> frequencies;
            for (auto f : node.getGroup().crossoverHz) frequencies.add(f);
            obj->setProperty("crossoverFrequencies", frequencies);
            obj->setProperty("crossover", CrossoverHelpers::toString(node.getGroup().crossoverHz));
        }
        obj->setProperty("dryWet", node.getGroup().dryWetMix);
        obj->setProperty("collapsed", node.collapsed);

        juce::Array<juce::var> childrenArr;
        for (const auto& child : node.getGroup().children)
            childrenArr.add(nodeToJsonWithPresets(*child));
        obj->setProperty("children", childrenArr);
    }

    return juce::var(obj);
}

juce::var ChainProcessor::getChainStateAsJson() const
{
    // Emit tree-structured JSON with backward compat
    auto* result = new juce::DynamicObject();

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
    auto xml = std::make_unique<juce::XmlElement>("ChainState");
    xml->setAttribute("version", 2);

    for (const auto& child : rootNode.getGroup().children)
        nodeToXml(*child, *xml);

    copyXmlToBinary(*xml, destData);
}

void ChainProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary(data, sizeInBytes))
        restoreChainFromXml(*xml, false);
}

//==============================================================================
// Preset-level tree serialization
//==============================================================================

std::unique_ptr<juce::XmlElement> ChainProcessor::serializeChainToXml() const
{
    auto xml = std::make_unique<juce::XmlElement>("ChainTree");
    xml->setAttribute("version", 2);

    for (const auto& child : rootNode.getGroup().children)
        nodeToXml(*child, *xml);

    return xml;
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
    notificationDirty = true;
    timerCallback();
    if (notificationDirty && pendingRuntime.load() == nullptr)
    {
        if (onChainChanged) onChainChanged();
        notificationDirty = false;
    }
}
