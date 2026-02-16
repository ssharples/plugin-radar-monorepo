# Plugin Swap & Similarity System - Complete Technical Analysis

## Executive Summary

The plugin swap system enables users to replace plugins in a chain while automatically translating all parameters to maintain the same sonic intent. The workflow consists of:

1. **User Action** → "Swap Plugin" context menu in ChainSlot
2. **Similarity Discovery** → Find compatible plugins by semantic features
3. **Parameter Mapping** → Look up pre-computed parameter maps
4. **Translation** → Convert parameters using denormalization → physical units → renormalization
5. **Execution** → Replace plugin and apply translated settings
6. **Upload** → Auto-discover and upload parameter maps for future use

---

## 1. Feature-Level Similarity Scoring (`convex/lib/similarity.ts`)

### Core Algorithm
Compares plugins across 9 weighted dimensions, using **dynamic weight normalization** when fields are missing:

```
Score(source, candidate) = 0-100
```

**Dimensions with weights:**
- `effectType`: 20% (exact match)
- `sonicCharacter`: 15% (Jaccard similarity)
- `keyFeatures`: 15% (Jaccard similarity)
- `worksWellOn`: 12% (Jaccard similarity)
- `tonalCharacter`: 10% (Jaccard similarity)
- `useCases`: 8% (Jaccard similarity)
- `genreSuitability`: 8% (Jaccard similarity)
- `comparableTo`: 7% (name match → Jaccard fallback)
- `subcategory`: 5% (exact match)

### Implementation Details

**Jaccard Similarity:**
```
similarity(A, B) = |A ∩ B| / |A ∪ B|
```
- Case-insensitive comparison
- Returns 0 if either set is empty

**ComparableTo Special Handling:**
- Checks if source's `comparableTo` array mentions candidate's name (substring match)
- OR if candidate's `comparableTo` mentions source's name
- Example: If source has `comparableTo: ["SSL-style"]`, match with plugin named "SSL Channel Strip"

**Dynamic Weight Normalization:**
- If both source AND candidate have a field → include it in active weight sum
- If either is missing/empty → redistribute its weight among present fields
- Prevents unused fields from suppressing the score

**Tiebreaker Comparator** (in order):
1. Score (descending)
2. `isIndustryStandard` flag (industry standard preferred)
3. `mentionScore` (trending/mentioned plugins preferred)

**Output:**
- `score`: 0-100 integer
- `reasons`: Array of human-readable explanations (top 3 contributing dimensions)

---

## 2. Plugin Swap UI (`apps/desktop/ui/src/components/ChainEditor/PluginSwapMenu.tsx`)

### Menu Display
Triggered by right-click context menu on plugin slot. Shows:

**Header:**
- Title: "Swap Plugin"
- Random button (icon: Dice5)
- Close button
- **Map source indicator** with conditional "Scan" button

**Map Source Indicator States:**
- `manual`: Green badge, "Manual map (X%)"
- `juce-scanned`: Yellow badge, "Auto-discovered (X%)"
- `ai-analyzed`: Accent color badge, "AI-analyzed (X%)"
- `none`: Gray badge, "No map yet" + Scan button (if applicable)

**Content List:**
- Shows `findCompatibleSwaps()` results (owned plugins only, same category)
- Sorted by confidence descending
- Each item displays:
  - Plugin name
  - Parameter count and EQ band count
  - Confidence badge (green >80%, yellow 50-80%, red <50%)
  - Loading spinner while swapping

**Footer:**
- Legend explaining confidence color codes

### User Actions

**1. Read Parameters (Phase 1)**
```
UI: "Swap Plugin" menu opened
  ↓
Convex: fetchCompatibleSwaps(matchedPluginId)
  → getParameterMap(matchedPluginId)
  → listCandidates from ownedPlugins
  → computeSimilarityScore() for ranking
  ↓
UI: Display sorted candidates with confidence scores
```

**2. Scan Parameters (Phase 2) - Optional**
User clicks "Scan" button when no map exists:
```
UI: User clicks "Scan"
  ↓
JUCE: discoverPluginParameters(nodeId)
  → Analyzes loaded plugin's parameters
  → Returns semantic mapping with confidence
  ↓
Convex: uploadDiscoveredParameterMap(map, matchedPluginId)
  → Stores in pluginParameterMaps table
  → Updates UI with new map source
```

**3. Swap Execution (Phase 3)**
User clicks a candidate plugin:
```
UI: User selects candidate
  ↓
JUCE Phase 1: readPluginParameters(nodeId)
  → Returns current normalized values (0-1) for all params
  ↓
Convex: translateParameters(source, target, params)
  → Denormalize source → physical units
  → Convert units (Hz, ms, Q, etc.)
  → Clamp to target range
  → Renormalize to target's 0-1 range
  → Return targetParams with paramIndex + value
  ↓
JUCE Phase 2: findPluginInList(targetPlugin)
  → Scanned plugin list lookup by name
  → Get JUCE identifier string
  ↓
JUCE Phase 3: swapPluginInChain(nodeId, newPluginUid, translatedParams)
  → Remove plugin at nodeId
  → Insert new plugin at same position
  → Apply all translated parameters
  → Return updated chainState
  ↓
UI: Close menu, show toast "Swapped to Plugin X (60% confidence)"
```

### Error Handling
- "Plugin not matched to catalog" → Cannot find `matchedPluginId`
- "Failed to read plugin parameters" → JUCE parameter read failed
- "Translation failed" → No parameter map for source/target
- "Plugin X not found in scanned plugins" → Name lookup failed
- "Swap failed" → JUCE swap execution error

---

## 3. Parameter Mapping System (`convex/parameterTranslation.ts`)

### Parameter Map Schema (`pluginParameterMaps` table)

**Semantic Definition:**
```typescript
{
  juceParamId: string,          // e.g., "Frequency" or "band1frequency"
  juceParamIndex: number,       // JUCE parameter index
  semantic: string,             // e.g., "eq_band_1_freq", "comp_threshold"
  physicalUnit: string,         // "hz", "db", "ms", "ratio", "q_factor"
  mappingCurve: string,         // "linear", "logarithmic", "exponential", "stepped"
  minValue: number,             // Physical minimum
  maxValue: number,             // Physical maximum
  defaultValue?: number,        // Physical default
  
  // Stepped parameters (e.g., filter types)
  steps?: [
    { normalizedValue: 0.0, physicalValue: "bell" },
    { normalizedValue: 0.5, physicalValue: "low_shelf" },
    ...
  ],
  
  // JUCE NormalisableRange data (for exact curve reproduction)
  rangeStart?: number,
  rangeEnd?: number,
  skewFactor?: number,
  symmetricSkew?: boolean,
  hasNormalisableRange?: boolean,
  
  // Sampled curve (for complex non-standard curves)
  curveSamples?: [
    { normalized: 0.0, physical: 20.0 },
    { normalized: 0.5, physical: 1000.0 },
    { normalized: 1.0, physical: 20000.0 },
  ],
  
  qRepresentation?: string,      // "q_factor" | "bandwidth_octaves"
}
```

### Supported Mapping Curves

**1. Linear**
```
physical = min + (max - min) * normalized
```

**2. Logarithmic** (for frequencies, exponential ranges)
```
physical = exp(log(min) + normalized * (log(max) - log(min)))
```

**3. Exponential** (for smooth non-linear response)
```
physical = min + (max - min) * normalized²
```

**4. Stepped** (for discrete options like filter types)
- Maps normalized value to closest step
- Uses semantic aliases for type matching
- Example aliases:
  - `hpf` ↔ `high_pass` ↔ `highpass` ↔ `hp` ↔ `low_cut`
  - `bell` ↔ `peak` ↔ `parametric`
  - `low_shelf` ↔ `ls` ↔ `bass_shelf`

**5. JUCE NormalisableRange (exact reproduction)**
- Uses JUCE's proprietary skew formula:
  ```
  physical = start + (end - start) * normalized^(1/skew)
  ```
- Symmetric skew applies skew to each half separately
- Preserves exact curve from original plugin

### Unit Conversions

**Q Factor ↔ Bandwidth (octaves):**
```
bandwidth = 2 * asinh(1 / (2 * Q)) / ln(2)
Q = 1 / (2 * sinh(bandwidth * ln(2) / 2))
```

**Time Units:**
```
ms ↔ s (divide/multiply by 1000)
```

---

## 4. Parameter Translation Flow (`translateParameters` query)

### Step-by-Step Translation

**Input:**
```typescript
{
  sourcePluginId: ID,
  targetPluginId: ID,
  sourceParams: [
    { paramId: "band1freq", paramIndex: 5, normalizedValue: 0.75 }
    { paramId: "band1gain", paramIndex: 6, normalizedValue: 0.5 }
    { paramId: "band1q", paramIndex: 7, normalizedValue: 0.6 }
  ]
}
```

**Phase 1: Lookup Parameter Definitions**
```
sourceMap = getParameterMap(sourcePluginId)
targetMap = getParameterMap(targetPluginId)

Build semantic lookup maps:
  sourceBySemantic: { "eq_band_1_freq" → paramDef, ... }
  targetBySemantic: { "eq_band_1_freq" → paramDef, ... }
```

**Phase 2: Match Semantic IDs**
```
For each sourceParam:
  1. Find sourceDef by paramId
  2. Get semantic ID (e.g., "eq_band_1_freq")
  3. Look up targetDef by same semantic ID
  
Special handling for EQ bands:
  If source has 24 bands but target has 7:
    - Map band 1-7 normally
    - Drop bands 8-24
  If target has more bands than source:
    - Only translate bands source has
```

**Phase 3: Value Translation**

**For stepped parameters (filter types, modes):**
```
1. Find closest source step to normalizedValue
2. Get semantic meaning (e.g., "bell", "hpf")
3. Find matching target step by semantic meaning
4. If not found, try common aliases
5. Return target step's normalizedValue
```

**For continuous parameters:**
```
Step 1: Denormalize source value to physical units
  if hasNormalisableRange + skewFactor:
    physical = denormalizeWithSkew(normalized, start, end, skew, symmetricSkew)
  else:
    physical = denormalize(normalized, min, max, curve)

Step 2: Convert units (if needed)
  if sourceDef.qRepresentation != targetDef.qRepresentation:
    physical = convertUnits(physical, source, target)
  OR if sourceDef.unit != targetDef.unit:
    physical = convertUnits(physical, source, target)

Step 3: Clamp to target range
  targetMin = targetDef.rangeStart ?? targetDef.minValue
  targetMax = targetDef.rangeEnd ?? targetDef.maxValue
  clampedPhysical = Math.max(targetMin, Math.min(targetMax, physical))

Step 4: Renormalize to target's 0-1 range
  if targetDef.hasNormalisableRange + skewFactor:
    normalized = normalizeWithSkew(clampedPhysical, start, end, skew, symmetricSkew)
  else:
    normalized = normalize(clampedPhysical, min, max, curve)
```

**Output:**
```typescript
{
  targetParams: [
    { paramId: "frequency", paramIndex: 5, value: 0.72 },
    { paramId: "gain", paramIndex: 6, value: 0.48 },
    { paramId: "q", paramIndex: 7, value: 0.58 }
  ],
  confidence: 85,               // % of params successfully translated
  unmappedParams: [],           // params with no translation
  sourcePluginName: "FabFilter Pro-Q 3",
  targetPluginName: "WAVES Linear Phase"
}
```

---

## 5. Finding Compatible Swaps (`findCompatibleSwaps` query)

### Query Logic

```typescript
Input:
  pluginId: source plugin (from chain)
  userId: current user

Process:
  1. Get sourceMap = getParameterMap(pluginId)
  2. Get all category maps = getParameterMapsByCategory(sourceMap.category)
  3. Get userScanned = all scanned plugins for user
  4. Build ownedPluginIds = matched plugins from scanned list
  
  5. For each candidate in categoryMaps:
     - Skip if it's the source plugin
     - Skip if user doesn't own it
     - Calculate confidence:
       - Count semantic ID overlaps
       - overlapRatio = matching / total semantics
       - confidence = overlapRatio × min(sourceMap.confidence, targetMap.confidence)
     - Add to swaps list
  
  6. Sort by confidence descending
  7. Return top candidates
```

**Example:**
```
User has owned plugins: [FabFilter Pro-Q 3, WAVES Linear Phase, Neve Shelford]
Current plugin in chain: FabFilter Pro-Q 3

Candidates (same category: eq):
  - WAVES Linear Phase:
    - Overlap: eq_band_1_freq, eq_band_1_gain, eq_band_1_q (3/12 params)
    - Confidence: 25% × 90% × 85% = ~19%
    
  - Neve Shelford:
    - Overlap: eq_band_1_freq, eq_band_1_gain, eq_band_1_q, eq_band_1_type (4/12 params)
    - Confidence: 33% × 95% × 90% = ~28%

Result: [Neve Shelford (28%), WAVES Linear Phase (19%)]
```

---

## 6. Chain Store Integration (`apps/desktop/ui/src/stores/chainStore.ts`)

### Auto-Discovery on Plugin Add

When user adds a plugin to chain:

```typescript
addPlugin: async (pluginId: string) => {
  // ... normal add logic ...
  
  // Fire-and-forget auto-discovery
  const newNodeId = findNewPluginNodeId(newState.nodes)
  const enrichedData = usePluginStore.getState().enrichedData.get(newPlugin.uid)
  const matchedPluginId = enrichedData?._id
  
  autoDiscoverAndUpload(newNodeId, pluginName, matchedPluginId)
    .catch(() => {}) // Silently ignored — best-effort
}
```

### Auto-Discovery Logic

```typescript
async function autoDiscoverAndUpload(
  nodeId: number,
  pluginName: string,
  matchedPluginId?: string
): Promise<void> {
  if (!matchedPluginId) return  // Need catalog ID for upload
  
  // Check existing map quality
  const existingMap = await getParameterMapByName(pluginName)
  if (existingMap && (source === 'manual' || confidence >= 80))
    return  // Good enough, skip discovery
  
  // Run JUCE discovery
  const discoveryResult = await juceBridge.discoverPluginParameters(nodeId)
  if (!discoveryResult.success) return
  
  // Only upload if confidence meets threshold
  if (discoveryResult.map.confidence < 30) return
  
  // Upload to Convex
  const result = await uploadDiscoveredParameterMap(
    discoveryResult.map,
    matchedPluginId
  )
  
  // Done — no notification, best-effort background process
}
```

---

## 7. Parameter Discovery (`discoverPluginParameters` native function)

### JUCE Implementation

Called from desktop UI to analyze loaded plugin parameters:

```typescript
async discoverPluginParameters(nodeId: number): Promise<{
  success: boolean,
  map?: {
    pluginName: string,
    manufacturer: string,
    category: string,              // "eq", "compressor", etc.
    confidence: number,            // 0-100, how many params matched semantics
    matchedCount: number,          // params with semantic match
    totalCount: number,            // total parameters
    eqBandCount: number,           // for EQ plugins
    eqBandParameterPattern: string, // e.g., "Band{N}_Frequency"
    compHasParallelMix: boolean,
    compHasAutoMakeup: boolean,
    compHasLookahead: boolean,
    source: "juce-scanned",        // always this value
    parameters: [
      {
        juceParamId: string,
        juceParamIndex: number,
        semantic: string,           // matched semantic ID
        physicalUnit: string,
        mappingCurve: string,
        minValue: number,
        maxValue: number,
        defaultValue: number,
        matched: boolean            // true if semantic matched
      }
    ]
  },
  error?: string
}>
```

### Auto-Discovery Triggering

Users can manually trigger discovery:
1. Open PluginSwapMenu
2. Click "Scan" button (if no map exists)
3. JUCE analyzes plugin
4. Upload to Convex
5. UI updates to show new map source

---

## 8. Complete User Flow Example

### Scenario: Swap EQ Plugins

**User Setup:**
- Chain contains: FabFilter Pro-Q 3 (source)
- User owns: WAVES Linear Phase, Neve Shelford (same category)
- Pro-Q 3 has: parameter map (95% confidence, manual source)
- WAVES: parameter map (87% confidence, juce-scanned source)
- Neve: no parameter map

**User Action:**
1. Right-click Pro-Q 3 slot → "Swap Plugin"

**Step 1: Menu Opens**
```
UI calls: findCompatibleSwaps(proQId)
Convex:
  - Gets proQ parameterMap (12 semantic params)
  - Gets category "eq" maps
  - Filters to user's owned plugins
  - Scores WAVES vs Neve
  
Result:
  [
    {
      pluginId: "waves123",
      pluginName: "WAVES Linear Phase",
      confidence: 60,          // 8/12 params overlap × 87%
      parameterCount: 12
    },
    {
      pluginId: "neve456",
      pluginName: "Neve Shelford",
      confidence: 0,           // No parameter map = cannot swap
      parameterCount: 0
    }
  ]
```

**Step 2: Display Menu**
```
Shows:
  Map source: "Manual map (95%)" [green indicator]
  
  Candidates:
    → WAVES Linear Phase
      12 params · 60% match confidence [yellow badge]
    
  (Neve not shown because confidence = 0)
```

**Step 3: User Clicks WAVES**
```
JUCE Phase 1:
  readPluginParameters(proQNodeId)
  → Returns current normalized values:
    [
      { name: "band1freq", index: 0, normalizedValue: 0.65 },
      { name: "band1gain", index: 1, normalizedValue: 0.5 },
      { name: "band1q", index: 2, normalizedValue: 0.45 },
      { name: "band2freq", index: 3, normalizedValue: 0.72 },
      ...
    ]

Convex Phase 1:
  translateParameters(proQId, wavesId, sourceParams)
  
  Translation:
    band1freq (0.65):
      - Source: min=20, max=20000, curve=log, semantic="eq_band_1_freq"
      - Denormalize: physical = exp(log(20) + 0.65 * (log(20000) - log(20))) ≈ 2512 Hz
      - Target: min=20, max=20000, curve=log, semantic="eq_band_1_freq"
      - Renormalize: normalized = (log(2512) - log(20)) / (log(20000) - log(20)) ≈ 0.64
      - Result: paramIndex=0, value=0.64
    
    band1gain (0.5):
      - Source: min=-24, max=+24, curve=linear, semantic="eq_band_1_gain"
      - Denormalize: physical = -24 + 0.5 * 48 = 0 dB
      - Target: min=-24, max=+24, curve=linear, semantic="eq_band_1_gain"
      - Renormalize: normalized = (0 - (-24)) / 48 = 0.5
      - Result: paramIndex=1, value=0.5
    
    band1q (0.45):
      - Source: min=0.5, max=20, curve=log, semantic="eq_band_1_q"
      - Denormalize: physical ≈ 3.16 (Q factor)
      - Target: qRepresentation="bandwidth_octaves", semantic="eq_band_1_q"
      - Convert: bandwidth = 2 * asinh(1/(2*3.16)) / ln(2) ≈ 0.86 octaves
      - Target: min=0.1, max=5, curve=log
      - Renormalize: normalized ≈ 0.42
      - Result: paramIndex=2, value=0.42
  
  Returns: confidence=75% (9/12 params translated)

JUCE Phase 2:
  findPluginInList("WAVES Linear Phase")
  → Gets JUCE identifier: "com.waves.plugins.linear_phase"

JUCE Phase 3:
  swapPluginInChain(proQNodeId, "com.waves.plugins.linear_phase", [
    { paramIndex: 0, value: 0.64 },
    { paramIndex: 1, value: 0.5 },
    { paramIndex: 2, value: 0.42 },
    ...
  ])
  
  C++ executes:
    1. Remove Pro-Q from chain at nodeId
    2. Insert WAVES at same position
    3. Apply all translated parameters
    4. Return new chainState

UI:
  - Close menu
  - Show toast: "Swapped to WAVES Linear Phase (75% confidence)"
  - Update chain display with new plugin
  - Auto-discover WAVES params in background
```

---

## 9. Key Design Principles

### 1. Confidence is Multifaceted
- **Similarity score** (50%): feature overlap between plugins
- **Map quality** (25%): source (manual=100%, juce-scanned=80%, ai-analyzed=60%)
- **Translation ratio** (25%): % of params successfully translated
- Users see visual feedback: green (>80%), yellow (50-80%), red (<50%)

### 2. Graceful Degradation
- No parameter map? Show confidence=0 (cannot translate)
- Partial map? Translate what we can, skip unmapped params
- Stepped param mismatch? Skip it, apply continuous params
- Unit conversion unknown? Clamp to range as fallback

### 3. Best-Effort Auto-Discovery
- Happens in background after plugin add
- Only uploads if confidence ≥ 30%
- Skips if good map already exists
- Errors silently ignored

### 4. Ownership-Based Filtering
- Can only swap to plugins user owns (via scannedPlugins)
- Prevents suggesting unavailable plugins
- Matches on name + manufacturer

### 5. Semantic Parameter Mapping
- All parameters have semantic meaning (e.g., "eq_band_1_freq")
- Enables cross-plugin translation
- Supports unit conversion (Hz, dB, Q, octaves, ms)
- Handles EQ band remapping (7 bands → 24 bands)

---

## 10. Error Cases & Recovery

| Error | Cause | Recovery |
|-------|-------|----------|
| "Plugin not matched to catalog" | `matchedPluginId` is undefined | Cannot start swap |
| "No parameter map for [plugin]" | Parameter map doesn't exist | Show confidence=0, hide from list |
| "Failed to read plugin parameters" | JUCE readPluginParameters() fails | Show error, offer manual scan |
| "Translation failed" | No maps for source/target | Cannot proceed |
| "Plugin X not found in scanned plugins" | Name lookup fails | Offer manual plugin selection? |
| "Swap failed" | JUCE swapPluginInChain() fails | Rollback, show error |
| "Scan confidence too low" | `discoveryResult.confidence < 30` | Skip upload, notify user |

---

## 11. Database Tables Involved

| Table | Purpose |
|-------|---------|
| `plugins` | Plugin catalog (name, category, manufacturer, enrichment fields) |
| `scannedPlugins` | User's scanned local plugins (matched to catalog via matchedPlugin) |
| `ownedPlugins` | Plugins user has purchased/owns (derived from scannedPlugins) |
| `pluginParameterMaps` | Semantic parameter definitions (juceParamId → semantic → physical units) |
| `parameterSemantics` | Standard semantic definitions by category (seed data) |
| `pluginChains` | User's saved chains (slots contain plugin name + matchedPlugin ref) |

---

## 12. Implementation Checklist for New Systems

To add "swap similar" support for a new plugin category:

- [ ] Ensure category has ≥2 plugins with `category` field set in schema
- [ ] Run `discoverPluginParameters()` for key plugins in category
- [ ] Validate parameter maps (confidence ≥ 70%)
- [ ] Test `translateParameters()` for each pair
- [ ] Test `findCompatibleSwaps()` shows relevant candidates
- [ ] Verify UI displays confidence badges correctly
- [ ] Test edge cases: partial maps, unit conversion, stepped params

