import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

/**
 * Recomputes plugin pairing stats from all public chains.
 * Scheduled daily via cron. Analyzes consecutive plugin pairs
 * in non-bypassed chain slots to build recommendation data.
 */
export const recomputePairings = internalMutation({
  args: {},
  handler: async (ctx) => {
    // 1. Fetch all public chains
    const chains = await ctx.db
      .query("pluginChains")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .collect();

    // 2. Build co-occurrence map: pluginKey -> nextPluginKey -> stats
    const pairings = new Map<
      string,
      {
        category: string;
        nexts: Map<string, { count: number; ratingSum: number; ratingCount: number }>;
      }
    >();

    for (const chain of chains) {
      // Filter to non-bypassed slots, sorted by position
      const slots = chain.slots
        .filter((s) => !s.bypassed)
        .sort((a, b) => a.position - b.position);

      if (slots.length < 2) continue;

      for (let i = 0; i < slots.length - 1; i++) {
        const current = slots[i];
        const next = slots[i + 1];
        const key = `${current.pluginName}::${current.manufacturer}`;
        const nextKey = `${next.pluginName}::${next.manufacturer}`;

        if (!pairings.has(key)) {
          pairings.set(key, {
            category: chain.category,
            nexts: new Map(),
          });
        }
        const entry = pairings.get(key)!;
        if (!entry.nexts.has(nextKey)) {
          entry.nexts.set(nextKey, { count: 0, ratingSum: 0, ratingCount: 0 });
        }
        entry.nexts.get(nextKey)!.count++;
      }
    }

    // 3. Delete all existing pairing docs
    const existing = await ctx.db.query("pluginPairings").collect();
    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }

    // 4. Insert new aggregated pairings (top 10 next plugins per plugin)
    for (const [key, data] of pairings) {
      const [pluginName, manufacturer] = key.split("::");

      const nextPlugins = Array.from(data.nexts.entries())
        .map(([nk, stats]) => {
          const [npName, npManufacturer] = nk.split("::");
          return {
            pluginName: npName,
            manufacturer: npManufacturer,
            count: stats.count,
            avgRating:
              stats.ratingCount > 0
                ? stats.ratingSum / stats.ratingCount
                : undefined,
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const totalObservations = nextPlugins.reduce(
        (sum, p) => sum + p.count,
        0
      );

      await ctx.db.insert("pluginPairings", {
        pluginName,
        manufacturer,
        category: data.category,
        nextPlugins,
        totalObservations,
        lastUpdatedAt: Date.now(),
      });
    }
  },
});

/**
 * Query plugin pairings for a given plugin.
 * Returns the most commonly used next plugins, sorted by frequency.
 */
export const getPluginPairings = query({
  args: {
    pluginName: v.string(),
    manufacturer: v.string(),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pairing = await ctx.db
      .query("pluginPairings")
      .withIndex("by_plugin", (q) =>
        q.eq("pluginName", args.pluginName).eq("manufacturer", args.manufacturer)
      )
      .first();

    if (!pairing) return [];

    let results = pairing.nextPlugins.sort((a, b) => b.count - a.count);

    // Optionally filter by category if caller wants category-specific pairings
    if (args.category) {
      const categoryPairing = await ctx.db
        .query("pluginPairings")
        .withIndex("by_plugin", (q) =>
          q.eq("pluginName", args.pluginName).eq("manufacturer", args.manufacturer)
        )
        .filter((q) => q.eq(q.field("category"), args.category!))
        .first();
      if (categoryPairing) {
        results = categoryPairing.nextPlugins.sort((a, b) => b.count - a.count);
      }
    }

    return results.slice(0, args.limit ?? 5);
  },
});
