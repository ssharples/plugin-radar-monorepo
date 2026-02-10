import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================
// Helper: Denormalize a 0-1 JUCE value to physical units
// ============================================
function denormalize(
  normalizedValue: number,
  minValue: number,
  maxValue: number,
  curve: string
): number {
  const clamped = Math.max(0, Math.min(1, normalizedValue));

  switch (curve) {
    case "logarithmic": {
      // Logarithmic mapping: 0-1 → log scale between min and max
      // Handles min=0 by using a small epsilon
      const safeMin = Math.max(minValue, 1e-6);
      const logMin = Math.log(safeMin);
      const logMax = Math.log(maxValue);
      return Math.exp(logMin + clamped * (logMax - logMin));
    }
    case "exponential": {
      // Exponential: physical = min + (max - min) * value^2
      return minValue + (maxValue - minValue) * clamped * clamped;
    }
    case "stepped": {
      // Stepped values are handled separately via steps array
      return clamped;
    }
    case "linear":
    default: {
      return minValue + clamped * (maxValue - minValue);
    }
  }
}

// ============================================
// Helper: Normalize a physical value to 0-1 JUCE range
// ============================================
function normalize(
  physicalValue: number,
  minValue: number,
  maxValue: number,
  curve: string
): number {
  switch (curve) {
    case "logarithmic": {
      const safeMin = Math.max(minValue, 1e-6);
      const safeVal = Math.max(physicalValue, safeMin);
      const logMin = Math.log(safeMin);
      const logMax = Math.log(maxValue);
      const logVal = Math.log(safeVal);
      return Math.max(0, Math.min(1, (logVal - logMin) / (logMax - logMin)));
    }
    case "exponential": {
      const range = maxValue - minValue;
      if (range <= 0) return 0;
      const ratio = (physicalValue - minValue) / range;
      return Math.max(0, Math.min(1, Math.sqrt(Math.max(0, ratio))));
    }
    case "stepped": {
      return physicalValue; // Pass through for stepped
    }
    case "linear":
    default: {
      const range = maxValue - minValue;
      if (range <= 0) return 0;
      return Math.max(0, Math.min(1, (physicalValue - minValue) / range));
    }
  }
}

// ============================================
// Helper: Denormalize using exact JUCE NormalisableRange skew formula
// physical = start + (end - start) * proportion^(1/skew)
// ============================================
function denormalizeWithSkew(
  normalized: number,
  start: number,
  end: number,
  skew: number,
  symmetricSkew: boolean
): number {
  const clamped = Math.max(0, Math.min(1, normalized));

  if (skew === 1.0) {
    // Linear case — no skew
    return start + (end - start) * clamped;
  }

  if (symmetricSkew) {
    // Symmetric skew: apply skew to each half separately
    const mid = (start + end) * 0.5;
    if (clamped < 0.5) {
      const proportion = clamped * 2.0;
      return start + (mid - start) * Math.pow(proportion, 1.0 / skew);
    } else {
      const proportion = (clamped - 0.5) * 2.0;
      return mid + (end - mid) * Math.pow(proportion, 1.0 / skew);
    }
  }

  // Standard skew: physical = start + (end - start) * normalized^(1/skew)
  return start + (end - start) * Math.pow(clamped, 1.0 / skew);
}

// ============================================
// Helper: Normalize using exact JUCE NormalisableRange skew formula
// normalized = ((physical - start) / (end - start))^skew
// ============================================
function normalizeWithSkew(
  physical: number,
  start: number,
  end: number,
  skew: number,
  symmetricSkew: boolean
): number {
  const range = end - start;
  if (range <= 0) return 0;

  const clampedPhysical = Math.max(start, Math.min(end, physical));

  if (skew === 1.0) {
    return (clampedPhysical - start) / range;
  }

  if (symmetricSkew) {
    const mid = (start + end) * 0.5;
    if (clampedPhysical < mid) {
      const proportion = (clampedPhysical - start) / (mid - start);
      return Math.pow(Math.max(0, proportion), skew) * 0.5;
    } else {
      const proportion = (clampedPhysical - mid) / (end - mid);
      return 0.5 + Math.pow(Math.max(0, proportion), skew) * 0.5;
    }
  }

  const proportion = (clampedPhysical - start) / range;
  return Math.pow(Math.max(0, proportion), skew);
}

// ============================================
// Helper: Convert between compatible units
// ============================================
function convertUnits(value: number, sourceUnit: string, targetUnit: string): number {
  if (sourceUnit === targetUnit) return value;

  // Q factor <-> bandwidth in octaves
  // bandwidth = 2 * asinh(1 / (2 * Q)) / ln(2)
  // Q = 1 / (2 * sinh(bandwidth * ln(2) / 2))
  if (sourceUnit === "q_factor" && targetUnit === "bandwidth_octaves") {
    if (value <= 0) return 1.0;
    return (2 * Math.asinh(1 / (2 * value))) / Math.LN2;
  }
  if (sourceUnit === "bandwidth_octaves" && targetUnit === "q_factor") {
    if (value <= 0) return 1.0;
    return 1 / (2 * Math.sinh((value * Math.LN2) / 2));
  }

  // ms <-> s
  if (sourceUnit === "ms" && targetUnit === "s") return value / 1000;
  if (sourceUnit === "s" && targetUnit === "ms") return value * 1000;

  return value; // No conversion possible
}

// ============================================
// Helper: Map stepped parameter values between plugins
// ============================================
function translateSteppedValue(
  sourceNormalized: number,
  sourceSteps: Array<{ normalizedValue: number; physicalValue: string }>,
  targetSteps: Array<{ normalizedValue: number; physicalValue: string }>
): number | null {
  // Find the closest source step to get the physical/semantic meaning
  let closestSourceStep = sourceSteps[0];
  let closestDist = Math.abs(sourceNormalized - sourceSteps[0].normalizedValue);

  for (const step of sourceSteps) {
    const dist = Math.abs(sourceNormalized - step.normalizedValue);
    if (dist < closestDist) {
      closestDist = dist;
      closestSourceStep = step;
    }
  }

  // Find matching target step by physical value (semantic meaning)
  const matchingTarget = targetSteps.find(
    (t) => t.physicalValue === closestSourceStep.physicalValue
  );

  if (matchingTarget) {
    return matchingTarget.normalizedValue;
  }

  // No exact semantic match — try common aliases
  const aliases: Record<string, string[]> = {
    bell: ["bell", "peak", "peaking", "parametric"],
    low_shelf: ["low_shelf", "low shelf", "ls", "shelf_low", "bass_shelf"],
    high_shelf: ["high_shelf", "high shelf", "hs", "shelf_high", "treble_shelf"],
    hpf: ["hpf", "high_pass", "highpass", "hp", "low_cut", "lowcut"],
    lpf: ["lpf", "low_pass", "lowpass", "lp", "high_cut", "highcut"],
    notch: ["notch", "band_reject", "band_stop"],
    bandpass: ["bandpass", "band_pass", "bp"],
    tilt: ["tilt", "tilt_shelf"],
  };

  const sourcePhysical = closestSourceStep.physicalValue.toLowerCase();
  for (const [_key, group] of Object.entries(aliases)) {
    if (group.includes(sourcePhysical)) {
      // Found the alias group, look for any target match
      for (const targetStep of targetSteps) {
        if (group.includes(targetStep.physicalValue.toLowerCase())) {
          return targetStep.normalizedValue;
        }
      }
    }
  }

  return null; // Cannot translate this stepped value
}

// ============================================
// 1. getParameterMap — get parameter map for a plugin
// ============================================
export const getParameterMap = query({
  args: {
    pluginId: v.id("plugins"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pluginParameterMaps")
      .withIndex("by_plugin", (q) => q.eq("plugin", args.pluginId))
      .first();
  },
});

// Get parameter map by plugin name (for scripts/seed that may not know the ID)
export const getParameterMapByName = query({
  args: {
    pluginName: v.string(),
  },
  handler: async (ctx, args) => {
    const maps = await ctx.db
      .query("pluginParameterMaps")
      .collect();
    return maps.find((m) => m.pluginName === args.pluginName) ?? null;
  },
});

// Get all parameter maps for a category
export const getParameterMapsByCategory = query({
  args: {
    category: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pluginParameterMaps")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .collect();
  },
});

// ============================================
// 2. upsertParameterMap — create/update a parameter map
// ============================================
export const upsertParameterMap = mutation({
  args: {
    plugin: v.id("plugins"),
    pluginName: v.string(),
    category: v.string(),
    parameters: v.array(v.object({
      juceParamId: v.string(),
      juceParamIndex: v.optional(v.number()),
      semantic: v.string(),
      physicalUnit: v.string(),
      mappingCurve: v.string(),
      minValue: v.number(),
      maxValue: v.number(),
      defaultValue: v.optional(v.number()),
      steps: v.optional(v.array(v.object({
        normalizedValue: v.number(),
        physicalValue: v.string(),
      }))),
      // NormalisableRange data
      rangeStart: v.optional(v.number()),
      rangeEnd: v.optional(v.number()),
      skewFactor: v.optional(v.number()),
      symmetricSkew: v.optional(v.boolean()),
      interval: v.optional(v.number()),
      hasNormalisableRange: v.optional(v.boolean()),
      curveSamples: v.optional(v.array(v.object({
        normalized: v.number(),
        physical: v.number(),
      }))),
      qRepresentation: v.optional(v.string()),
    })),
    eqBandCount: v.optional(v.number()),
    eqBandParameterPattern: v.optional(v.string()),
    compHasAutoMakeup: v.optional(v.boolean()),
    compHasParallelMix: v.optional(v.boolean()),
    compHasLookahead: v.optional(v.boolean()),
    confidence: v.number(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing map for this plugin
    const existing = await ctx.db
      .query("pluginParameterMaps")
      .withIndex("by_plugin", (q) => q.eq("plugin", args.plugin))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        pluginName: args.pluginName,
        category: args.category,
        parameters: args.parameters,
        eqBandCount: args.eqBandCount,
        eqBandParameterPattern: args.eqBandParameterPattern,
        compHasAutoMakeup: args.compHasAutoMakeup,
        compHasParallelMix: args.compHasParallelMix,
        compHasLookahead: args.compHasLookahead,
        confidence: args.confidence,
        source: args.source,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("pluginParameterMaps", {
      plugin: args.plugin,
      pluginName: args.pluginName,
      category: args.category,
      parameters: args.parameters,
      eqBandCount: args.eqBandCount,
      eqBandParameterPattern: args.eqBandParameterPattern,
      compHasAutoMakeup: args.compHasAutoMakeup,
      compHasParallelMix: args.compHasParallelMix,
      compHasLookahead: args.compHasLookahead,
      confidence: args.confidence,
      source: args.source,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ============================================
// 3. translateParameters — translate params from source to target plugin
// ============================================
export const translateParameters = query({
  args: {
    sourcePluginId: v.id("plugins"),
    targetPluginId: v.id("plugins"),
    sourceParams: v.array(v.object({
      paramId: v.string(),
      paramIndex: v.optional(v.number()),
      normalizedValue: v.number(), // 0.0-1.0 JUCE value
    })),
  },
  handler: async (ctx, args) => {
    // Get parameter maps for both plugins
    const sourceMap = await ctx.db
      .query("pluginParameterMaps")
      .withIndex("by_plugin", (q) => q.eq("plugin", args.sourcePluginId))
      .first();

    const targetMap = await ctx.db
      .query("pluginParameterMaps")
      .withIndex("by_plugin", (q) => q.eq("plugin", args.targetPluginId))
      .first();

    if (!sourceMap || !targetMap) {
      return {
        targetParams: [],
        confidence: 0,
        unmappedParams: args.sourceParams.map((p) => p.paramId),
        error: !sourceMap
          ? "No parameter map for source plugin"
          : "No parameter map for target plugin",
      };
    }

    // Build lookup maps for source and target
    const sourceByParam = new Map<string, typeof sourceMap.parameters[0]>();
    const sourceBySemantic = new Map<string, typeof sourceMap.parameters[0]>();
    for (const param of sourceMap.parameters) {
      sourceByParam.set(param.juceParamId, param);
      sourceBySemantic.set(param.semantic, param);
    }

    const targetBySemantic = new Map<string, typeof targetMap.parameters[0]>();
    for (const param of targetMap.parameters) {
      targetBySemantic.set(param.semantic, param);
    }

    const targetParams: Array<{ paramId: string; paramIndex?: number; value: number }> = [];
    const unmappedParams: string[] = [];
    let translatedCount = 0;
    let totalCount = 0;

    for (const sourceParam of args.sourceParams) {
      totalCount++;

      // Find the source parameter definition
      const sourceDef = sourceByParam.get(sourceParam.paramId);
      if (!sourceDef) {
        unmappedParams.push(sourceParam.paramId);
        continue;
      }

      // Find matching target parameter by semantic ID
      // For EQ bands, handle band number remapping
      let targetDef = targetBySemantic.get(sourceDef.semantic);

      // If no direct match, try to remap EQ bands
      // e.g., source has 24 bands but target has 7 — map bands 1-7
      if (!targetDef && sourceDef.semantic.startsWith("eq_band_")) {
        const bandMatch = sourceDef.semantic.match(/^eq_band_(\d+)_(.+)$/);
        if (bandMatch) {
          const bandNum = parseInt(bandMatch[1]);
          const paramType = bandMatch[2]; // "freq", "gain", "q", "type"
          const targetBandCount = targetMap.eqBandCount ?? 0;

          // Only translate if band number is within target's range
          if (bandNum <= targetBandCount) {
            targetDef = targetBySemantic.get(`eq_band_${bandNum}_${paramType}`);
          }
        }
      }

      if (!targetDef) {
        unmappedParams.push(sourceParam.paramId);
        continue;
      }

      // Translate the value
      let targetValue: number;

      if (sourceDef.mappingCurve === "stepped" && targetDef.mappingCurve === "stepped") {
        // Stepped-to-stepped translation (e.g., filter types)
        const translated = translateSteppedValue(
          sourceParam.normalizedValue,
          sourceDef.steps ?? [],
          targetDef.steps ?? []
        );
        if (translated !== null) {
          targetValue = translated;
        } else {
          unmappedParams.push(sourceParam.paramId);
          continue;
        }
      } else if (sourceDef.mappingCurve === "stepped" || targetDef.mappingCurve === "stepped") {
        // Mixed stepped/continuous — can't translate meaningfully
        unmappedParams.push(sourceParam.paramId);
        continue;
      } else {
        // Continuous-to-continuous translation
        let physicalValue: number;

        // Step 1: Denormalize source value to physical units
        if (sourceDef.hasNormalisableRange && sourceDef.skewFactor !== undefined) {
          // Use exact JUCE skew formula
          physicalValue = denormalizeWithSkew(
            sourceParam.normalizedValue,
            sourceDef.rangeStart ?? sourceDef.minValue,
            sourceDef.rangeEnd ?? sourceDef.maxValue,
            sourceDef.skewFactor,
            sourceDef.symmetricSkew ?? false
          );
        } else {
          // Fall back to generic curve-based denormalization
          physicalValue = denormalize(
            sourceParam.normalizedValue,
            sourceDef.minValue,
            sourceDef.maxValue,
            sourceDef.mappingCurve
          );
        }

        // Step 2: Unit conversion (e.g., Q factor <-> bandwidth octaves)
        if (sourceDef.qRepresentation && targetDef.qRepresentation &&
            sourceDef.qRepresentation !== targetDef.qRepresentation) {
          physicalValue = convertUnits(physicalValue, sourceDef.qRepresentation, targetDef.qRepresentation);
        } else if (sourceDef.physicalUnit !== targetDef.physicalUnit) {
          physicalValue = convertUnits(physicalValue, sourceDef.physicalUnit, targetDef.physicalUnit);
        }

        // Step 3: Clamp to target range
        const targetMin = targetDef.rangeStart ?? targetDef.minValue;
        const targetMax = targetDef.rangeEnd ?? targetDef.maxValue;
        const clampedPhysical = Math.max(targetMin, Math.min(targetMax, physicalValue));

        // Step 4: Renormalize to target's 0-1 range
        if (targetDef.hasNormalisableRange && targetDef.skewFactor !== undefined) {
          // Use exact JUCE skew formula
          targetValue = normalizeWithSkew(
            clampedPhysical,
            targetMin,
            targetMax,
            targetDef.skewFactor,
            targetDef.symmetricSkew ?? false
          );
        } else {
          // Fall back to generic curve-based normalization
          targetValue = normalize(
            clampedPhysical,
            targetDef.minValue,
            targetDef.maxValue,
            targetDef.mappingCurve
          );
        }
      }

      targetParams.push({
        paramId: targetDef.juceParamId,
        paramIndex: targetDef.juceParamIndex,
        value: targetValue,
      });
      translatedCount++;
    }

    // Calculate confidence based on:
    // - Ratio of successfully translated parameters
    // - Source and target map confidence scores
    const translationRatio = totalCount > 0 ? translatedCount / totalCount : 0;
    const mapConfidence = Math.min(sourceMap.confidence, targetMap.confidence) / 100;
    const overallConfidence = Math.round(translationRatio * mapConfidence * 100);

    return {
      targetParams,
      confidence: overallConfidence,
      unmappedParams,
      sourcePluginName: sourceMap.pluginName,
      targetPluginName: targetMap.pluginName,
    };
  },
});

// ============================================
// 4. findCompatibleSwaps — find plugins user owns that can be swapped
// ============================================
export const findCompatibleSwaps = query({
  args: {
    pluginId: v.id("plugins"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Get the source plugin to determine category
    const sourcePlugin = await ctx.db.get(args.pluginId);
    if (!sourcePlugin) return [];

    // Get source parameter map to know the category
    const sourceMap = await ctx.db
      .query("pluginParameterMaps")
      .withIndex("by_plugin", (q) => q.eq("plugin", args.pluginId))
      .first();

    if (!sourceMap) return [];

    // Get all parameter maps in the same category
    const categoryMaps = await ctx.db
      .query("pluginParameterMaps")
      .withIndex("by_category", (q) => q.eq("category", sourceMap.category))
      .collect();

    // Filter to only plugins the user owns (via scannedPlugins with matchedPlugin)
    const userScanned = await ctx.db
      .query("scannedPlugins")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .collect();

    const ownedPluginIds = new Set(
      userScanned
        .filter((sp) => sp.matchedPlugin !== undefined)
        .map((sp) => sp.matchedPlugin as string)
    );

    // Build results — exclude the source plugin itself
    const swaps: Array<{
      pluginId: string;
      pluginName: string;
      category: string;
      confidence: number;
      parameterCount: number;
      eqBandCount?: number;
    }> = [];

    for (const map of categoryMaps) {
      // Skip the source plugin
      if (map.plugin === args.pluginId) continue;

      // Only include if user owns this plugin
      if (!ownedPluginIds.has(map.plugin)) continue;

      // Estimate translation confidence based on parameter overlap
      const sourceSemantics = new Set(sourceMap.parameters.map((p) => p.semantic));
      const targetSemantics = new Set(map.parameters.map((p) => p.semantic));

      let matchCount = 0;
      for (const sem of sourceSemantics) {
        if (targetSemantics.has(sem)) matchCount++;
      }

      const overlapRatio = sourceSemantics.size > 0
        ? matchCount / sourceSemantics.size
        : 0;

      // Combine overlap ratio with map confidence
      const estimatedConfidence = Math.round(
        overlapRatio * (Math.min(sourceMap.confidence, map.confidence) / 100) * 100
      );

      swaps.push({
        pluginId: map.plugin,
        pluginName: map.pluginName,
        category: map.category,
        confidence: estimatedConfidence,
        parameterCount: map.parameters.length,
        eqBandCount: map.eqBandCount,
      });
    }

    // Sort by confidence descending
    swaps.sort((a, b) => b.confidence - a.confidence);

    return swaps;
  },
});

// ============================================
// 5. getRandomSwap — pick a random compatible plugin for "randomize"
// ============================================
export const getRandomSwap = query({
  args: {
    pluginId: v.id("plugins"),
    userId: v.id("users"),
    // Pass a random seed from client so the query is deterministic for caching
    randomSeed: v.number(),
  },
  handler: async (ctx, args) => {
    // Get the source parameter map
    const sourceMap = await ctx.db
      .query("pluginParameterMaps")
      .withIndex("by_plugin", (q) => q.eq("plugin", args.pluginId))
      .first();

    if (!sourceMap) return null;

    // Get all category maps
    const categoryMaps = await ctx.db
      .query("pluginParameterMaps")
      .withIndex("by_category", (q) => q.eq("category", sourceMap.category))
      .collect();

    // Get user's owned plugins
    const userScanned = await ctx.db
      .query("scannedPlugins")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .collect();

    const ownedPluginIds = new Set(
      userScanned
        .filter((sp) => sp.matchedPlugin !== undefined)
        .map((sp) => sp.matchedPlugin as string)
    );

    // Filter to owned plugins, exclude source
    const candidates = categoryMaps.filter(
      (m) => m.plugin !== args.pluginId && ownedPluginIds.has(m.plugin)
    );

    if (candidates.length === 0) return null;

    // Use the random seed to pick a candidate deterministically
    const index = Math.abs(Math.floor(args.randomSeed)) % candidates.length;
    const picked = candidates[index];

    // Calculate confidence estimate
    const sourceSemantics = new Set(sourceMap.parameters.map((p) => p.semantic));
    const targetSemantics = new Set(picked.parameters.map((p) => p.semantic));
    let matchCount = 0;
    for (const sem of sourceSemantics) {
      if (targetSemantics.has(sem)) matchCount++;
    }
    const overlapRatio = sourceSemantics.size > 0 ? matchCount / sourceSemantics.size : 0;
    const confidence = Math.round(
      overlapRatio * (Math.min(sourceMap.confidence, picked.confidence) / 100) * 100
    );

    return {
      pluginId: picked.plugin,
      pluginName: picked.pluginName,
      category: picked.category,
      confidence,
      parameterCount: picked.parameters.length,
    };
  },
});

// ============================================
// Seed helpers
// ============================================

// Upsert a semantic definition
export const upsertParameterSemantic = mutation({
  args: {
    category: v.string(),
    semanticId: v.string(),
    displayName: v.string(),
    physicalUnit: v.string(),
    typicalMin: v.number(),
    typicalMax: v.number(),
    typicalDefault: v.number(),
    typicalCurve: v.string(),
    priority: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("parameterSemantics")
      .withIndex("by_semantic", (q) => q.eq("semanticId", args.semanticId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }

    return await ctx.db.insert("parameterSemantics", args);
  },
});

// Get all semantic definitions for a category
export const getParameterSemantics = query({
  args: {
    category: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("parameterSemantics")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .collect();
  },
});
