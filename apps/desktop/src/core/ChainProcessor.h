#pragma once

#include "../audio/PluginParameterWatcher.h"
#include "ChainNode.h"
#include "PluginManager.h"
#include "PluginSlot.h"
#include <functional>
#include <juce_audio_processors/juce_audio_processors.h>
#include <memory>
#include <set>
#include <vector>

struct WireResult {
  juce::AudioProcessorGraph::NodeID audioOut;
  int latency = 0; // Total latency (samples) of the wired subtree
};

class ChainProcessor : public juce::AudioProcessorGraph {
public:
  ChainProcessor(PluginManager &pluginManager);
  ~ChainProcessor() noexcept override;

  // =============================================
  // Meter Mode (PHASE 2: Conditional Metering)
  // =============================================

  enum class MeterMode {
    PeakOnly, // Peak/RMS only, skip LUFS calculation (low CPU)
    FullLUFS  // Full LUFS calculation (default)
  };

  void setGlobalMeterMode(MeterMode mode);

  // =============================================
  // Tree-based API (new)
  // =============================================

  // Add a plugin to a specific parent group at a given index
  bool addPlugin(const juce::PluginDescription &desc, ChainNodeId parentId,
                 int insertIndex);

  // Add an empty dry path branch to a parallel group
  ChainNodeId addDryPath(ChainNodeId parentId, int insertIndex = -1);

  // Remove any node by ID (plugin or group)
  bool removeNode(ChainNodeId nodeId);

  // Move a node to a new parent at a new index
  bool moveNode(ChainNodeId nodeId, ChainNodeId newParentId, int newIndex);

  // Group operations
  ChainNodeId createGroup(const std::vector<ChainNodeId> &childIds,
                          GroupMode mode, const juce::String &name);
  bool dissolveGroup(ChainNodeId groupId);
  bool setGroupMode(ChainNodeId groupId, GroupMode mode);
  bool setGroupDryWet(ChainNodeId groupId, float mix);
  bool setGroupWetGain(ChainNodeId groupId, float gainDb);
  bool setGroupDucking(ChainNodeId groupId, bool enabled, float thresholdDb,
                       float attackMs, float releaseMs);

  // Per-branch controls
  bool setBranchGain(ChainNodeId nodeId, float gainDb);
  bool setBranchMute(ChainNodeId nodeId, bool mute);
  bool setBranchSolo(ChainNodeId nodeId, bool solo);

  // FX Selector: switch active branch (crossfades via SmoothedValue — no
  // rebuild)
  bool setActiveBranch(ChainNodeId groupId, int branchIndex);

  // Per-plugin controls (gain staging, dry/wet, sidechain)
  bool setNodeInputGain(ChainNodeId nodeId, float gainDb);
  bool setNodeOutputGain(ChainNodeId nodeId, float gainDb);
  bool setNodeDryWet(ChainNodeId nodeId, float mix);
  bool setNodeMidSideMode(ChainNodeId nodeId, int mode);

  // Per-plugin auto-gain compensation
  bool setNodeAutoGain(ChainNodeId nodeId, bool enabled);
  bool getNodeAutoGain(ChainNodeId nodeId) const;

  // Set bypass on a node (plugin leaf or group)
  void setNodeBypassed(ChainNodeId nodeId, bool bypassed);

  // Get the root node for read access
  const ChainNode &getRootNode() const { return rootNode; }

  // Insert a pre-built node tree (for group templates)
  ChainNodeId insertNodeTree(std::unique_ptr<ChainNode> node,
                             ChainNodeId parentId, int insertIndex);

  // DFS-ordered list of all plugin leaves (for proxy parameter binding)
  std::vector<PluginLeaf *> getFlatPluginList();
  std::vector<const PluginLeaf *> getFlatPluginList() const;

  // DFS-ordered list of ChainNodeIds for plugin leaves (parallel to
  // getFlatPluginList)
  std::vector<ChainNodeId> getFlatPluginNodeIds() const;

  // =============================================
  // Backward-compatible flat API (delegates to tree)
  // =============================================

  bool addPlugin(const juce::PluginDescription &desc, int insertIndex = -1);
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

  // Toggle all plugins bypassed: if ANY are active, bypass all. If ALL are
  // bypassed, enable all.
  void toggleAllBypass();
  // Explicit set all bypass state
  void setAllBypass(bool bypassed);

  struct BypassState {
    bool allBypassed = false;
    bool anyBypassed = false;
  };
  BypassState getBypassState() const;

  // Note: showPluginWindow/hidePluginWindow accept both node IDs and slot
  // indices since ChainNodeId == int. The flat-index-based callers resolve to
  // the same overload.

  // Chain info
  int getNumSlots() const;
  const PluginSlot *getSlot(int index) const;
  PluginSlot *getSlot(int index);

  // Per-node meter data collection (called by WebViewBridge timer)
  struct NodeMeterData {
    ChainNodeId nodeId;
    float peakL, peakR, peakHoldL, peakHoldR;                     // output peak
    float rmsL, rmsR;                                             // output RMS
    float inputPeakL, inputPeakR, inputPeakHoldL, inputPeakHoldR; // input peak
    float inputRmsL, inputRmsR;                                   // input RMS
    float latencyMs; // latency in milliseconds
    float inputLufs = -100.0f;   // Input short-term LUFS
    float outputLufs = -100.0f;  // Output short-term LUFS
  };
  const std::vector<NodeMeterData> &getNodeMeterReadings() const;
  void resetAllNodePeaks();

  // Duplicate a plugin node (inserts copy right after the original)
  bool duplicateNode(ChainNodeId nodeId);

  // Tail length (max across all hosted plugins)
  double getTotalTailLengthSeconds() const;

  // Latency reporting
  int getTotalLatencySamples() const;

  // PHASE 7: Force latency refresh (for plugins like Auto-Tune that change
  // latency dynamically) Call this after toggling plugin settings that affect
  // latency
  void refreshLatencyCompensation();

  // Check if the audio thread is currently inside processBlock
  bool isAudioThreadBusy() const {
    return audioThreadBusy.load(std::memory_order_acquire);
  }

  // Check if the graph is currently being rebuilt (prevents reading stale tree
  // data)
  bool isRebuilding() const { return isRebuilding_; }

  // Check/clear the latency refresh flag (set by audio thread, polled by
  // message thread)
  bool needsLatencyRefresh() const {
    return latencyRefreshNeeded.load(std::memory_order_acquire);
  }
  void clearLatencyRefreshFlag() {
    latencyRefreshNeeded.store(false, std::memory_order_relaxed);
  }

  // Check if the tree is being modified (rootNode.children cleared/repopulated)
  bool isTreeModificationInProgress() const {
    return treeModificationInProgress_;
  }

  // Remove all connections and nodes, then rebuild the (now-empty) render
  // sequence. Used by the destructor to make the graph inert before member
  // destruction.
  void clearGraph();

  // State (serialization)
  juce::var getChainStateAsJson() const;
  void getStateInformation(juce::MemoryBlock &destData) override;
  void setStateInformation(const void *data, int sizeInBytes) override;

  // Cross-format substitution tracking (e.g. VST3 saved → AU loaded)
  struct FormatSubstitution {
    juce::String pluginName;
    juce::String savedFormat;
    juce::String loadedFormat;
    bool hasPresetData =
        false; // true when substitution occurred and preset data was non-empty
  };

  // Preset-level tree serialization (used by PresetManager)
  struct RestoreResult {
    bool success = false;
    juce::StringArray missingPlugins;
    std::vector<FormatSubstitution> formatSubstitutions;
  };
  std::unique_ptr<juce::XmlElement> serializeChainToXml() const;
  RestoreResult restoreChainFromXml(const juce::XmlElement &chainXml);
  juce::MemoryBlock captureSnapshot() const;
  void restoreSnapshot(const juce::MemoryBlock &snapshot);

  // Cloud sharing
  juce::var exportChainWithPresets() const;

  struct SlotFailure {
    int position;
    juce::String pluginName;
    juce::String reason; // "not_found", "load_error", "preset_error"
  };

  struct ImportResult {
    bool success = false;
    int totalSlots = 0;
    int loadedSlots = 0;
    int failedSlots = 0;
    std::vector<SlotFailure> failures;
    std::vector<FormatSubstitution> formatSubstitutions;
  };

  ImportResult importChainWithPresets(const juce::var &data);
  juce::String getSlotPresetData(int slotIndex) const;
  bool setSlotPresetData(int slotIndex, const juce::String &base64Data);

  // Prepare/release/processBlock
  void prepareToPlay(double sampleRate, int samplesPerBlock) override;
  void releaseResources() override;
  void processBlock(juce::AudioBuffer<float> &buffer,
                    juce::MidiBuffer &midi) override;

  // Access child processor by flat slot index (backward compat)
  juce::AudioProcessor *getSlotProcessor(int slotIndex);

  // Access child processor by node ID
  juce::AudioProcessor *getNodeProcessor(ChainNodeId nodeId);

  // Access plugin manager
  PluginManager &getPluginManager() { return pluginManager; }

  // Callbacks
  std::function<void()> onChainChanged;
  std::function<void(int)> onLatencyChanged;
  std::function<void()> onParameterBindingChanged;
  std::function<void()> onBeforeDeletePlugin;
  std::function<void(int)>
      onUnbindSlot; // Called after duplication to clear automation

  /** Fired when child plugin parameters settle after user edits.
   *  Argument is the Base64 snapshot from *before* the parameter changes. */
  std::function<void(const juce::String &beforeSnapshotBase64)>
      onPluginParameterChangeSettled;

  /** Suppress/unsuppress parameter watcher (use during undo/redo restores). */
  void setParameterWatcherSuppressed(bool suppressed);

  /** Clear parameter watcher listeners. Must be called before destroying hosted
   * plugins so that clearWatches() doesn't call removeListener() on dangling
   * parameter pointers. */
  void clearParameterWatches();

private:
  // Crash recovery - async state persistence
  juce::File getCrashRecoveryFile() const;
  void saveCrashRecoveryStateAsync();
  // Best-effort serialization without suspendProcessing() — safe for crash
  // recovery and undo snapshots where a brief data race with processBlock() is
  // acceptable.
  void serializeStateNoSuspend(juce::MemoryBlock &destData);
  void performCrashRecoverySave(const juce::MemoryBlock &stateData);
  bool tryRestoreCrashRecoveryState();
  void cleanupCrashRecoveryFile();
  // fullPrepare=false (topology change): only new/utility nodes get
  // prepareToPlay — no audio dip fullPrepare=true  (SR/block-size change via
  // prepareToPlay): all nodes get prepareToPlay
  void rebuildGraph(bool fullPrepare = false);
  void scheduleRebuild(); // Deferred rebuild — coalesces rapid changes into
                          // single rebuild
  void
  beginBatch();    // Suspend processing and suppress rebuilds until endBatch()
  void endBatch(); // Resume processing and perform single rebuild
  WireResult wireNode(ChainNode &node, NodeID audioIn, int depth = 0);
  WireResult wireSerialGroup(ChainNode &node, NodeID audioIn, int depth = 0);
  WireResult wireParallelGroup(ChainNode &node, NodeID audioIn, int depth = 0);
  WireResult wireMidSideGroup(ChainNode &node, NodeID audioIn, int depth = 0);
  WireResult wireFXSelectorGroup(ChainNode &node, NodeID audioIn,
                                 int depth = 0);

  // Helper: wire a single-channel M/S plugin (MidOnly or SideOnly)
  // processChannel = which encode output the plugin processes (0=mid, 1=side)
  // bypassChannel  = which encode output bypasses the plugin (1=side, 0=mid)
  void wireMidSidePlugin(PluginLeaf &leaf, NodeID encodeNodeId,
                         NodeID pluginNodeId, NodeID decodeNodeId,
                         int processChannel, int bypassChannel,
                         int pluginLatency);

  void removeUtilityNodes(UpdateKind update = UpdateKind::sync);
  void notifyChainChanged();
  void notifyParameterChanged();  // Lightweight: crash-recovery only, no UI state push

  // Helper to check if a node is in a parallel group
  bool isInParallelGroup(ChainNodeId id) const;

  // Helper: compute and apply the effective BranchGainProcessor gain for a
  // branch node, taking into account solo (any branch in parent soloed?) and
  // mute state. parentGroup must be the parent parallel GroupData. branchIndex
  // is the child index.
  void applyBranchEffectiveGain(ChainNode &branch, int branchIndex,
                                GroupData &parentGroup);

  // Cycle detection in the audio graph
  bool detectCycles() const;

  // Latency helpers
  int computeNodeLatency(const ChainNode &node, int depth = 0) const;

  // Serialization helpers
  void nodeToXml(const ChainNode &node, juce::XmlElement &parent,
                 int depth = 0) const;
  std::unique_ptr<ChainNode> xmlToNode(const juce::XmlElement &xml,
                                       int depth = 0);
  juce::var nodeToJson(const ChainNode &node, int depth = 0) const;
  juce::var nodeToJsonWithPresets(const ChainNode &node, int depth = 0) const;
  std::unique_ptr<ChainNode> jsonToNode(const juce::var &json, int depth = 0);

  // Collect candidates for cross-format plugin matching (3-tier + catalog)
  std::vector<juce::PluginDescription>
  collectFormatCandidates(const juce::PluginDescription &desc) const;

  // Apply pending parameters from seeded chains (semantic match + fuzzy
  // fallback)
  void applyPendingParameters(juce::AudioProcessor *processor,
                              const std::vector<PendingParameter> &pending,
                              const juce::String &pluginName,
                              const juce::String &manufacturer);

  // Temporary accumulator for per-slot failures during importChainWithPresets
  std::vector<SlotFailure> importFailures;
  std::vector<FormatSubstitution> importFormatSubstitutions;
  int importSlotCounter = 0;

  // Flat index helpers (for backward compat)
  PluginLeaf *getPluginByFlatIndex(int index);
  const PluginLeaf *getPluginByFlatIndex(int index) const;
  ChainNodeId getNodeIdByFlatIndex(int index) const;

  PluginManager &pluginManager;

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

  // Cached PluginWithMeterWrapper pointers — avoids DFS + dynamic_cast in
  // processBlock and getNodeMeterReadings. Double-buffered:
  // updateMeterWrapperCache() writes to the back buffer then atomically swaps
  // the index. Readers (processBlock on audio thread, getNodeMeterReadings on
  // message thread) always read the front buffer.
  struct MeterWrapperEntry {
    ChainNodeId nodeId;
    class PluginWithMeterWrapper *wrapper;
    bool bypassed;
  };
  std::vector<MeterWrapperEntry> meterWrapperBuffers[2];
  std::atomic<int> meterWrapperReadIndex{
      0}; // Index of the buffer currently safe to read
  void updateMeterWrapperCache();

  // PHASE 5: Latency caching (eliminates redundant O(N) tree traversals)
  mutable std::atomic<int> cachedTotalLatency{0};
  mutable std::atomic<bool> latencyCacheDirty{true};
  void invalidateLatencyCache();

  NodeID audioInputNode;
  NodeID audioOutputNode;

  double currentSampleRate = 44100.0;
  int currentBlockSize = 512;

  std::shared_ptr<std::atomic<bool>> aliveFlag{
      std::make_shared<std::atomic<bool>>(true)};

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
  int batchDepth{0}; // Nesting counter (message thread only)

  // Set by the audio thread when any hosted plugin reports a latency change.
  // Polled by the message thread (WebViewBridge timer) to trigger graph
  // rebuild.
  std::atomic<bool> latencyRefreshNeeded{false};

  // Re-entrancy guard for rebuildGraph().
  // Prevents recursive graph rebuilds when setLatencySamples() causes the DAW
  // to call prepareToPlay() synchronously from within rebuildGraph().
  bool isRebuilding_{false};
  bool rebuildAgainAfterCurrent_{false};

  // Tree modification guard.
  // Set during setStateInformation / importChainWithPresets /
  // restoreChainFromXml to prevent the latency-refresh timer from triggering a
  // rebuild while rootNode.children is being cleared and repopulated. On macOS,
  // AU plugin instantiation (AudioComponentInstanceNew) can pump the run loop,
  // which allows timer callbacks to fire mid-operation and see a
  // partially-built tree.
  bool treeModificationInProgress_{false};

  // RAII guard that sets treeModificationInProgress_ on construction and
  // clears it on destruction, ensuring the flag is always reset even if an
  // exception or early return occurs during tree modification.
  struct TreeModificationGuard {
    explicit TreeModificationGuard(bool &flag) : flag_(flag) { flag_ = true; }
    ~TreeModificationGuard() { flag_ = false; }
    TreeModificationGuard(const TreeModificationGuard &) = delete;
    TreeModificationGuard &operator=(const TreeModificationGuard &) = delete;

  private:
    bool &flag_;
  };

  // Diagnostic: tracks which code path triggered the last rebuildGraph() call.
  const char *lastRebuildCaller_{"init"};

  // Crash recovery state - throttling and background save tracking
  std::atomic<bool> pendingCrashRecoverySave{false};
  std::atomic<int64_t> lastCrashRecoverySaveTime{0};
  static constexpr int64_t kMinCrashRecoverySaveIntervalMs =
      2000; // Max once per 2 seconds

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ChainProcessor)
};
