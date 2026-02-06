#include "ChainProcessor.h"
#include "../audio/DryWetMixProcessor.h"
#include "../audio/BranchGainProcessor.h"
#include "../audio/LatencyCompensationProcessor.h"
#include <cmath>

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

        // Use standard window flags WITHOUT windowIsTemporary — this prevents
        // the always-on-top floating panel behavior that makes child plugin
        // windows stay above the DAW and the main plugin editor.
        int styleFlags = juce::ComponentPeer::windowHasTitleBar
                       | juce::ComponentPeer::windowHasCloseButton
                       | juce::ComponentPeer::windowHasDropShadow
                       | juce::ComponentPeer::windowAppearsOnTaskbar;
        addToDesktop(styleFlags);

        centreWithSize(getWidth(), getHeight());
        setVisible(true);
        toFront(true);
    }

    void closeButtonPressed() override { setVisible(false); }

    void activeWindowStatusChanged() override {}

    void mouseDown(const juce::MouseEvent& e) override
    {
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

    // Initialize root as an empty Serial group with id=0
    rootNode.id = 0;
    rootNode.name = "Root";
    rootNode.data = GroupData{ GroupMode::Serial, 1.0f, {}, {}, {}, {}, {} };
}

ChainProcessor::~ChainProcessor()
{
    *aliveFlag = false;
    hideAllPluginWindows();
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

//==============================================================================
// Tree-based API
//==============================================================================

bool ChainProcessor::addPlugin(const juce::PluginDescription& desc, ChainNodeId parentId, int insertIndex)
{
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    auto* parent = ChainNodeHelpers::findById(rootNode, parentId);
    if (!parent || !parent->isGroup())
        return false;

    juce::String errorMessage;
    auto instance = pluginManager.createPluginInstance(desc, currentSampleRate, currentBlockSize, errorMessage);
    if (!instance)
    {
        DBG("Failed to create plugin instance: " + errorMessage);
        return false;
    }

    auto node = std::make_unique<ChainNode>();
    node->id = nextNodeId++;
    node->name = desc.name;
    PluginLeaf leaf;
    leaf.description = desc;
    leaf.bypassed = false;

    if (auto graphNode = addNode(std::move(instance)))
    {
        leaf.graphNodeId = graphNode->nodeID;
    }
    else
    {
        return false;
    }

    node->data = std::move(leaf);

    auto& children = parent->getGroup().children;
    if (insertIndex < 0 || insertIndex >= static_cast<int>(children.size()))
        children.push_back(std::move(node));
    else
        children.insert(children.begin() + insertIndex, std::move(node));

    cachedSlotsDirty = true;
    rebuildGraph();
    notifyChainChanged();
    if (onParameterBindingChanged)
        onParameterBindingChanged();
    return true;
}

bool ChainProcessor::removeNode(ChainNodeId nodeId)
{
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
                AudioProcessorGraph::removeNode(plug->graphNodeId);
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
    if (onParameterBindingChanged)
        onParameterBindingChanged();
    return true;
}

bool ChainProcessor::moveNode(ChainNodeId nodeId, ChainNodeId newParentId, int newIndex)
{
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
    if (onParameterBindingChanged)
        onParameterBindingChanged();
    return true;
}

ChainNodeId ChainProcessor::createGroup(const std::vector<ChainNodeId>& childIds, GroupMode mode, const juce::String& name)
{
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

    ChainNodeId groupId = parentChildren[static_cast<size_t>(earliestIndex)]->id;

    cachedSlotsDirty = true;
    rebuildGraph();
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

    rebuildGraph();
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

    node->solo = solo;

    rebuildGraph();
    notifyChainChanged();
    return true;
}

bool ChainProcessor::setBranchMute(ChainNodeId nodeId, bool mute)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node)
        return false;

    node->mute = mute;

    rebuildGraph();
    notifyChainChanged();
    return true;
}

void ChainProcessor::setNodeBypassed(ChainNodeId nodeId, bool bypassed)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node || !node->isPlugin())
        return;

    node->getPlugin().bypassed = bypassed;

    if (auto gNode = getNodeForId(node->getPlugin().graphNodeId))
        gNode->setBypassed(bypassed);

    cachedSlotsDirty = true;
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
    hidePluginWindow(slotIndex);

    return removeNode(nodeId);
}

bool ChainProcessor::movePlugin(int fromIndex, int toIndex)
{
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
                    pluginWindows.add(new PluginWindow(editor, windowName, nodeId));
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
    {
        leaf->bypassed = bypassed;
        if (auto gNode = getNodeForId(leaf->graphNodeId))
            gNode->setBypassed(bypassed);
    }

    cachedSlotsDirty = true;
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
        return gNode->getProcessor();

    return nullptr;
}

juce::AudioProcessor* ChainProcessor::getNodeProcessor(ChainNodeId nodeId)
{
    auto* node = ChainNodeHelpers::findById(rootNode, nodeId);
    if (!node || !node->isPlugin())
        return nullptr;

    if (auto gNode = getNodeForId(node->getPlugin().graphNodeId))
        return gNode->getProcessor();

    return nullptr;
}

//==============================================================================
// Graph wiring
//==============================================================================

void ChainProcessor::removeUtilityNodes()
{
    for (auto nodeId : utilityNodes)
        AudioProcessorGraph::removeNode(nodeId);
    utilityNodes.clear();
}

void ChainProcessor::rebuildGraph()
{
    jassert(juce::MessageManager::getInstance()->isThisTheMessageThread());

    // Remove all connections
    for (auto& connection : getConnections())
        removeConnection(connection);

    // Remove utility nodes from previous wiring
    removeUtilityNodes();

    // Remove I/O nodes if they exist
    if (audioInputNode.uid != 0)
        AudioProcessorGraph::removeNode(audioInputNode);
    if (audioOutputNode.uid != 0)
        AudioProcessorGraph::removeNode(audioOutputNode);
    if (midiInputNode.uid != 0)
        AudioProcessorGraph::removeNode(midiInputNode);
    if (midiOutputNode.uid != 0)
        AudioProcessorGraph::removeNode(midiOutputNode);

    // Create I/O nodes
    if (auto audioIn = addNode(std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
            juce::AudioProcessorGraph::AudioGraphIOProcessor::audioInputNode)))
        audioInputNode = audioIn->nodeID;

    if (auto audioOut = addNode(std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
            juce::AudioProcessorGraph::AudioGraphIOProcessor::audioOutputNode)))
        audioOutputNode = audioOut->nodeID;

    if (auto midiIn = addNode(std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
            juce::AudioProcessorGraph::AudioGraphIOProcessor::midiInputNode)))
        midiInputNode = midiIn->nodeID;

    if (auto midiOut = addNode(std::make_unique<juce::AudioProcessorGraph::AudioGraphIOProcessor>(
            juce::AudioProcessorGraph::AudioGraphIOProcessor::midiOutputNode)))
        midiOutputNode = midiOut->nodeID;

    // Wire the root group
    auto result = wireNode(rootNode, audioInputNode, midiInputNode);

    // Connect last output to audio/midi output
    addConnection({{result.audioOut, 0}, {audioOutputNode, 0}});
    addConnection({{result.audioOut, 1}, {audioOutputNode, 1}});
    addConnection({{result.midiOut, juce::AudioProcessorGraph::midiChannelIndex},
                   {midiOutputNode, juce::AudioProcessorGraph::midiChannelIndex}});
}

WireResult ChainProcessor::wireNode(ChainNode& node, NodeID audioIn, NodeID midiIn)
{
    if (node.isPlugin())
    {
        auto& leaf = node.getPlugin();
        auto nodeId = leaf.graphNodeId;

        // Audio connections (stereo)
        addConnection({{audioIn, 0}, {nodeId, 0}});
        addConnection({{audioIn, 1}, {nodeId, 1}});

        // MIDI connection
        addConnection({{midiIn, juce::AudioProcessorGraph::midiChannelIndex},
                       {nodeId, juce::AudioProcessorGraph::midiChannelIndex}});

        return { nodeId, nodeId };
    }
    else if (node.isGroup())
    {
        auto& group = node.getGroup();
        if (group.mode == GroupMode::Serial)
            return wireSerialGroup(node, audioIn, midiIn);
        else
            return wireParallelGroup(node, audioIn, midiIn);
    }

    // Shouldn't reach here, but passthrough
    return { audioIn, midiIn };
}

WireResult ChainProcessor::wireSerialGroup(ChainNode& node, NodeID audioIn, NodeID midiIn)
{
    auto& group = node.getGroup();
    auto& children = group.children;

    // Empty group = passthrough
    if (children.empty())
        return { audioIn, midiIn };

    bool useDryWet = (group.dryWetMix < 0.999f) && (node.id != 0); // Root node doesn't use dry/wet

    if (!useDryWet)
    {
        // Simple serial chain: wire children one after another
        NodeID prevAudio = audioIn;
        NodeID prevMidi = midiIn;

        for (auto& child : children)
        {
            auto result = wireNode(*child, prevAudio, prevMidi);
            prevAudio = result.audioOut;
            prevMidi = result.midiOut;
        }

        return { prevAudio, prevMidi };
    }

    // Dry/wet mode: create a DryWetMixProcessor
    auto mixProc = std::make_unique<DryWetMixProcessor>();
    mixProc->setMix(group.dryWetMix);

    auto mixNode = addNode(std::move(mixProc));
    if (!mixNode)
        return { audioIn, midiIn };

    group.dryWetMixNodeId = mixNode->nodeID;
    utilityNodes.insert(mixNode->nodeID);

    // Dry path: connect input directly to mix node channels 0-1
    addConnection({{audioIn, 0}, {mixNode->nodeID, 0}});
    addConnection({{audioIn, 1}, {mixNode->nodeID, 1}});

    // Wet path: wire children in series, then connect to mix node channels 2-3
    NodeID prevAudio = audioIn;
    NodeID prevMidi = midiIn;

    for (auto& child : children)
    {
        auto result = wireNode(*child, prevAudio, prevMidi);
        prevAudio = result.audioOut;
        prevMidi = result.midiOut;
    }

    addConnection({{prevAudio, 0}, {mixNode->nodeID, 2}});
    addConnection({{prevAudio, 1}, {mixNode->nodeID, 3}});

    // MIDI passes through the wet chain
    return { mixNode->nodeID, prevMidi };
}

WireResult ChainProcessor::wireParallelGroup(ChainNode& node, NodeID audioIn, NodeID midiIn)
{
    auto& group = node.getGroup();
    auto& children = group.children;

    // Empty group = passthrough
    if (children.empty())
        return { audioIn, midiIn };

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
        // Create a gain node with -inf dB
        auto silenceProc = std::make_unique<BranchGainProcessor>();
        silenceProc->setGainDb(-60.0f);
        auto silenceNode = addNode(std::move(silenceProc));
        if (silenceNode)
        {
            utilityNodes.insert(silenceNode->nodeID);
            addConnection({{audioIn, 0}, {silenceNode->nodeID, 0}});
            addConnection({{audioIn, 1}, {silenceNode->nodeID, 1}});
            return { silenceNode->nodeID, midiIn };
        }
        return { audioIn, midiIn };
    }

    // Create sum compensation gain node at the output
    float compensationDb = -20.0f * std::log10(static_cast<float>(activeBranches));
    auto sumGainProc = std::make_unique<BranchGainProcessor>();
    sumGainProc->setGainDb(compensationDb);

    auto sumGainNode = addNode(std::move(sumGainProc));
    if (!sumGainNode)
        return { audioIn, midiIn };

    group.sumGainNodeId = sumGainNode->nodeID;
    utilityNodes.insert(sumGainNode->nodeID);

    // Clear and rebuild branch node ID vectors
    group.branchGainNodeIds.clear();
    group.delayCompNodeIds.clear();

    NodeID lastMidi = midiIn;

    // Phase 1: Wire all branches and record their output nodes + latencies
    struct BranchInfo {
        NodeID audioOut;
        NodeID midiOut;
        int latency = 0;
        size_t index = 0;
    };
    std::vector<BranchInfo> branchInfos;

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
            group.delayCompNodeIds.push_back({});
            continue;
        }

        // Create per-branch gain processor
        auto branchGainProc = std::make_unique<BranchGainProcessor>();
        branchGainProc->setGainDb(child->branchGainDb);

        auto branchGainNode = addNode(std::move(branchGainProc));
        if (!branchGainNode)
        {
            group.branchGainNodeIds.push_back({});
            group.delayCompNodeIds.push_back({});
            continue;
        }

        group.branchGainNodeIds.push_back(branchGainNode->nodeID);
        group.delayCompNodeIds.push_back({}); // placeholder, filled in phase 2
        utilityNodes.insert(branchGainNode->nodeID);

        // Fan-out: connect input to branch gain
        addConnection({{audioIn, 0}, {branchGainNode->nodeID, 0}});
        addConnection({{audioIn, 1}, {branchGainNode->nodeID, 1}});

        // Wire child after branch gain
        auto result = wireNode(*child, branchGainNode->nodeID, midiIn);

        // Compute this branch's latency
        int branchLatency = computeNodeLatency(*child);

        branchInfos.push_back({ result.audioOut, result.midiOut, branchLatency, i });
        lastMidi = result.midiOut;
    }

    // Phase 2: Find max latency and insert delay compensation on shorter branches
    int maxLatency = 0;
    for (const auto& info : branchInfos)
        maxLatency = std::max(maxLatency, info.latency);

    for (auto& info : branchInfos)
    {
        int delayNeeded = maxLatency - info.latency;
        NodeID connectFrom = info.audioOut;

        if (delayNeeded > 0)
        {
            // Insert a delay compensation processor
            auto delayProc = std::make_unique<LatencyCompensationProcessor>(delayNeeded);
            auto delayNode = addNode(std::move(delayProc));

            if (delayNode)
            {
                utilityNodes.insert(delayNode->nodeID);
                group.delayCompNodeIds[info.index] = delayNode->nodeID;

                // Wire branch output → delay → (then to sum)
                addConnection({{info.audioOut, 0}, {delayNode->nodeID, 0}});
                addConnection({{info.audioOut, 1}, {delayNode->nodeID, 1}});

                connectFrom = delayNode->nodeID;
            }
        }

        // Fan-in: connect (possibly delayed) branch output to sum gain node
        // (AudioProcessorGraph auto-sums multiple connections to the same input)
        addConnection({{connectFrom, 0}, {sumGainNode->nodeID, 0}});
        addConnection({{connectFrom, 1}, {sumGainNode->nodeID, 1}});
    }

    return { sumGainNode->nodeID, lastMidi };
}

//==============================================================================
// Latency
//==============================================================================

int ChainProcessor::getTotalLatencySamples() const
{
    return computeNodeLatency(rootNode);
}

int ChainProcessor::computeNodeLatency(const ChainNode& node) const
{
    if (node.isPlugin())
    {
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
        nodeXml->setAttribute("mode", node.getGroup().mode == GroupMode::Serial ? "serial" : "parallel");
        nodeXml->setAttribute("dryWet", static_cast<double>(node.getGroup().dryWetMix));
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
        node->solo = xml.getBoolAttribute("solo", false);
        node->mute = xml.getBoolAttribute("mute", false);

        PluginLeaf leaf;
        leaf.bypassed = xml.getBoolAttribute("bypassed", false);

        if (auto* descXml = xml.getChildByName("PLUGIN"))
        {
            leaf.description.loadFromXml(*descXml);
            node->name = leaf.description.name;

            juce::String errorMessage;
            auto instance = pluginManager.createPluginInstance(
                leaf.description, currentSampleRate, currentBlockSize, errorMessage);

            if (instance)
            {
                // Restore plugin state
                auto stateBase64 = xml.getStringAttribute("state");
                if (stateBase64.isNotEmpty())
                {
                    juce::MemoryBlock state;
                    state.fromBase64Encoding(stateBase64);
                    instance->setStateInformation(state.getData(), static_cast<int>(state.getSize()));
                }

                if (auto graphNode = addNode(std::move(instance)))
                {
                    leaf.graphNodeId = graphNode->nodeID;
                    if (leaf.bypassed)
                        graphNode->setBypassed(true);
                }
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
        obj->setProperty("manufacturer", node.getPlugin().description.manufacturerName);
        obj->setProperty("branchGainDb", node.branchGainDb);
        obj->setProperty("solo", node.solo);
        obj->setProperty("mute", node.mute);
    }
    else if (node.isGroup())
    {
        obj->setProperty("type", "group");
        obj->setProperty("name", node.name);
        obj->setProperty("mode", node.getGroup().mode == GroupMode::Serial ? "serial" : "parallel");
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
        obj->setProperty("mode", node.getGroup().mode == GroupMode::Serial ? "serial" : "parallel");
        obj->setProperty("dryWet", node.getGroup().dryWetMix);
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
        node->solo = static_cast<bool>(obj->getProperty("solo"));
        node->mute = static_cast<bool>(obj->getProperty("mute"));

        PluginLeaf leaf;
        leaf.bypassed = static_cast<bool>(obj->getProperty("bypassed"));

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
            // Restore preset data
            auto presetData = obj->getProperty("presetData").toString();
            if (presetData.isNotEmpty())
            {
                juce::MemoryBlock state;
                state.fromBase64Encoding(presetData);
                instance->setStateInformation(state.getData(), static_cast<int>(state.getSize()));
            }

            if (auto graphNode = addNode(std::move(instance)))
            {
                leaf.graphNodeId = graphNode->nodeID;
                if (leaf.bypassed)
                    graphNode->setBypassed(true);
            }
        }

        node->data = std::move(leaf);
    }
    else if (type == "group")
    {
        node->name = obj->getProperty("name").toString();
        node->collapsed = static_cast<bool>(obj->getProperty("collapsed"));

        GroupData group;
        group.mode = obj->getProperty("mode").toString() == "parallel" ? GroupMode::Parallel : GroupMode::Serial;
        group.dryWetMix = static_cast<float>(obj->getProperty("dryWet"));

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
    {
        if (xml->hasTagName("ChainState"))
        {
            // Clear existing chain
            hideAllPluginWindows();

            // Remove all plugin graph nodes
            std::vector<PluginLeaf*> allPlugins;
            ChainNodeHelpers::collectPluginsMut(rootNode, allPlugins);
            for (auto* plug : allPlugins)
                AudioProcessorGraph::removeNode(plug->graphNodeId);

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

    for (const auto& child : rootNode.getGroup().children)
        nodeToXml(*child, *xml);

    return xml;
}

ChainProcessor::RestoreResult ChainProcessor::restoreChainFromXml(const juce::XmlElement& chainXml)
{
    RestoreResult result;
    int version = chainXml.getIntAttribute("version", 1);

    // Clear existing chain (same logic as setStateInformation)
    hideAllPluginWindows();

    std::vector<PluginLeaf*> allPlugins;
    ChainNodeHelpers::collectPluginsMut(rootNode, allPlugins);
    for (auto* plug : allPlugins)
        AudioProcessorGraph::removeNode(plug->graphNodeId);

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

bool ChainProcessor::importChainWithPresets(const juce::var& data)
{
    if (!data.isObject())
        return false;

    auto* obj = data.getDynamicObject();
    if (!obj)
        return false;

    int version = static_cast<int>(obj->getProperty("version"));

    // Clear existing chain
    hideAllPluginWindows();
    std::vector<PluginLeaf*> allPlugins;
    ChainNodeHelpers::collectPluginsMut(rootNode, allPlugins);
    for (auto* plug : allPlugins)
        AudioProcessorGraph::removeNode(plug->graphNodeId);
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
            return false;

        for (const auto& slotVar : *slotsVar.getArray())
        {
            if (auto child = jsonToNode(slotVar))
                rootNode.getGroup().children.push_back(std::move(child));
        }
    }

    cachedSlotsDirty = true;
    rebuildGraph();
    notifyChainChanged();
    if (onParameterBindingChanged)
        onParameterBindingChanged();
    return true;
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
