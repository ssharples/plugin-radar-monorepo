import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Helper to get storage URL for a plugin's image
export const getImageUrl = query({
  args: { id: v.id("plugins") },
  handler: async (ctx, args) => {
    const plugin = await ctx.db.get(args.id);
    if (!plugin) return null;
    
    // Prefer storage URL if available
    if (plugin.imageStorageId) {
      return await ctx.storage.getUrl(plugin.imageStorageId);
    }
    
    // Fall back to imageUrl
    return plugin.imageUrl || null;
  },
});

// Get plugin with resolved image URL
export const getWithImageUrl = query({
  args: { id: v.id("plugins") },
  handler: async (ctx, args) => {
    const plugin = await ctx.db.get(args.id);
    if (!plugin) return null;
    
    let resolvedImageUrl: string | null | undefined = plugin.imageUrl;
    if (plugin.imageStorageId) {
      resolvedImageUrl = await ctx.storage.getUrl(plugin.imageStorageId);
    }
    
    return {
      ...plugin,
      resolvedImageUrl,
    };
  },
});

// ============================================
// QUERIES
// ============================================

export const list = query({
  args: {
    category: v.optional(v.string()),
    manufacturer: v.optional(v.id("manufacturers")),
    isFree: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    let plugins;
    
    if (args.category) {
      plugins = await ctx.db
        .query("plugins")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .order("desc")
        .take(limit + 1);
    } else if (args.manufacturer) {
      plugins = await ctx.db
        .query("plugins")
        .withIndex("by_manufacturer", (q) => q.eq("manufacturer", args.manufacturer!))
        .order("desc")
        .take(limit + 1);
    } else if (args.isFree !== undefined) {
      plugins = await ctx.db
        .query("plugins")
        .withIndex("by_free", (q) => q.eq("isFree", args.isFree!))
        .order("desc")
        .take(limit + 1);
    } else {
      plugins = await ctx.db
        .query("plugins")
        .order("desc")
        .take(limit + 1);
    }
    
    const hasMore = plugins.length > limit;
    const items = hasMore ? plugins.slice(0, -1) : plugins;
    
    return {
      items,
      hasMore,
    };
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("plugins")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

export const getBySlugWithManufacturer = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const plugin = await ctx.db
      .query("plugins")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    
    if (!plugin) return null;
    
    const manufacturer = await ctx.db.get(plugin.manufacturer);
    
    // Resolve image URL from storage if available
    let resolvedImageUrl: string | null | undefined = plugin.imageUrl;
    if (plugin.imageStorageId) {
      resolvedImageUrl = await ctx.storage.getUrl(plugin.imageStorageId);
    }
    
    return {
      ...plugin,
      resolvedImageUrl,
      manufacturerData: manufacturer,
    };
  },
});

export const get = query({
  args: { id: v.id("plugins") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getWithManufacturer = query({
  args: { id: v.id("plugins") },
  handler: async (ctx, args) => {
    const plugin = await ctx.db.get(args.id);
    if (!plugin) return null;
    
    const manufacturer = await ctx.db.get(plugin.manufacturer);
    return { ...plugin, manufacturer };
  },
});

export const search = query({
  args: {
    query: v.string(),
    category: v.optional(v.string()),
    isFree: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let searchQuery = ctx.db
      .query("plugins")
      .withSearchIndex("search_name", (q) => {
        let sq = q.search("name", args.query);
        if (args.category) sq = sq.eq("category", args.category);
        if (args.isFree !== undefined) sq = sq.eq("isFree", args.isFree);
        return sq;
      });
    
    return await searchQuery.take(50);
  },
});

export const recentlyUpdated = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("plugins")
      .withIndex("by_updated")
      .order("desc")
      .take(args.limit ?? 20);
  },
});

export const freePlugins = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("plugins")
      .withIndex("by_free", (q) => q.eq("isFree", true))
      .take(args.limit ?? 50);
  },
});

// Enhanced browse query for plugins page
export const browse = query({
  args: {
    category: v.optional(v.string()),
    manufacturer: v.optional(v.id("manufacturers")),
    isFree: v.optional(v.boolean()),
    format: v.optional(v.string()),
    platform: v.optional(v.string()),
    minPrice: v.optional(v.number()),
    maxPrice: v.optional(v.number()),
    sortBy: v.optional(v.string()), // "newest", "price-low", "price-high", "name"
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    // New enrichment filters
    worksWellOn: v.optional(v.array(v.string())),
    useCases: v.optional(v.array(v.string())),
    skillLevel: v.optional(v.string()),
    cpuUsage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 24;

    let plugins;

    // Start with indexed query if possible
    if (args.skillLevel) {
      plugins = await ctx.db
        .query("plugins")
        .withIndex("by_skill_level", (q) => q.eq("skillLevel", args.skillLevel!))
        .collect();
    } else if (args.cpuUsage) {
      plugins = await ctx.db
        .query("plugins")
        .withIndex("by_cpu_usage", (q) => q.eq("cpuUsage", args.cpuUsage!))
        .collect();
    } else if (args.category) {
      plugins = await ctx.db
        .query("plugins")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .collect();
    } else if (args.manufacturer) {
      plugins = await ctx.db
        .query("plugins")
        .withIndex("by_manufacturer", (q) => q.eq("manufacturer", args.manufacturer!))
        .collect();
    } else if (args.isFree !== undefined) {
      plugins = await ctx.db
        .query("plugins")
        .withIndex("by_free", (q) => q.eq("isFree", args.isFree!))
        .collect();
    } else {
      plugins = await ctx.db
        .query("plugins")
        .withIndex("by_updated")
        .order("desc")
        .collect();
    }

    // Apply additional filters in memory
    let filtered = plugins;

    if (args.format) {
      filtered = filtered.filter((p) => p.formats?.includes(args.format!));
    }

    if (args.platform) {
      filtered = filtered.filter((p) => p.platforms?.includes(args.platform!));
    }

    if (args.minPrice !== undefined) {
      filtered = filtered.filter((p) => {
        const price = p.currentPrice ?? p.msrp;
        return price !== undefined && price >= args.minPrice!;
      });
    }

    if (args.maxPrice !== undefined) {
      filtered = filtered.filter((p) => {
        const price = p.currentPrice ?? p.msrp;
        return price !== undefined && price <= args.maxPrice!;
      });
    }

    // When using non-category indexes but category is specified
    if (args.category && !args.manufacturer && args.isFree === undefined) {
      // Already filtered by index
    } else if (args.category && (args.manufacturer || args.isFree !== undefined)) {
      filtered = filtered.filter((p) => p.category === args.category);
    }

    // Filter by worksWellOn (match any)
    if (args.worksWellOn && args.worksWellOn.length > 0) {
      filtered = filtered.filter((p) =>
        p.worksWellOn?.some((w) => args.worksWellOn!.includes(w))
      );
    }

    // Filter by useCases (match any)
    if (args.useCases && args.useCases.length > 0) {
      filtered = filtered.filter((p) =>
        p.useCases?.some((u) => args.useCases!.includes(u))
      );
    }

    // Filter by skillLevel (already filtered by index if primary, otherwise filter here)
    if (args.skillLevel && !plugins.every((p) => p.skillLevel === args.skillLevel)) {
      filtered = filtered.filter((p) => p.skillLevel === args.skillLevel);
    }

    // Filter by cpuUsage (already filtered by index if primary, otherwise filter here)
    if (args.cpuUsage && !plugins.every((p) => p.cpuUsage === args.cpuUsage)) {
      filtered = filtered.filter((p) => p.cpuUsage === args.cpuUsage);
    }

    // Sort
    switch (args.sortBy) {
      case "name":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "price-low":
        filtered.sort((a, b) => {
          const priceA = a.currentPrice ?? a.msrp ?? Infinity;
          const priceB = b.currentPrice ?? b.msrp ?? Infinity;
          return priceA - priceB;
        });
        break;
      case "price-high":
        filtered.sort((a, b) => {
          const priceA = a.currentPrice ?? a.msrp ?? 0;
          const priceB = b.currentPrice ?? b.msrp ?? 0;
          return priceB - priceA;
        });
        break;
      case "newest":
      default:
        filtered.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
        break;
    }

    // Paginate
    const total = filtered.length;
    const items = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;

    return {
      items,
      total,
      hasMore,
    };
  },
});

// Get all unique categories
export const getCategories = query({
  args: {},
  handler: async (ctx) => {
    const plugins = await ctx.db.query("plugins").collect();
    const categories = [...new Set(plugins.map((p) => p.category))].sort();

    // Count plugins per category
    return categories.map((cat) => ({
      name: cat,
      count: plugins.filter((p) => p.category === cat).length,
    }));
  },
});

// Get all unique formats
export const getFormats = query({
  args: {},
  handler: async (ctx) => {
    const plugins = await ctx.db.query("plugins").collect();
    const formats = new Set<string>();
    plugins.forEach((p) => p.formats?.forEach((f) => formats.add(f)));
    return [...formats].sort();
  },
});

// Get all unique platforms
export const getPlatforms = query({
  args: {},
  handler: async (ctx) => {
    const plugins = await ctx.db.query("plugins").collect();
    const platforms = new Set<string>();
    plugins.forEach((p) => p.platforms?.forEach((f) => platforms.add(f)));
    return [...platforms].sort();
  },
});

// Get plugins added in the last 7 days
export const newThisWeek = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 8;
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const plugins = await ctx.db
      .query("plugins")
      .withIndex("by_updated")
      .order("desc")
      .take(200);

    return plugins
      .filter((p) => p.createdAt > oneWeekAgo)
      .slice(0, limit);
  },
});

// Get similar plugins (same category, excluding the given plugin)
export const similar = query({
  args: {
    pluginId: v.id("plugins"),
    category: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 4;

    const plugins = await ctx.db
      .query("plugins")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .take(limit + 1);

    return plugins
      .filter((p) => p._id !== args.pluginId)
      .slice(0, limit);
  },
});

// Get all enrichment options (predefined lists)
export const getEnrichmentOptions = query({
  args: {},
  handler: async () => {
    return {
      worksWellOn: [
        { value: "vocals", label: "Vocals" },
        { value: "drums", label: "Drums" },
        { value: "bass", label: "Bass" },
        { value: "guitars", label: "Guitars" },
        { value: "keys", label: "Keys" },
        { value: "synths", label: "Synths" },
        { value: "pads", label: "Pads" },
        { value: "strings", label: "Strings" },
        { value: "brass", label: "Brass" },
        { value: "percussion", label: "Percussion" },
        { value: "mix-bus", label: "Mix Bus" },
        { value: "master", label: "Master" },
        { value: "dialogue", label: "Dialogue" },
        { value: "sfx", label: "SFX" },
        { value: "foley", label: "Foley" },
        { value: "full-mix", label: "Full Mix" },
      ],
      useCases: [
        { value: "mixing", label: "Mixing" },
        { value: "mastering", label: "Mastering" },
        { value: "sound-design", label: "Sound Design" },
        { value: "post-production", label: "Post Production" },
        { value: "live-performance", label: "Live Performance" },
        { value: "beat-making", label: "Beat Making" },
        { value: "recording", label: "Recording" },
        { value: "restoration", label: "Restoration" },
        { value: "podcast", label: "Podcast" },
      ],
      sonicCharacter: [
        { value: "transparent", label: "Transparent" },
        { value: "warm", label: "Warm" },
        { value: "aggressive", label: "Aggressive" },
        { value: "vintage", label: "Vintage" },
        { value: "modern", label: "Modern" },
        { value: "colored", label: "Colored" },
        { value: "surgical", label: "Surgical" },
        { value: "creative", label: "Creative" },
        { value: "punchy", label: "Punchy" },
        { value: "smooth", label: "Smooth" },
        { value: "crisp", label: "Crisp" },
      ],
      genreSuitability: [
        { value: "electronic", label: "Electronic" },
        { value: "hip-hop", label: "Hip-Hop" },
        { value: "rock", label: "Rock" },
        { value: "pop", label: "Pop" },
        { value: "classical", label: "Classical" },
        { value: "jazz", label: "Jazz" },
        { value: "cinematic", label: "Cinematic" },
        { value: "ambient", label: "Ambient" },
        { value: "metal", label: "Metal" },
        { value: "r&b", label: "R&B" },
        { value: "country", label: "Country" },
        { value: "edm", label: "EDM" },
      ],
      skillLevel: [
        { value: "beginner", label: "Beginner" },
        { value: "intermediate", label: "Intermediate" },
        { value: "advanced", label: "Advanced" },
        { value: "professional", label: "Professional" },
      ],
      learningCurve: [
        { value: "easy", label: "Easy" },
        { value: "moderate", label: "Moderate" },
        { value: "steep", label: "Steep" },
      ],
      cpuUsage: [
        { value: "light", label: "Light" },
        { value: "moderate", label: "Moderate" },
        { value: "heavy", label: "Heavy" },
        { value: "very-heavy", label: "Very Heavy" },
      ],
      licenseType: [
        { value: "perpetual", label: "Perpetual" },
        { value: "subscription", label: "Subscription" },
        { value: "rent-to-own", label: "Rent-to-Own" },
        { value: "free", label: "Free" },
        { value: "freemium", label: "Freemium" },
      ],
      keyFeatures: [
        // Dynamics
        { value: "sidechain", label: "Sidechain", category: "dynamics" },
        { value: "multiband", label: "Multiband", category: "dynamics" },
        { value: "parallel", label: "Parallel", category: "dynamics" },
        { value: "auto-gain", label: "Auto Gain", category: "dynamics" },
        { value: "lookahead", label: "Lookahead", category: "dynamics" },
        { value: "program-dependent", label: "Program Dependent", category: "dynamics" },
        // EQ/Filters
        { value: "mid-side", label: "Mid/Side", category: "eq" },
        { value: "linear-phase", label: "Linear Phase", category: "eq" },
        { value: "dynamic-eq", label: "Dynamic EQ", category: "eq" },
        { value: "analog-modeling", label: "Analog Modeling", category: "eq" },
        // Spatial
        { value: "true-stereo", label: "True Stereo", category: "spatial" },
        { value: "surround", label: "Surround", category: "spatial" },
        { value: "atmos-compatible", label: "Atmos Compatible", category: "spatial" },
        { value: "binaural", label: "Binaural", category: "spatial" },
        // General
        { value: "oversampling", label: "Oversampling", category: "general" },
        { value: "low-latency", label: "Low Latency", category: "general" },
        { value: "zero-latency", label: "Zero Latency", category: "general" },
        { value: "preset-browser", label: "Preset Browser", category: "general" },
        { value: "undo-history", label: "Undo History", category: "general" },
      ],
      recommendedDaws: [
        { value: "ableton-live", label: "Ableton Live" },
        { value: "logic-pro", label: "Logic Pro" },
        { value: "pro-tools", label: "Pro Tools" },
        { value: "fl-studio", label: "FL Studio" },
        { value: "cubase", label: "Cubase" },
        { value: "studio-one", label: "Studio One" },
        { value: "reaper", label: "Reaper" },
        { value: "bitwig", label: "Bitwig" },
        { value: "reason", label: "Reason" },
      ],
      comparableTo: [
        { value: "ssl-style", label: "SSL-style" },
        { value: "neve-style", label: "Neve-style" },
        { value: "api-style", label: "API-style" },
        { value: "1176-style", label: "1176-style" },
        { value: "la2a-style", label: "LA-2A-style" },
        { value: "pultec-style", label: "Pultec-style" },
        { value: "fairchild-style", label: "Fairchild-style" },
        { value: "dbx-style", label: "DBX-style" },
        { value: "urei-style", label: "UREI-style" },
        { value: "emu-style", label: "E-mu-style" },
      ],
    };
  },
});

// ============================================
// BATCH QUERIES (Desktop enrichment)
// ============================================

/**
 * Get multiple plugins by their IDs.
 * Used by the desktop app to pull enrichment data for matched scanned plugins.
 */
export const getByIds = query({
  args: {
    ids: v.array(v.id("plugins")),
  },
  handler: async (ctx, args) => {
    const plugins = await Promise.all(
      args.ids.map(async (id) => {
        const plugin = await ctx.db.get(id);
        if (!plugin) return null;

        // Resolve image URL from storage if available
        let resolvedImageUrl: string | null | undefined = plugin.imageUrl;
        if (plugin.imageStorageId) {
          resolvedImageUrl = await ctx.storage.getUrl(plugin.imageStorageId);
        }

        return { ...plugin, resolvedImageUrl };
      })
    );
    return plugins.filter(Boolean);
  },
});

// ============================================
// MUTATIONS
// ============================================

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    manufacturer: v.id("manufacturers"),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    category: v.string(),
    subcategory: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    formats: v.optional(v.array(v.string())),
    platforms: v.optional(v.array(v.string())),
    systemRequirements: v.optional(v.string()),
    currentVersion: v.optional(v.string()),
    releaseDate: v.optional(v.number()),
    msrp: v.optional(v.number()),
    currentPrice: v.optional(v.number()),
    currency: v.optional(v.string()),
    isFree: v.optional(v.boolean()),
    hasDemo: v.optional(v.boolean()),
    hasTrial: v.optional(v.boolean()),
    trialDays: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    bannerUrl: v.optional(v.string()),
    screenshots: v.optional(v.array(v.string())),
    videoUrl: v.optional(v.string()),
    audioDemo: v.optional(v.string()),
    productUrl: v.string(),
    manualUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Check for duplicate slug
    const existing = await ctx.db
      .query("plugins")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    
    if (existing) {
      throw new Error(`Plugin with slug "${args.slug}" already exists`);
    }
    
    const pluginId = await ctx.db.insert("plugins", {
      name: args.name,
      slug: args.slug,
      manufacturer: args.manufacturer,
      description: args.description,
      shortDescription: args.shortDescription,
      category: args.category,
      subcategory: args.subcategory,
      tags: args.tags ?? [],
      formats: args.formats ?? [],
      platforms: args.platforms ?? [],
      systemRequirements: args.systemRequirements,
      currentVersion: args.currentVersion,
      releaseDate: args.releaseDate,
      lastUpdated: now,
      msrp: args.msrp,
      currentPrice: args.currentPrice ?? args.msrp,
      currency: args.currency ?? "USD",
      isFree: args.isFree ?? false,
      hasDemo: args.hasDemo ?? false,
      hasTrial: args.hasTrial ?? false,
      trialDays: args.trialDays,
      imageUrl: args.imageUrl,
      bannerUrl: args.bannerUrl,
      screenshots: args.screenshots ?? [],
      videoUrl: args.videoUrl,
      audioDemo: args.audioDemo,
      productUrl: args.productUrl,
      manualUrl: args.manualUrl,
      isActive: true,
      isDiscontinued: false,
      createdAt: now,
      updatedAt: now,
    });
    
    // Increment manufacturer's plugin count
    const manufacturer = await ctx.db.get(args.manufacturer);
    if (manufacturer) {
      await ctx.db.patch(args.manufacturer, {
        pluginCount: manufacturer.pluginCount + 1,
      });
    }
    
    return pluginId;
  },
});

export const update = mutation({
  args: {
    id: v.id("plugins"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    formats: v.optional(v.array(v.string())),
    platforms: v.optional(v.array(v.string())),
    systemRequirements: v.optional(v.string()),
    currentVersion: v.optional(v.string()),
    releaseDate: v.optional(v.number()),
    lastUpdated: v.optional(v.number()),
    msrp: v.optional(v.number()),
    currentPrice: v.optional(v.number()),
    isFree: v.optional(v.boolean()),
    hasDemo: v.optional(v.boolean()),
    hasTrial: v.optional(v.boolean()),
    trialDays: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    bannerStorageId: v.optional(v.id("_storage")),
    screenshotStorageIds: v.optional(v.array(v.id("_storage"))),
    productUrl: v.optional(v.string()),
    manualUrl: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    isDiscontinued: v.optional(v.boolean()),
    // Mention/trending fields
    mentionCount7d: v.optional(v.number()),
    mentionCount30d: v.optional(v.number()),
    mentionScore: v.optional(v.number()),
    lastMentionScan: v.optional(v.number()),
    // Effect taxonomy
    effectType: v.optional(v.string()),
    circuitEmulation: v.optional(v.string()),
    tonalCharacter: v.optional(v.array(v.string())),
    // Enrichment fields
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
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Plugin not found");
    }

    // Filter out undefined values
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    return await ctx.db.patch(id, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });
  },
});

export const updatePrice = mutation({
  args: {
    id: v.id("plugins"),
    currentPrice: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Plugin not found");
    }
    
    await ctx.db.patch(args.id, {
      currentPrice: args.currentPrice,
      updatedAt: Date.now(),
    });
  },
});

export const upsertBySlug = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    manufacturer: v.id("manufacturers"),
    category: v.string(),
    productUrl: v.string(),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    formats: v.optional(v.array(v.string())),
    platforms: v.optional(v.array(v.string())),
    currentVersion: v.optional(v.string()),
    msrp: v.optional(v.number()),
    currentPrice: v.optional(v.number()),
    currency: v.optional(v.string()),
    isFree: v.optional(v.boolean()),
    hasDemo: v.optional(v.boolean()),
    hasTrial: v.optional(v.boolean()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("plugins")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    
    const now = Date.now();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        description: args.description ?? existing.description,
        shortDescription: args.shortDescription ?? existing.shortDescription,
        category: args.category,
        tags: args.tags ?? existing.tags,
        formats: args.formats ?? existing.formats,
        platforms: args.platforms ?? existing.platforms,
        currentVersion: args.currentVersion ?? existing.currentVersion,
        msrp: args.msrp ?? existing.msrp,
        currentPrice: args.currentPrice ?? existing.currentPrice,
        currency: args.currency ?? existing.currency,
        isFree: args.isFree ?? existing.isFree,
        hasDemo: args.hasDemo ?? existing.hasDemo,
        hasTrial: args.hasTrial ?? existing.hasTrial,
        imageUrl: args.imageUrl ?? existing.imageUrl,
        productUrl: args.productUrl,
        updatedAt: now,
      });
      return existing._id;
    } else {
      const pluginId = await ctx.db.insert("plugins", {
        name: args.name,
        slug: args.slug,
        manufacturer: args.manufacturer,
        description: args.description,
        shortDescription: args.shortDescription,
        category: args.category,
        subcategory: undefined,
        tags: args.tags ?? [],
        formats: args.formats ?? [],
        platforms: args.platforms ?? [],
        systemRequirements: undefined,
        currentVersion: args.currentVersion,
        releaseDate: undefined,
        lastUpdated: now,
        msrp: args.msrp,
        currentPrice: args.currentPrice ?? args.msrp,
        currency: args.currency ?? "USD",
        isFree: args.isFree ?? false,
        hasDemo: args.hasDemo ?? false,
        hasTrial: args.hasTrial ?? false,
        trialDays: undefined,
        imageUrl: args.imageUrl,
        bannerUrl: undefined,
        screenshots: [],
        videoUrl: undefined,
        audioDemo: undefined,
        productUrl: args.productUrl,
        manualUrl: undefined,
        isActive: true,
        isDiscontinued: false,
        createdAt: now,
        updatedAt: now,
      });
      
      // Increment manufacturer's plugin count
      const manufacturer = await ctx.db.get(args.manufacturer);
      if (manufacturer) {
        await ctx.db.patch(args.manufacturer, {
          pluginCount: manufacturer.pluginCount + 1,
        });
      }
      
      return pluginId;
    }
  },
});

// ============================================
// DELETE (from plugin-radar)
// ============================================

export const remove = mutation({
  args: { id: v.id("plugins") },
  handler: async (ctx, args) => {
    const plugin = await ctx.db.get(args.id);
    if (!plugin) throw new Error("Plugin not found");
    await ctx.db.delete(args.id);
    return { success: true };
  },
});
