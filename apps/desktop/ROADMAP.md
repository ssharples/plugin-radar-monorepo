# Plugin Chain Manager - Development Roadmap

## Project Overview

**Plugin Chain Manager** is a JUCE-based VST3/AU plugin host with a React web UI that enables users to chain multiple audio plugins together, with real-time metering, gain matching, preset management, and cloud sharing.

---

## Current State (v1.0.0)

### Working Features
- Plugin discovery (VST3/AU) with crash-safe out-of-process scanning
- Drag-drop chain management with bypass control
- Real-time waveform visualization (pre/post)
- Peak/RMS/LUFS metering
- Input/output gain control with auto-matching
- Local preset save/load
- Cloud sync via Convex (PluginRadar integration)
- Native plugin UI windows

### Known Issues
1. **Load chain not implemented** - Cloud chains log but don't apply to session
2. **Match lock UI feedback** - No warning shown when gain limit reached
3. **Debug logging** - Excessive std::cerr output in production builds
4. **Promise timeouts** - Bridge calls can hang indefinitely
5. **VST3 scanning** - May need additional testing on Windows

---

## Phase 1: Bug Fixes & Polish (Priority: High)

### 1.1 Fix Cloud Chain Loading
- **File**: `ui/src/components/Footer/Footer.tsx` (line 198)
- **Task**: Implement `juceBridge.importChain()` call to load saved chains
- **Acceptance**: User can load a cloud chain and it populates the session

### 1.2 Match Lock UI Feedback
- **Files**: `src/bridge/WebViewBridge.cpp`, `ui/src/components/Footer/Footer.tsx`
- **Task**: Handle `matchLockWarning` event in UI, show toast/notification
- **Acceptance**: User sees warning when match lock auto-disables

### 1.3 Clean Up Debug Logging
- **Files**: `src/core/PluginManager.cpp`, `src/bridge/*.cpp`
- **Task**: Wrap std::cerr in `#ifdef DEBUG` or use JUCE logging
- **Acceptance**: Release builds have no console spam

### 1.4 Add Promise Timeouts to Bridge
- **File**: `ui/src/api/juce-bridge.ts`
- **Task**: Add 10-second timeout to native function calls, reject with error
- **Acceptance**: Hung calls fail gracefully instead of waiting forever

---

## Phase 2: Stability & Robustness (Priority: Medium)

### 2.1 Comprehensive Error Handling
- Standardize error response format from native functions
- Add retry logic for transient failures
- Improve error messages shown to users

### 2.2 Plugin Compatibility Validation
- Validate plugin state on load (handle missing plugins gracefully)
- Show compatibility warnings before loading chains with unavailable plugins
- Offer to skip missing plugins vs. abort load

### 2.3 State Persistence Improvements
- Auto-save chain state periodically
- Crash recovery (restore last known state)
- Undo/redo for chain operations

### 2.4 Performance Optimization
- Adaptive update rates for waveform/meters (reduce CPU on idle)
- Lazy-load plugin list (pagination for large collections)
- Debounce rapid UI updates

---

## Phase 3: New Features (Priority: Medium)

### 3.1 Plugin Presets (Per-Slot)
- Save/load individual plugin presets
- Quick A/B comparison for single plugins
- Preset browser per slot

### 3.2 Signal Flow Visualization
- Show signal path with gain staging indicators
- Highlight clipping points in chain
- Latency visualization per plugin

### 3.3 MIDI Routing
- Route MIDI to specific plugins in chain
- MIDI learn for plugin parameters
- MIDI pass-through control

### 3.4 Sidechain Support
- Configure sidechain inputs for compressors/gates
- Visual sidechain routing in UI

---

## Phase 4: Platform & Distribution (Priority: Low)

### 4.1 Windows Support
- Test/fix VST3 scanning on Windows
- Windows installer (NSIS or WiX)
- Code signing for Windows

### 4.2 AAX Format
- Add Pro Tools AAX support
- AAX-specific testing

### 4.3 Documentation
- User manual
- Developer documentation
- Video tutorials

### 4.4 Testing Infrastructure
- Unit tests for core components
- Integration tests for bridge
- Automated UI tests

---

## Technical Debt

| Item | Location | Priority |
|------|----------|----------|
| Remove hardcoded 120 frame stuck counter | WebViewBridge.cpp | Low |
| Standardize error response format | WebViewBridge.cpp | Medium |
| Add TypeScript strict mode | ui/tsconfig.json | Low |
| Document JUCE version requirements | README.md | Low |

---

## Architecture Notes

### Key Constraints
- Audio thread must remain lock-free (no allocations, no locks)
- WebView communication requires JSON serialization
- Plugin windows must be independent DocumentWindow instances
- Latency compensation critical for aligned visualization

### Design Patterns
- **Bridge Pattern**: C++ audio engine <-> React UI
- **Observer Pattern**: Event-based updates from native to JS
- **Command Pattern**: All chain operations are discrete commands

---

## Build & Test

```bash
# Build AU plugin
cd build && cmake --build . --target PluginChainManager_AU

# Build VST3 plugin
cd build && cmake --build . --target PluginChainManager_VST3

# Build standalone app
cd build && cmake --build . --target PluginChainManager_Standalone

# Build UI (development)
cd ui && npm run dev

# Build UI (production - creates embedded bundle)
cd ui && npm run build
```

---

## Team Assignments

| Area | Focus |
|------|-------|
| Backend (C++) | Audio processing, plugin management, native bridge |
| Frontend (React) | UI components, state management, cloud sync |
| Integration | Bridge communication, testing, documentation |

---

## Audit: JUCE C++ Best Practices

*Conducted 2026-02-05. Covers all C++ source files in the project.*

Severity scale: **CRITICAL** (will cause crashes/corruption), **HIGH** (audio glitches or data races), **MEDIUM** (correctness/maintainability issue), **LOW** (style/best-practice nit).

---

### A. CRITICAL: Audio Thread Violations

#### A1. Heap allocation on the audio thread (AudioMeter::process)
- **File**: `src/audio/AudioMeter.cpp:142-143`
- **Severity**: CRITICAL
- **Issue**: Two `std::vector` objects are allocated on every single call to `process()`, which runs on the real-time audio thread.
  ```cpp
  std::vector<float> kWeightedL(numSamples);
  std::vector<float> kWeightedR(numSamples);
  ```
  `std::vector` constructors call `operator new`, which may block on a mutex inside the system allocator. This violates the fundamental real-time audio constraint and can cause audio dropouts, glitches, or priority inversion.
- **Fix**: Pre-allocate these buffers in `prepareToPlay()` as member variables sized to `samplesPerBlock`. Reuse them in `process()`.

#### A2. std::vector inside WaveformCapture::PeakBuffer::getPeaks (called from timerCallback -> UI thread via bridge)
- **File**: `src/audio/WaveformCapture.h:120-133`
- **Severity**: MEDIUM (not on audio thread, but worth noting)
- **Issue**: `getPeaks()` allocates a `std::vector` on every call. Since this is called at 60 Hz from the timer, it generates garbage-collection pressure but is not on the audio thread. Acceptable but could be improved by writing into a pre-allocated buffer.

#### A3. LUFS ring buffer summing entire buffer every block
- **File**: `src/audio/AudioMeter.cpp:157-163`
- **Severity**: MEDIUM (performance)
- **Issue**: The LUFS calculation iterates over the entire `lufsBufferSize` (up to 3 seconds of samples at 48kHz = 144,000 floats) on every audio callback. At 512 samples/block and 48kHz, that is ~94 calls/second, each scanning 144k floats.
- **Fix**: Maintain a running sum. When writing a new sample to the ring buffer, subtract the old value and add the new value, keeping the sum incremental.

---

### B. HIGH: Thread Safety Issues

#### B1. GainProcessor::setInputGain / setOutputGain - race between UI and audio threads
- **File**: `src/audio/GainProcessor.cpp:29-41`
- **Severity**: HIGH
- **Issue**: `setInputGain()` and `setOutputGain()` write to the atomic `inputGainDB` and then call `setTargetValue()` on the `SmoothedValue`. `SmoothedValue` is NOT thread-safe. These setters are called from the UI thread (via the WebView bridge), but `SmoothedValue::getNextValue()` is called from the audio thread in `processInputGain()` / `processOutputGain()`. There is a data race on the internal state of `SmoothedValue`.
- **Fix**: Store the target dB value in the atomic, then read it and call `setTargetValue()` on the audio thread at the start of the process function. This is the standard JUCE pattern for thread-safe smoothed parameter updates.

#### B2. ChainProcessor::processLock is a CriticalSection used in addPlugin/removePlugin/movePlugin
- **File**: `src/core/ChainProcessor.h:72`, `src/core/ChainProcessor.cpp:110,135,154`
- **Severity**: HIGH
- **Issue**: `juce::CriticalSection` (which wraps a pthread mutex) is used under `ScopedLock` in `addPlugin`, `removePlugin`, and `movePlugin`. These methods also call `rebuildGraph()` which modifies the AudioProcessorGraph. However, `processBlock` on the audio thread calls `AudioProcessorGraph::processBlock()` internally, which reads the graph topology. If `rebuildGraph()` runs concurrently with `processBlock()`, there is a potential race condition. The `processLock` is never acquired in the audio path.
- **Fix**: Either (a) ensure `rebuildGraph()` is always called from the message thread and rely on `AudioProcessorGraph`'s internal locking for topology changes, or (b) use `AudioProcessorGraph`'s built-in thread-safety mechanisms for adding/removing connections (it already has an internal read-write lock in JUCE 8). The current `processLock` on the `slots` vector alone is insufficient because `rebuildGraph()` calls graph mutation methods outside the lock scope.

#### B3. notifyChainChanged captures `this` in async lambda
- **File**: `src/core/ChainProcessor.cpp:444,452`
- **Severity**: HIGH
- **Issue**: `juce::MessageManager::callAsync` captures a raw `this` pointer. If the `ChainProcessor` is destroyed before the async callback fires, the callback will dereference a dangling pointer, causing undefined behavior (crash).
- **Fix**: Use a weak reference pattern. For example, use `juce::Component::SafePointer` if applicable, or store a `std::shared_ptr<bool>` alive flag, or use `juce::MessageManager::callAsync` with a weak reference guard. Alternatively, ensure the destructor waits for pending async calls (not practical with `callAsync`).

#### B4. PluginSlot::instance ownership confusion
- **File**: `src/core/ChainProcessor.cpp:98-108`, `src/core/PluginSlot.h:8`
- **Severity**: HIGH
- **Issue**: In `addPlugin()`, the plugin instance is created, placed in `slot->instance`, then `slot->instance.release()` transfers ownership to `addNode`. After that, `slot->instance.reset()` is called, meaning the slot no longer owns the processor. However, `PluginSlot` still has a `std::unique_ptr<AudioPluginInstance> instance` member that is now null. This is confusing and error-prone. Any code that checks `slot->instance` (e.g., `prepareToPlay` at line 69) will find it null and skip preparation, which is actually fine because the graph handles it, but the code reads as though it expects the slot to own the instance.
- **Fix**: Remove `PluginSlot::instance` or clearly document that after adding to the graph, the processor is owned by the graph node. Consider storing only the `NodeID` and using `getNodeForId()->getProcessor()` to access the processor. The `editorWindow` member in `PluginSlot` is also never used (the window management is in `ChainProcessor::PluginWindow`).

#### B5. WaveformCapture: non-atomic fields accessed from both audio and UI threads
- **File**: `src/audio/WaveformCapture.h:148-149,153-154`, `src/audio/WaveformCapture.cpp:39-41,43-51`
- **Severity**: HIGH
- **Issue**: `delayWritePos`, `delayReadPos`, `preAccumulator`, and `preSampleCount` are plain (non-atomic) member variables written by the audio thread in `pushPreSamples()`. While they are not directly read by the UI thread, the `reset()` method writes to them. If `reset()` is called from a non-audio thread while the audio thread is running, this is a data race.
- **Fix**: Either make these atomic, or ensure `reset()` is only ever called when the audio callback is not running (i.e., during `prepareToPlay` which JUCE guarantees is not concurrent with `processBlock`).

---

### C. HIGH: Algorithm Correctness Issues

#### C1. K-weighting filter implementation is broken (dead code path)
- **File**: `src/audio/AudioMeter.cpp:191-206`
- **Severity**: HIGH
- **Issue**: The `processKWeighting` function has two overlapping filter implementations in the same loop body. Lines 194-198 compute `y` using one formula and `newZ1`/`newZ2` using another, but then lines 201-203 completely overwrite `y`, `s.z1`, and `s.z2` using a different (TDF-II) implementation. The variables `newZ1` and `newZ2` computed on lines 197-198 are never used. The first computation (lines 194-198) is dead code.
  While the second implementation (TDF-II, lines 201-203) is correct on its own, the dead code suggests a failed refactoring attempt and may be masking a bug. This warrants verification against the ITU-R BS.1770-4 reference implementation.
- **Fix**: Remove lines 194-198 (the dead code). Verify the TDF-II filter coefficients against the ITU-R BS.1770-4 standard. The standard specifies exact coefficient values for 48kHz, and the current code uses an approximate design that may deviate, especially at non-48kHz sample rates.

#### C2. K-weighting filter coefficients do not match ITU-R BS.1770-4
- **File**: `src/audio/AudioMeter.cpp:217-242`
- **Severity**: HIGH
- **Issue**: The K-weighting pre-filter in ITU-R BS.1770 consists of two stages:
  1. A shelving filter (not a "high shelf" per se - ITU specifies exact coefficients for 48kHz)
  2. A high-pass filter (revised in BS.1770-2 to use specific coefficients)

  The current implementation designs a generic high-shelf at 1.5kHz with +4dB gain and Q=0.71, and a high-pass at 38Hz with Q=0.5. The ITU standard specifies exact coefficients for 48kHz and provides a bilinear-transform method for other sample rates. The generic approach here will produce different frequency responses than the standard requires, especially the first stage which is more complex than a simple high-shelf.
- **Fix**: Use the exact coefficients from ITU-R BS.1770-4 Table 1 for 48kHz and apply proper bilinear transform with frequency warping for other sample rates, or use pre-computed coefficients for common rates (44.1kHz, 48kHz, 88.2kHz, 96kHz).

#### C3. LUFS formula uses wrong window duration
- **File**: `src/audio/AudioMeter.h:73`, `src/audio/AudioMeter.cpp:19`
- **Severity**: MEDIUM
- **Issue**: The header declares `LufsWindowMs = 3000` (3 seconds, matching the ITU-R BS.1770 "short-term" 3s definition), but the comment at line 19 says "LUFS buffer for 400ms window" and the header comment at line 14 says "Simplified short-term LUFS (~400ms integration)". The actual buffer size IS 3 seconds (correct for short-term LUFS), but the comments are contradictory and misleading.
  Additionally, ITU-R BS.1770 short-term loudness uses a 3-second sliding window with 75% overlap (stepped every 100ms), and the gating algorithm requires multiple passes. The current implementation does a simple mean over a ring buffer, which is a reasonable simplification but should be documented as non-compliant.
- **Fix**: Correct the misleading comments. Document that this is a simplified short-term loudness measurement, not fully ITU-R BS.1770 compliant (no gating, no overlap stepping).

#### C4. GainProcessor multi-channel smoothing is incorrect
- **File**: `src/audio/GainProcessor.cpp:63`
- **Severity**: HIGH
- **Issue**: `inputGainSmoothed.skip(-buffer.getNumSamples())` is called for channels > 0 to "rewind" the smoothed value and re-apply the same gain ramp. However, `SmoothedValue::skip()` does not support negative values - it takes a `numSamples` parameter that is used to advance the internal counter. Passing a negative value will result in undefined or incorrect behavior (the counter could wrap or remain unchanged depending on implementation).
- **Fix**: Before processing channels, snapshot the `SmoothedValue` current value, process channel 0 with `getNextValue()`, then for subsequent channels, reset the smoothed value to the snapshot and process again. Alternatively, store the per-sample gain values for the block in a temporary array and apply them to all channels. The cleanest approach is to use `juce::dsp::Gain` which handles multi-channel properly.

#### C5. RMS EMA calculation applies EMA to block RMS rather than sample-by-sample
- **File**: `src/audio/AudioMeter.cpp:130-138`
- **Severity**: MEDIUM
- **Issue**: The RMS is calculated as: `blockRms = sqrt(sumSquares / numSamples)` then `rmsAccum += rmsCoeff * (blockRms - rmsAccum)`. This applies EMA to the block-level RMS, not sample-by-sample. The effective time constant depends on the block size, making the meter behave differently at 64-sample vs 1024-sample buffer sizes. At 1024 samples (typical), the time constant is roughly correct, but at smaller buffer sizes, the RMS will decay faster than intended.
- **Fix**: Apply EMA to the mean-square value per block (not the RMS), then take the square root when storing the result. This gives consistent behavior regardless of block size. Or even better, apply per-sample EMA for accurate behavior.

---

### D. MEDIUM: Memory Management and JUCE API Issues

#### D1. PresetManager::createPresetXml returns raw new pointer
- **File**: `src/core/PresetManager.h:55`, `src/core/PresetManager.cpp:161`
- **Severity**: MEDIUM
- **Issue**: `createPresetXml()` returns a raw `juce::XmlElement*`. The caller at line 84 wraps it in `std::unique_ptr` but the API itself is error-prone (easy to leak if a caller forgets).
- **Fix**: Return `std::unique_ptr<juce::XmlElement>` directly.

#### D2. Redundant dynamic_cast in PresetManager::createPresetXml
- **File**: `src/core/PresetManager.cpp:192`
- **Severity**: LOW
- **Issue**: `dynamic_cast<juce::AudioProcessorGraph*>(&chain)` is unnecessary because `chain` is declared as `ChainProcessor&` and `ChainProcessor` inherits from `AudioProcessorGraph`. A simple `static_cast` or even `&chain` directly would work.
- **Fix**: Use `chain.getNodeForId(slot->nodeId)` directly since `ChainProcessor` IS an `AudioProcessorGraph`.

#### D3. PluginSlot::editorWindow member is unused
- **File**: `src/core/PluginSlot.h:12`
- **Severity**: LOW
- **Issue**: `PluginSlot` has a `std::unique_ptr<juce::AudioProcessorEditor> editorWindow` member that is never assigned anywhere. Plugin window management is handled separately by `ChainProcessor::PluginWindow`.
- **Fix**: Remove this unused member.

#### D4. getReadings() is not atomic as a group
- **File**: `src/audio/AudioMeter.cpp:269-280`
- **Severity**: MEDIUM
- **Issue**: `getReadings()` loads 7 separate atomic values with `memory_order_relaxed`. There is no guarantee that the returned `Readings` struct represents a consistent snapshot. Between loading `peakL` and `peakR`, the audio thread may have updated `peakR` from the next block. For visual metering this is typically acceptable, but it means the L/R values could be from different audio blocks.
- **Fix**: This is generally acceptable for visual metering. If exact consistency is needed, use a lock-free SPSC (single-producer single-consumer) queue or a double-buffer with an atomic flag. Document the trade-off.

---

### E. MEDIUM: Thread-Safety in WebViewBridge and ChainProcessor

#### E1. WebViewBridge::timerCallback accesses matchLockEnabled without synchronization
- **File**: `src/bridge/WebViewBridge.cpp:416`, `src/bridge/WebViewBridge.h:88`
- **Severity**: MEDIUM
- **Issue**: `matchLockEnabled` is a plain `bool` read in `timerCallback()` (timer thread/message thread) and written in `setMatchLock()` (called from native function callback, which may be on a different thread depending on WebView implementation). Similarly, `matchLockReferenceOffset` and `matchLockStuckCounter` are not synchronized.
- **Fix**: Make `matchLockEnabled` `std::atomic<bool>`, and `matchLockStuckCounter` `std::atomic<int>`. For `matchLockReferenceOffset`, either make it atomic or ensure `setMatchLock` and `timerCallback` always run on the same thread (message thread).

#### E2. Gain matching uses linear peak values as if they were dB
- **File**: `src/bridge/WebViewBridge.cpp:419-428`
- **Severity**: HIGH
- **Issue**: `inputReadings.peakL` is a LINEAR value (0 to 1+), not a dB value. The code compares `inputPeak > -60.0f` as though it were dB, but linear peak values are never negative (they range from 0.0 to 1.0+ for clipping). This means the threshold check `inputPeak > -60.0f` is ALWAYS true (any peak >= 0.0 passes). Furthermore, the arithmetic `targetOutputPeak = inputPeak - matchLockReferenceOffset` and `error = targetOutputPeak - outputPeak` operates on linear values as if they were dB, which is mathematically incorrect for level matching.
- **Fix**: Convert linear peak values to dB using `20 * log10(peak)` before performing the gain matching arithmetic. The same issue affects `calculateGainMatch()` at line 823-831.

---

### F. LOW: Code Quality and Best Practices

#### F1. Debug logging using std::cerr instead of JUCE logging
- **File**: `src/core/PluginManager.cpp` (throughout), `src/bridge/WebViewBridge.cpp:338`, `src/PluginEditor.cpp:49`
- **Severity**: LOW
- **Issue**: Extensive use of `std::cerr` for debug logging. While wrapped in `#if JUCE_DEBUG` in most places, some instances (e.g., PluginManager.cpp:625-626, 657-658, 676) are always-on `std::cerr` calls even in release builds.
- **Fix**: Use `juce::Logger::writeToLog()` or `DBG()` macro consistently. Ensure all stderr output is wrapped in `#if JUCE_DEBUG`.

#### F2. const_cast to work around const method
- **File**: `src/core/PluginManager.cpp:91`
- **Severity**: LOW
- **Issue**: `const_cast<std::mutex&>(scanMutex)` is used in `getCurrentlyScanning() const`. This is a code smell.
- **Fix**: Declare `scanMutex` as `mutable std::mutex scanMutex;`.

#### F3. PluginWindow::activeWindowStatusChanged may cause focus fighting
- **File**: `src/core/ChainProcessor.cpp:30-34`
- **Severity**: LOW
- **Issue**: `activeWindowStatusChanged()` calls `toFront(true)` whenever the window becomes active. Combined with `mouseDown()` also calling `toFront(true)`, this could cause focus-fighting with the DAW or other plugin windows in some host environments.
- **Fix**: Remove the `activeWindowStatusChanged` override. The `mouseDown` handler is sufficient for bringing windows to front on user interaction.

#### F4. rebuildGraph removes and re-creates all I/O nodes on every topology change
- **File**: `src/core/ChainProcessor.cpp:253-311`
- **Severity**: MEDIUM
- **Issue**: `rebuildGraph()` removes all connections, removes all 4 I/O nodes, then recreates them and reconnects everything from scratch. This is expensive and causes a brief interruption in audio flow. JUCE's `AudioProcessorGraph` supports incremental connection changes.
- **Fix**: Only remove/add the connections that changed. Keep the I/O nodes persistent. This avoids audio interruptions during chain modifications.

#### F5. Missing `prepareToPlay` for meters and gain on sample rate change
- **File**: `src/PluginProcessor.cpp:74-94`
- **Severity**: LOW
- **Issue**: The `prepareToPlay` correctly calls `gainProcessor.prepareToPlay()`, `inputMeter.prepareToPlay()`, and `outputMeter.prepareToPlay()`. However, if the host changes the sample rate or block size without a full stop/restart cycle, the meters' LUFS buffer (`std::vector::resize`) would allocate on what might still be an active audio thread. JUCE guarantees that `prepareToPlay` is not called concurrently with `processBlock`, so this is safe in practice. No fix needed, just confirming correctness.

#### F6. Output metering happens BEFORE output gain
- **File**: `src/PluginProcessor.cpp:134-138`
- **Severity**: MEDIUM
- **Issue**: The processing order is: input gain -> input meter -> chain -> output meter -> output gain. This means the output meter shows levels BEFORE the output gain is applied. The user sees meter readings that do not correspond to the actual output signal level. This is confusing for gain staging.
- **Fix**: Swap the order so output gain is applied before the output meter reads, OR document that the output meter shows post-chain but pre-output-gain levels (which may be intentional for gain-matching purposes).

---

### G. Summary of Prioritized Fixes

| Priority | Issue | File | Impact |
|----------|-------|------|--------|
| CRITICAL | A1: Heap alloc in audio thread (std::vector in AudioMeter::process) | AudioMeter.cpp:142 | Audio dropouts |
| HIGH | B1: SmoothedValue race condition | GainProcessor.cpp:29-41 | Audio glitches |
| HIGH | C4: SmoothedValue::skip(-N) is invalid | GainProcessor.cpp:63,100 | Wrong gain ramp on channels > 0 |
| HIGH | E2: Linear vs dB confusion in gain matching | WebViewBridge.cpp:419-428 | Gain match always broken |
| HIGH | C1: Dead code in K-weighting filter | AudioMeter.cpp:191-206 | Potential filter error |
| HIGH | C2: Non-standard K-weighting coefficients | AudioMeter.cpp:217-242 | Inaccurate LUFS |
| HIGH | B3: Dangling `this` in callAsync | ChainProcessor.cpp:444,452 | Crash on teardown |
| HIGH | B2: processLock insufficient for graph safety | ChainProcessor.cpp:110 | Possible race |
| HIGH | B4: PluginSlot instance ownership confusion | ChainProcessor.cpp:98-108 | Maintenance hazard |
| MEDIUM | A3: Full-buffer LUFS scan every block | AudioMeter.cpp:157-163 | CPU waste |
| MEDIUM | C3: Contradictory LUFS window comments | AudioMeter.h:73 | Confusion |
| MEDIUM | C5: Block-size-dependent RMS | AudioMeter.cpp:130-138 | Inconsistent meter |
| MEDIUM | D1: Raw pointer return from createPresetXml | PresetManager.cpp:161 | Leak risk |
| MEDIUM | E1: Non-atomic matchLock fields | WebViewBridge.h:88 | Data race |
| MEDIUM | F4: Full graph rebuild on every change | ChainProcessor.cpp:253 | Audio interruption |
| MEDIUM | F6: Output meter before output gain | PluginProcessor.cpp:134 | Misleading meters |
| LOW | D3: Unused editorWindow in PluginSlot | PluginSlot.h:12 | Dead code |
| LOW | F1: std::cerr in release builds | PluginManager.cpp | Console spam |
| LOW | F2: const_cast on mutex | PluginManager.cpp:91 | Code smell |
| LOW | F3: Focus fighting in PluginWindow | ChainProcessor.cpp:30 | UX annoyance |

---

## Audit: UI Design & Frontend

*Conducted 2026-02-05. Covers all React/TypeScript UI source files under `ui/src/`.*

### Audit Findings

#### 1. Bugs Fixed

| Issue | File | Severity | Fix Applied |
|-------|------|----------|-------------|
| MeterDisplay: Duplicate gradient rendering (two overlapping clip-path divs for left channel) | MeterDisplay.tsx | MEDIUM | Extracted `MeterBar` component, single gradient per channel |
| MeterDisplay: `scaleMarks.reverse()` mutates the array on every render, causing reversed-then-re-reversed marks on subsequent renders | MeterDisplay.tsx | MEDIUM | Use a fresh non-reversed array, positioned with `bottom` CSS |
| Knob: No scroll-to-change interaction (standard in pro audio) | Knob.tsx | LOW | Added `wheel` event listener with sensitivity scaling |
| Knob: No visual marker for 0 dB position | Knob.tsx | LOW | Added tick mark at 0 dB angle, highlighted when value is near zero |
| Modals: No Escape key handling or click-outside-to-close | SaveChainModal, LoadChainModal | MEDIUM | Added `keydown` Escape listener and backdrop `onClick` handler |
| CloudSync: Custom inline SVG instead of using Lucide `Cloud` icon (inconsistent with rest of app) | CloudSync.tsx | LOW | Replaced custom `CloudIcon` with Lucide `Cloud` |

#### 2. Layout Redesign

**Before**: Vertical stack layout (Browser on top, Chain below, Waveform at bottom). Plugin browser consumed 38% via hardcoded `style={{ height: '38%' }}`.

**After**: Horizontal split layout (Browser left 55%, Chain right 45%). This mirrors professional DAW layouts (Ableton's browser/session split, FL Studio's channel rack). Benefits:
- Better use of horizontal screen space in typical plugin host windows
- Plugin browser and chain are visible simultaneously without scrolling
- Gap between panels uses `gap-px bg-plugin-border` for clean 1px separator lines
- Waveform strip at bottom with reduced height (72px) since it's a monitoring display, not primary workflow

#### 3. Visual Design System Changes

**Tailwind Config Expanded** (`ui/tailwind.config.js`):
- Added intermediate surface colors: `plugin-surface-alt` (#111), `plugin-border-bright` (#2a2a2a)
- Added dim color `plugin-dim` (#3a3a3a) for tertiary text
- Added custom shadows: `glow-accent`, `glow-accent-strong`, `inset-dark`, `meter`
- Added animations: `fade-in`, `slide-up`, `pulse-soft` for modal transitions
- Added `text-xxs` (0.625rem) font size for compact UI elements

**Header**: Redesigned from plain text to branded logo mark with version badge. Uses gradient accent square with "P" monogram and "Chain**Mgr**" branding with orange accent.

#### 4. Component-by-Component Changes

**MeterDisplay** (`MeterDisplay.tsx`):
- Extracted `MeterBar` as a sub-component eliminating code duplication
- Added segmented-line overlay (`repeating-linear-gradient`) for professional LED-meter look
- Added `shadow-meter` inset shadow for depth
- Refined gradient: added lime-green transition zone for better mid-range visibility
- Fixed peak hold: uses constant `ZERO_DB_PERCENT` instead of recalculating
- Added red glow `boxShadow` to peak hold indicators above 0 dB

**Knob** (`Knob.tsx`):
- Added radial gradient fill for 3D appearance
- Added outer shadow ring for depth
- Added 0 dB tick mark at the correct angle position
- Added scroll-to-change with sensitivity scaling
- Value display highlights orange while dragging
- Label uses widest tracking for pro hardware look

**Footer** (`Footer.tsx`):
- Added vertical dividers (`w-px h-8 bg-plugin-border`) between input/controls/output sections
- Used `flex-1` spacer to push preset button right
- Reduced all button and knob sizes for tighter footer bar
- Consistent `text-xxs` sizing throughout
- Match Lock button uses `shadow-glow-accent` when active

**PluginBrowser** (`PluginBrowser.tsx`):
- Removed rounded-lg border (panels now go edge-to-edge in split layout)
- Tighter padding and spacing throughout
- Progress bar reduced to `h-0.5` for subtlety
- `space-y-px` between plugin items for single-pixel separation

**PluginItem** (`PluginItem.tsx`):
- Reduced icon size from 7x7 to 6x6
- Manufacturer/format separator uses styled `/` instead of bullet
- Smaller add button (3x3 icon)

**PluginFilters** (`PluginFilters.tsx`):
- Labels shortened: "Effects" -> "FX", "Instruments" -> "Inst", "Name A-Z" -> "Name"
- Type toggle wrapped in shared border for visual grouping
- Consistent `text-xxs` sizing

**PluginViewer/Chain** (`PluginViewer.tsx`):
- Slot count badge uses monospace font in dark pill
- Selected slot uses `shadow-glow-accent` for standout
- Input/Output indicators use CSS `box-shadow` glow effect
- Connector lines use `plugin-border-bright` for visibility
- Smaller action icons (3x3 instead of 3.5x3.5)

**WaveformDisplay** (`WaveformDisplay.tsx`):
- Added subtle grid lines at 25/50/75% amplitude for reference
- Input waveform color changed from pure white to silver/grey for less visual dominance
- Canvas background darkened to `#050505` for deeper contrast
- Toggle buttons use `text-xxs` and smaller dot indicators
- Removed wrapping `<div>` around canvas (unnecessary nesting)

**LufsDisplay** (`LufsDisplay.tsx`):
- Added `min-w-[32px]` to compact mode for stable layout
- Changed inactive color to `plugin-dim` for better hierarchy
- Label text reduced to 7px with wider tracking

**CloudSync** (`CloudSync.tsx`):
- Replaced custom SVG `CloudIcon` with Lucide `Cloud` for consistency
- Button text shortened to "Connect" (from "Connect to PluginRadar")
- Reduced button size to match header scale

**Modals** (`SaveChainModal.tsx`, `LoadChainModal.tsx`):
- Added `animate-fade-in` on backdrop
- Added `animate-slide-up` on modal panel
- Added click-outside-to-close via backdrop `onClick` + inner panel `stopPropagation`
- Added Escape key handling via `keydown` event listener

#### 5. Remaining Recommendations (Not Implemented)

| Item | Priority | Notes |
|------|----------|-------|
| Virtualize plugin list for 500+ plugins | MEDIUM | Use `@tanstack/react-virtual` for large collections |
| Add keyboard navigation to plugin browser | LOW | Arrow keys, Enter to add |
| Debounce search input (currently re-filters on every keystroke) | LOW | Add 150ms debounce in `setSearchQuery` |
| Extract Footer gain/metering into `MeterStrip` component | LOW | Reduce Footer complexity |
| Add focus ring styles for keyboard accessibility | LOW | All interactive elements |
| Consider dark mode variations (blue-accent, green-accent themes) | LOW | User preference |
| WaveformDisplay: Only run `requestAnimationFrame` when data is changing | LOW | Detect idle state to reduce CPU usage |
