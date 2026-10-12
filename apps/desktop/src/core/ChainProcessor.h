#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "ChainNode.h"
#include "PluginSlot.h"
#include "PluginManager.h"
#include <vector>
#include <memory>
#include <functional>
#include <set>
#include <map>
#include <atomic>
#include "ChainRenderGraph.h"
#include "../audio/HostedPluginProcessor.h"

struct WireResult
{
    juce::AudioProcessorGraph::NodeID audioOut;
    juce::AudioProcessorGraph::NodeID midiOut;
};

class ChainProcessor : public juce::AudioProcessorGraph, private juce::Timer
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
    // Crossover groups: moves one split point, kept between its neighbours
    bool setCrossoverFrequency(ChainNodeId groupId, int splitIndex, float frequencyHz);
    bool setGroupDryWet(ChainNodeId groupId, float mix);

    // Per-branch controls
    bool setBranchGain(ChainNodeId nodeId, float gainDb);
    bool setBranchSolo(ChainNodeId nodeId, bool solo);
    bool setBranchMute(ChainNodeId nodeId, bool mute);
    bool setBranchPolarity(ChainNodeId nodeId, bool inverted);

    // Set bypass on a node (must be a plugin leaf)
    void setNodeBypassed(ChainNodeId nodeId, bool bypassed);
    bool setNodeSuspended(ChainNodeId nodeId, bool suspended);
    bool setNodeRecallSafe(ChainNodeId nodeId, bool recallSafe);
    bool setNodeIgnoreLatency(ChainNodeId nodeId, bool ignore);
    // Key a plugin from the wrapper's sidechain input (only plugins with a sidechain bus)
    bool setNodeSidechain(ChainNodeId nodeId, bool useSidechain);
    // Audio thread, before processBlock: the host's sidechain audio for this block.
    // Cleared again when processBlock returns.
    void setSidechainInput(const float* left, const float* right, int numSamples) noexcept;

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
        float peakL, peakR, peakHoldL, peakHoldR;                     // output
        float inputPeakL, inputPeakR, inputPeakHoldL, inputPeakHoldR; // input
    };
    std::vector<NodeMeterData> getNodeMeterReadings() const;

    // Duplicate a plugin node (inserts copy right after the original)
    bool duplicateNode(ChainNodeId nodeId);

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
        juce::String error;
        juce::String status = "failed";
        uint64_t requestId = 0;
        juce::Array<juce::var> issues;
    };
    std::unique_ptr<juce::XmlElement> serializeChainToXml() const;
    RestoreResult restoreChainFromXml(const juce::XmlElement& chainXml, bool allowPartial = false);
    using RestoreCompletion = std::function<void(RestoreResult)>;
    using RestoreProgress = std::function<void(uint64_t, const juce::String&, int, int, const juce::String&)>;
    // respectRecallSafe: slots marked recall-safe keep their current plugin and settings
    uint64_t requestRestore(const juce::XmlElement&, bool allowPartial, RestoreCompletion, RestoreProgress = {},
                            bool respectRecallSafe = false);
    void cancelPendingLoads();
    void requestSlotPresetData(int slotIndex, const juce::String&, RestoreCompletion);
    void duplicateNodeAsync(ChainNodeId, RestoreCompletion);
    void replaceNodeAsync(ChainNodeId, const juce::PluginDescription&, const juce::var& translatedParams, RestoreCompletion);
    void addPluginAsync(const juce::PluginDescription&, ChainNodeId parentId, int index,
                        std::function<void(bool, juce::String)>);
    juce::MemoryBlock captureSnapshot() const;
    void restoreSnapshot(const juce::MemoryBlock& snapshot);

    // Cloud sharing
    juce::var exportChainWithPresets() const;
    bool importChainWithPresets(const juce::var& data);
    uint64_t requestImportChainWithPresets(const juce::var&, RestoreCompletion, bool reuseUnchanged = false,
                                           bool respectRecallSafe = false);
    juce::String getSlotPresetData(int slotIndex) const;
    bool setSlotPresetData(int slotIndex, const juce::String& base64Data);

    // Prepare/release
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    void reset() override;
    void setNonRealtime(bool) noexcept override;
    void audioWorkgroupContextChanged(const juce::AudioWorkgroup&) override;
    double getTailLengthSeconds() const override { return cachedTail.load(); }

    // Access child processor by flat slot index (backward compat)
    juce::AudioProcessor* getSlotProcessor(int slotIndex);

    // Access child processor by node ID
    juce::AudioProcessor* getNodeProcessor(ChainNodeId nodeId);

    // Callbacks
    std::function<void()> onChainChanged;
    std::function<void(int)> onLatencyChanged;
    std::function<void()> onParameterBindingChanged;
    std::function<void(const juce::String&)> onPluginRetiring;
    std::function<bool()> canRetireTargets;
    uint64_t getRenderRevision() const noexcept { return renderRevision; }
    const juce::String& getLastError() const noexcept { return lastError; }

public:
    ChainNodeId getNodeIdByFlatIndex(int index) const;

private:
    struct PreparedRestore;
    std::shared_ptr<PreparedRestore> prepareRestoreSkeleton(const juce::XmlElement&, bool, bool reuseUnchanged = false,
                                                            bool respectRecallSafe = false);
    void keepRecallSafeSlots(PreparedRestore&);
    void prepareNextPlugin(const std::shared_ptr<PreparedRestore>&);
    void finishLoad(const std::shared_ptr<PreparedRestore>&, RestoreResult);
    void enqueueLoad(const std::shared_ptr<PreparedRestore>&);
    RestoreResult commitRestore(const std::shared_ptr<PreparedRestore>&, RestoreCompletion = {});
    std::unique_ptr<juce::XmlElement> importXml(const juce::var&) const;
    std::unique_ptr<ChainNode> parseNode(const juce::XmlElement&, ChainNodeId&, std::set<int>&, std::set<juce::String>&);
    Node::Ptr addHostedInstance(std::unique_ptr<juce::AudioPluginInstance>, bool bypassed, bool suspended, juce::String&);
    bool addPreparedPlugin(const juce::PluginDescription&, std::unique_ptr<juce::AudioPluginInstance>, ChainNodeId, int, juce::String&);
    HostedPluginProcessor* getHosted(const PluginLeaf&) const;
    void retirePlugin(const PluginLeaf&);
    void closeRetiredPluginWindows(const ChainNode&, const std::set<NodeID>&);
    void timerCallback() override;
    void publishRuntime(std::unique_ptr<ChainRenderGraph>);
    NodeID utility(const juce::String&, std::unique_ptr<juce::AudioProcessor>);
    void connectAudio(NodeID, NodeID, int destinationChannel = 0);
    void connectMidi(NodeID, NodeID);
    void updateBranchGates(ChainNode&);
    double computeTail(const ChainNode&) const;
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
    juce::var nodeToJson(const ChainNode& node) const;
    juce::var nodeToJsonWithPresets(const ChainNode& node) const;

    // Flat index helpers (for backward compat)
    PluginLeaf* getPluginByFlatIndex(int index);
    const PluginLeaf* getPluginByFlatIndex(int index) const;

    PluginManager& pluginManager;

    // The tree root — always a Serial group
    ChainNode rootNode;
    ChainNodeId nextNodeId = 1;

    // Utility nodes added during graph wiring (cleaned up on rebuild)
    std::set<NodeID> utilityNodes;
    std::map<juce::String, NodeID> utilityByKey;
    std::set<juce::String> usedUtilityKeys;
    std::set<NodeID> preparedNodes;
    std::vector<std::pair<juce::String, Node::Ptr>> retiredTargets;
    std::atomic<ChainRenderGraph*> pendingRuntime { nullptr }, retiredRuntime { nullptr };
    ChainRenderGraph* audioRuntime = nullptr; // exclusively audio-owned until host quiescence
    std::atomic<uint64_t> activeRevision { 0 }, acknowledgedRevision { 0 };
    std::atomic<int> activeLatency { 0 };
    std::atomic<int64_t> lastAudioTime { 0 };
    std::atomic<double> cachedTail { 0.0 };
    std::atomic<bool> resetPending { false };
    juce::SmoothedValue<float> transitionGain;
    juce::MidiBuffer chunkMidi, collectedMidi;
    class BlockPlayhead;
    std::unique_ptr<BlockPlayhead> blockPlayhead;
    std::shared_ptr<SidechainFeed> sidechainFeed = std::make_shared<SidechainFeed>();
    uint64_t renderRevision = 0, notifiedRevision = 0, nextLoadRequest = 0;
    std::atomic<uint64_t> latestLoadRequest { 0 };
    std::shared_ptr<PreparedRestore> loadingRestore, queuedRestore;
    std::map<uint64_t, std::function<void()>> commitCallbacks;
    int primeRemaining = 0;
    bool prepared = false;
    bool bindingsDirty = false, notificationDirty = false;
    juce::String lastError;
    juce::AudioWorkgroup currentWorkgroup;

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
