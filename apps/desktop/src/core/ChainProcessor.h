#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "ChainNode.h"
#include "PluginSlot.h"
#include "PluginManager.h"
#include "../audio/PluginParameterWatcher.h"
#include <vector>
#include <memory>
#include <functional>
#include <set>

struct WireResult
{
    juce::AudioProcessorGraph::NodeID audioOut;
};

class ChainProcessor : public juce::AudioProcessorGraph
{
public:
    ChainProcessor(PluginManager& pluginManager);
    ~ChainProcessor() noexcept override;

    // =============================================
    // Meter Mode (PHASE 2: Conditional Metering)
    // =============================================

    enum class MeterMode
    {
        PeakOnly,   // Peak/RMS only, skip LUFS calculation (low CPU)
        FullLUFS    // Full LUFS calculation (default)
    };

    void setGlobalMeterMode(MeterMode mode);

    // =============================================
    // Tree-based API (new)
    // =============================================

    // Add a plugin to a specific parent group at a given index
    bool addPlugin(const juce::PluginDescription& desc, ChainNodeId parentId, int insertIndex);

    // Add an empty dry path branch to a parallel group
    ChainNodeId addDryPath(ChainNodeId parentId, int insertIndex = -1);

    // Remove any node by ID (plugin or group)
    bool removeNode(ChainNodeId nodeId);

    // Move a node to a new parent at a new index
    bool moveNode(ChainNodeId nodeId, ChainNodeId newParentId, int newIndex);

    // Group operations
    ChainNodeId createGroup(const std::vector<ChainNodeId>& childIds, GroupMode mode, const juce::String& name);
    bool dissolveGroup(ChainNodeId groupId);
    bool setGroupMode(ChainNodeId groupId, GroupMode mode);
    bool setGroupDryWet(ChainNodeId groupId, float mix);
    bool setGroupDucking(ChainNodeId groupId, float amount, float releaseMs);

    // Per-branch controls
    bool setBranchGain(ChainNodeId nodeId, float gainDb);
    bool setBranchSolo(ChainNodeId nodeId, bool solo);
    bool setBranchMute(ChainNodeId nodeId, bool mute);

    // Per-plugin controls (gain staging, dry/wet, sidechain)
    bool setNodeInputGain(ChainNodeId nodeId, float gainDb);
    bool setNodeOutputGain(ChainNodeId nodeId, float gainDb);
    bool setNodeDryWet(ChainNodeId nodeId, float mix);
    bool setNodeSidechainSource(ChainNodeId nodeId, int source);
    bool setNodeMidSideMode(ChainNodeId nodeId, int mode);

    // Sidechain buffer from host
    void setSidechainBuffer(juce::AudioBuffer<float>* buf) { externalSidechainBuffer = buf; }

    // Set bypass on a node (must be a plugin leaf)
    void setNodeBypassed(ChainNodeId nodeId, bool bypassed);

    // Get the root node for read access
    const ChainNode& getRootNode() const { return rootNode; }
    
    // Insert a pre-built node tree (for group templates)
    ChainNodeId insertNodeTree(std::unique_ptr<ChainNode> node, ChainNodeId parentId, int insertIndex);

    // DFS-ordered list of all plugin leaves (for proxy parameter binding)
    std::vector<PluginLeaf*> getFlatPluginList();
    std::vector<const PluginLeaf*> getFlatPluginList() const;

    // DFS-ordered list of ChainNodeIds for plugin leaves (parallel to getFlatPluginList)
    std::vector<ChainNodeId> getFlatPluginNodeIds() const;

    // =============================================
    // Backward-compatible flat API (delegates to tree)
    // =============================================

    bool addPlugin(const juce::PluginDescription& desc, int insertIndex = -1);
    bool removePlugin(int slotIndex);
    bool movePlugin(int fromIndex, int toIndex);

    // Slot control (flat API compat)
    void setSlotBypassed(int slotIndex, bool bypassed);

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
        float peakL, peakR, peakHoldL, peakHoldR;                     // output peak
        float rmsL, rmsR;                                              // output RMS
        float inputPeakL, inputPeakR, inputPeakHoldL, inputPeakHoldR; // input peak
        float inputRmsL, inputRmsR;                                    // input RMS
        float latencyMs;                                               // latency in milliseconds
    };
    const std::vector<NodeMeterData>& getNodeMeterReadings() const;
    void resetAllNodePeaks();

    // Duplicate a plugin node (inserts copy right after the original)
    bool duplicateNode(ChainNodeId nodeId);

    // Latency reporting
    int getTotalLatencySamples() const;

    // PHASE 7: Force latency refresh (for plugins like Auto-Tune that change latency dynamically)
    // Call this after toggling plugin settings that affect latency
    void refreshLatencyCompensation();

    // Check if the audio thread is currently inside processBlock
    bool isAudioThreadBusy() const { return audioThreadBusy.load(std::memory_order_acquire); }

    // Check/clear the latency refresh flag (set by audio thread, polled by message thread)
    bool needsLatencyRefresh() const { return latencyRefreshNeeded.load(std::memory_order_acquire); }
    void clearLatencyRefreshFlag() { latencyRefreshNeeded.store(false, std::memory_order_relaxed); }

    // Remove all connections and nodes, then rebuild the (now-empty) render sequence.
    // Used by the destructor to make the graph inert before member destruction.
    void clearGraph();

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

    struct SlotFailure
    {
        int position;
        juce::String pluginName;
        juce::String reason; // "not_found", "load_error", "preset_error"
    };

    struct ImportResult
    {
        bool success = false;
        int totalSlots = 0;
        int loadedSlots = 0;
        int failedSlots = 0;
        std::vector<SlotFailure> failures;
    };

    ImportResult importChainWithPresets(const juce::var& data);
    juce::String getSlotPresetData(int slotIndex) const;
    bool setSlotPresetData(int slotIndex, const juce::String& base64Data);

    // Prepare/release/processBlock
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override;

    // Access child processor by flat slot index (backward compat)
    juce::AudioProcessor* getSlotProcessor(int slotIndex);

    // Access child processor by node ID
    juce::AudioProcessor* getNodeProcessor(ChainNodeId nodeId);

    // Access plugin manager
    PluginManager& getPluginManager() { return pluginManager; }

    // Callbacks
    std::function<void()> onChainChanged;
    std::function<void(int)> onLatencyChanged;
    std::function<void()> onParameterBindingChanged;
    std::function<void(int)> onUnbindSlot;  // Called after duplication to clear automation

    /** Fired when child plugin parameters settle after user edits.
     *  Argument is the Base64 snapshot from *before* the parameter changes. */
    std::function<void(const juce::String& beforeSnapshotBase64)> onPluginParameterChangeSettled;

    /** Suppress/unsuppress parameter watcher (use during undo/redo restores). */
    void setParameterWatcherSuppressed(bool suppressed);

private:
    // Crash recovery - async state persistence
    juce::File getCrashRecoveryFile() const;
    void saveCrashRecoveryStateAsync();
    void performCrashRecoverySave(const juce::MemoryBlock& stateData);
    bool tryRestoreCrashRecoveryState();
    void cleanupCrashRecoveryFile();
    void rebuildGraph();
    void scheduleRebuild();  // Deferred rebuild — coalesces rapid changes into single rebuild
    void beginBatch();       // Suspend processing and suppress rebuilds until endBatch()
    void endBatch();         // Resume processing and perform single rebuild
    WireResult wireNode(ChainNode& node, NodeID audioIn);
    WireResult wireSerialGroup(ChainNode& node, NodeID audioIn);
    WireResult wireParallelGroup(ChainNode& node, NodeID audioIn);

    // Helper: wire a single-channel M/S plugin (MidOnly or SideOnly)
    // processChannel = which encode output the plugin processes (0=mid, 1=side)
    // bypassChannel  = which encode output bypasses the plugin (1=side, 0=mid)
    void wireMidSidePlugin(PluginLeaf& leaf, NodeID encodeNodeId, NodeID pluginNodeId,
                           NodeID decodeNodeId, int processChannel, int bypassChannel,
                           int pluginLatency);

    void removeUtilityNodes(UpdateKind update = UpdateKind::sync);
    void notifyChainChanged();

    // Helper to check if a node is in a parallel group
    bool isInParallelGroup(ChainNodeId id) const;

    // Cycle detection in the audio graph
    bool detectCycles() const;

    // Latency helpers
    int computeNodeLatency(const ChainNode& node, int depth = 0) const;

    // Serialization helpers
    void nodeToXml(const ChainNode& node, juce::XmlElement& parent) const;
    std::unique_ptr<ChainNode> xmlToNode(const juce::XmlElement& xml);
    juce::var nodeToJson(const ChainNode& node) const;
    juce::var nodeToJsonWithPresets(const ChainNode& node) const;
    std::unique_ptr<ChainNode> jsonToNode(const juce::var& json);

    // Apply pending parameters from seeded chains (semantic match + fuzzy fallback)
    void applyPendingParameters(juce::AudioProcessor* processor,
                                const std::vector<PendingParameter>& pending,
                                const juce::String& pluginName,
                                const juce::String& manufacturer);

    // Temporary accumulator for per-slot failures during importChainWithPresets
    std::vector<SlotFailure> importFailures;
    int importSlotCounter = 0;

    // Flat index helpers (for backward compat)
    PluginLeaf* getPluginByFlatIndex(int index);
    const PluginLeaf* getPluginByFlatIndex(int index) const;
    ChainNodeId getNodeIdByFlatIndex(int index) const;

    PluginManager& pluginManager;

    // Plugin parameter watcher for undo/redo of child plugin knob changes
    std::unique_ptr<PluginParameterWatcher> parameterWatcher;

    // The tree root — always a Serial group
    ChainNode rootNode;
    ChainNodeId nextNodeId = 1;

    // Utility nodes added during graph wiring (cleaned up on rebuild)
    std::set<NodeID> utilityNodes;

    // Cached flat plugin slots for backward compat getSlot() API
    mutable std::vector<std::unique_ptr<PluginSlot>> cachedSlots;
    mutable bool cachedSlotsDirty = true;
    void rebuildCachedSlots() const;

    // PHASE 3: Preallocated meter readings cache (eliminates 30Hz allocation)
    mutable std::vector<NodeMeterData> cachedMeterReadings;

    // Cached PluginWithMeterWrapper pointers — avoids DFS + dynamic_cast in processBlock and getNodeMeterReadings
    std::vector<std::pair<ChainNodeId, class PluginWithMeterWrapper*>> cachedMeterWrappers;
    void updateMeterWrapperCache();

    // PHASE 5: Latency caching (eliminates redundant O(N) tree traversals)
    mutable std::atomic<int> cachedTotalLatency{0};
    mutable std::atomic<bool> latencyCacheDirty{true};
    void invalidateLatencyCache();

    NodeID audioInputNode;
    NodeID audioOutputNode;

    // Sidechain buffer from host (set before processBlock, not owned)
    juce::AudioBuffer<float>* externalSidechainBuffer = nullptr;

    double currentSampleRate = 44100.0;
    int currentBlockSize = 512;

    std::shared_ptr<std::atomic<bool>> aliveFlag { std::make_shared<std::atomic<bool>>(true) };

    // Mutex for state serialization (prevents concurrent saves)
    mutable std::mutex stateMutex;

    // Plugin window management
    class PluginWindow;
    juce::OwnedArray<PluginWindow> pluginWindows;

    // Thread safety: SpinLock protects the tree during mutations
    mutable juce::SpinLock treeLock;

    // Audio-thread-busy flag — set by processBlock, cleared on exit.
    std::atomic<bool> audioThreadBusy{false};

    // Deferred rebuild — coalesces rapid graph mutations into a single rebuild
    std::atomic<bool> rebuildNeeded{false};
    std::atomic<bool> rebuildScheduled{false};

    // Batch API — suppresses individual rebuilds during multi-operation sequences
    int batchDepth{0};  // Nesting counter (message thread only)

    // Set by the audio thread when any hosted plugin reports a latency change.
    // Polled by the message thread (WebViewBridge timer) to trigger graph rebuild.
    std::atomic<bool> latencyRefreshNeeded{false};

    // Crash recovery state - throttling and background save tracking
    std::atomic<bool> pendingCrashRecoverySave{false};
    std::atomic<int64_t> lastCrashRecoverySaveTime{0};
    static constexpr int64_t kMinCrashRecoverySaveIntervalMs = 2000; // Max once per 2 seconds

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ChainProcessor)
};
