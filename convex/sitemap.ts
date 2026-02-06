import { query } from "./_generated/server";

/**
 * Lightweight queries for sitemap generation.
 * Returns only slugs and timestamps to minimize data transfer.
 */

export const allPluginSlugs = query({
  args: {},
  handler: async (ctx) => {
    const plugins = await ctx.db.query("plugins").collect();
    return plugins.map((p) => ({
      slug: p.slug,
      updatedAt: p.updatedAt,
    }));
  },
});

export const allManufacturerSlugs = query({
  args: {},
  handler: async (ctx) => {
    const manufacturers = await ctx.db.query("manufacturers").collect();
    return manufacturers.map((m) => ({
      slug: m.slug,
      updatedAt: m.updatedAt,
    }));
  },
});

export const allComparisonSlugs = query({
  args: {},
  handler: async (ctx) => {
    const comparisons = await ctx.db.query("comparisons").collect();
    return comparisons.map((c) => ({
      slug: c.slug,
      updatedAt: c.updatedAt,
    }));
  },
});

export const allChainSlugs = query({
  args: {},
  handler: async (ctx) => {
    const chains = await ctx.db
      .query("pluginChains")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .collect();
    return chains.map((c) => ({
      slug: c.slug,
      updatedAt: c.updatedAt,
    }));
  },
});
