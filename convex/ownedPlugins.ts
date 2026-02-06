import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// QUERIES
// ============================================

export const listByUser = query({
  args: { user: v.id("users") },
  handler: async (ctx, args) => {
    const owned = await ctx.db
      .query("ownedPlugins")
      .withIndex("by_user", (q) => q.eq("user", args.user))
      .collect();

    // Enrich with plugin data
    const enriched = await Promise.all(
      owned.map(async (o) => {
        const plugin = await ctx.db.get(o.plugin);
        const manufacturer = plugin ? await ctx.db.get(plugin.manufacturer) : null;

        return {
          ...o,
          pluginData: plugin,
          manufacturerData: manufacturer,
        };
      })
    );

    return enriched.filter((o) => o.pluginData !== null);
  },
});

export const getForPlugin = query({
  args: {
    user: v.id("users"),
    plugin: v.id("plugins"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ownedPlugins")
      .withIndex("by_user_plugin", (q) =>
        q.eq("user", args.user).eq("plugin", args.plugin)
      )
      .first();
  },
});

export const count = query({
  args: { user: v.id("users") },
  handler: async (ctx, args) => {
    const owned = await ctx.db
      .query("ownedPlugins")
      .withIndex("by_user", (q) => q.eq("user", args.user))
      .collect();
    return owned.length;
  },
});

export const totalValue = query({
  args: { user: v.id("users") },
  handler: async (ctx, args) => {
    const owned = await ctx.db
      .query("ownedPlugins")
      .withIndex("by_user", (q) => q.eq("user", args.user))
      .collect();

    let total = 0;
    let paidTotal = 0;

    for (const o of owned) {
      const plugin = await ctx.db.get(o.plugin);
      if (plugin) {
        const msrp = plugin.msrp ?? 0;
        total += msrp;
        paidTotal += o.purchasePrice ?? msrp;
      }
    }

    return {
      msrpTotal: total,
      paidTotal,
      saved: total - paidTotal,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

export const add = mutation({
  args: {
    user: v.id("users"),
    plugin: v.id("plugins"),
    purchasePrice: v.optional(v.number()),
    purchaseDate: v.optional(v.number()),
    purchaseStore: v.optional(v.id("stores")),
    licenseKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if already owned
    const existing = await ctx.db
      .query("ownedPlugins")
      .withIndex("by_user_plugin", (q) =>
        q.eq("user", args.user).eq("plugin", args.plugin)
      )
      .first();

    if (existing) {
      // Update existing entry
      return await ctx.db.patch(existing._id, {
        purchasePrice: args.purchasePrice ?? existing.purchasePrice,
        purchaseDate: args.purchaseDate ?? existing.purchaseDate,
        purchaseStore: args.purchaseStore ?? existing.purchaseStore,
        licenseKey: args.licenseKey ?? existing.licenseKey,
      });
    }

    return await ctx.db.insert("ownedPlugins", {
      user: args.user,
      plugin: args.plugin,
      purchasePrice: args.purchasePrice,
      purchaseDate: args.purchaseDate ?? Date.now(),
      purchaseStore: args.purchaseStore,
      licenseKey: args.licenseKey,
      addedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    user: v.id("users"),
    plugin: v.id("plugins"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ownedPlugins")
      .withIndex("by_user_plugin", (q) =>
        q.eq("user", args.user).eq("plugin", args.plugin)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const update = mutation({
  args: {
    id: v.id("ownedPlugins"),
    purchasePrice: v.optional(v.number()),
    purchaseDate: v.optional(v.number()),
    purchaseStore: v.optional(v.id("stores")),
    licenseKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    return await ctx.db.patch(id, filteredUpdates);
  },
});
