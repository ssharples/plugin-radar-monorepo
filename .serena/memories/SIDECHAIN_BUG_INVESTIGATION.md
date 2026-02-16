# ProChain Sidechain Audio Silencing Bug Investigation

**Working Directory**: `/Users/satti/Development-projects/plugin-radar-monorepo/apps/desktop/build`
**Date**: 2026-02-11

## Problem Statement
Plugins with sidechain inputs (e.g., Pro-L 2) silence the audio output in ProChain even when the sidechain is set to "off" (disabled). This suggests a channel routing issue in the AudioProcessorGraph wiring.

---

## Root Cause Analysis

### 1. **Bus Layout Propagation Issue (PluginWithMeterWrapper)**

**File**: `apps/desktop/src/audio/PluginWithMeterWrapper.h/cpp`

The wrapper correctly attempts to sync bus layouts from sidechain-capable plugins:

```cpp
// PluginWithMeterWrapper constructor (lines 16-25)
auto layout = wrappedPlugin->getBusesLayout();
if (layout.inputBuses.size() > 0 || layout.outputBuses.size() > 0)
    setBusesLayout(layout);  // <-- Syncs the 4-in/2-out layout
else
    setPlayConfigDetails(2, 2, 44100.0, 512);

// PluginWithMeterWrapper::prepareToPlay (lines 36-39)
auto layout = wrappedPlugin->getBusesLayout();
setBusesLayout(layout);  // Syncs again in prepareToPlay
```

**Issue**: When a sidechain plugin (like Pro-L 2) is configured with 4 input channels (2 main + 2 sidechain), the wrapper's `setBusesLayout()` call sets up the wrapper's bus configuration to match. However, this creates a **bus layout mismatch** with what the AudioProcessorGraph allocates.

---

### 2. **Critical Connection Mismatch in Graph Wiring**

**File**: `apps/desktop/src/core/ChainProcessor.cpp`

**Location**: `wireNode()` function (lines 1558-1700)

**The Bug**:

```cpp
// Line 1622-1623: Connect upstream (typically 2 channels) to plugin (expects 4+ channels)
addConnection({{currentAudioIn, 0}, {pluginNodeId, 0}}, UpdateKind::none);
addConnection({{currentAudioIn, 1}, {pluginNodeId, 1}}, UpdateKind::none);
```

The problem is:
1. The wrapper's bus layout is set to 4-in/2-out (sidechain plugin requirement)
2. BUT the connections from upstream only feed channels 0-1
3. Channels 2-3 (the sidechain inputs) **remain unconnected and uninitialized**
4. The AudioProcessorGraph allocates buffers based on the wrapper's reported bus layout (4 input channels)
5. When the plugin's processBlock() runs, it tries to access channels 2-3, but they contain garbage/uninitialized data
6. This can cause the plugin to produce silence or crash

---

### 3. **Buffer Expansion Partially Addresses This (But Not the Core Issue)**

**File**: `apps/desktop/src/audio/PluginWithMeterWrapper.cpp` (lines 91-118)

The wrapper attempts to handle this:

```cpp
int requiredChannels = wrappedPlugin->getTotalNumInputChannels();

if (numChannels < requiredChannels)
{
    // Create a larger buffer and copy our data into it
    juce::AudioBuffer<float> expandedBuffer(requiredChannels, numSamples);
    expandedBuffer.clear();  // <-- Clears channels 2-3 to silence
    
    // Copy existing channels
    for (int ch = 0; ch < numChannels; ++ch)
        expandedBuffer.copyFrom(ch, 0, buffer, ch, 0, numSamples);
    
    // Fill sidechain channels from host SC buffer
    for (int ch = numChannels; ch < requiredChannels; ++ch)
    {
        if (sidechainBuffer != nullptr)
        {
            int scCh = ch - 2;  // map ch2→0, ch3→1
            if (scCh >= 0 && scCh < sidechainBuffer->getNumChannels())
                expandedBuffer.copyFrom(ch, 0, *sidechainBuffer, scCh, 0, numSamples);
        }
        // else: already cleared to silence above
    }
    
    wrappedPlugin->processBlock(expandedBuffer, midiMessages);
    
    // Copy back the output channels
    for (int ch = 0; ch < juce::jmin(numChannels, expandedBuffer.getNumChannels()); ++ch)
        buffer.copyFrom(ch, 0, expandedBuffer, ch, 0, numSamples);
}
```

**Why this is not enough**:
- The wrapper **clears channels 2-3** to silence when no sidechain buffer is provided
- When sidechain is disabled, `sidechainBuffer` is `nullptr`, so channels 2-3 stay silent
- Some plugins may interpret zero/silent sidechain as "please mute the output"
- Or the plugin might have a bug where 4-input mode + all-zero sidechain = audio mute

---

### 4. **Graph Buffer Allocation Problem**

The AudioProcessorGraph uses the wrapper's reported channel count (4-in) to allocate internal buffers. However:

**File**: `apps/desktop/src/core/ChainProcessor.cpp` (lines 1622-1623)

```cpp
// We only connect 2 channels (0 and 1)
addConnection({{currentAudioIn, 0}, {pluginNodeId, 0}}, UpdateKind::none);
addConnection({{currentAudioIn, 1}, {pluginNodeId, 1}}, UpdateKind::none);
// Channels 2-3 are NOT connected from upstream!
```

When the graph's internal render sequence runs:
1. The upstream node provides channels 0-1 only
2. The graph allocates a 4-channel buffer for the wrapper (based on its bus layout)
3. Channels 0-1 are filled by the connection
4. Channels 2-3 contain whatever was in the previous buffer (stale data OR zeroes)
5. When the wrapper's processBlock runs, it receives this 4-channel buffer with zeroes in ch2-3
6. The plugin processes silence on the sidechain and produces silent output

---

### 5. **Why "Sidechain Off" Doesn't Help**

**File**: `apps/desktop/src/core/ChainProcessor.cpp` (lines 1589-1594)

```cpp
// Set sidechain buffer on the wrapper if SC source is external
if (auto gNode = getNodeForId(pluginNodeId))
{
    if (auto* wrapper = dynamic_cast<PluginWithMeterWrapper*>(gNode->getProcessor()))
        wrapper->setSidechainBuffer(leaf.sidechainSource == 1 ? externalSidechainBuffer : nullptr);
}
```

Even when sidechain is disabled (`leaf.sidechainSource == 0`), the **graph routing is unchanged**:
- The wrapper still has a 4-input bus layout
- Channels 2-3 still aren't connected from upstream
- The plugin still receives silence on those channels
- Some plugins may mute output when sidechain is connected but contains silence

---

## Key Evidence from Code

### PluginWithMeterWrapper.cpp (lines 173-179)
```cpp
// Pre-prepare so the plugin initializes its bus layout (needed for sidechain plugins).
// Without this, PluginWithMeterWrapper defaults to stereo and the graph allocates
// 2-channel buffers — but sidechain plugins (Pro-L 2, etc.) expect 4 channels,
// causing a crash in AudioUnitPluginInstance::processAudio when it tries to clear
// channels that don't exist in the buffer.
instance->prepareToPlay(currentSampleRate, currentBlockSize);
```

This comment acknowledges the 4-channel problem but only tries to prevent crashes, not routing.

### PluginWithMeterWrapper.cpp (lines 87-88)
```cpp
// CRITICAL FIX: Pro-L 2 has 4 input channels (2 main + 2 sidechain)
// If the graph gives us fewer channels, we need to expand the buffer
```

This shows the workaround attempts to expand from 2 → 4, but doesn't solve the root cause.

---

## The Real Issue: AudioProcessorGraph Bus Layout vs. Connection Mismatch

The fundamental problem is **architectural**:

1. **PluginWithMeterWrapper reports 4 input channels** to the AudioProcessorGraph
2. **But the graph connections only wire 2 channels** (lines 1622-1623)
3. The graph sees "4-input node" but "2-channel connection"
4. Internal buffer allocation uses the node's declared channel count (4), not the connection count (2)
5. Channels 2-3 become uninitialized or explicitly zeroed
6. The plugin receives 4 channels where 2-3 are garbage/zero
7. Some plugins interpret this as "sidechain connected but silent" → mute output

---

## How the Graph Currently Handles This

The wrapper's `processBlock()` attempts to recover (lines 91-118):
- If incoming buffer has fewer channels than the plugin needs, it expands the buffer
- It clears unused channels to 0
- But this happens **after** the graph has already allocated buffers based on bus layout
- The damage is already done by then

---

## Why This Breaks Audio Output

When Pro-L 2 (or similar sidechain plugin):
1. Receives 4-channel input with ch2-3 = silence/garbage
2. Interprets this as "sidechain is connected but inactive"
3. May apply its sidechain-based gating/limiting to the main channels
4. With sidechain idle/silent, the plugin mutes the main output as well

---

## The Fix Conceptually Requires One Of:

1. **Don't expose 4-input bus layout to graph** - Keep wrapper at 2-in/2-out, handle sidechain internally only
2. **Wire all 4 channels from upstream** - But upstream only has 2, so this needs expansion in wireNode()
3. **Don't use sidechain plugins in 4-channel mode** - Force them to 2-channel stereo-only mode
4. **Create a sidechain splitter node** that takes 2 input channels and duplicates/routes them to 4-channel layout
5. **Use per-node bus layout configuration** - Only apply 4-channel layout when sidechain is actually enabled

---

## Files and Line Numbers Summary

| File | Lines | Issue |
|------|-------|-------|
| `PluginWithMeterWrapper.h` | 21-23 | setBusesLayout() from sidechain plugin |
| `PluginWithMeterWrapper.cpp` | 36-39 | setBusesLayout() in prepareToPlay |
| `PluginWithMeterWrapper.cpp` | 91-118 | Buffer expansion workaround |
| `ChainProcessor.cpp` | 173-179 | Pre-prepare call sets up 4-channel layout |
| `ChainProcessor.cpp` | 1622-1623 | **CRITICAL**: Only connects channels 0-1, not 2-3 |
| `ChainProcessor.cpp` | 1589-1594 | Sidechain buffer assignment (doesn't fix routing) |
| `ChainProcessor.cpp` | 1498-1507 | rebuildGraph() manages connections |

---

## Next Steps for Fixing

1. **Trace through a real Pro-L 2 instance** to confirm its bus layout requirements
2. **Check if sidechain is mandatory** or if it can be disabled in the plugin's bus configuration
3. **Test forcing 2-in/2-out layout** on the wrapper regardless of plugin type
4. **Or implement graph-level sidechain routing** that doesn't expose unused channels as connections
