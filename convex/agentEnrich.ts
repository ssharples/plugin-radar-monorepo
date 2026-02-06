import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// =============================================================================
// AGENT ENRICHMENT MUTATIONS
// Used by the plugin-agent.mjs script to save research directly to Convex
// =============================================================================

/**
 * Upsert plugin enrichment data from the research agent.
 * Handles deduplication by slug, creates manufacturer if needed.
 */
export const upsertPluginEnrichment = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    manufacturer: v.string(),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    
    // Effect taxonomy
    effectType: v.optional(v.string()),
    circuitEmulation: v.optional(v.string()),
    tonalCharacter: v.optional(v.array(v.string())),
    
    // Technical specs
    formats: v.optional(v.array(v.string())),
    platforms: v.optional(v.array(v.string())),
    systemRequirements: v.optional(v.string()),
    
    // Pricing
    msrp: v.optional(v.number()),
    isFree: v.optional(v.boolean()),
    
    // Features & tags
    tags: v.optional(v.array(v.string())),
    features: v.optional(v.array(v.string())),
    pros: v.optional(v.array(v.string())),
    cons: v.optional(v.array(v.string())),
    useCases: v.optional(v.array(v.string())),
    
    // Links
    productUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // 0. Validate: reject instruments/synths
    const rejectedCategories = ["synth", "sampler", "instrument", "bundle"];
    if (args.category && rejectedCategories.includes(args.category)) {
      throw new Error(`Rejected: category "${args.category}" is not allowed. PluginRadar only tracks audio effects.`);
    }
    
    // 1. Find or create manufacturer
    let manufacturerDoc = await ctx.db
      .query("manufacturers")
      .withIndex("by_name", (q) => q.eq("name", args.manufacturer))
      .first();
    
    if (!manufacturerDoc) {
      // Create manufacturer with slug
      const manufacturerSlug = args.manufacturer
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      
      const manufacturerId = await ctx.db.insert("manufacturers", {
        name: args.manufacturer,
        slug: manufacturerSlug,
        website: "",
        newsletterSubscribed: false,
        pluginCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      
      manufacturerDoc = await ctx.db.get(manufacturerId);
    }
    
    // 2. Find existing plugin by slug
    const existingPlugin = await ctx.db
      .query("plugins")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    
    // 3. Prepare plugin data
    const pluginData = {
      name: args.name,
      slug: args.slug,
      manufacturer: manufacturerDoc!._id,
      
      description: args.description,
      shortDescription: args.shortDescription,
      
      category: args.category || "utility",
      subcategory: undefined,
      tags: args.tags || [],
      
      // Effect taxonomy
      effectType: args.effectType,
      circuitEmulation: args.circuitEmulation,
      tonalCharacter: args.tonalCharacter,
      
      formats: args.formats || [],
      platforms: args.platforms || [],
      systemRequirements: args.systemRequirements,
      
      msrp: args.msrp,
      currency: "USD" as const,
      isFree: args.isFree ?? false,
      hasDemo: false,
      hasTrial: false,
      
      imageUrl: args.imageUrl,
      screenshots: [],
      
      productUrl: args.productUrl || "",
      
      isActive: true,
      isDiscontinued: false,
      
      updatedAt: now,
    };
    
    let pluginId;
    
    if (existingPlugin) {
      // Update existing - merge data, don't overwrite good data with undefined
      await ctx.db.patch(existingPlugin._id, {
        ...pluginData,
        // Preserve existing values if new ones are empty
        description: args.description || existingPlugin.description,
        shortDescription: args.shortDescription || existingPlugin.shortDescription,
        formats: args.formats?.length ? args.formats : existingPlugin.formats,
        platforms: args.platforms?.length ? args.platforms : existingPlugin.platforms,
        tags: args.tags?.length ? args.tags : existingPlugin.tags,
        imageUrl: args.imageUrl || existingPlugin.imageUrl,
        productUrl: args.productUrl || existingPlugin.productUrl,
        // Preserve existing effect taxonomy if new values are empty
        effectType: args.effectType || (existingPlugin as any).effectType,
        circuitEmulation: args.circuitEmulation || (existingPlugin as any).circuitEmulation,
        tonalCharacter: args.tonalCharacter?.length ? args.tonalCharacter : (existingPlugin as any).tonalCharacter,
      });
      pluginId = existingPlugin._id;
    } else {
      // Create new plugin
      pluginId = await ctx.db.insert("plugins", {
        ...pluginData,
        createdAt: now,
      });
      
      // Update manufacturer plugin count
      await ctx.db.patch(manufacturerDoc!._id, {
        pluginCount: (manufacturerDoc!.pluginCount || 0) + 1,
        updatedAt: now,
      });
    }
    
    // 4. Save features to pluginFeatures table
    if (args.features?.length) {
      for (const feature of args.features) {
        // Check if feature already exists
        const existingFeature = await ctx.db
          .query("pluginFeatures")
          .withIndex("by_plugin", (q) => q.eq("plugin", pluginId))
          .filter((q) => q.eq(q.field("feature"), feature))
          .first();
        
        if (!existingFeature) {
          await ctx.db.insert("pluginFeatures", {
            plugin: pluginId,
            feature,
            category: "general",
            upvotes: 0,
            downvotes: 0,
            addedAt: now,
          });
        }
      }
    }
    
    // 5. Save pros/cons as features with categories
    if (args.pros?.length) {
      for (const pro of args.pros) {
        const existingPro = await ctx.db
          .query("pluginFeatures")
          .withIndex("by_plugin", (q) => q.eq("plugin", pluginId))
          .filter((q) => q.eq(q.field("feature"), pro))
          .first();
        
        if (!existingPro) {
          await ctx.db.insert("pluginFeatures", {
            plugin: pluginId,
            feature: pro,
            category: "pro",
            upvotes: 0,
            downvotes: 0,
            addedAt: now,
          });
        }
      }
    }
    
    if (args.cons?.length) {
      for (const con of args.cons) {
        const existingCon = await ctx.db
          .query("pluginFeatures")
          .withIndex("by_plugin", (q) => q.eq("plugin", pluginId))
          .filter((q) => q.eq(q.field("feature"), con))
          .first();
        
        if (!existingCon) {
          await ctx.db.insert("pluginFeatures", {
            plugin: pluginId,
            feature: con,
            category: "con",
            upvotes: 0,
            downvotes: 0,
            addedAt: now,
          });
        }
      }
    }
    
    return {
      pluginId,
      isNew: !existingPlugin,
      slug: args.slug,
    };
  },
});

/**
 * Upsert plugin comparison from the research agent.
 */
export const upsertComparison = mutation({
  args: {
    slug: v.string(),
    pluginASlug: v.string(),
    pluginBSlug: v.string(),
    category: v.string(),
    
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    verdict: v.optional(v.string()),
    
    prosA: v.optional(v.array(v.string())),
    prosB: v.optional(v.array(v.string())),
    consA: v.optional(v.array(v.string())),
    consB: v.optional(v.array(v.string())),
    
    bestForA: v.optional(v.array(v.string())),
    bestForB: v.optional(v.array(v.string())),
    
    faqs: v.optional(v.array(v.object({
      question: v.string(),
      answer: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Find plugins by slug
    const pluginA = await ctx.db
      .query("plugins")
      .withIndex("by_slug", (q) => q.eq("slug", args.pluginASlug))
      .first();
    
    const pluginB = await ctx.db
      .query("plugins")
      .withIndex("by_slug", (q) => q.eq("slug", args.pluginBSlug))
      .first();
    
    if (!pluginA || !pluginB) {
      return {
        success: false,
        error: `Plugin not found: ${!pluginA ? args.pluginASlug : args.pluginBSlug}`,
      };
    }
    
    // Check for existing comparison
    const existing = await ctx.db
      .query("comparisons")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    
    const comparisonData = {
      slug: args.slug,
      pluginA: pluginA._id,
      pluginB: pluginB._id,
      
      title: args.title || `${pluginA.name} vs ${pluginB.name}`,
      metaDescription: args.summary?.slice(0, 160) || `Compare ${pluginA.name} and ${pluginB.name} - features, price, and more.`,
      
      category: args.category,
      summary: args.summary,
      
      pros: {
        a: args.prosA || [],
        b: args.prosB || [],
      },
      cons: {
        a: args.consA || [],
        b: args.consB || [],
      },
      
      faqs: args.faqs,
      
      updatedAt: now,
    };
    
    let comparisonId;
    
    if (existing) {
      await ctx.db.patch(existing._id, comparisonData);
      comparisonId = existing._id;
    } else {
      comparisonId = await ctx.db.insert("comparisons", {
        ...comparisonData,
        views: 0,
        generatedAt: now,
      });
    }
    
    return {
      success: true,
      comparisonId,
      isNew: !existing,
      slug: args.slug,
    };
  },
});

// =============================================================================
// QUERY FUNCTIONS FOR THE AGENT
// =============================================================================

/**
 * Get plugin by slug (for checking if it exists)
 */
export const getPluginBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("plugins")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

/**
 * Search plugins by name
 */
export const searchPlugins = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("plugins")
      .withSearchIndex("search_name", (q) => q.search("name", args.query))
      .take(args.limit || 10);
    
    return results;
  },
});

/**
 * Get all enriched plugins (for listing)
 */
export const listEnrichedPlugins = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const plugins = await ctx.db
      .query("plugins")
      .withIndex("by_updated")
      .order("desc")
      .take(args.limit || 100);
    
    // Get manufacturer names
    const results = await Promise.all(
      plugins.map(async (p) => {
        const manufacturer = await ctx.db.get(p.manufacturer);
        return {
          slug: p.slug,
          name: p.name,
          manufacturer: manufacturer?.name,
          category: p.category,
          updatedAt: p.updatedAt,
        };
      })
    );
    
    return results;
  },
});

/**
 * Get comparison by slug
 */
export const getComparisonBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("comparisons")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

/**
 * Get comparison by slug with resolved plugin data for the detail page.
 */
export const getComparisonWithPlugins = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const comparison = await ctx.db
      .query("comparisons")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!comparison) return null;

    const [pluginA, pluginB] = await Promise.all([
      ctx.db.get(comparison.pluginA),
      ctx.db.get(comparison.pluginB),
    ]);

    if (!pluginA || !pluginB) return null;

    const [mfrA, mfrB] = await Promise.all([
      ctx.db.get(pluginA.manufacturer),
      ctx.db.get(pluginB.manufacturer),
    ]);

    return {
      slug: comparison.slug,
      title: comparison.title,
      metaDescription: comparison.metaDescription,
      category: comparison.category,
      priceWinner: comparison.priceWinner as "a" | "b" | null | undefined,
      trendingWinner: comparison.trendingWinner as "a" | "b" | null | undefined,
      summary: comparison.summary,
      pros: comparison.pros,
      cons: comparison.cons,
      faqs: comparison.faqs,
      generatedAt: comparison.generatedAt,
      pluginA: {
        name: pluginA.name,
        slug: pluginA.slug,
        manufacturer: mfrA?.name ?? "Unknown",
        manufacturerSlug: mfrA?.slug ?? "",
        description: pluginA.description,
        price: pluginA.isFree ? "Free" : pluginA.currentPrice != null ? `$${(pluginA.currentPrice / 100).toFixed(2)}` : pluginA.msrp != null ? `$${(pluginA.msrp / 100).toFixed(2)}` : "N/A",
        priceRaw: pluginA.currentPrice ?? pluginA.msrp,
        isFree: pluginA.isFree ?? false,
        category: pluginA.category,
        formats: pluginA.formats ?? [],
        platforms: pluginA.platforms ?? [],
        tags: pluginA.tags ?? [],
        imageUrl: pluginA.imageUrl,
        productUrl: pluginA.productUrl,
      },
      pluginB: {
        name: pluginB.name,
        slug: pluginB.slug,
        manufacturer: mfrB?.name ?? "Unknown",
        manufacturerSlug: mfrB?.slug ?? "",
        description: pluginB.description,
        price: pluginB.isFree ? "Free" : pluginB.currentPrice != null ? `$${(pluginB.currentPrice / 100).toFixed(2)}` : pluginB.msrp != null ? `$${(pluginB.msrp / 100).toFixed(2)}` : "N/A",
        priceRaw: pluginB.currentPrice ?? pluginB.msrp,
        isFree: pluginB.isFree ?? false,
        category: pluginB.category,
        formats: pluginB.formats ?? [],
        platforms: pluginB.platforms ?? [],
        tags: pluginB.tags ?? [],
        imageUrl: pluginB.imageUrl,
        productUrl: pluginB.productUrl,
      },
    };
  },
});

/**
 * List all comparisons
 */
export const listComparisons = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const comparisons = await ctx.db
      .query("comparisons")
      .withIndex("by_views")
      .order("desc")
      .take(args.limit || 100);
    
    // Get plugin names
    const results = await Promise.all(
      comparisons.map(async (c) => {
        const pluginA = await ctx.db.get(c.pluginA);
        const pluginB = await ctx.db.get(c.pluginB);
        return {
          slug: c.slug,
          pluginA: pluginA?.name,
          pluginB: pluginB?.name,
          category: c.category,
          views: c.views,
        };
      })
    );
    
    return results;
  },
});
