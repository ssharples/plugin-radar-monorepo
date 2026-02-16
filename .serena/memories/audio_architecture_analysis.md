# Audio Processing & Bridge Architecture Analysis

## 1. MUTE vs BYPASS IMPLEMENTATION

### Bypass (Plugin Level)
- **What it does**: Completely disconnects a plugin from the audio graph
- **Implementation**: `ChainProcessor::setNodeBypassed(ChainNodeId, bool)`
  - Sets `PluginLeaf::bypassed = true/false`
  - Calls `rebuildGraph()` to rewire the audio graph
  - During wiring in `wireNode()`:
    - **Serial groups**: Bypassed plugins pass signal through (passthrough connection)
    - **Parallel groups**: Bypassed plugins disconnect entirely (no connection) = silent
  - **Latency impact**: Bypassed plugins report ZERO latency (line: "if (node.getPlugin().bypassed) return 0;")
  - **CPU impact**: Zero (fully disconnected from graph)
  - **Graph rebuild required**: YES (expensive operation, ~100-500ms for large chains)

### Mute (Branch/Node Level)
- **What it does**: Silences a node but keeps it in the audio graph
- **Implementation**: `ChainProcessor::setBranchMute(ChainNodeId, bool)`
  - Sets `ChainNode::mute` atomic<bool>
  - Calls `rebuildGraph()` to apply the silencing
  - Currently stored on ChainNode but effect during wiring unclear from current grep
  - Likely affects `BranchGainProcessor` coefficient (similar to solo logic)
- **Latency impact**: Plugin still processes, so latency INCLUDED
- **CPU impact**: Still running the DSP (slight savings from gain=0 optimization)
- **Graph rebuild required**: YES (to propagate to BranchGainProcessor)

### Solo (Parallel Branch Only)
- **What it does**: When ANY branch is soloed, only soloed branches pass through
- **Implementation**: Checked in `wireParallelGroup()` - sets branch gain to 0 for non-soloed branches
- **Status**: Only works in parallel groups (makes sense for stereo mixing)

---

## 2. METERING ARCHITECTURE

### Overview
Lock-free thread-safe metering system with input/output peak, RMS, and LUFS measurement.

### Main Components

#### AudioMeter Class
- **Location**: `apps/desktop/src/audio/AudioMeter.h/cpp`
- **Thread safety**: All reads use `std::atomic<float>` with `memory_order_relaxed`
- **Outputs** (via `getReadings()`):
  - `peakL, peakR`: Current instantaneous peak (linear 0-1+)
  - `peakHoldL, peakHoldR`: Peak hold with configurable decay
  - `rmsL, rmsR`: RMS via exponential moving average (~300ms time constant)
  - `lufsShort`: Short-term LUFS integrated over 3s window (ITU-R BS.1770-4)

**Metering Modes** (PHASE 2):
- `PeakOnly`: Fast mode - peak/RMS only, skip LUFS calculation
- `FullLUFS`: Default - includes ITU-R K-weighted LUFS

**Peak Detection**:
- Instant attack on block peak
- Configurable hold time (default 1.5s)
- Decay rate (default 20 dB/s) using FastMath lookup table

**LUFS Calculation** (PHASE 1 optimization):
- K-weighted via 2-stage biquad filter (ITU-R BS.1770-4 coefficients)
- 3s short-term window via ring buffer
- Incremental calculation: O(1) per sample using running sums
- Formula: `LUFS = -0.691 + 10 * log10(mean_square)`

#### Per-Plugin Metering
- **Location**: `PluginWithMeterWrapper` (PHASE 7 consolidation)
- **Architecture**: Wraps each plugin with integrated input + output meters
- **Benefits**: Reduces node count 3→1 (40-50% reduction for 30-plugin chains: 90 nodes → 48 nodes)
- **Data exposed**: Input/output peak, peakHold for each plugin node

#### Global Input/Output Meters
- **Location**: `PluginProcessor` members `inputMeter`, `outputMeter`
- **Placement**:
  - `inputMeter`: Pre-chain (after input gain, before plugins)
  - `outputMeter`: Post-chain (after plugins, before output gain)
- **Processing order** in `processBlock()`:
  1. Apply input gain
  2. Capture pre-waveform
  3. **Process inputMeter** on input buffer
  4. Process plugin chain
  5. Capture post-waveform
  6. **Process outputMeter** on output buffer
  7. FFT analysis (post-chain, pre-output gain)
  8. Apply output gain

### Metering Data Flow to UI

**Timer Callback** (WebViewBridge, 30Hz):
1. `timerCallback()` runs on message thread
2. Collects meter data:
   - Input/output global meters
   - Per-node meters via `chainProcessor.getNodeMeterReadings()`
   - Waveform peaks (pre/post)
   - FFT magnitudes

3. **Emission**: `emitEvent("meterData", {...})` → JavaScript
   - Input: peakL, peakR, peakHoldL, peakHoldR, rmsL, rmsR, lufsShort
   - Output: same fields
   - Node meters: Array of {nodeId: {peakL, peakR, peakHoldL, peakHoldR, inputPeakL, inputPeakR, inputPeakHoldL, inputPeakHoldR}}

**WebViewBridge Native Functions**:
- `getNodeMeterReadings()`: Collects from all plugin wrappers via DFS traversal
- Each node returns `NodeMeterData` struct with input/output peaks

---

## 3. LATENCY COMPENSATION

### Latency Calculation

**Total Latency Computation**:
- `ChainProcessor::getTotalLatencySamples()` (cached)
- `computeNodeLatency(node, depth)` recursive traversal

**Rules**:
1. **Bypassed plugins**: Return ZERO latency (not in signal path)
2. **Serial groups**: SUM of all children's latencies (sequential processing)
3. **Parallel groups**: MAXIMUM of all children's latencies (branches run in parallel)
4. **Plugin nodes**: Call `plugin->getLatencySamples()` from wrapped AudioPluginInstance

**Example**:
```
Serial [
  Plugin A (10ms) → Plugin B (5ms)  = 15ms total
]
in Parallel [
  Branch 1: Plugin C (20ms)
  Branch 2: Plugin D (5ms)
] = max(20ms, 5ms) = 20ms total
```

### Latency Compensation in Parallel Routing

**Purpose**: Align branches with different latencies at the sum point

**Implementation** in `wireParallelGroup()`:
1. Wire each branch with its gain processor
2. Collect latencies: `branchLatency = computeNodeLatency(*child)`
3. Find max latency across all branches
4. For branches shorter than max: insert `LatencyCompensationProcessor` delay node
5. Connect shorter branches through delay before sum point

**LatencyCompensationProcessor**:
- Uses `juce::dsp::DelayLine<float>` for fixed-sample delay
- Reports delay as latency to the graph
- Thread-safe: Only written once during `prepareToPlay()`

### Caching (PHASE 5)
- `cachedTotalLatency`: Atomic<int> stores last computed value
- `latencyCacheDirty`: Atomic<bool> flag
- Invalidated when: graph rebuilt, plugin added/removed/bypassed
- Validation: Check flag before recomputing (eliminates O(N) tree traversal every 500ms)

### Dry/Wet Latency Handling
- **Dry path**: If wet path has latency, insert delay on dry path to align
- **Formula**: Both paths meet at sum point with zero relative delay

---

## 4. DRY/WET PROCESSING

### DryWetMixProcessor Architecture

**Channel Layout** (4-in, 2-out):
- Input channels 0-1: Dry signal (L/R)
- Input channels 2-3: Wet signal (L/R)
- Output channels 0-1: Mixed result (L/R)

**Mix Control**:
- Range: 0.0 (100% dry) → 1.0 (100% wet)
- Formula: `output = dry * (1-mix) + wet * mix`

**Implementation**:
- Atomic<float> `mix` for UI thread writes
- `SmoothedValue<float>` for 20ms crossfade ramp (click-free)
- Processing path:
  - If smoothing in progress: Per-sample interpolation
  - If constant: SIMD vectorized via `FloatVectorOperations` (2-3x speedup)

**PHASE 8 Optimization**:
- Non-smoothing path uses JUCE SIMD:
  - `FloatVectorOperations::copy()` + `multiply()` + `addWithMultiply()`
  - Leverages SSE/AVX when available

### Serial Group Dry/Wet Pattern

Used when `node.id != 0` AND `group.dryWetMix < 0.999f`

**Wiring**:
1. Create `DryWetMixProcessor` node
2. Dry path: Input → (optional delay if wet has latency) → DryWetMixProcessor
3. Wet path: Input → Serial children chain → DryWetMixProcessor
4. Output: From DryWetMixProcessor

**Not used for root node** (always 100% processed signal)

---

## 5. WEBVIEWBRIDGE METERING METHODS

**Native Functions Exposed**:
- `getTotalLatencySamples()`: Returns samples (UI must convert to ms)
- `getChainState()`: Includes chain tree structure
- `startWaveformStream()` / `stopWaveformStream()`: Enables timer
- `setInputGain()` / `setOutputGain()`: dB values
- `getGainSettings()`: Returns current dB values

**Events Emitted** (Timer-driven, 30Hz):
- `"meterData"`: Global input/output meters
- `"nodeMeterData"`: Per-plugin node meters
- `"fftData"`: Spectrum analyzer data
- `"waveformData"`: Pre/post-chain peaks

**Match Lock Feature**:
- Automatically adjusts output gain to match input metering
- Controlled via `setMatchLock(bool)` native function
- Runs continuously in timer if enabled

---

## 6. AUDIO PROCESSING FLOW (PluginProcessor)

**Order in processBlock()**:
```
Input buffer (stereo, from DAW)
   ↓
1. gainProcessor.processInputGain() [0dB by default]
   ↓
2. waveformCapture.pushPreSamples() [store pre-chain peaks]
3. inputMeter.process() [measure input]
   ↓
4. chainProcessor.processBlock() [main plugin chain]
   ↓
5. waveformCapture.pushPostSamples() [store post-chain peaks]
6. outputMeter.process() [measure output]
   ↓
7. fftProcessor.process() [spectrum analysis]
   ↓
8. gainProcessor.processOutputGain() [0dB by default]
   ↓
Output buffer (stereo, to DAW)
```

**Note**: FFT happens POST-chain but BEFORE output gain (shows chain effect)

---

## 7. KNOWN OPTIMIZATIONS & PHASES

| Phase | Optimization | Impact |
|-------|---------------|--------|
| PHASE 1 | Incremental LUFS calculation (running sums) | 866M ops/s → 2.9M ops/s |
| PHASE 2 | Conditional LUFS metering (skip if disabled) | 10-20% CPU savings |
| PHASE 3 | Meter reading cache pre-allocation | Eliminates 30Hz allocations |
| PHASE 4 | FastMath dB/linear lookup table | 10-20x faster peak decay |
| PHASE 5 | Latency caching (atomic flag) | Eliminates O(N) tree traversals |
| PHASE 7 | Plugin wrapper consolidation (3 nodes → 1) | 40-50% node count reduction |
| PHASE 8 | SIMD vectorization for constant dry/wet | 2-3x speedup when not smoothing |

---

## 8. KEY CONSTRAINTS & GOTCHAS

### Bypass vs Mute
- **Bypass**: Zero latency, zero CPU, full graph rewire
- **Mute**: Full latency, still processes, silenced via gain
- **Choice**: Use bypass for disabled plugins (saves CPU), use mute for temporary silencing

### Latency Reporting
- **Units**: Always SAMPLES, never ms (conversion: `ms = samples / sampleRate * 1000`)
- **Dynamic updates**: Call `refreshLatencyCompensation()` after plugin mode changes (e.g., Auto-Tune)
- **Parallel alignment**: Automatically handled; shorter branches get delay compensation

### Metering Thread Safety
- **Lock-free**: All meter reads use atomics with `memory_order_relaxed`
- **No mutex overhead**: Suitable for real-time audio thread
- **UI thread**: Can safely call `getReadings()` from 30Hz timer

### DryWet Crossfading
- **Always 20ms smooth ramp** (click-free)
- **Root node**: Ignores dry/wet setting (always 100% wet/processed)
- **Only for Serial groups**: Parallel groups use per-branch mute

---

## 9. MUTING IN PARALLEL GROUPS

**Solo Logic** (from `wireParallelGroup()`):
```cpp
bool anySoloed = false;
for (const auto& child : children)
  if (child->solo)
    anySoloed = true;

// Later, for each branch:
if (anySoloed && !child->solo)
  branchGain = 0.0f;  // Mute non-soloed branches
else
  branchGain = branch.branchGainDb;
```

**Mute Logic**: Similar mechanism via `node.mute` atomic
- Likely sets branch gain to -inf dB during graph rebuild
- Keeps plugin active but output silenced

---

## 10. BRIDGE DATA STRUCTURES

**NodeMeterData** (from ChainProcessor):
```cpp
struct NodeMeterData {
  ChainNodeId nodeId;
  float peakL, peakR, peakHoldL, peakHoldR;              // output
  float inputPeakL, inputPeakR, inputPeakHoldL, inputPeakHoldR;  // input
};
```

**Emitted as JSON** via `emitEvent("nodeMeterData", {...})`

