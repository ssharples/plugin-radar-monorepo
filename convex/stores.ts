import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// QUERIES
// ============================================

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("stores")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stores")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

// ============================================
// MUTATIONS
// ============================================

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    website: v.string(),
    affiliateBaseUrl: v.optional(v.string()),
    affiliateParam: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("stores", {
      name: args.name,
      slug: args.slug,
      website: args.website,
      affiliateBaseUrl: args.affiliateBaseUrl,
      affiliateParam: args.affiliateParam,
      logoUrl: args.logoUrl,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

export const upsertBySlug = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    website: v.string(),
    affiliateBaseUrl: v.optional(v.string()),
    affiliateParam: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stores")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        website: args.website,
        affiliateBaseUrl: args.affiliateBaseUrl ?? existing.affiliateBaseUrl,
        affiliateParam: args.affiliateParam ?? existing.affiliateParam,
        logoUrl: args.logoUrl ?? existing.logoUrl,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("stores", {
        name: args.name,
        slug: args.slug,
        website: args.website,
        affiliateBaseUrl: args.affiliateBaseUrl,
        affiliateParam: args.affiliateParam,
        logoUrl: args.logoUrl,
        isActive: true,
        createdAt: Date.now(),
      });
    }
  },
});
