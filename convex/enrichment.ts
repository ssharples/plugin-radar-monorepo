import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Mutation to enrich a plugin with metadata (unified — all enrichment fields)
export const enrichPlugin = mutation({
  args: {
    id: v.id("plugins"),
    // Effect taxonomy
    effectType: v.optional(v.string()),
    circuitEmulation: v.optional(v.string()),
    tonalCharacter: v.optional(v.array(v.string())),
    // Usage Context
    worksWellOn: v.optional(v.array(v.string())),
    useCases: v.optional(v.array(v.string())),
    genreSuitability: v.optional(v.array(v.string())),
    // Sonic Profile
    sonicCharacter: v.optional(v.array(v.string())),
    comparableTo: v.optional(v.array(v.string())),
    // User Experience
    skillLevel: v.optional(v.string()),
    learningCurve: v.optional(v.string()),
    cpuUsage: v.optional(v.string()),
    // Technical/Business
    licenseType: v.optional(v.string()),
    keyFeatures: v.optional(v.array(v.string())),
    recommendedDaws: v.optional(v.array(v.string())),
    isIndustryStandard: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...enrichmentData } = args;

    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Plugin not found");
    }

    // Filter out undefined values
    const filteredUpdates = Object.fromEntries(
      Object.entries(enrichmentData).filter(([_, v]) => v !== undefined)
    );

    return await ctx.db.patch(id, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });
  },
});

// Batch enrich multiple plugins (unified — all enrichment fields)
export const batchEnrich = mutation({
  args: {
    plugins: v.array(
      v.object({
        id: v.id("plugins"),
        // Effect taxonomy
        effectType: v.optional(v.string()),
        circuitEmulation: v.optional(v.string()),
        tonalCharacter: v.optional(v.array(v.string())),
        // Usage Context
        worksWellOn: v.optional(v.array(v.string())),
        useCases: v.optional(v.array(v.string())),
        genreSuitability: v.optional(v.array(v.string())),
        sonicCharacter: v.optional(v.array(v.string())),
        comparableTo: v.optional(v.array(v.string())),
        // User Experience
        skillLevel: v.optional(v.string()),
        learningCurve: v.optional(v.string()),
        cpuUsage: v.optional(v.string()),
        // Technical/Business
        licenseType: v.optional(v.string()),
        keyFeatures: v.optional(v.array(v.string())),
        recommendedDaws: v.optional(v.array(v.string())),
        isIndustryStandard: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results = [];
    const now = Date.now();

    for (const pluginData of args.plugins) {
      const { id, ...enrichmentData } = pluginData;

      const existing = await ctx.db.get(id);
      if (!existing) {
        results.push({ id, success: false, error: "Plugin not found" });
        continue;
      }

      // Filter out undefined values
      const filteredUpdates = Object.fromEntries(
        Object.entries(enrichmentData).filter(([_, v]) => v !== undefined)
      );

      await ctx.db.patch(id, {
        ...filteredUpdates,
        updatedAt: now,
      });

      results.push({ id, success: true });
    }

    return results;
  },
});

// Get plugins that need enrichment (missing key fields)
export const getUnenriched = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const plugins = await ctx.db
      .query("plugins")
      .order("desc")
      .collect();

    // Filter to plugins missing enrichment data (check both taxonomy + usage fields)
    const unenriched = plugins.filter(
      (p) =>
        !p.effectType ||
        !p.worksWellOn ||
        p.worksWellOn.length === 0 ||
        !p.useCases ||
        p.useCases.length === 0 ||
        !p.skillLevel ||
        !p.cpuUsage
    );

    return unenriched.slice(0, limit).map((p) => ({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      category: p.category,
      manufacturer: p.manufacturer,
      // Include existing enrichment for context
      effectType: p.effectType,
      circuitEmulation: p.circuitEmulation,
      tonalCharacter: p.tonalCharacter,
      worksWellOn: p.worksWellOn,
      useCases: p.useCases,
      sonicCharacter: p.sonicCharacter,
      skillLevel: p.skillLevel,
      cpuUsage: p.cpuUsage,
    }));
  },
});

// Get enrichment stats
export const getEnrichmentStats = query({
  args: {},
  handler: async (ctx) => {
    const plugins = await ctx.db.query("plugins").collect();
    const total = plugins.length;

    const stats = {
      total,
      // Taxonomy fields
      withEffectType: plugins.filter((p) => p.effectType).length,
      withCircuitEmulation: plugins.filter((p) => p.circuitEmulation).length,
      withTonalCharacter: plugins.filter((p) => p.tonalCharacter && p.tonalCharacter.length > 0).length,
      // Usage fields
      withWorksWellOn: plugins.filter((p) => p.worksWellOn && p.worksWellOn.length > 0).length,
      withUseCases: plugins.filter((p) => p.useCases && p.useCases.length > 0).length,
      withSonicCharacter: plugins.filter((p) => p.sonicCharacter && p.sonicCharacter.length > 0).length,
      withSkillLevel: plugins.filter((p) => p.skillLevel).length,
      withCpuUsage: plugins.filter((p) => p.cpuUsage).length,
      withLicenseType: plugins.filter((p) => p.licenseType).length,
      withKeyFeatures: plugins.filter((p) => p.keyFeatures && p.keyFeatures.length > 0).length,
      fullyEnriched: plugins.filter(
        (p) =>
          p.effectType &&
          p.worksWellOn &&
          p.worksWellOn.length > 0 &&
          p.useCases &&
          p.useCases.length > 0 &&
          p.skillLevel &&
          p.cpuUsage
      ).length,
    };

    return {
      ...stats,
      percentages: {
        effectType: Math.round((stats.withEffectType / total) * 100),
        circuitEmulation: Math.round((stats.withCircuitEmulation / total) * 100),
        tonalCharacter: Math.round((stats.withTonalCharacter / total) * 100),
        worksWellOn: Math.round((stats.withWorksWellOn / total) * 100),
        useCases: Math.round((stats.withUseCases / total) * 100),
        sonicCharacter: Math.round((stats.withSonicCharacter / total) * 100),
        skillLevel: Math.round((stats.withSkillLevel / total) * 100),
        cpuUsage: Math.round((stats.withCpuUsage / total) * 100),
        licenseType: Math.round((stats.withLicenseType / total) * 100),
        keyFeatures: Math.round((stats.withKeyFeatures / total) * 100),
        fullyEnriched: Math.round((stats.fullyEnriched / total) * 100),
      },
    };
  },
});
