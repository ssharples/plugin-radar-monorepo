import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// QUERIES
// ============================================

export const listActive = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .take(args.limit ?? 50);
    
    // Filter out expired sales
    return sales.filter((sale) => !sale.endsAt || sale.endsAt > now);
  },
});

export const listByPlugin = query({
  args: { plugin: v.id("plugins") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sales")
      .withIndex("by_plugin", (q) => q.eq("plugin", args.plugin))
      .order("desc")
      .take(20);
  },
});

export const getActiveForPlugin = query({
  args: { plugin: v.id("plugins") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_plugin", (q) => q.eq("plugin", args.plugin))
      .filter((q) => q.eq(q.field("isActive"), true))
      .take(10);
    
    // Return only non-expired sales
    return sales.filter((sale) => !sale.endsAt || sale.endsAt > now);
  },
});

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sales")
      .withIndex("by_created")
      .order("desc")
      .take(args.limit ?? 20);
  },
});

export const expiringSoon = query({
  args: {
    withinHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const withinMs = (args.withinHours ?? 24) * 60 * 60 * 1000;
    const deadline = now + withinMs;
    
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(100);
    
    return sales.filter(
      (sale) => sale.endsAt && sale.endsAt > now && sale.endsAt < deadline
    );
  },
});

// ============================================
// MUTATIONS
// ============================================

export const create = mutation({
  args: {
    plugin: v.id("plugins"),
    store: v.optional(v.id("stores")),
    salePrice: v.number(),
    originalPrice: v.number(),
    discountPercent: v.number(),
    currency: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    saleName: v.optional(v.string()),
    promoCode: v.optional(v.string()),
    url: v.string(),
    source: v.string(),
    sourceUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    return await ctx.db.insert("sales", {
      plugin: args.plugin,
      store: args.store,
      salePrice: args.salePrice,
      originalPrice: args.originalPrice,
      discountPercent: args.discountPercent,
      currency: args.currency ?? "USD",
      startsAt: args.startsAt ?? now,
      endsAt: args.endsAt,
      saleName: args.saleName,
      promoCode: args.promoCode,
      url: args.url,
      source: args.source,
      sourceUrl: args.sourceUrl,
      isVerified: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markExpired = mutation({
  args: { id: v.id("sales") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});

export const verify = mutation({
  args: { id: v.id("sales") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      isVerified: true,
      updatedAt: Date.now(),
    });
  },
});

export const updateEndDate = mutation({
  args: {
    id: v.id("sales"),
    endsAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      endsAt: args.endsAt,
      updatedAt: Date.now(),
    });
  },
});

// Get biggest discount sales
export const biggestDiscounts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(200);

    // Filter non-expired and sort by discount
    return sales
      .filter((sale) => !sale.endsAt || sale.endsAt > now)
      .sort((a, b) => b.discountPercent - a.discountPercent)
      .slice(0, args.limit ?? 20);
  },
});

// Get sales with plugin details
export const listActiveWithPlugins = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .take(args.limit ?? 100);

    // Filter out expired sales and enrich with plugin data
    const activeSales = sales.filter((sale) => !sale.endsAt || sale.endsAt > now);

    const enriched = await Promise.all(
      activeSales.map(async (sale) => {
        const plugin = await ctx.db.get(sale.plugin);
        const store = sale.store ? await ctx.db.get(sale.store) : null;
        return {
          ...sale,
          pluginData: plugin,
          storeData: store,
        };
      })
    );

    return enriched.filter((s) => s.pluginData !== null);
  },
});

// Cleanup expired sales
export const cleanupExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiredSales = await ctx.db
      .query("sales")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(500);
    
    let cleaned = 0;
    for (const sale of expiredSales) {
      if (sale.endsAt && sale.endsAt < now) {
        await ctx.db.patch(sale._id, { isActive: false });
        cleaned++;
      }
    }
    
    return { cleaned };
  },
});
