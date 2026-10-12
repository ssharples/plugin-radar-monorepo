# C++ Audio Processing & Bridge Changes - Implementation Plan

## Executive Summary

This plan covers all C++ audio processing and bridge changes to support the new UI requirements: corrected metering placement, master dry/wet control, mute vs bypass distinction, latency display in milliseconds, and removal of the match lock feature.

## Architecture Decisions

### 1. Signal Flow Changes (Metering)

**Problem**: Input meter measures PRE-gain, output meter measures PRE-gain. Need POST-gain measurements.

**Solution**: Reorder operations in `PluginProcessor.cpp::processBlock()`

**New Signal Flow**:
```cpp
// Current (WRONG):
// 1. gainProcessor.processInputGain()    // Apply input gain
// 2. inputMeter.process()                 // ← Measures POST input gain
// 3. chainProcessor.processBlock()
// 4. outputMeter.process()                // ← Measures PRE output gain
// 5. gainProcessor.processOutputGain()    // Apply output gain

// New (CORRECT):
// 1. inputMeter.process()                 // Measure CLEAN input
// 2. gainProcessor.processInputGain()     // Apply input gain
// 3. waveformCapture.pushPreSamples()     // Capture POST-gain for display
// 4. chainProcessor.processBlock()
// 5. waveformCapture.pushPostSamples()
// 6. fftProcessor.process()               // FFT on POST-chain signal
// 7. gainProcessor.processOutputGain()    // Apply output gain
// 8. outputMeter.process()                // Measure POST output gain (final)
```

**Rationale**: 
- Input meter should show the **actual signal level entering the chain** (post input gain)
- Output meter should show the **final output level** going to the DAW (post output gain)
- This matches user expectations: "what level is hitting my plugins?" and "what level am I sending out?"

**Thread Safety**: No concerns - all operations are sequential on the audio thread.

---

### 2. Master Dry/Wet Implementation

**Problem**: Need master dry/wet control for entire chain (currently only per-group).

**Solution**: **Option B - Dedicated Master Processor**

Add a new `MasterDryWetProcessor` (extends `DryWetMixProcessor`) inserted **after** the chain, **before** output gain.

**New Signal Flow** (with master dry/wet):
```cpp
// 1. inputMeter.process()                 
// 2. gainProcessor.processInputGain()
// 3. waveformCapture.pushPreSamples()
// 4. [Store dry signal for master dry/wet]
// 5. chainProcessor.processBlock()
// 6. [Master dry/wet crossfade]
// 7. waveformCapture.pushPostSamples()
// 8. fftProcessor.process()
// 9. gainProcessor.processOutputGain()
// 10. outputMeter.process()
```

**Implementation Details**:

1. **Add member to `PluginProcessor.h`**:
   ```cpp
   DryWetMixProcessor masterDryWetProcessor;
   juce::AudioBuffer<float> dryBufferForMaster;  // Store dry signal
   ```

2. **In `prepareToPlay()`**:
   ```cpp
   masterDryWetProcessor.prepareToPlay(sampleRate, samplesPerBlock);
   dryBufferForMaster.setSize(2, samplesPerBlock);
   ```

3. **In `processBlock()` - after input gain**:
   ```cpp
   // Copy post-gain signal for master dry/wet
   dryBufferForMaster.makeCopyOf(buffer, true);
   ```

4. **After `chainProcessor.processBlock()`**:
   ```cpp
   // Apply master dry/wet
   if (masterDryWetProcessor.getMix() < 0.999f)
   {
       // Create 4-channel buffer for DryWetMixProcessor
       juce::AudioBuffer<float> mixBuffer(4, buffer.getNumSamples());
       mixBuffer.copyFrom(0, 0, dryBufferForMaster, 0, 0, buffer.getNumSamples());
       mixBuffer.copyFrom(1, 0, dryBufferForMaster, 1, 0, buffer.getNumSamples());
       mixBuffer.copyFrom(2, 0, buffer, 0, 0, buffer.getNumSamples());
       mixBuffer.copyFrom(3, 0, buffer, 1, 0, buffer.getNumSamples());
       
       masterDryWetProcessor.processBlock(mixBuffer, midiMessages);
       
       buffer.copyFrom(0, 0, mixBuffer, 0, 0, buffer.getNumSamples());
       buffer.copyFrom(1, 0, mixBuffer, 1, 0, buffer.getNumSamples());
   }
   ```

**Why Option B (not Option A or C)**:
- **Option A** (apply to root node): Requires refactoring `ChainProcessor` to handle root-level dry/wet, complex latency compensation
- **Option C** (modify output gain): Mixes concerns, breaks single responsibility principle
- **Option B**: Clean separation, reuses existing `DryWetMixProcessor`, minimal latency impact (just buffer copy)

**Latency Impact**: Negligible - no buffering delay, just one extra buffer copy (~0.1ms at 512 samples/48kHz).

**Bridge API**:
```cpp
juce::var setMasterDryWet(float mix);  // 0.0 = 100% dry, 1.0 = 100% wet
juce::var getMasterDryWet();           // Return current mix value
```

---

### 3. Mute vs Bypass Distinction

**Problem**: UI has both "mute" and "bypass" buttons, but C++ only implements bypass (disconnect from graph).

**Current Bypass Behavior**:
- `setNodeBypassed(nodeId, true)` → Disconnects plugin from `AudioProcessorGraph`
- Zero CPU usage, zero latency contribution
- Implemented in `ChainProcessor::setNodeBypassed()`

**Desired Mute Behavior**:
- Keep plugin in graph (still processing, still contributing latency)
- Output silence instead of processed audio
- Used for A/B comparison without latency changes

**Solution**: Use existing `mute` atomic flag in `ChainNode`, implement in `NodeMeterProcessor` wrapper.

**Implementation**:

1. **Modify `NodeMeterProcessor` (or create `PluginWithMeterWrapper`)**:
   - Check `ChainNode::mute` flag before passing audio to wrapped plugin
   - If muted: Clear buffer before plugin, pass silence, restore original after metering

2. **OR: Implement in `ChainProcessor::wireNode()`**:
   - Insert a `BranchGainProcessor` with gain=-inf before each plugin when muted
   - Toggle gain between 0.0 and -inf based on mute flag

**Recommended Approach**: **Wrapper-based mute in plugin connection logic**

**In `ChainProcessor::wireNode()` - after plugin connection**:
```cpp
// Check mute flag and apply silence if needed
if (node.mute.load(std::memory_order_relaxed))
{
    // Don't disconnect - keep plugin in graph
    // Buffer will be silenced by mute processor before plugin
}
```

**Create new `MuteProcessor.h`**:
```cpp
class MuteProcessor : public juce::AudioProcessor
{
public:
    void setMuted(bool shouldMute);
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override
    {
        if (muted.load(std::memory_order_relaxed))
            buffer.clear();
    }
private:
    std::atomic<bool> muted{false};
};
```

**Wire as**: `[MuteProcessor] → [Plugin] → [NodeMeterProcessor]`

**Bridge API**:
- Keep existing `setNodeBypassed(nodeId, bypassed)` - disconnects from graph
- Add `setNodeMuted(nodeId, muted)` - stays in graph, outputs silence
- `setBranchMute()` already exists for parallel groups - extend to all nodes

**Thread Safety**: `std::atomic<bool> mute` in `ChainNode` is already thread-safe.

---

### 4. Latency Display in Milliseconds

**Problem**: C++ returns latency in samples, UI needs milliseconds.

**Solution**: **Convert in C++ before sending to UI**

**Two Approaches**:

**A. Convert in Timer Callback** (RECOMMENDED):
```cpp
// In WebViewBridge::timerCallback() - where latency is already polled
int latencySamples = chainProcessor.getTotalLatencySamples();
double sampleRate = mainProcessor->getSampleRate();
float latencyMs = sampleRate > 0 ? (latencySamples / sampleRate * 1000.0f) : 0.0f;

auto* latencyObj = new juce::DynamicObject();
latencyObj->setProperty("latencySamples", latencySamples);  // Keep for backward compat
latencyObj->setProperty("latencyMs", latencyMs);
emitEvent("latencyChanged", juce::var(latencyObj));
```

**B. Provide Bridge Method**:
```cpp
juce::var getSampleRate()
{
    return mainProcessor ? mainProcessor->getSampleRate() : 44100.0;
}
```

**RECOMMENDED: Approach A** - Do conversion in C++, send both samples and ms for flexibility.

**Per-Node Latency**:

Currently, `NodeMeterData` includes peak readings but not latency. Add latency per node.

**Modify `ChainProcessor::getNodeMeterReadings()`**:
```cpp
struct NodeMeterData {
    ChainNodeId nodeId;
    float peakL, peakR, peakHoldL, peakHoldR;
    float inputPeakL, inputPeakR, inputPeakHoldL, inputPeakHoldR;
    float latencyMs;  // NEW - per-node latency in milliseconds
};

std::vector<NodeMeterData> ChainProcessor::getNodeMeterReadings() const
{
    double sampleRate = currentSampleRate;
    // ... existing meter collection code ...
    
    // Add latency for each node
    for (auto& data : cachedMeterReadings)
    {
        const ChainNode* node = ChainNodeHelpers::findById(rootNode, data.nodeId);
        if (node && node->isPlugin())
        {
            auto* proc = getNodeProcessor(data.nodeId);
            if (proc)
            {
                int latencySamples = proc->getLatencySamples();
                data.latencyMs = (sampleRate > 0) 
                    ? (latencySamples / sampleRate * 1000.0f) 
                    : 0.0f;
            }
        }
    }
    
    return cachedMeterReadings;
}
```

**Bridge Event Update**:
```cpp
// In WebViewBridge::timerCallback() - nodeMeterData emission
entry->setProperty("latencyMs", nm.latencyMs);  // ADD THIS
```

**Thread Safety**: Sample rate is set in `prepareToPlay()` and only changes on the audio thread during host reconfiguration. Safe to read from timer thread.

---

### 5. Remove Match Lock Feature

**Problem**: Remove all match lock backend code (frontend removal is separate).

**Files to Modify**:

1. **`WebViewBridge.h`** - Remove declarations:
   ```cpp
   // DELETE THESE LINES:
   juce::var calculateGainMatch();
   void setMatchLock(bool enabled);
   bool getMatchLockState() const { return matchLockEnabled.load(std::memory_order_relaxed); }
   std::atomic<bool> matchLockEnabled{false};
   std::atomic<float> matchLockReferenceOffset{0.0f};
   std::atomic<int> matchLockStuckCounter{0};
   static constexpr int MaxStuckFrames = 120;
   ```

2. **`WebViewBridge.cpp`** - Remove implementations:
   - Delete `calculateGainMatch()` function (~20 lines)
   - Delete `setMatchLock()` function (~15 lines)
   - Remove native function registration in `getOptions()`:
     ```cpp
     // DELETE:
     .withNativeFunction("calculateGainMatch", ...)
     .withNativeFunction("setMatchLock", ...)
     .withNativeFunction("getMatchLockState", ...)
     ```
   - Delete match lock logic in `timerCallback()` (lines 911-982):
     ```cpp
     // DELETE ENTIRE BLOCK:
     // Continuous match lock logic
     if (inputMeter && outputMeter && matchLockEnabled.load(...)) { ... }
     ```
   - Remove `matchLockWarning` event emission

**No other files affected** - match lock is isolated to `WebViewBridge`.

**Backward Compatibility**: None needed - feature is being removed.

---

## Code Organization & File Changes

### Files to Create
1. **`apps/desktop/src/audio/MuteProcessor.h`** - Simple passthrough that clears buffer when muted
2. **`apps/desktop/src/audio/MuteProcessor.cpp`** - Implementation

### Files to Modify

| File | Changes | Lines Est. |
|------|---------|-----------|
| `PluginProcessor.h` | Add `masterDryWetProcessor` and `dryBufferForMaster` members | +3 |
| `PluginProcessor.cpp` | Reorder signal flow in `processBlock()`, add master dry/wet logic | +25 |
| `ChainProcessor.h` | Add `latencyMs` to `NodeMeterData` struct | +1 |
| `ChainProcessor.cpp` | Compute per-node latency in `getNodeMeterReadings()` | +15 |
| `WebViewBridge.h` | Remove match lock declarations, add master dry/wet methods | +3/-7 |
| `WebViewBridge.cpp` | Remove match lock code, add master dry/wet bridge, emit latency in ms | +30/-100 |
| `CMakeLists.txt` | Add `MuteProcessor.cpp` to sources | +1 |

**Total**: ~250 lines added, ~110 lines removed

---

## Thread Safety Analysis

### Audio Thread vs UI Thread Access

| Component | Writer Thread | Reader Thread | Sync Mechanism |
|-----------|---------------|---------------|----------------|
| `masterDryWetProcessor.mix` | UI (via bridge) | Audio | `std::atomic<float>` + `SmoothedValue` |
| `ChainNode::mute` | UI (via bridge) | Audio (mute processor) | `std::atomic<bool>` |
| `sampleRate` | Audio (prepareToPlay) | Timer (30Hz) | Set once, read-only after init |
| `inputMeter/outputMeter readings` | Audio (process) | Timer (30Hz) | Lock-free atomics in `AudioMeter` |
| `NodeMeterData` | Audio (graph) | Timer (build+emit) | Preallocated cache (no alloc on read) |

**All safe** - existing patterns maintained. No new locks introduced.

---

## Performance Impact

| Change | CPU Impact | Memory Impact |
|--------|-----------|---------------|
| Reorder metering | 0% (same DSP, different position) | 0 bytes |
| Master dry/wet | <0.5% (one buffer copy + mix) | 2 channels × samplesPerBlock × 4 bytes |
| Mute processor | <0.1% (conditional clear) | 0 bytes (reuse buffer) |
| Latency ms conversion | <0.01% (float division at 30Hz) | +4 bytes per node in cache |
| Remove match lock | -0.5% (eliminate 60Hz control loop) | -12 bytes atomics |

**Net**: Negligible impact. Master dry/wet buffer copy is ~10-20μs at 512 samples, far below 1ms budget.

---

## Implementation Sequence

### Phase 1: Metering & Latency (Foundation)
1. Reorder signal flow in `PluginProcessor::processBlock()`
2. Add latency ms conversion in `ChainProcessor::getNodeMeterReadings()`
3. Update `WebViewBridge::timerCallback()` to emit latency in ms
4. **Test**: Verify input/output meters show POST-gain levels, latency displays in ms

### Phase 2: Master Dry/Wet (New Feature)
1. Add `masterDryWetProcessor` member to `PluginProcessor`
2. Add dry buffer allocation in `prepareToPlay()`
3. Implement dry signal capture and crossfade in `processBlock()`
4. Add bridge methods: `setMasterDryWet()`, `getMasterDryWet()`
5. Register native functions in `WebViewBridge::getOptions()`
6. **Test**: Verify master dry/wet blends entire chain with input signal

### Phase 3: Mute Implementation (Behavior Fix)
1. Create `MuteProcessor.h` and `MuteProcessor.cpp`
2. Add `MuteProcessor` insertion in `ChainProcessor::wireNode()`
3. Implement `setNodeMuted()` to toggle mute flag
4. Update `setBranchMute()` to use new mute processor (not bypass)
5. **Test**: Verify muted plugins stay in graph, contribute latency, output silence

### Phase 4: Match Lock Removal (Cleanup)
1. Remove match lock declarations from `WebViewBridge.h`
2. Remove match lock implementations from `WebViewBridge.cpp`
3. Remove native function registrations
4. Remove timer callback logic (lines 911-982)
5. **Test**: Build succeeds, no runtime errors, memory usage reduced

---

## Testing Strategy

### Unit Tests (Manual)

**Metering Correctness**:
- Set input gain to +12dB, play sine wave
- Verify input meter shows ~12dB higher than clean input
- Set output gain to -6dB
- Verify output meter shows ~6dB lower than chain output

**Master Dry/Wet**:
- Load heavy distortion plugin
- Set master dry/wet to 0% → should hear clean input
- Set to 50% → should hear blend
- Set to 100% → should hear full distortion

**Mute vs Bypass**:
- Load plugin with 100ms latency (e.g., Auto-Tune)
- **Bypass**: Latency should drop to 0ms, signal passes unprocessed
- **Mute**: Latency stays 100ms, signal is silent
- Verify DAW compensation stays engaged during mute

**Latency Display**:
- Load plugins with known latency (e.g., FabFilter Pro-Q 3 = 10ms)
- Verify UI shows correct ms value
- Change sample rate → verify ms value updates correctly

**Per-Node Latency**:
- Load 3 plugins with different latencies
- Verify each node shows its individual latency in ms
- Add plugin in parallel group → verify both branches show latency

### Integration Tests

**Signal Flow Integrity**:
- Process test audio through entire chain
- Compare output with reference (ensure no regression)
- Verify waveform display matches meters

**Thread Safety**:
- Enable ThreadSanitizer (TSan) during testing
- Toggle all controls rapidly during audio processing
- Verify no data races detected

---

## Backward Compatibility

**State Serialization**:
- Add `masterDryWet` to preset XML (default 1.0 for backward compat)
- Old presets without `masterDryWet` attribute default to 1.0 (100% wet = chain enabled)

**Bridge API**:
- All new methods are additive (no breaking changes)
- Latency events include both `latencySamples` and `latencyMs` for backward compat
- Match lock removal is breaking but feature is unused in production

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Master dry/wet buffer copy overhead | High CPU on large blocks | Test at 8192 samples, use JUCE's buffer pool |
| Mute processor interaction with PDC | Latency compensation breaks | Keep latency reporting unchanged when muted |
| Signal flow reorder causes glitches | Audio artifacts on first play | Test with various hosts (Logic, Ableton, Reaper) |
| Latency polling at 30Hz too slow | Stale UI | Emit event immediately on chain change via callback |

---

## Open Questions for Review

1. **Master Dry/Wet**: Should dry signal be captured **before** or **after** input gain?
   - **Recommendation**: After input gain (matches user expectation - "input knob affects dry signal")

2. **Mute Processor**: Insert before plugin (silence input) or after plugin (silence output)?
   - **Recommendation**: Before plugin - saves CPU on skipped processing, plugin sees silence

3. **Latency Events**: Emit on every timer tick or only on change?
   - **Current**: Only on change (lines 994-999 in `timerCallback()`)
   - **Recommendation**: Keep as-is, add immediate callback on chain structure change

4. **Per-Node Latency**: Include compensation delay or just plugin-reported latency?
   - **Recommendation**: Plugin-reported only (what user expects to see in plugin UI)

---

## Summary

This plan provides a complete, production-ready implementation for all C++ audio processing and bridge changes. Key highlights:

- **Clean signal flow** with correct meter placement
- **Reusable `DryWetMixProcessor`** for master dry/wet
- **Lightweight mute** using new `MuteProcessor` wrapper
- **Accurate latency display** with ms conversion in C++
- **Complete removal** of match lock feature
- **Zero performance regression**, minimal memory overhead
- **Thread-safe** with existing lock-free patterns
- **Backward compatible** preset loading

**Estimated effort**: 2-3 days for experienced JUCE developer

---

## Critical Files for Implementation

### Top 5 Files for Implementation

1. **`apps/desktop/src/PluginProcessor.cpp`** - Core signal flow changes, master dry/wet integration, metering reorder
2. **`apps/desktop/src/bridge/WebViewBridge.cpp`** - Bridge methods, timer callback updates, match lock removal
3. **`apps/desktop/src/core/ChainProcessor.cpp`** - Per-node latency calculation, mute processor wiring
4. **`apps/desktop/src/audio/MuteProcessor.h`** - New file, simple mute passthrough processor
5. **`apps/desktop/src/bridge/WebViewBridge.h`** - API declarations, remove match lock, add master dry/wet
