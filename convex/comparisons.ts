import { v } from "convex/values";
import { query } from "./_generated/server";

// Get comparisons involving a specific plugin
export const getForPlugin = query({
  args: {
    pluginId: v.id("plugins"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 5;

    const [asA, asB] = await Promise.all([
      ctx.db
        .query("comparisons")
        .withIndex("by_plugin_a", (q) => q.eq("pluginA", args.pluginId))
        .take(limit),
      ctx.db
        .query("comparisons")
        .withIndex("by_plugin_b", (q) => q.eq("pluginB", args.pluginId))
        .take(limit),
    ]);

    const all = [...asA, ...asB].slice(0, limit);

    // Enrich with plugin names
    const enriched = await Promise.all(
      all.map(async (c) => {
        const otherPluginId = c.pluginA === args.pluginId ? c.pluginB : c.pluginA;
        const otherPlugin = await ctx.db.get(otherPluginId);
        return {
          _id: c._id,
          slug: c.slug,
          title: c.title,
          otherPluginName: otherPlugin?.name ?? "Unknown",
          otherPluginSlug: otherPlugin?.slug,
        };
      })
    );

    return enriched;
  },
});
