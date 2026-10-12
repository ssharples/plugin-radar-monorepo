import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getSessionUser } from "./lib/auth";

// Mutation to enrich a plugin with metadata (unified — all enrichment fields)
export const enrichPlugin = mutation({
  args: {
    sessionToken: v.string(),
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
    const { user } = await getSessionUser(ctx, args.sessionToken);
    if (!user.isAdmin) throw new Error("Unauthorized: Admin access required");

    const { sessionToken: _, id, ...enrichmentData } = args;

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
    sessionToken: v.string(),
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
    const { user } = await getSessionUser(ctx, args.sessionToken);
    if (!user.isAdmin) throw new Error("Unauthorized: Admin access required");

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

// Batch enrich with API key (agent-safe, no session token required)
export const batchEnrichByApiKey = mutation({
  args: {
    apiKey: v.string(),
    plugins: v.array(
      v.object({
        id: v.id("plugins"),
        effectType: v.optional(v.string()),
        circuitEmulation: v.optional(v.string()),
        tonalCharacter: v.optional(v.array(v.string())),
        worksWellOn: v.optional(v.array(v.string())),
        useCases: v.optional(v.array(v.string())),
        genreSuitability: v.optional(v.array(v.string())),
        sonicCharacter: v.optional(v.array(v.string())),
        comparableTo: v.optional(v.array(v.string())),
        skillLevel: v.optional(v.string()),
        learningCurve: v.optional(v.string()),
        cpuUsage: v.optional(v.string()),
        licenseType: v.optional(v.string()),
        keyFeatures: v.optional(v.array(v.string())),
        recommendedDaws: v.optional(v.array(v.string())),
        isIndustryStandard: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const expectedKey = process.env.ENRICHMENT_API_KEY || "pluginradar-enrich-2026";
    if (args.apiKey !== expectedKey) {
      throw new Error("Invalid API key");
    }

    const results = [];
    const now = Date.now();

    for (const pluginData of args.plugins) {
      const { id, ...enrichmentData } = pluginData;

      const existing = await ctx.db.get(id);
      if (!existing) {
        results.push({ id, success: false, error: "Plugin not found" });
        continue;
      }

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

// Recalculate manufacturer plugin counts (agent-safe, uses apiKey)
export const recalculateManufacturerCounts = mutation({
  args: {
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    const expectedKey = process.env.ENRICHMENT_API_KEY || "pluginradar-enrich-2026";
    if (args.apiKey !== expectedKey) {
      throw new Error("Invalid API key");
    }

    const now = Date.now();

    // Count actual plugins per manufacturer
    const plugins = await ctx.db.query("plugins").collect();
    const counts: Record<string, number> = {};
    for (const plugin of plugins) {
      const mfrId = plugin.manufacturer as string;
      counts[mfrId] = (counts[mfrId] || 0) + 1;
    }

    // Update all manufacturers
    const manufacturers = await ctx.db.query("manufacturers").collect();
    const results = [];
    for (const mfr of manufacturers) {
      const actual = counts[mfr._id] || 0;
      const stored = mfr.pluginCount || 0;
      if (actual !== stored) {
        await ctx.db.patch(mfr._id, {
          pluginCount: actual,
          updatedAt: now,
        });
        results.push({ name: mfr.name, old: stored, new: actual });
      }
    }

    return { updated: results.length, fixes: results };
  },
});

// Fix plugin category (agent-safe, uses apiKey)
export const fixPluginCategory = mutation({
  args: {
    apiKey: v.string(),
    slug: v.string(),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const expectedKey = process.env.ENRICHMENT_API_KEY || "pluginradar-enrich-2026";
    if (args.apiKey !== expectedKey) {
      throw new Error("Invalid API key");
    }

    const plugin = await ctx.db
      .query("plugins")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!plugin) {
      return { success: false, error: `Plugin not found: ${args.slug}` };
    }

    const oldCategory = plugin.category;
    await ctx.db.patch(plugin._id, {
      category: args.category,
      updatedAt: Date.now(),
    });

    return {
      success: true,
      name: plugin.name,
      slug: args.slug,
      oldCategory,
      newCategory: args.category,
    };
  },
});

// Clear bad image URLs for given slugs (agent-safe, uses apiKey)
export const clearPluginImages = mutation({
  args: {
    apiKey: v.string(),
    slugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const expectedKey = process.env.ENRICHMENT_API_KEY || "pluginradar-enrich-2026";
    if (args.apiKey !== expectedKey) {
      throw new Error("Invalid API key");
    }

    let cleared = 0;
    for (const slug of args.slugs) {
      const plugin = await ctx.db
        .query("plugins")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();

      if (plugin) {
        await ctx.db.patch(plugin._id, {
          imageUrl: undefined,
          updatedAt: Date.now(),
        });
        cleared++;
      }
    }

    return { cleared };
  },
});

// Delete plugins by slug (agent-safe, uses apiKey)
export const deletePluginsBySlugs = mutation({
  args: {
    apiKey: v.string(),
    slugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const expectedKey = process.env.ENRICHMENT_API_KEY || "pluginradar-enrich-2026";
    if (args.apiKey !== expectedKey) {
      throw new Error("Invalid API key");
    }

    const results = [];
    for (const slug of args.slugs) {
      const plugin = await ctx.db
        .query("plugins")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();

      if (!plugin) {
        results.push({ slug, success: false, error: "Not found" });
        continue;
      }

      await ctx.db.delete(plugin._id);
      results.push({ slug, success: true, name: plugin.name });
    }

    return { deleted: results.filter((r) => r.success).length, results };
  },
});

// Update plugin image URL (agent-safe, uses apiKey)
export const updatePluginImage = mutation({
  args: {
    apiKey: v.string(),
    slug: v.string(),
    imageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const expectedKey = process.env.ENRICHMENT_API_KEY || "pluginradar-enrich-2026";
    if (args.apiKey !== expectedKey) {
      throw new Error("Invalid API key");
    }

    const plugin = await ctx.db
      .query("plugins")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!plugin) {
      return { success: false, error: `Plugin not found: ${args.slug}` };
    }

    await ctx.db.patch(plugin._id, {
      imageUrl: args.imageUrl,
      updatedAt: Date.now(),
    });

    return { success: true, name: plugin.name, slug: args.slug };
  },
});

// Batch update plugin images (agent-safe, uses apiKey)
export const batchUpdatePluginImages = mutation({
  args: {
    apiKey: v.string(),
    plugins: v.array(
      v.object({
        slug: v.string(),
        imageUrl: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const expectedKey = process.env.ENRICHMENT_API_KEY || "pluginradar-enrich-2026";
    if (args.apiKey !== expectedKey) {
      throw new Error("Invalid API key");
    }

    const results = [];
    const now = Date.now();

    for (const item of args.plugins) {
      const plugin = await ctx.db
        .query("plugins")
        .withIndex("by_slug", (q) => q.eq("slug", item.slug))
        .first();

      if (!plugin) {
        results.push({ slug: item.slug, success: false, error: "Not found" });
        continue;
      }

      await ctx.db.patch(plugin._id, {
        imageUrl: item.imageUrl,
        updatedAt: now,
      });

      results.push({ slug: item.slug, success: true, name: plugin.name });
    }

    return { updated: results.filter((r) => r.success).length, results };
  },
});

// Batch update manufacturer logos (agent-safe, uses apiKey)
export const batchUpdateManufacturerLogos = mutation({
  args: {
    apiKey: v.string(),
    manufacturers: v.array(
      v.object({
        slug: v.string(),
        logoUrl: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const expectedKey = process.env.ENRICHMENT_API_KEY || "pluginradar-enrich-2026";
    if (args.apiKey !== expectedKey) {
      throw new Error("Invalid API key");
    }

    const results = [];
    const now = Date.now();

    for (const item of args.manufacturers) {
      const manufacturer = await ctx.db
        .query("manufacturers")
        .withIndex("by_slug", (q) => q.eq("slug", item.slug))
        .first();

      if (!manufacturer) {
        results.push({ slug: item.slug, success: false, error: "Not found" });
        continue;
      }

      await ctx.db.patch(manufacturer._id, {
        logoUrl: item.logoUrl,
        updatedAt: now,
      });

      results.push({ slug: item.slug, success: true, name: manufacturer.name });
    }

    return { updated: results.filter((r) => r.success).length, results };
  },
});

// Delete manufacturers by slug (agent-safe, uses apiKey)
export const deleteManufacturersBySlug = mutation({
  args: {
    apiKey: v.string(),
    slugs: v.array(v.string()),
    deleteOrphanedPlugins: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const expectedKey = process.env.ENRICHMENT_API_KEY || "pluginradar-enrich-2026";
    if (args.apiKey !== expectedKey) {
      throw new Error("Invalid API key");
    }

    const results = [];
    for (const slug of args.slugs) {
      const manufacturer = await ctx.db
        .query("manufacturers")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();

      if (!manufacturer) {
        results.push({ slug, success: false, error: "Not found" });
        continue;
      }

      // Find plugins referencing this manufacturer
      const plugins = await ctx.db.query("plugins").collect();
      const orphans = plugins.filter((p) => p.manufacturer === manufacturer._id);

      if (args.deleteOrphanedPlugins) {
        for (const p of orphans) {
          await ctx.db.delete(p._id);
        }
      }

      await ctx.db.delete(manufacturer._id);
      results.push({ slug, success: true, name: manufacturer.name, orphanedPlugins: orphans.length });
    }

    return { deleted: results.filter((r) => r.success).length, results };
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
