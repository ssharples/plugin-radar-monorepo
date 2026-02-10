import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { checkRateLimit } from "./lib/rateLimit";
import { USE_CASE_TO_GROUP } from "./lib/chainUseCases";
import { getSessionUser } from "./lib/auth";

// ============================================
// PLUGIN SYNC FROM PLUGIN-DIRECTORY APP
// ============================================

/**
 * Sync scanned plugins from the JUCE plugin-directory app
 * Called after a scan completes with all discovered plugins
 */
export const syncScannedPlugins = mutation({
  args: {
    userId: v.id("users"),
    plugins: v.array(v.object({
      name: v.string(),
      manufacturer: v.string(),
      format: v.string(),
      uid: v.number(),
      fileOrIdentifier: v.string(),
      isInstrument: v.boolean(),
      numInputChannels: v.number(),
      numOutputChannels: v.number(),
      version: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    // Rate limit: 5 syncs per minute per user
    await checkRateLimit(ctx, `sync:${args.userId}`, 5, 60 * 1000);

    const now = Date.now();
    const results = {
      synced: 0,
      created: 0,
      updated: 0,
      matched: 0,
    };

    for (const plugin of args.plugins) {
      // Check if we already have this plugin for this user (by UID)
      const existing = await ctx.db
        .query("scannedPlugins")
        .withIndex("by_user_uid", (q) => 
          q.eq("user", args.userId).eq("uid", plugin.uid)
        )
        .first();

      if (existing) {
        // Update lastSeenAt
        await ctx.db.patch(existing._id, {
          lastSeenAt: now,
          version: plugin.version,
        });
        results.updated++;
      } else {
        // Try to match to our database
        const match = await matchPlugin(ctx, plugin.name, plugin.manufacturer);

        // Create new scanned plugin record
        await ctx.db.insert("scannedPlugins", {
          user: args.userId,
          name: plugin.name,
          manufacturer: plugin.manufacturer,
          format: plugin.format,
          uid: plugin.uid,
          fileOrIdentifier: plugin.fileOrIdentifier,
          isInstrument: plugin.isInstrument,
          numInputChannels: plugin.numInputChannels,
          numOutputChannels: plugin.numOutputChannels,
          version: plugin.version,
          matchedPlugin: match?.pluginId,
          matchConfidence: match?.confidence,
          matchMethod: match?.method,
          firstSeenAt: now,
          lastSeenAt: now,
        });
        results.created++;

        if (match) {
          results.matched++;
          
          // Also add to ownedPlugins if matched and not already there
          if (match.pluginId) {
            const alreadyOwned = await ctx.db
              .query("ownedPlugins")
              .withIndex("by_user_plugin", (q) =>
                q.eq("user", args.userId).eq("plugin", match.pluginId!)
              )
              .first();
            
            if (!alreadyOwned) {
              await ctx.db.insert("ownedPlugins", {
                user: args.userId,
                plugin: match.pluginId,
                addedAt: now,
              });
            }
          }
        }
      }
      results.synced++;
    }

    return results;
  },
});

/**
 * Match a plugin name/manufacturer to our database
 */
async function matchPlugin(
  ctx: any,
  name: string,
  manufacturer: string
): Promise<{ pluginId: Id<"plugins">; confidence: number; method: string } | null> {
  
  // Normalize for matching
  const normName = normalizeName(name);
  const normManufacturer = normalizeName(manufacturer);

  // 1. Try exact search first
  const exactResults = await ctx.db
    .query("plugins")
    .withSearchIndex("search_name", (q: any) => q.search("name", name))
    .take(10);

  for (const plugin of exactResults) {
    const pluginManufacturer = await ctx.db.get(plugin.manufacturer);
    if (!pluginManufacturer) continue;

    // Exact match
    if (
      plugin.name.toLowerCase() === name.toLowerCase() &&
      pluginManufacturer.name.toLowerCase() === manufacturer.toLowerCase()
    ) {
      return { pluginId: plugin._id, confidence: 100, method: "exact" };
    }

    // Normalized match (handles "Pro-Q 3" vs "Pro Q 3")
    if (
      normalizeName(plugin.name) === normName &&
      normalizeName(pluginManufacturer.name) === normManufacturer
    ) {
      return { pluginId: plugin._id, confidence: 95, method: "normalized" };
    }
  }

  // 2. Try fuzzy matching with manufacturer filter
  const manufacturerDoc = await ctx.db
    .query("manufacturers")
    .withSearchIndex("search_name", (q: any) => q.search("name", manufacturer))
    .first();

  if (manufacturerDoc) {
    // Get all plugins from this manufacturer
    const manufacturerPlugins = await ctx.db
      .query("plugins")
      .withIndex("by_manufacturer", (q: any) => q.eq("manufacturer", manufacturerDoc._id))
      .collect();

    for (const plugin of manufacturerPlugins) {
      const similarity = calculateSimilarity(normName, normalizeName(plugin.name));
      if (similarity >= 0.8) {
        return { 
          pluginId: plugin._id, 
          confidence: Math.round(similarity * 100), 
          method: "fuzzy" 
        };
      }
    }
  }

  // 3. Broad fuzzy search (slower, last resort)
  const allResults = await ctx.db
    .query("plugins")
    .withSearchIndex("search_name", (q: any) => q.search("name", name.split(" ")[0]))
    .take(20);

  for (const plugin of allResults) {
    const pluginManufacturer = await ctx.db.get(plugin.manufacturer);
    if (!pluginManufacturer) continue;

    const nameSimilarity = calculateSimilarity(normName, normalizeName(plugin.name));
    const mfgSimilarity = calculateSimilarity(normManufacturer, normalizeName(pluginManufacturer.name));
    
    // Both name and manufacturer should be somewhat similar
    if (nameSimilarity >= 0.7 && mfgSimilarity >= 0.6) {
      const combined = (nameSimilarity * 0.7 + mfgSimilarity * 0.3);
      return { 
        pluginId: plugin._id, 
        confidence: Math.round(combined * 100), 
        method: "fuzzy" 
      };
    }
  }

  return null;
}

/**
 * Normalize plugin name for matching
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")  // Remove special chars
    .replace(/\d+$/, "");        // Remove trailing version numbers
}

/**
 * Calculate Levenshtein similarity (0-1)
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[b.length][a.length];
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

// ============================================
// QUERIES FOR PLUGIN-DIRECTORY APP
// ============================================

/**
 * Get user's scanned plugins with match status
 */
export const getUserScannedPlugins = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const scanned = await ctx.db
      .query("scannedPlugins")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .collect();

    // Enrich with matched plugin data
    const enriched = await Promise.all(
      scanned.map(async (sp) => {
        let matchedPluginData = null;
        if (sp.matchedPlugin) {
          const plugin = await ctx.db.get(sp.matchedPlugin);
          if (plugin) {
            const manufacturer = await ctx.db.get(plugin.manufacturer);
            matchedPluginData = {
              id: plugin._id,
              name: plugin.name,
              slug: plugin.slug,
              manufacturer: manufacturer?.name,
              imageUrl: plugin.imageUrl,
              currentPrice: plugin.currentPrice,
              isFree: plugin.isFree,
            };
          }
        }
        return {
          ...sp,
          matchedPluginData,
        };
      })
    );

    return enriched;
  },
});

/**
 * Get unmatched plugins for a user (for manual matching UI)
 */
export const getUnmatchedPlugins = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scannedPlugins")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .filter((q) => q.eq(q.field("matchedPlugin"), undefined))
      .collect();
  },
});

/**
 * Manually match a scanned plugin to a PluginRadar plugin
 */
export const manualMatchPlugin = mutation({
  args: {
    scannedPluginId: v.id("scannedPlugins"),
    pluginId: v.id("plugins"),
  },
  handler: async (ctx, args) => {
    const scanned = await ctx.db.get(args.scannedPluginId);
    if (!scanned) throw new Error("Scanned plugin not found");

    await ctx.db.patch(args.scannedPluginId, {
      matchedPlugin: args.pluginId,
      matchConfidence: 100,
      matchMethod: "manual",
    });

    // Also add to ownedPlugins
    if (scanned.user) {
      const alreadyOwned = await ctx.db
        .query("ownedPlugins")
        .withIndex("by_user_plugin", (q) =>
          q.eq("user", scanned.user!).eq("plugin", args.pluginId)
        )
        .first();

      if (!alreadyOwned) {
        await ctx.db.insert("ownedPlugins", {
          user: scanned.user,
          plugin: args.pluginId,
          addedAt: Date.now(),
        });
      }
    }

    return { success: true };
  },
});

// ============================================
// CHAIN MANAGEMENT
// ============================================

/**
 * Save a plugin chain
 */
export const saveChain = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    tags: v.array(v.string()),
    genre: v.optional(v.string()),
    useCase: v.optional(v.string()),
    slots: v.array(v.object({
      position: v.number(),
      pluginName: v.string(),
      manufacturer: v.string(),
      format: v.optional(v.string()),
      uid: v.optional(v.number()),
      version: v.optional(v.string()),
      presetName: v.optional(v.string()),
      presetData: v.optional(v.string()),
      presetSizeBytes: v.optional(v.number()),
      bypassed: v.boolean(),
      notes: v.optional(v.string()),
      parameters: v.optional(v.array(v.object({
        name: v.string(),
        value: v.string(),
        normalizedValue: v.number(),
        semantic: v.optional(v.string()),
        unit: v.optional(v.string()),
      }))),
    })),
    isPublic: v.boolean(),
    targetInputLufs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Generate slug
    const baseSlug = args.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    
    // Check for existing slug and make unique
    let slug = baseSlug;
    let counter = 1;
    while (await ctx.db.query("pluginChains").withIndex("by_slug", (q) => q.eq("slug", slug)).first()) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Try to match each slot's plugin
    const enrichedSlots = await Promise.all(
      args.slots.map(async (slot) => {
        const match = await matchPlugin(ctx, slot.pluginName, slot.manufacturer);
        return {
          ...slot,
          matchedPlugin: match?.pluginId,
        };
      })
    );

    // Generate share code
    const shareCode = generateShareCode();

    // Pre-compute pluginIds for fast compatibility checks during browse
    const pluginIds = enrichedSlots
      .filter((s) => s.matchedPlugin)
      .map((s) => s.matchedPlugin!.toString());

    // Derive useCaseGroup from useCase
    const useCaseGroup = args.useCase
      ? USE_CASE_TO_GROUP[args.useCase] ?? undefined
      : undefined;

    const chainId = await ctx.db.insert("pluginChains", {
      user: args.userId,
      name: args.name,
      slug,
      description: args.description,
      category: args.category,
      tags: args.tags,
      genre: args.genre,
      useCase: args.useCase,
      useCaseGroup,
      pluginIds: pluginIds.length > 0 ? pluginIds : undefined,
      slots: enrichedSlots,
      pluginCount: enrichedSlots.length,
      views: 0,
      downloads: 0,
      likes: 0,
      isPublic: args.isPublic,
      shareCode,
      targetInputLufs: args.targetInputLufs,
      createdAt: now,
      updatedAt: now,
    });

    return { chainId, slug, shareCode };
  },
});

function generateShareCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I, O, 0, 1 for clarity
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Get a chain by slug (public) or share code (private)
 */
export const getChain = query({
  args: {
    slug: v.optional(v.string()),
    shareCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let chain;
    
    if (args.slug) {
      chain = await ctx.db
        .query("pluginChains")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug!))
        .first();
    } else if (args.shareCode) {
      chain = await ctx.db
        .query("pluginChains")
        .withIndex("by_share_code", (q) => q.eq("shareCode", args.shareCode!))
        .first();
    }

    if (!chain) return null;

    // Get author info
    const author = await ctx.db.get(chain.user);

    // Enrich slots with plugin data
    const enrichedSlots = await Promise.all(
      chain.slots.map(async (slot) => {
        let pluginData = null;
        if (slot.matchedPlugin) {
          const plugin = await ctx.db.get(slot.matchedPlugin);
          if (plugin) {
            const manufacturer = await ctx.db.get(plugin.manufacturer);
            pluginData = {
              id: plugin._id,
              name: plugin.name,
              slug: plugin.slug,
              manufacturer: manufacturer?.name,
              imageUrl: plugin.imageUrl,
              currentPrice: plugin.currentPrice,
              isFree: plugin.isFree,
              productUrl: plugin.productUrl,
            };
          }
        }
        return { ...slot, pluginData };
      })
    );

    return {
      ...chain,
      slots: enrichedSlots,
      author: author ? { name: author.name, avatarUrl: author.avatarUrl } : null,
    };
  },
});

/**
 * Check if user can load a chain (has all plugins)
 */
export const checkChainCompatibility = query({
  args: {
    chainId: v.id("pluginChains"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const chain = await ctx.db.get(args.chainId);
    if (!chain) throw new Error("Chain not found");

    // Get user's owned plugins (catalog-matched)
    const owned = await ctx.db
      .query("ownedPlugins")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .collect();

    const ownedPluginIds = new Set(owned.map((o) => o.plugin.toString()));

    // Get user's scanned plugins for name-based fallback matching
    const scannedPlugins = await ctx.db
      .query("scannedPlugins")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .collect();

    // Build a set of normalized "name::manufacturer" keys from scanned plugins
    const scannedKeys = new Set(
      scannedPlugins.map((sp) =>
        `${sp.name.toLowerCase()}::${sp.manufacturer.toLowerCase()}`
      )
    );

    // Check each slot
    const slotStatus = chain.slots.map((slot) => {
      // First: check by catalog match ID
      let isOwned = slot.matchedPlugin
        ? ownedPluginIds.has(slot.matchedPlugin.toString())
        : false;

      // Fallback: if no catalog match or not found in ownedPlugins,
      // check if user has a scanned plugin with the same name+manufacturer
      if (!isOwned) {
        const slotKey = `${slot.pluginName.toLowerCase()}::${slot.manufacturer.toLowerCase()}`;
        isOwned = scannedKeys.has(slotKey);
      }

      return {
        position: slot.position,
        pluginName: slot.pluginName,
        manufacturer: slot.manufacturer,
        matchedPlugin: slot.matchedPlugin,
        owned: isOwned,
      };
    });

    const ownedCount = slotStatus.filter((s) => s.owned).length;
    const missingCount = chain.pluginCount - ownedCount;

    return {
      canFullyLoad: missingCount === 0,
      ownedCount,
      missingCount,
      totalCount: chain.pluginCount,
      percentage: Math.round((ownedCount / chain.pluginCount) * 100),
      slots: slotStatus,
    };
  },
});

/**
 * Get detailed compatibility info for a chain.
 * For each slot, reports owned/missing status and suggests alternatives
 * the user owns in the same category.
 */
export const getDetailedCompatibility = query({
  args: {
    chainId: v.id("pluginChains"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const chain = await ctx.db.get(args.chainId);
    if (!chain) throw new Error("Chain not found");

    // Get user's scanned plugins (with match data)
    const scannedPlugins = await ctx.db
      .query("scannedPlugins")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .collect();

    // Build a set of matched plugin IDs the user owns
    const ownedPluginIds = new Set(
      scannedPlugins
        .filter((sp) => sp.matchedPlugin)
        .map((sp) => sp.matchedPlugin!.toString())
    );

    // Also check ownedPlugins table
    const ownedPlugins = await ctx.db
      .query("ownedPlugins")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .collect();
    for (const op of ownedPlugins) {
      ownedPluginIds.add(op.plugin.toString());
    }

    // Build a set of normalized "name::manufacturer" keys for fallback matching
    const scannedKeys = new Set(
      scannedPlugins.map((sp) =>
        `${sp.name.toLowerCase()}::${sp.manufacturer.toLowerCase()}`
      )
    );

    // Process each slot
    const slots: Array<{
      position: number;
      pluginName: string;
      manufacturer: string;
      status: "owned" | "missing";
      alternatives: Array<{
        id: string;
        name: string;
        manufacturer: string;
        slug?: string;
      }>;
    }> = [];

    let ownedCount = 0;
    let missingCount = 0;
    const missingList: Array<{
      pluginName: string;
      manufacturer: string;
      suggestion: string | null;
    }> = [];

    for (const slot of chain.slots) {
      let isOwned =
        slot.matchedPlugin &&
        ownedPluginIds.has(slot.matchedPlugin.toString());

      // Fallback: name+manufacturer match against scanned plugins
      if (!isOwned) {
        const slotKey = `${slot.pluginName.toLowerCase()}::${slot.manufacturer.toLowerCase()}`;
        isOwned = scannedKeys.has(slotKey);
      }

      if (isOwned) {
        ownedCount++;
        slots.push({
          position: slot.position,
          pluginName: slot.pluginName,
          manufacturer: slot.manufacturer,
          status: "owned",
          alternatives: [],
        });
      } else {
        missingCount++;

        // Find alternatives: same category plugins the user owns
        const alternatives: Array<{
          id: string;
          name: string;
          manufacturer: string;
          slug?: string;
        }> = [];

        // Get the category of the missing plugin (if matched)
        let pluginCategory: string | null = null;
        if (slot.matchedPlugin) {
          const matchedPlugin = await ctx.db.get(slot.matchedPlugin);
          if (matchedPlugin) {
            pluginCategory = matchedPlugin.category;
          }
        }

        // If we know the category, find user-owned plugins in the same category
        if (pluginCategory) {
          const sameCategoryPlugins = await ctx.db
            .query("plugins")
            .withIndex("by_category", (q) => q.eq("category", pluginCategory!))
            .take(50);

          for (const candidate of sameCategoryPlugins) {
            if (ownedPluginIds.has(candidate._id.toString())) {
              const mfg = await ctx.db.get(candidate.manufacturer);
              alternatives.push({
                id: candidate._id,
                name: candidate.name,
                manufacturer: mfg?.name ?? "Unknown",
                slug: candidate.slug,
              });
              if (alternatives.length >= 3) break; // Cap at 3 suggestions
            }
          }
        }

        // If no category match, try fuzzy name matching against user's scanned plugins
        if (alternatives.length === 0) {
          const normSlotName = slot.pluginName.toLowerCase().replace(/[^a-z0-9]/g, "");
          for (const sp of scannedPlugins) {
            const normSpName = sp.name.toLowerCase().replace(/[^a-z0-9]/g, "");
            // Check if names share significant overlap
            if (
              normSpName.includes(normSlotName.slice(0, 4)) ||
              normSlotName.includes(normSpName.slice(0, 4))
            ) {
              // Exclude exact same plugin name
              if (sp.name.toLowerCase() !== slot.pluginName.toLowerCase()) {
                alternatives.push({
                  id: sp._id,
                  name: sp.name,
                  manufacturer: sp.manufacturer,
                });
                if (alternatives.length >= 3) break;
              }
            }
          }
        }

        const suggestion =
          alternatives.length > 0
            ? `${alternatives[0].name} (${alternatives[0].manufacturer})`
            : null;

        missingList.push({
          pluginName: slot.pluginName,
          manufacturer: slot.manufacturer,
          suggestion,
        });

        slots.push({
          position: slot.position,
          pluginName: slot.pluginName,
          manufacturer: slot.manufacturer,
          status: "missing",
          alternatives,
        });
      }
    }

    const totalCount = chain.slots.length;
    const percentage =
      totalCount > 0 ? Math.round((ownedCount / totalCount) * 100) : 100;

    return {
      slots,
      ownedCount,
      missingCount,
      percentage,
      missing: missingList,
    };
  },
});

/**
 * Browse public chains
 */
export const browseChains = query({
  args: {
    category: v.optional(v.string()),
    sortBy: v.optional(v.string()), // "popular", "recent", "downloads", "rating"
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    let chains;
    if (args.category) {
      chains = await ctx.db
        .query("pluginChains")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .filter((q) => q.eq(q.field("isPublic"), true))
        .take(limit * 2);  // Get extra for sorting
    } else {
      chains = await ctx.db
        .query("pluginChains")
        .withIndex("by_public", (q) => q.eq("isPublic", true))
        .take(limit * 2);
    }

    // Sort
    if (args.sortBy === "rating") {
      // Compute average ratings for each chain
      const chainsWithRating = await Promise.all(
        chains.map(async (chain) => {
          const ratings = await ctx.db
            .query("chainRatings")
            .withIndex("by_chain_user", (q) => q.eq("chainId", chain._id))
            .collect();
          const avg =
            ratings.length > 0
              ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
              : 0;
          return { chain, avgRating: avg, ratingCount: ratings.length };
        })
      );
      chainsWithRating.sort((a, b) => b.avgRating - a.avgRating || b.ratingCount - a.ratingCount);
      chains = chainsWithRating.map((c) => c.chain);
    } else if (args.sortBy === "downloads") {
      chains.sort((a, b) => b.downloads - a.downloads);
    } else if (args.sortBy === "popular") {
      chains.sort((a, b) => b.likes - a.likes);
    } else {
      chains.sort((a, b) => b.createdAt - a.createdAt);
    }

    // Get author info for each chain
    const enriched = await Promise.all(
      chains.slice(0, limit).map(async (chain) => {
        const author = await ctx.db.get(chain.user);
        return {
          ...chain,
          author: author ? { name: author.name, avatarUrl: author.avatarUrl } : null,
        };
      })
    );

    return enriched;
  },
});

/**
 * Record a chain download
 */
export const downloadChain = mutation({
  args: {
    chainId: v.id("pluginChains"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const chain = await ctx.db.get(args.chainId);
    if (!chain) throw new Error("Chain not found");

    // Check compatibility
    const owned = await ctx.db
      .query("ownedPlugins")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .collect();
    
    const ownedPluginIds = new Set(owned.map((o) => o.plugin.toString()));
    const ownedCount = chain.slots.filter(
      (s) => s.matchedPlugin && ownedPluginIds.has(s.matchedPlugin.toString())
    ).length;

    // Record download
    await ctx.db.insert("chainDownloads", {
      chain: args.chainId,
      user: args.userId,
      ownedPluginCount: ownedCount,
      missingPluginCount: chain.pluginCount - ownedCount,
      createdAt: Date.now(),
    });

    // Increment download count
    await ctx.db.patch(args.chainId, {
      downloads: chain.downloads + 1,
    });

    return { success: true };
  },
});

/**
 * Like/unlike a chain
 */
export const toggleChainLike = mutation({
  args: {
    chainId: v.id("pluginChains"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const chain = await ctx.db.get(args.chainId);
    if (!chain) throw new Error("Chain not found");

    const existingLike = await ctx.db
      .query("chainLikes")
      .withIndex("by_user_chain", (q) => 
        q.eq("user", args.userId).eq("chain", args.chainId)
      )
      .first();

    if (existingLike) {
      // Unlike
      await ctx.db.delete(existingLike._id);
      await ctx.db.patch(args.chainId, {
        likes: Math.max(0, chain.likes - 1),
      });
      return { liked: false };
    } else {
      // Like
      await ctx.db.insert("chainLikes", {
        chain: args.chainId,
        user: args.userId,
        createdAt: Date.now(),
      });
      await ctx.db.patch(args.chainId, {
        likes: chain.likes + 1,
      });
      return { liked: true };
    }
  },
});

// ============================================
// USER PROFILE QUERIES
// ============================================

/**
 * Get chains by a specific user.
 * If sessionToken is provided and matches the userId, returns all chains.
 * Otherwise, returns only public chains.
 */
export const getChainsByUser = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const chains = await ctx.db
      .query("pluginChains")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .collect();

    // Determine if the requester is the chain owner
    let isOwner = false;
    if (args.sessionToken) {
      const session = await ctx.db
        .query("sessions")
        .withIndex("by_token", (q) => q.eq("token", args.sessionToken!))
        .first();
      if (session && session.expiresAt >= Date.now() && session.userId === args.userId) {
        isOwner = true;
      }
    }

    // Filter to public only if not the owner
    const filtered = isOwner ? chains : chains.filter((c) => c.isPublic);

    // Sort by most recent
    filtered.sort((a, b) => b.createdAt - a.createdAt);

    // Enrich with author info
    const user = await ctx.db.get(args.userId);
    return filtered.map((chain) => ({
      ...chain,
      author: user ? { name: user.name, avatarUrl: user.avatarUrl } : null,
    }));
  },
});

/**
 * Get aggregated stats for a user profile
 */
export const getUserStats = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Count public chains
    const chains = await ctx.db
      .query("pluginChains")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .filter((q) => q.eq(q.field("isPublic"), true))
      .collect();

    const chainCount = chains.length;
    const totalLikes = chains.reduce((sum, c) => sum + c.likes, 0);
    const totalDownloads = chains.reduce((sum, c) => sum + c.downloads, 0);

    // Count followers
    const followers = await ctx.db
      .query("userFollows")
      .withIndex("by_followed", (q) => q.eq("followedId", args.userId))
      .collect();

    return {
      chainCount,
      totalLikes,
      totalDownloads,
      followerCount: followers.length,
    };
  },
});

// ============================================
// ENHANCED CHAIN BROWSING
// ============================================

/**
 * Browse public chains with granular filtering, sorting, and compatibility.
 * Replaces basic browseChains for the new ChainBrowser UI.
 */
export const browseChainsPaginated = query({
  args: {
    useCaseGroup: v.optional(v.string()),
    useCase: v.optional(v.string()),
    search: v.optional(v.string()),
    sortBy: v.optional(v.string()),       // "popular" | "recent" | "downloads" | "rating"
    compatibilityFilter: v.optional(v.string()), // "all" | "full" | "close"
    sessionToken: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    const offset = args.offset || 0;

    // Determine user's owned plugin IDs for compatibility filtering
    let ownedPluginIds: Set<string> | null = null;
    if (args.compatibilityFilter && args.compatibilityFilter !== "all" && args.sessionToken) {
      try {
        const { userId } = await getSessionUser(ctx, args.sessionToken);
        const owned = await ctx.db
          .query("ownedPlugins")
          .withIndex("by_user", (q) => q.eq("user", userId))
          .collect();
        ownedPluginIds = new Set(owned.map((o) => o.plugin.toString()));
      } catch {
        // Not authenticated — skip compatibility filtering
      }
    }

    let chains;

    // Use search index if search text is provided
    if (args.search && args.search.trim()) {
      let searchQuery = ctx.db
        .query("pluginChains")
        .withSearchIndex("search_name", (q: any) => {
          let sq = q.search("name", args.search!);
          sq = sq.eq("isPublic", true);
          if (args.useCaseGroup) {
            sq = sq.eq("useCaseGroup", args.useCaseGroup);
          }
          if (args.useCase) {
            sq = sq.eq("useCase", args.useCase);
          }
          return sq;
        });
      chains = await searchQuery.take(200);
    } else if (args.useCase) {
      // Filter by specific use case
      chains = await ctx.db
        .query("pluginChains")
        .withIndex("by_use_case", (q) =>
          q.eq("useCase", args.useCase!).eq("isPublic", true)
        )
        .take(200);
    } else if (args.useCaseGroup) {
      // Filter by use case group
      chains = await ctx.db
        .query("pluginChains")
        .withIndex("by_use_case_group", (q) =>
          q.eq("useCaseGroup", args.useCaseGroup!).eq("isPublic", true)
        )
        .take(200);
    } else {
      // All public chains
      chains = await ctx.db
        .query("pluginChains")
        .withIndex("by_public", (q) => q.eq("isPublic", true))
        .take(200);
    }

    // Apply compatibility filter if requested
    if (ownedPluginIds && args.compatibilityFilter !== "all") {
      chains = chains.filter((chain) => {
        if (!chain.pluginIds || chain.pluginIds.length === 0) {
          // No pre-computed IDs — skip filtering for this chain
          return true;
        }
        const missing = chain.pluginIds.filter(
          (id) => !ownedPluginIds!.has(id)
        ).length;
        if (args.compatibilityFilter === "full") {
          return missing === 0;
        }
        // "close" = missing 0-2
        return missing <= 2;
      });
    }

    // Sort
    if (args.sortBy === "rating") {
      const chainsWithRating = await Promise.all(
        chains.map(async (chain) => {
          const ratings = await ctx.db
            .query("chainRatings")
            .withIndex("by_chain_user", (q) => q.eq("chainId", chain._id))
            .collect();
          const avg =
            ratings.length > 0
              ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
              : 0;
          return { chain, avgRating: avg, ratingCount: ratings.length };
        })
      );
      chainsWithRating.sort(
        (a, b) => b.avgRating - a.avgRating || b.ratingCount - a.ratingCount
      );
      chains = chainsWithRating.map((c) => c.chain);
    } else if (args.sortBy === "downloads") {
      chains.sort((a, b) => b.downloads - a.downloads);
    } else if (args.sortBy === "popular") {
      chains.sort((a, b) => b.likes - a.likes);
    } else {
      // Default: recent
      chains.sort((a, b) => b.createdAt - a.createdAt);
    }

    // Paginate
    const total = chains.length;
    const paged = chains.slice(offset, offset + limit);

    // Enrich with author info
    const enriched = await Promise.all(
      paged.map(async (chain) => {
        const author = await ctx.db.get(chain.user);
        return {
          ...chain,
          author: author
            ? { name: author.name, avatarUrl: author.avatarUrl }
            : null,
        };
      })
    );

    return {
      chains: enriched,
      total,
      hasMore: offset + limit < total,
    };
  },
});

// ============================================
// CHAIN COLLECTIONS (cross-platform bookmarks)
// ============================================

/**
 * Add a chain to the user's collection
 */
export const addToCollection = mutation({
  args: {
    sessionToken: v.string(),
    chainId: v.id("pluginChains"),
    source: v.string(), // "web" | "desktop"
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    // Check if already in collection
    const existing = await ctx.db
      .query("chainCollections")
      .withIndex("by_user_chain", (q) =>
        q.eq("user", userId).eq("chain", args.chainId)
      )
      .first();

    if (existing) {
      // Update notes if provided
      if (args.notes !== undefined) {
        await ctx.db.patch(existing._id, { notes: args.notes });
      }
      return { _id: existing._id, alreadyExists: true };
    }

    const id = await ctx.db.insert("chainCollections", {
      user: userId,
      chain: args.chainId,
      addedAt: Date.now(),
      source: args.source,
      notes: args.notes,
    });

    return { _id: id, alreadyExists: false };
  },
});

/**
 * Remove a chain from the user's collection
 */
export const removeFromCollection = mutation({
  args: {
    sessionToken: v.string(),
    chainId: v.id("pluginChains"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    const existing = await ctx.db
      .query("chainCollections")
      .withIndex("by_user_chain", (q) =>
        q.eq("user", userId).eq("chain", args.chainId)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return { success: true };
  },
});

/**
 * Get the user's chain collection with enriched data
 */
export const getMyCollection = query({
  args: {
    sessionToken: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let userId;
    try {
      ({ userId } = await getSessionUser(ctx, args.sessionToken));
    } catch {
      return [];
    }

    const limit = args.limit || 50;
    const items = await ctx.db
      .query("chainCollections")
      .withIndex("by_user", (q) => q.eq("user", userId))
      .take(limit);

    // Sort by most recently added
    items.sort((a, b) => b.addedAt - a.addedAt);

    // Enrich with chain + author data
    const enriched = await Promise.all(
      items.map(async (item) => {
        const chain = await ctx.db.get(item.chain);
        if (!chain) return null;

        const author = await ctx.db.get(chain.user);
        return {
          ...item,
          chain: {
            ...chain,
            author: author
              ? { name: author.name, avatarUrl: author.avatarUrl }
              : null,
          },
        };
      })
    );

    return enriched.filter((e) => e !== null);
  },
});

/**
 * Check if a chain is in the user's collection
 */
export const isInCollection = query({
  args: {
    sessionToken: v.string(),
    chainId: v.id("pluginChains"),
  },
  handler: async (ctx, args) => {
    let userId;
    try {
      ({ userId } = await getSessionUser(ctx, args.sessionToken));
    } catch {
      return false;
    }

    const existing = await ctx.db
      .query("chainCollections")
      .withIndex("by_user_chain", (q) =>
        q.eq("user", userId).eq("chain", args.chainId)
      )
      .first();

    return !!existing;
  },
});
