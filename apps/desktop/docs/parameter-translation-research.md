# Parameter Translation Research: Cross-Plugin Parameter Mapping

> Research document for task #6: Implementing a robust parameter translation engine.
> Covers JUCE internals, semantic matching, edge cases, and architectural recommendations.

---

## Table of Contents

1. [JUCE Parameter Normalization Internals](#1-juce-parameter-normalization-internals)
2. [Current Implementation Analysis](#2-current-implementation-analysis)
3. [Parameter Semantic Matching Strategies](#3-parameter-semantic-matching-strategies)
4. [Edge Cases Catalog](#4-edge-cases-catalog)
5. [Physical Unit Conversion Formulas](#5-physical-unit-conversion-formulas)
6. [How Professional Hosts Handle This](#6-how-professional-hosts-handle-this)
7. [Open-Source References](#7-open-source-references)
8. [Recommended Architecture](#8-recommended-architecture)
9. [Implementation Priorities](#9-implementation-priorities)

---

## 1. JUCE Parameter Normalization Internals

### 1.1 NormalisableRange Core Formula

JUCE stores all parameter values in the 0-1 range (a limitation of some plugin APIs like VST2). The `NormalisableRange<float>` class handles the mapping between physical values and normalized values.

**Constructor signature:**
```cpp
NormalisableRange(ValueType rangeStart, ValueType rangeEnd,
                  ValueType intervalValue, ValueType skewFactor,
                  bool useSymmetricSkew = false)
```

### 1.2 convertFrom0to1 (Normalized -> Physical)

This is the function that maps a 0-1 slider position to a real-world value:

```cpp
ValueType convertFrom0to1(ValueType proportion) const noexcept
{
    proportion = clampTo0To1(proportion);

    if (convertFrom0To1Function != nullptr)
        return convertFrom0To1Function(start, end, proportion);

    if (!symmetricSkew)
    {
        if (!exactlyEqual(skew, 1.0f) && proportion > 0.0f)
            proportion = std::exp(std::log(proportion) / skew);

        return start + (end - start) * proportion;
    }

    // Symmetric skew: applies skew from the midpoint outward
    auto distanceFromMiddle = 2.0f * proportion - 1.0f;

    if (!exactlyEqual(skew, 1.0f) && !exactlyEqual(distanceFromMiddle, 0.0f))
        distanceFromMiddle = std::exp(std::log(std::abs(distanceFromMiddle)) / skew)
                             * (distanceFromMiddle < 0.0f ? -1.0f : 1.0f);

    return start + (end - start) / 2.0f * (1.0f + distanceFromMiddle);
}
```

**Simplified math (non-symmetric):**
```
physical = start + (end - start) * proportion^(1/skew)
```

### 1.3 convertTo0to1 (Physical -> Normalized)

This maps a physical value back to 0-1:

```cpp
ValueType convertTo0to1(ValueType v) const noexcept
{
    if (convertTo0To1Function != nullptr)
        return clampTo0To1(convertTo0To1Function(start, end, v));

    auto proportion = clampTo0To1((v - start) / (end - start));

    if (exactlyEqual(skew, 1.0f))
        return proportion;

    if (!symmetricSkew)
        return std::pow(proportion, skew);

    // Symmetric skew
    auto distanceFromMiddle = 2.0f * proportion - 1.0f;
    return (1.0f + std::pow(std::abs(distanceFromMiddle), skew)
                   * (distanceFromMiddle < 0.0f ? -1.0f : 1.0f)) / 2.0f;
}
```

**Simplified math (non-symmetric):**
```
normalized = ((physical - start) / (end - start))^skew
```

### 1.4 setSkewForCentre

This calculates the skew factor so that `convertFrom0to1(0.5)` returns `centrePointValue`:

```cpp
void setSkewForCentre(ValueType centrePointValue) noexcept
{
    skew = std::log(0.5f) / std::log((centrePointValue - start) / (end - start));
}
```

**Formula:** `skew = ln(0.5) / ln((centre - start) / (end - start))`

**Example:** For frequency 20Hz-20kHz with centre at geometric mean ~632Hz:
- `skew = ln(0.5) / ln((632 - 20) / (20000 - 20))` = ~0.2
- This is why the common JUCE frequency skew factor is 0.2

### 1.5 Key Insight: Skew != True Logarithmic

JUCE's skew-based mapping is a **power curve**, not a true logarithmic scale:
- `physical = start + range * normalized^(1/skew)` (power law)
- True log: `physical = min * (max/min)^normalized` (exponential of linear)

For frequency parameters, these are close but not identical. **When translating between plugins, we must match the actual curve type**, not assume all "logarithmic" parameters use the same formula.

### 1.6 Custom Remap Functions

JUCE also supports fully custom remap functions via lambdas:
```cpp
NormalisableRange(start, end, convertFrom0To1Func, convertTo0To1Func, snapFunc)
```

Some plugins use custom lambda mappings that don't correspond to any standard skew factor. **We cannot extract these lambdas** from external plugins -- we can only observe the behavior by sampling `getText()` at multiple normalized values.

### 1.7 RangedAudioParameter API

The `RangedAudioParameter` base class provides:
- `convertTo0to1(float v)` -- normalizes using the parameter's NormalisableRange
- `convertFrom0to1(float v)` -- denormalizes
- `getNormalisableRange()` -- returns the range (start, end, interval, skew)
- `getText(float normalisedValue, int maxLen)` -- text representation at a given normalized value
- `getValueForText(const String& text)` -- parse text back to normalized value
- `getNumSteps()` -- number of discrete steps (0 = continuous)
- `getLabel()` -- unit label string (e.g., "Hz", "dB", "ms")
- `getDefaultValue()` -- default normalized value

**Critical for discovery:** We can call `getText()` at multiple normalized values (0.0, 0.25, 0.5, 0.75, 1.0) to sample the actual mapping curve, even for custom remap functions.

---

## 2. Current Implementation Analysis

### 2.1 What We Have (Strengths)

**C++ ParameterDiscovery (`apps/desktop/src/core/ParameterDiscovery.cpp`):**
- Iterates all parameters via `getParameters()`
- Extracts physical range by calling `getText(0.0f)` and `getText(1.0f)`
- Pattern-matches parameter names to semantic IDs (regex-based)
- Infers mapping curve type from ranges and units
- Infers physical units from labels and ranges
- Detects EQ band numbers from parameter names
- Calculates confidence scores
- Exports as JSON for WebView bridge

**Convex Translation (`convex/parameterTranslation.ts`):**
- Stores parameter maps server-side per plugin
- Translates via semantic ID matching (source semantic -> target semantic)
- Handles stepped parameters with alias matching (bell/peak/parametric)
- Denormalize-clamp-renormalize pipeline for continuous parameters
- EQ band number remapping (bands beyond target count are dropped)
- Confidence scoring combining translation ratio and map quality
- `findCompatibleSwaps` finds same-category plugins user owns

**WebView Bridge (`apps/desktop/src/bridge/WebViewBridge.cpp`):**
- `swapPluginInChain` removes old, adds new, applies translated params
- `discoverPluginParameters` runs ParameterDiscovery on a loaded plugin

### 2.2 Gaps and Weaknesses

1. **Curve mismatch:** Our `denormalize()` uses `log(min) + t * (log(max) - log(min))` but JUCE uses `start + range * t^(1/skew)`. These are different curves. Translation between two plugins with different skew factors will produce incorrect physical values.

2. **No skew factor extraction:** We never call `getNormalisableRange()` to get the actual skew factor from the JUCE parameter. Instead we guess "logarithmic" or "linear" from heuristics. This is the single biggest source of inaccuracy.

3. **Physical range extraction is fragile:** We only sample `getText()` at 0.0 and 1.0. Some plugins return text like "Off" at 0.0 or "Auto" at 1.0, which breaks our float parser. We should sample at multiple points.

4. **No Q/bandwidth conversion:** When source EQ uses Q factor and target uses bandwidth in octaves, we have no conversion. Both get semantic "eq_band_N_q" but the physical units differ.

5. **Filter type mapping is basic:** Only exact string and alias matching. Doesn't handle numeric filter type indices or plugin-specific type ordering.

6. **No handling of different band topologies:** FabFilter Pro-Q 3 has dynamic bands (any band can be any type), while some EQs have fixed topology (Band 1 is always low shelf, Band 5 is always high shelf). Mapping "Band 3 = Bell" from Pro-Q to a fixed-topology EQ requires structural awareness.

7. **No gain structure awareness:** When source has separate input/output gain and target has only output gain, we should combine them.

8. **Compressor-specific gaps:** No handling of ratio scale differences (linear vs log), no attack/release unit conversion (ms vs s), no soft/hard knee mapping.

9. **"Unknown" parameters are discarded:** Parameters that don't match our regex patterns are completely ignored, even if they're semantically equivalent to a known parameter in the target.

---

## 3. Parameter Semantic Matching Strategies

### 3.1 Current Approach (Regex Pattern Matching)

Our current system uses regex patterns against parameter names:
```cpp
// Example: matches "freq", "frequency"
if (matchesPattern(name, R"(\b(freq|frequency)\b)"))
```

**Limitations:**
- Requires explicit patterns for every naming variant
- Can't handle unknown abbreviations or non-English names
- Doesn't use parameter context (range, unit) to resolve ambiguity

### 3.2 Recommended: Multi-Signal Scoring

Instead of binary match/no-match, use a scoring system that combines multiple signals:

```
matchScore = w1 * nameScore + w2 * unitScore + w3 * rangeScore + w4 * positionScore
```

**Signal 1: Name Similarity (nameScore)**
Combine multiple string matching strategies:
- Exact match (after normalization): score = 1.0
- Prefix match ("freq" is prefix of "frequency"): score = 0.95
- Alias lookup from predefined table: score = 0.9
- Token overlap (split on spaces/underscores, compare tokens): score varies
- Edit distance (Levenshtein) < 2: score = 0.7
- Substring containment: score = 0.6

**Alias Table (essential for audio plugins):**
```
frequency: freq, center, centre, center_freq, cf, cutoff, fc, hz
gain: boost, cut, level, amount, amplitude, db
q: quality, bandwidth, bw, width, resonance, res
threshold: thresh, thr
attack: att, atk
release: rel, decay
ratio: rat, compression
knee: soft_knee, hard_knee
mix: dry_wet, drywet, blend, parallel, wet
output: volume, level, master, out, makeup
input: drive, in, pre_gain
type: shape, mode, filter, slope
```

**Signal 2: Unit Compatibility (unitScore)**
If both parameters report similar units (via `getLabel()` or range inference):
- Same unit: score = 1.0
- Compatible units (Hz vs kHz, ms vs s): score = 0.8
- Both dimensionless: score = 0.5
- Incompatible units: score = 0.0

**Signal 3: Range Compatibility (rangeScore)**
Compare physical ranges:
- Overlapping ranges: score based on overlap percentage
- Same order of magnitude: score = 0.7
- Very different ranges (e.g., 0-1 vs 20-20000): score = 0.1

**Signal 4: Position Context (positionScore)**
Parameters that appear in similar positions within their respective parameter lists:
- Same band number: score = 1.0
- Adjacent band number: score = 0.5
- Parameters in the same group/section: score = 0.3

### 3.3 Two-Phase Matching

**Phase 1: Confident Matches (score > 0.85)**
- Direct semantic ID matches (eq_band_1_freq -> eq_band_1_freq)
- Unambiguous name matches with compatible units

**Phase 2: Fuzzy Matches (score 0.5 - 0.85)**
- Present to user for confirmation
- Mark as "suggested" in the translation result
- Allow user to accept/reject/remap

### 3.4 Band Number Extraction Improvements

Current regex patterns are good but miss some cases:

```
// Additional patterns to support:
"Low Band Freq"     -> band 1 (by position keyword "Low")
"HF Gain"           -> band 5 (by position keyword "HF")
"EQ 1 - Frequency"  -> band 1 (numbered EQ prefix)
"Para 3 Freq"       -> band 3 ("Para" = parametric = band)
"Peak 2"            -> band 2 ("Peak" = bell band)
```

Also need to detect **fixed topology** patterns:
```
"Low Cut Freq"      -> always the HPF (not a parametric band)
"High Shelf Gain"   -> always the high shelf
"Low Shelf Freq"    -> always the low shelf
```

---

## 4. Edge Cases Catalog

### 4.1 Different Band Counts

**Problem:** FabFilter Pro-Q 3 has up to 24 bands, TDR Nova has 6 (4 parametric + HP + LP).

**Strategy:**
- Map bands 1:1 where both plugins have them
- Drop excess bands from source (with warning to user)
- For N-source -> M-target where N > M, prioritize bands with highest gain deviation from 0dB
- Return `unmappedBands` in translation result

### 4.2 Fixed vs Dynamic Topology

**Problem:** Plugin A has 5 dynamic bands (any can be any type). Plugin B has fixed topology: HP, Low Shelf, 3x Bell, High Shelf, LP.

**Strategy:**
- Match by filter type first, then by frequency
- Source band with type=HPF maps to target's dedicated HPF slot
- Source band with type=Bell maps to nearest available Bell slot
- If source has 2 HPFs but target has only 1, drop the higher-frequency one

### 4.3 Different Range Limits

**Problem:** EQ A frequency range is 10Hz-30kHz, EQ B is 20Hz-20kHz.

**Strategy:**
- Clamp physical value to target range (already implemented)
- Return `clampedParams` list so UI can warn user about out-of-range values
- For frequencies near the boundary, consider mapping to the target's nearest extreme

### 4.4 Discrete vs Continuous

**Problem:** Source has continuous Q knob (0.1 to 40.0), target has stepped Q (0.5, 0.7, 1.0, 1.4, 2.0, 4.0, 8.0).

**Strategy:**
- Find the nearest step to the denormalized physical value
- Return `discretizationError` so UI can show the approximation

### 4.5 Different Q Representations

**Problem:** Plugin A uses Q factor (0.1 to 40), Plugin B uses bandwidth in octaves (0.05 to 5).

**Conversion formulas:**
```
Q_to_octaves(Q) = 2 * asinh(1 / (2 * Q)) / ln(2)
octaves_to_Q(BW) = 1 / (2 * sinh(ln(2) / 2 * BW))
```

**Approximate lookup table:**
| Q     | Octaves |
|-------|---------|
| 0.667 | 2.0     |
| 1.414 | 1.0     |
| 2.871 | 0.5     |
| 4.36  | 0.333   |
| 5.76  | 0.25    |
| 11.54 | 0.125   |
| 23.0  | 0.0625  |

### 4.6 Filter Type Index Mismatch

**Problem:** Plugin A's filter types: [0=Bell, 1=Low Shelf, 2=High Shelf, 3=HPF 12dB, 4=HPF 24dB, 5=LPF 12dB, 6=LPF 24dB, 7=Notch, 8=Bandpass].
Plugin B's filter types: [0=Peak, 1=LP, 2=HP, 3=Bandpass, 4=Notch, 5=Low Shelf, 6=High Shelf, 7=All Pass].

**Strategy:**
- Never translate by index -- always translate by semantic meaning
- The stepped value translation with alias groups (already implemented) is the right approach
- Extend alias groups:
```
bell:        ["bell", "peak", "peaking", "parametric", "para"]
low_shelf:   ["low_shelf", "low shelf", "ls", "shelf_low", "bass_shelf", "lo shelf"]
high_shelf:  ["high_shelf", "high shelf", "hs", "shelf_high", "treble_shelf", "hi shelf"]
hpf:         ["hpf", "high_pass", "highpass", "hp", "low_cut", "lowcut", "lc",
              "hpf_6", "hpf_12", "hpf_24", "hpf_48", "hp6", "hp12", "hp24", "hp48"]
lpf:         ["lpf", "low_pass", "lowpass", "lp", "high_cut", "highcut", "hc",
              "lpf_6", "lpf_12", "lpf_24", "lpf_48", "lp6", "lp12", "lp24", "lp48"]
notch:       ["notch", "band_reject", "band_stop", "br"]
bandpass:    ["bandpass", "band_pass", "bp"]
tilt:        ["tilt", "tilt_shelf", "tilt_eq"]
allpass:     ["allpass", "all_pass", "ap", "phase"]
```

**Slope handling:** When source has "HPF 24dB/oct" but target only has "HPF 12dB/oct", map to the closest available slope and warn the user.

### 4.7 Compressor-Specific Edge Cases

**Ratio representations:**
- Most: ratio as X:1 (e.g., 4.0 means 4:1)
- Some: percentage (100% = infinite ratio)
- 1176-style: discrete buttons (4, 8, 12, 20, all-buttons)
- LA-2A style: compress vs limit toggle

**Attack/release units:**
- Most modern compressors: milliseconds
- Some: seconds (multiply by 1000)
- Some: microseconds (divide by 1000)
- 1176-style: arbitrary knob position (1-7), not direct time

**Knee:**
- Soft/hard binary toggle vs. continuous dB value (0-30 dB)
- Binary: soft = ~6dB, hard = 0dB

**Sidechain filter:**
- Some compressors have HP/LP sidechain filters, others don't
- These parameters have no equivalent in simpler compressors -> unmapped

### 4.8 Different Default Values

**Problem:** When a parameter has no equivalent in the target plugin, should we leave it at default or try to infer a reasonable value?

**Strategy:** Always use the target's default value for unmapped parameters. Never try to infer -- it's better to have the expected default behavior than a possibly wrong guess.

### 4.9 Skew Factor Mismatch

**Problem:** Plugin A uses skew=0.2 for frequency (JUCE power curve), Plugin B uses true logarithmic mapping (custom lambda).

**Strategy:** The correct approach is:
1. Get source normalized value (0-1)
2. Denormalize using source's actual curve to get physical value
3. Renormalize using target's actual curve

This requires knowing the actual curve for each parameter. Options:
- **Best:** Extract `getNormalisableRange()` to get skew factor directly
- **Fallback:** Sample `getText()` at 5+ points and fit a curve
- **Current (inaccurate):** Guess "logarithmic" and use `exp(log(min) + t * (log(max) - log(min)))`

---

## 5. Physical Unit Conversion Formulas

### 5.1 Frequency Units

```
Hz_to_kHz(hz)  = hz / 1000
kHz_to_Hz(khz) = khz * 1000
```

### 5.2 Time Units

```
ms_to_s(ms)   = ms / 1000
s_to_ms(s)    = s * 1000
us_to_ms(us)  = us / 1000
ms_to_us(ms)  = ms * 1000
```

### 5.3 Q Factor / Bandwidth Conversion

```
Q_to_bandwidth_octaves(Q):
    return (2 / ln(2)) * asinh(1 / (2 * Q))

bandwidth_octaves_to_Q(BW):
    return 1 / (2 * sinh(ln(2) * BW / 2))

Q_to_bandwidth_hz(Q, f0):
    return f0 / Q

bandwidth_hz_to_Q(BW_hz, f0):
    return f0 / BW_hz
```

### 5.4 Gain Units

```
dB_to_linear(dB):     return 10^(dB/20)
linear_to_dB(linear): return 20 * log10(linear)

percent_to_linear(pct): return pct / 100
linear_to_percent(lin): return lin * 100
```

### 5.5 Ratio Representations

```
ratio_to_percent(ratio):  return (1 - 1/ratio) * 100  // e.g., 4:1 -> 75%
percent_to_ratio(pct):    return 1 / (1 - pct/100)    // e.g., 75% -> 4:1

// Special cases:
// Infinity:1 = 100% (limiter)
// 1:1 = 0% (no compression)
```

### 5.6 Filter Slope

```
order_to_dbPerOct(order): return order * 6  // 1st order = 6dB/oct
dbPerOct_to_order(db):    return db / 6     // 24dB/oct = 4th order
```

---

## 6. How Professional Hosts Handle This

### 6.1 Blue Cat's PatchWork

PatchWork uses a **purely manual parameter mapping system** with semi-automated assistance:

- Up to 40 mappable "Control" parameters
- **Learn Mode**: user touches a knob in a sub-plugin, PatchWork auto-maps it to the next available control
- **Map All Params**: batch-maps all parameters in order
- **Macro Controls** (v2.6+): one control adjusts multiple params across different plugins with adjustable ranges
- **No automatic cross-plugin translation**: swapping a plugin requires manual remapping
- Configurations (chains + mappings) can be saved as presets

**Key insight:** PatchWork does NOT attempt semantic understanding of parameters. It's a generic parameter forwarding system.

### 6.2 DDMF Metaplugin

Metaplugin is a plugin-chainer that:
- Loads VST/VST3/AU plugins in a signal flow graph
- Includes built-in Mid-Side matrix, crossover filter, routing plugin
- Can be used as format wrapper (VST in AAX, AU in Pro Tools)
- **No parameter translation between loaded plugins** -- each plugin maintains its own independent preset state

### 6.3 Kilohearts (Snap Heap / Multipass / Phase Plant)

Kilohearts uses a **closed ecosystem** approach:
- Their "Snapins" are standardized micro-effects with consistent parameter APIs
- Parameters are exposed uniformly because they control the entire plugin ecosystem
- Preset sharing works because all Snapins have identical internal architectures
- **Not applicable to our problem**: they don't translate between third-party plugins

### 6.4 pMix (Open Source, JUCE-based)

pMix by Oli Larkin is a preset interpolator and plugin chainer:
- Supports VST2, VST3, AU plugins
- **Preset interpolation**: morph between presets using 2D spatial control
- Parameters are mapped by index position, not semantic meaning
- Users position preset "balls" on a 2D plane and the system interpolates

**Key insight:** pMix's interpolation works because it operates on the same plugin's presets (same parameter space). Cross-plugin translation is not addressed.

### 6.5 Summary: Nobody Does What We're Doing

**No existing tool provides automatic semantic parameter translation between different third-party audio plugins.** This is genuinely novel. The closest approaches are:

1. Manual mapping (PatchWork, Metaplugin)
2. Closed ecosystems (Kilohearts)
3. Same-plugin interpolation (pMix)

Our approach of semantic parameter discovery + server-side translation maps + physical-value intermediary is ahead of the state of the art.

---

## 7. Open-Source References

### 7.1 Relevant Projects

| Project | URL | Relevance |
|---------|-----|-----------|
| **pMix2** | github.com/olilarkin/pMix2 | Plugin chainer with preset interpolation |
| **acabreira1/pluginparameters** | github.com/acabreira1/pluginparameters | JUCE parameter management with log/custom mapping |
| **sudara/melatonin_parameters** | github.com/sudara/melatonin_parameters | Parameter behavior and formatting for JUCE |
| **chowdsp_utils** | github.com/Chowdhury-DSP/chowdsp_utils | DSP utilities including preset management |
| **Element** | github.com/kushview/Element | Full modular JUCE plugin host |
| **PresetMagician** | github.com/PresetMagician/PresetMagician | NKS preset extraction from VST plugins (C#) |

### 7.2 Research Papers

| Paper | Relevance |
|-------|-----------|
| **Text2FX** (2024, Northwestern) | Uses CLAP embeddings + DDSP to control audio effects from text. Shows semantic-to-parameter mapping is possible via learned embeddings. |
| **LLM2Fx** (2025) | LLMs predicting audio effect parameters from natural language. Zero-shot Fx parameter generation. |
| **Synthesizer Sound Matching** (DAFx 2024, Native Instruments) | Audio Spectrogram Transformers for matching synth sounds. Parameter estimation from audio, not parameter names. |

### 7.3 Key Formula Reference: JUCE Skew Factor

To calculate skew factor for a desired centre point:
```
skew = ln(0.5) / ln((centre - start) / (end - start))
```

Common skew factors in audio plugins:
| Range | Centre | Skew |
|-------|--------|------|
| 20Hz - 20kHz | ~632Hz (geometric mean) | 0.199 |
| 20Hz - 20kHz | 1kHz | 0.229 |
| 0.1ms - 1000ms | ~10ms | 0.229 |
| 1ms - 5000ms | ~70ms | 0.229 |
| 1:1 - 20:1 (ratio) | ~4.5:1 | 0.5 |

---

## 8. Recommended Architecture

### 8.1 Three-Layer Translation Pipeline

```
Source Plugin (JUCE)
    |
    v
[Layer 1: Discovery] -- Extract parameter metadata + actual curve behavior
    |
    v
[Layer 2: Physical Domain] -- Convert all values to physical units (Hz, dB, ms, Q)
    |
    v
[Layer 3: Re-synthesis] -- Map physical values to target parameter space
    |
    v
Target Plugin (JUCE)
```

### 8.2 Layer 1: Improved Discovery (C++)

**Changes to `ParameterDiscovery`:**

1. **Extract NormalisableRange directly** (when available):
```cpp
if (auto* rangedParam = dynamic_cast<RangedAudioParameter*>(param))
{
    auto& range = rangedParam->getNormalisableRange();
    discovered.rangeStart = range.start;
    discovered.rangeEnd = range.end;
    discovered.skewFactor = range.skew;
    discovered.symmetricSkew = range.symmetricSkew;
    discovered.interval = range.interval;
    discovered.hasNormalisableRange = true;
}
```

2. **Multi-point curve sampling** (for all params, as validation):
```cpp
// Sample at 5 points to characterize the mapping curve
for (float norm : {0.0f, 0.25f, 0.5f, 0.75f, 1.0f})
{
    auto text = param->getText(norm, 64);
    float physical = parseFloat(text);
    discovered.curveSamples.push_back({norm, physical});
}
```

3. **Curve fitting from samples** when NormalisableRange is not accessible:
```cpp
// Given samples at [0, 0.25, 0.5, 0.75, 1.0], fit the best curve:
// - Linear: physical = min + (max - min) * norm
// - Power (JUCE skew): physical = min + (max - min) * norm^(1/skew)
//   -> solve for skew from midpoint: skew = ln(0.5) / ln((mid - min) / (max - min))
// - True log: physical = min * (max/min)^norm
// - Stepped: discrete values at regular intervals
```

4. **Enhanced semantic matching** using the multi-signal scoring system from Section 3.2

### 8.3 Layer 2: Physical Domain Translation (Convex)

**Key changes to `parameterTranslation.ts`:**

1. **Use actual curve functions instead of guessing:**
```typescript
function denormalizeWithSkew(
    normalized: number,
    start: number, end: number,
    skew: number, symmetricSkew: boolean
): number {
    let proportion = Math.max(0, Math.min(1, normalized));

    if (!symmetricSkew) {
        if (skew !== 1.0 && proportion > 0)
            proportion = Math.exp(Math.log(proportion) / skew);
        return start + (end - start) * proportion;
    }

    // Symmetric skew
    let dist = 2 * proportion - 1;
    if (skew !== 1.0 && dist !== 0)
        dist = Math.exp(Math.log(Math.abs(dist)) / skew)
               * (dist < 0 ? -1 : 1);
    return start + (end - start) / 2 * (1 + dist);
}
```

2. **Unit conversion layer:**
```typescript
function convertUnits(
    value: number,
    sourceUnit: string,
    targetUnit: string
): number {
    // Same unit? No conversion needed
    if (sourceUnit === targetUnit) return value;

    // Q <-> bandwidth conversion
    if (sourceUnit === 'q' && targetUnit === 'octaves')
        return qToOctaves(value);
    if (sourceUnit === 'octaves' && targetUnit === 'q')
        return octavesToQ(value);

    // Time conversions
    if (sourceUnit === 'ms' && targetUnit === 's') return value / 1000;
    if (sourceUnit === 's' && targetUnit === 'ms') return value * 1000;

    // If no conversion available, return as-is (best effort)
    return value;
}
```

3. **Enhanced translation with confidence per-parameter:**
```typescript
interface TranslatedParam {
    paramId: string;
    paramIndex: number;
    value: number;
    confidence: number;     // Per-param confidence (0-100)
    matchType: 'exact' | 'alias' | 'fuzzy' | 'range_clamped';
    warning?: string;       // e.g., "Frequency clamped from 25000Hz to 20000Hz"
}
```

### 8.4 Layer 3: Enhanced Parameter Map Schema

**Extended `pluginParameterMaps` table fields:**

```typescript
parameters: [{
    juceParamId: string,
    juceParamIndex: number,
    semantic: string,
    physicalUnit: string,

    // NEW: Actual curve data from JUCE
    rangeStart: number,      // NormalisableRange.start
    rangeEnd: number,        // NormalisableRange.end
    skewFactor: number,      // NormalisableRange.skew (default 1.0)
    symmetricSkew: boolean,  // NormalisableRange.symmetricSkew
    interval: number,        // NormalisableRange.interval (snap)

    // NEW: Multi-point curve samples for validation
    curveSamples?: Array<{ normalized: number, physical: number }>,

    // NEW: For Q/bandwidth disambiguation
    qRepresentation?: 'q_factor' | 'bandwidth_octaves' | 'bandwidth_hz',

    // Existing fields
    mappingCurve: string,    // Keep for backward compat
    minValue: number,        // Physical min (from getText)
    maxValue: number,        // Physical max (from getText)
    defaultValue: number,
    numSteps: number,
    label: string,
    matched: boolean,
    steps?: Array<{ normalizedValue: number, physicalValue: string }>,
}]
```

### 8.5 Translation Algorithm (Pseudocode)

```
function translateParameter(sourceParam, sourceMap, targetParam, targetMap):
    // Step 1: Get source physical value using actual curve
    physicalValue = denormalizeWithSkew(
        sourceNormalized,
        sourceParam.rangeStart, sourceParam.rangeEnd,
        sourceParam.skewFactor, sourceParam.symmetricSkew
    )

    // Step 2: Convert units if needed
    if sourceParam.physicalUnit != targetParam.physicalUnit:
        physicalValue = convertUnits(physicalValue,
            sourceParam.physicalUnit, targetParam.physicalUnit)

    // Step 3: Clamp to target range
    clamped = clamp(physicalValue, targetParam.rangeStart, targetParam.rangeEnd)
    wasClamped = (clamped != physicalValue)

    // Step 4: Renormalize using target's actual curve
    targetNormalized = normalizeWithSkew(
        clamped,
        targetParam.rangeStart, targetParam.rangeEnd,
        targetParam.skewFactor, targetParam.symmetricSkew
    )

    return {
        value: targetNormalized,
        confidence: calculateParamConfidence(sourceParam, targetParam, wasClamped),
        warning: wasClamped ? `Value clamped to target range` : null
    }
```

---

## 9. Implementation Priorities

### Priority 1: Fix Curve Translation (High Impact, Medium Effort)

**Problem:** Our denormalize/normalize functions use generic log/linear approximations instead of the actual JUCE curve math.

**Fix:**
1. In `ParameterDiscovery`, extract `getNormalisableRange()` to get skew factor
2. Pass skew factor through JSON to Convex
3. In `parameterTranslation.ts`, implement `denormalizeWithSkew()` and `normalizeWithSkew()` using the exact JUCE formulas
4. Fall back to multi-point sampling when NormalisableRange is not accessible

**Estimated accuracy improvement:** 30-50% for frequency/time parameters

### Priority 2: Multi-Point Curve Sampling (High Impact, Low Effort)

**Problem:** We only sample `getText()` at 0.0 and 1.0, missing curve shape entirely.

**Fix:**
1. Sample at 0.0, 0.25, 0.5, 0.75, 1.0
2. Store samples in parameter map
3. Use samples to validate/correct skew factor extraction
4. Use samples to detect custom mapping functions

### Priority 3: Q/Bandwidth Conversion (Medium Impact, Low Effort)

**Problem:** Q factor and bandwidth in octaves are not interconvertible in our system.

**Fix:**
1. Add `qRepresentation` field to parameter map
2. Detect representation from parameter range and label (Q > 1 typical: 0.1-40; octaves typical: 0.05-5)
3. Add conversion functions in translation layer

### Priority 4: Enhanced Semantic Matching (Medium Impact, Medium Effort)

**Problem:** Regex-only matching misses many valid parameter name variants.

**Fix:**
1. Implement multi-signal scoring (name + unit + range)
2. Expand alias tables
3. Add fuzzy matching as fallback for unknown names
4. Return confidence per parameter (not just overall)

### Priority 5: Filter Type Awareness (Medium Impact, Medium Effort)

**Problem:** Fixed-topology EQs need structural mapping, not just band number mapping.

**Fix:**
1. Detect fixed topology during discovery (HPF always at band 0, shelves at edges)
2. Add `bandTopology` field to parameter map (dynamic vs fixed, and layout description)
3. Map by filter type + frequency proximity rather than band number

### Priority 6: Compressor-Specific Translation (Lower Impact, Medium Effort)

**Problem:** Different ratio scales, time units, knee representations.

**Fix:**
1. Add ratio scale detection (linear vs log, range tells us a lot)
2. Add time unit normalization (always store in ms internally)
3. Add knee mapping (binary soft/hard <-> continuous dB)

### Priority 7: User-Correctable Mappings (Important for UX)

**Problem:** When auto-translation is wrong, users need to fix it.

**Fix:**
1. Return detailed translation results with per-parameter confidence
2. UI shows "suggested" vs "confident" mappings
3. User can drag-remap parameters
4. User corrections feed back into the parameter map (source: "user-corrected")
5. User corrections improve confidence for future translations of same plugin pair

---

## Appendix A: JUCE Parameter Access Patterns

### Getting All Parameters
```cpp
auto& params = processor->getParameters();
for (int i = 0; i < params.size(); ++i)
{
    auto* param = params[i];
    // param->getName(256)    -> display name
    // param->getLabel()      -> unit label
    // param->getNumSteps()   -> 0 for continuous
    // param->getDefaultValue() -> default (normalized 0-1)
    // param->getText(norm, maxLen) -> text at given normalized value
    // param->getValueForText(text) -> normalized value from text

    // Try to get the NormalisableRange
    if (auto* ranged = dynamic_cast<juce::RangedAudioParameter*>(param))
    {
        auto& range = ranged->getNormalisableRange();
        // range.start, range.end, range.skew, range.symmetricSkew, range.interval
        // range.convertFrom0to1(norm) -> physical
        // range.convertTo0to1(physical) -> normalized
    }
}
```

### Setting Parameters on Target Plugin
```cpp
// After translation, apply to new plugin instance:
auto& params = newProcessor->getParameters();
for (auto& translated : translatedParams)
{
    if (translated.paramIndex >= 0 && translated.paramIndex < params.size())
    {
        // setValue takes a normalized 0-1 value
        params[translated.paramIndex]->setValue(translated.value);
    }
}
```

## Appendix B: Common Plugin Parameter Ranges

### EQ Parameters (Typical)

| Parameter | Typical Range | Unit | Curve | Skew |
|-----------|--------------|------|-------|------|
| Frequency | 20 - 20,000 Hz | Hz | Log/Power | 0.2 |
| Gain | -30 to +30 dB | dB | Linear | 1.0 |
| Q | 0.1 to 40 | ratio | Log/Power | ~0.3 |
| Filter Type | 0-7 (discrete) | stepped | Stepped | N/A |

### Compressor Parameters (Typical)

| Parameter | Typical Range | Unit | Curve | Skew |
|-----------|--------------|------|-------|------|
| Threshold | -60 to 0 dB | dB | Linear | 1.0 |
| Ratio | 1:1 to 20:1 | ratio | Log | ~0.5 |
| Attack | 0.01 to 300 ms | ms | Log | ~0.3 |
| Release | 1 to 5000 ms | ms | Log | ~0.3 |
| Knee | 0 to 30 dB | dB | Linear | 1.0 |
| Makeup | -12 to +36 dB | dB | Linear | 1.0 |
| Mix | 0 to 100% | percent | Linear | 1.0 |

### Reverb Parameters (Typical)

| Parameter | Typical Range | Unit | Curve |
|-----------|--------------|------|-------|
| Decay/RT60 | 0.1 to 20 s | s | Log |
| Pre-delay | 0 to 500 ms | ms | Linear |
| Damping | 0 to 100% | percent | Linear |
| Size | 0 to 100% | percent | Linear |
| Mix | 0 to 100% | percent | Linear |
| HP Filter | 20 to 2000 Hz | Hz | Log |
| LP Filter | 200 to 20000 Hz | Hz | Log |

### Delay Parameters (Typical)

| Parameter | Typical Range | Unit | Curve |
|-----------|--------------|------|-------|
| Time | 1 to 5000 ms | ms | Log |
| Feedback | 0 to 100% | percent | Linear |
| Mix | 0 to 100% | percent | Linear |
| HP Filter | 20 to 2000 Hz | Hz | Log |
| LP Filter | 200 to 20000 Hz | Hz | Log |
| Sync | On/Off | boolean | Stepped |
