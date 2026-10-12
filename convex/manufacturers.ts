import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getSessionUser } from "./lib/auth";

// ============================================
// QUERIES
// ============================================

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("manufacturers")
      .order("asc")
      .take(limit);
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("manufacturers")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

export const get = query({
  args: { id: v.id("manufacturers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("manufacturers")
      .withSearchIndex("search_name", (q) => q.search("name", args.query))
      .take(20);
  },
});

export const listByNames = query({
  args: { names: v.array(v.string()) },
  handler: async (ctx, args) => {
    const manufacturers = await Promise.all(
      args.names.map(async (name) => {
        return await ctx.db
          .query("manufacturers")
          .withIndex("by_name", (q) => q.eq("name", name))
          .first();
      })
    );
    return manufacturers.filter((m): m is NonNullable<typeof m> => m !== null);
  },
});

// ============================================
// MUTATIONS
// ============================================

export const create = mutation({
  args: {
    sessionToken: v.string(),
    name: v.string(),
    slug: v.string(),
    website: v.string(),
    description: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    newsletterEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await getSessionUser(ctx, args.sessionToken);
    if (!user.isAdmin) throw new Error("Unauthorized: Admin access required");

    const now = Date.now();
    
    // Check for duplicate slug
    const existing = await ctx.db
      .query("manufacturers")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    
    if (existing) {
      throw new Error(`Manufacturer with slug "${args.slug}" already exists`);
    }
    
    return await ctx.db.insert("manufacturers", {
      name: args.name,
      slug: args.slug,
      website: args.website,
      description: args.description,
      logoUrl: args.logoUrl,
      newsletterEmail: args.newsletterEmail,
      newsletterSubscribed: false,
      pluginCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("manufacturers"),
    name: v.optional(v.string()),
    website: v.optional(v.string()),
    description: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    newsletterEmail: v.optional(v.string()),
    newsletterSubscribed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await getSessionUser(ctx, args.sessionToken);
    if (!user.isAdmin) throw new Error("Unauthorized: Admin access required");

    const { sessionToken: _, id, ...updates } = args;
    
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Manufacturer not found");
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

export const upsertBySlug = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    website: v.string(),
    description: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    newsletterEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("manufacturers")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    
    const now = Date.now();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        website: args.website,
        description: args.description ?? existing.description,
        logoUrl: args.logoUrl ?? existing.logoUrl,
        newsletterEmail: args.newsletterEmail ?? existing.newsletterEmail,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("manufacturers", {
        name: args.name,
        slug: args.slug,
        website: args.website,
        description: args.description,
        logoUrl: args.logoUrl,
        newsletterEmail: args.newsletterEmail,
        newsletterSubscribed: false,
        pluginCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const incrementPluginCount = mutation({
  args: { id: v.id("manufacturers") },
  handler: async (ctx, args) => {
    const manufacturer = await ctx.db.get(args.id);
    if (!manufacturer) {
      throw new Error("Manufacturer not found");
    }
    await ctx.db.patch(args.id, {
      pluginCount: manufacturer.pluginCount + 1,
    });
  },
});
