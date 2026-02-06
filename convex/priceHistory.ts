import { v } from "convex/values";
import { query } from "./_generated/server";

// Get price history for a plugin
export const getForPlugin = query({
  args: {
    plugin: v.id("plugins"),
    days: v.optional(v.number()), // default 90 days
  },
  handler: async (ctx, args) => {
    const days = args.days ?? 90;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const history = await ctx.db
      .query("priceHistory")
      .withIndex("by_plugin", (q) => q.eq("plugin", args.plugin))
      .filter((q) => q.gte(q.field("recordedAt"), cutoff))
      .collect();

    // Sort by date
    history.sort((a, b) => a.recordedAt - b.recordedAt);

    // Get store names for the history items
    const storeIds = [...new Set(history.map((h) => h.store))];
    const stores = await Promise.all(storeIds.map((id) => ctx.db.get(id)));
    const storeMap = new Map(stores.filter(Boolean).map((s) => [s!._id, s!.name]));

    return history.map((h) => ({
      ...h,
      storeName: storeMap.get(h.store) || "Unknown",
    }));
  },
});

// Get all-time low price for a plugin
export const getLowestPrice = query({
  args: { plugin: v.id("plugins") },
  handler: async (ctx, args) => {
    const history = await ctx.db
      .query("priceHistory")
      .withIndex("by_plugin", (q) => q.eq("plugin", args.plugin))
      .collect();

    if (history.length === 0) return null;

    const lowest = history.reduce((min, h) =>
      h.price < min.price ? h : min
    );

    const store = await ctx.db.get(lowest.store);

    return {
      price: lowest.price,
      recordedAt: lowest.recordedAt,
      storeName: store?.name || "Unknown",
    };
  },
});

// Get price statistics for a plugin
export const getStats = query({
  args: { plugin: v.id("plugins") },
  handler: async (ctx, args) => {
    const history = await ctx.db
      .query("priceHistory")
      .withIndex("by_plugin", (q) => q.eq("plugin", args.plugin))
      .collect();

    if (history.length === 0) return null;

    const prices = history.map((h) => h.price);
    const lowest = Math.min(...prices);
    const highest = Math.max(...prices);
    const average = prices.reduce((a, b) => a + b, 0) / prices.length;

    // Find when lowest was recorded
    const lowestRecord = history.find((h) => h.price === lowest);

    return {
      lowest,
      highest,
      average: Math.round(average),
      lowestDate: lowestRecord?.recordedAt || null,
      dataPoints: history.length,
    };
  },
});
