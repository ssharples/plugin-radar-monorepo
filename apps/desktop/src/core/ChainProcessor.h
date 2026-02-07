#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "ChainNode.h"
#include "PluginSlot.h"
#include "PluginManager.h"
#include <vector>
#include <memory>
#include <functional>
#include <set>

struct WireResult
{
    juce::AudioProcessorGraph::NodeID audioOut;
    juce::AudioProcessorGraph::NodeID midiOut;
};

class ChainProcessor : public juce::AudioProcessorGraph
{
public:
    ChainProcessor(PluginManager& pluginManager);
    ~ChainProcessor() override;

    // =============================================
    // Tree-based API (new)
    // =============================================

    // Add a plugin to a specific parent group at a given index
    bool addPlugin(const juce::PluginDescription& desc, ChainNodeId parentId, int insertIndex);

    // Remove any node by ID (plugin or group)
    bool removeNode(ChainNodeId nodeId);

    // Move a node to a new parent at a new index
    bool moveNode(ChainNodeId nodeId, ChainNodeId newParentId, int newIndex);

    // Group operations
    ChainNodeId createGroup(const std::vector<ChainNodeId>& childIds, GroupMode mode, const juce::String& name);
    bool dissolveGroup(ChainNodeId groupId);
    bool setGroupMode(ChainNodeId groupId, GroupMode mode);
    bool setGroupDryWet(ChainNodeId groupId, float mix);

    // Per-branch controls
    bool setBranchGain(ChainNodeId nodeId, float gainDb);
    bool setBranchSolo(ChainNodeId nodeId, bool solo);
    bool setBranchMute(ChainNodeId nodeId, bool mute);

    // Set bypass on a node (must be a plugin leaf)
    void setNodeBypassed(ChainNodeId nodeId, bool bypassed);

    // Get the root node for read access
    const ChainNode& getRootNode() const { return rootNode; }

    // DFS-ordered list of all plugin leaves (for proxy parameter binding)
    std::vector<PluginLeaf*> getFlatPluginList();

    // =============================================
    // Backward-compatible flat API (delegates to tree)
    // =============================================

    bool addPlugin(const juce::PluginDescription& desc, int insertIndex = -1);
    bool removePlugin(int slotIndex);
    bool movePlugin(int fromIndex, int toIndex);

    // Slot control (flat API compat)
    void setSlotBypassed(int slotIndex, bool bypassed);
    bool isSlotBypassed(int slotIndex) const;

    // Plugin UI (now keyed by node ID)
    void showPluginWindow(ChainNodeId nodeId);
    void hidePluginWindow(ChainNodeId nodeId);
    void hideAllPluginWindows();

    // =============================================
    // Chain-level toggle controls
    // =============================================

    // Toggle all plugins bypassed: if ANY are active, bypass all. If ALL are bypassed, enable all.
    void toggleAllBypass();
    // Explicit set all bypass state
    void setAllBypass(bool bypassed);

    struct BypassState {
        bool allBypassed = false;
        bool anyBypassed = false;
    };
    BypassState getBypassState() const;

    // Toggle all plugin windows: if any are open, close all. If none open, open all.
    void toggleAllPluginWindows();
    // Explicit set all plugin windows open/closed
    void setAllPluginWindows(bool open);

    struct WindowState {
        int openCount = 0;
        int totalCount = 0;
    };
    WindowState getWindowState() const;

    // Note: showPluginWindow/hidePluginWindow accept both node IDs and slot indices
    // since ChainNodeId == int. The flat-index-based callers resolve to the same overload.

    // Chain info
    int getNumSlots() const;
    const PluginSlot* getSlot(int index) const;
    PluginSlot* getSlot(int index);

    // Per-node meter data collection (called by WebViewBridge timer)
    struct NodeMeterData {
        ChainNodeId nodeId;
        float peakL, peakR, peakHoldL, peakHoldR;
    };
    std::vector<NodeMeterData> getNodeMeterReadings() const;

    // Latency reporting
    int getTotalLatencySamples() const;

    // State (serialization)
    juce::var getChainStateAsJson() const;
    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    // Preset-level tree serialization (used by PresetManager)
    struct RestoreResult {
        bool success = false;
        juce::StringArray missingPlugins;
    };
    std::unique_ptr<juce::XmlElement> serializeChainToXml() const;
    RestoreResult restoreChainFromXml(const juce::XmlElement& chainXml);
    juce::MemoryBlock captureSnapshot() const;
    void restoreSnapshot(const juce::MemoryBlock& snapshot);

    // Cloud sharing
    juce::var exportChainWithPresets() const;
    bool importChainWithPresets(const juce::var& data);
    juce::String getSlotPresetData(int slotIndex) const;
    bool setSlotPresetData(int slotIndex, const juce::String& base64Data);

    // Prepare/release
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;

    // Access child processor by flat slot index (backward compat)
    juce::AudioProcessor* getSlotProcessor(int slotIndex);

    // Access child processor by node ID
    juce::AudioProcessor* getNodeProcessor(ChainNodeId nodeId);

    // Callbacks
    std::function<void()> onChainChanged;
    std::function<void(int)> onLatencyChanged;
    std::function<void()> onParameterBindingChanged;

private:
    void rebuildGraph();
    WireResult wireNode(ChainNode& node, NodeID audioIn, NodeID midiIn);
    WireResult wireSerialGroup(ChainNode& node, NodeID audioIn, NodeID midiIn);
    WireResult wireParallelGroup(ChainNode& node, NodeID audioIn, NodeID midiIn);

    void removeUtilityNodes(UpdateKind update = UpdateKind::sync);
    void notifyChainChanged();

    // Latency helpers
    int computeNodeLatency(const ChainNode& node) const;

    // Serialization helpers
    void nodeToXml(const ChainNode& node, juce::XmlElement& parent) const;
    std::unique_ptr<ChainNode> xmlToNode(const juce::XmlElement& xml);
    juce::var nodeToJson(const ChainNode& node) const;
    juce::var nodeToJsonWithPresets(const ChainNode& node) const;
    std::unique_ptr<ChainNode> jsonToNode(const juce::var& json);

    // Flat index helpers (for backward compat)
    PluginLeaf* getPluginByFlatIndex(int index);
    const PluginLeaf* getPluginByFlatIndex(int index) const;
    ChainNodeId getNodeIdByFlatIndex(int index) const;

    PluginManager& pluginManager;

    // The tree root — always a Serial group
    ChainNode rootNode;
    ChainNodeId nextNodeId = 1;

    // Utility nodes added during graph wiring (cleaned up on rebuild)
    std::set<NodeID> utilityNodes;

    // Cached flat plugin slots for backward compat getSlot() API
    mutable std::vector<std::unique_ptr<PluginSlot>> cachedSlots;
    mutable bool cachedSlotsDirty = true;
    void rebuildCachedSlots() const;

    NodeID audioInputNode;
    NodeID audioOutputNode;
    NodeID midiInputNode;
    NodeID midiOutputNode;

    double currentSampleRate = 44100.0;
    int currentBlockSize = 512;

    std::shared_ptr<bool> aliveFlag { std::make_shared<bool>(true) };

    // Plugin window management
    class PluginWindow;
    juce::OwnedArray<PluginWindow> pluginWindows;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ChainProcessor)
};
