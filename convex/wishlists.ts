import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// QUERIES
// ============================================

export const listByUser = query({
  args: { user: v.id("users") },
  handler: async (ctx, args) => {
    const wishlists = await ctx.db
      .query("wishlists")
      .withIndex("by_user", (q) => q.eq("user", args.user))
      .collect();

    // Enrich with plugin data
    const enriched = await Promise.all(
      wishlists.map(async (w) => {
        const plugin = await ctx.db.get(w.plugin);
        const manufacturer = plugin ? await ctx.db.get(plugin.manufacturer) : null;

        // Check for active sales
        const sales = plugin
          ? await ctx.db
              .query("sales")
              .withIndex("by_plugin", (q) => q.eq("plugin", plugin._id))
              .filter((q) => q.eq(q.field("isActive"), true))
              .take(1)
          : [];

        const activeSale = sales[0] && (!sales[0].endsAt || sales[0].endsAt > Date.now())
          ? sales[0]
          : null;

        return {
          ...w,
          pluginData: plugin,
          manufacturerData: manufacturer,
          activeSale,
        };
      })
    );

    return enriched.filter((w) => w.pluginData !== null);
  },
});

export const getForPlugin = query({
  args: {
    user: v.id("users"),
    plugin: v.id("plugins"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("wishlists")
      .withIndex("by_user_plugin", (q) =>
        q.eq("user", args.user).eq("plugin", args.plugin)
      )
      .first();
  },
});

export const count = query({
  args: { user: v.id("users") },
  handler: async (ctx, args) => {
    const wishlists = await ctx.db
      .query("wishlists")
      .withIndex("by_user", (q) => q.eq("user", args.user))
      .collect();
    return wishlists.length;
  },
});

// ============================================
// MUTATIONS
// ============================================

export const add = mutation({
  args: {
    user: v.id("users"),
    plugin: v.id("plugins"),
    targetPrice: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if already in wishlist
    const existing = await ctx.db
      .query("wishlists")
      .withIndex("by_user_plugin", (q) =>
        q.eq("user", args.user).eq("plugin", args.plugin)
      )
      .first();

    if (existing) {
      // Update existing entry
      return await ctx.db.patch(existing._id, {
        targetPrice: args.targetPrice ?? existing.targetPrice,
        notes: args.notes ?? existing.notes,
      });
    }

    return await ctx.db.insert("wishlists", {
      user: args.user,
      plugin: args.plugin,
      targetPrice: args.targetPrice,
      notes: args.notes,
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
      .query("wishlists")
      .withIndex("by_user_plugin", (q) =>
        q.eq("user", args.user).eq("plugin", args.plugin)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const updateTargetPrice = mutation({
  args: {
    id: v.id("wishlists"),
    targetPrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      targetPrice: args.targetPrice,
    });
  },
});

export const updateNotes = mutation({
  args: {
    id: v.id("wishlists"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      notes: args.notes,
    });
  },
});
