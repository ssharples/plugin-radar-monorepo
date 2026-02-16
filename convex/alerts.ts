import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getSessionUser } from "./lib/auth";

// ============================================
// QUERIES
// ============================================

export const listByUser = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_user", (q) => q.eq("user", userId))
      .collect();

    // Enrich with plugin data
    const enriched = await Promise.all(
      alerts.map(async (alert) => {
        const plugin = alert.plugin ? await ctx.db.get(alert.plugin) : null;
        const manufacturer = plugin ? await ctx.db.get(plugin.manufacturer) : null;

        // Check if alert is triggered
        let isTriggered = false;
        if (plugin && alert.isActive) {
          const currentPrice = plugin.currentPrice ?? plugin.msrp;

          if (alert.type === "price_drop" && alert.priceThreshold && currentPrice) {
            isTriggered = currentPrice <= alert.priceThreshold;
          } else if (alert.type === "any_sale") {
            // Check for active sales
            const sales = await ctx.db
              .query("sales")
              .withIndex("by_plugin", (q) => q.eq("plugin", plugin._id))
              .filter((q) => q.eq(q.field("isActive"), true))
              .take(1);
            isTriggered =
              sales.length > 0 && (!sales[0].endsAt || sales[0].endsAt > Date.now());
          }
        }

        return {
          ...alert,
          pluginData: plugin,
          manufacturerData: manufacturer,
          isTriggered,
        };
      })
    );

    return enriched.filter((a) => a.pluginData !== null);
  },
});

export const getForPlugin = query({
  args: {
    sessionToken: v.string(),
    plugin: v.id("plugins"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    const userAlerts = await ctx.db
      .query("alerts")
      .withIndex("by_user", (q) => q.eq("user", userId))
      .collect();

    return userAlerts.filter((a) => a.plugin === args.plugin);
  },
});

export const count = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_user", (q) => q.eq("user", userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    return alerts.length;
  },
});

// ============================================
// MUTATIONS
// ============================================

export const create = mutation({
  args: {
    sessionToken: v.string(),
    plugin: v.id("plugins"),
    type: v.string(), // "price_drop", "any_sale", "new_release", "update"
    priceThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    // Check if similar alert already exists
    const userAlerts = await ctx.db
      .query("alerts")
      .withIndex("by_user", (q) => q.eq("user", userId))
      .collect();

    const existing = userAlerts.find(
      (a) => a.plugin === args.plugin && a.type === args.type
    );

    if (existing) {
      // Update existing alert
      return await ctx.db.patch(existing._id, {
        priceThreshold: args.priceThreshold ?? existing.priceThreshold,
        isActive: true,
      });
    }

    return await ctx.db.insert("alerts", {
      user: userId,
      plugin: args.plugin,
      type: args.type,
      priceThreshold: args.priceThreshold,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("alerts"),
    priceThreshold: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    // Verify ownership
    const alert = await ctx.db.get(args.id);
    if (!alert || alert.user !== userId) {
      throw new Error("Not authorized");
    }

    const { sessionToken: _, id, ...updates } = args;

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    return await ctx.db.patch(id, filteredUpdates);
  },
});

export const remove = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("alerts"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    // Verify ownership
    const alert = await ctx.db.get(args.id);
    if (!alert || alert.user !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.delete(args.id);
  },
});

export const deactivate = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("alerts"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    // Verify ownership
    const alert = await ctx.db.get(args.id);
    if (!alert || alert.user !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.id, {
      isActive: false,
    });
  },
});

export const markTriggered = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("alerts"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    // Verify ownership
    const alert = await ctx.db.get(args.id);
    if (!alert || alert.user !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.id, {
      lastTriggeredAt: Date.now(),
    });
  },
});
