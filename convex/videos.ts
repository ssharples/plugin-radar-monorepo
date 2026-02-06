import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// QUERIES
// ============================================

export const getForPlugin = query({
  args: {
    plugin: v.id("plugins"),
    platform: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    if (args.platform) {
      return await ctx.db
        .query("pluginVideos")
        .withIndex("by_plugin_platform", (q) =>
          q.eq("plugin", args.plugin).eq("platform", args.platform!)
        )
        .filter((q) => q.eq(q.field("isActive"), true))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("pluginVideos")
      .withIndex("by_plugin", (q) => q.eq("plugin", args.plugin))
      .filter((q) => q.eq(q.field("isActive"), true))
      .order("desc")
      .take(limit);
  },
});

export const getForPluginBySlug = query({
  args: {
    slug: v.string(),
    platform: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const plugin = await ctx.db
      .query("plugins")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!plugin) return [];

    const limit = args.limit ?? 10;

    if (args.platform) {
      return await ctx.db
        .query("pluginVideos")
        .withIndex("by_plugin_platform", (q) =>
          q.eq("plugin", plugin._id).eq("platform", args.platform!)
        )
        .filter((q) => q.eq(q.field("isActive"), true))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("pluginVideos")
      .withIndex("by_plugin", (q) => q.eq("plugin", plugin._id))
      .filter((q) => q.eq(q.field("isActive"), true))
      .order("desc")
      .take(limit);
  },
});

export const getFeatured = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pluginVideos")
      .withIndex("by_featured", (q) => q.eq("isFeatured", true))
      .filter((q) => q.eq(q.field("isActive"), true))
      .order("desc")
      .take(args.limit ?? 20);
  },
});

export const getByPlatform = query({
  args: {
    platform: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pluginVideos")
      .withIndex("by_platform", (q) => q.eq("platform", args.platform))
      .filter((q) => q.eq(q.field("isActive"), true))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const getStale = query({
  args: {
    olderThanDays: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const daysAgo = args.olderThanDays ?? 7;
    const threshold = Date.now() - daysAgo * 24 * 60 * 60 * 1000;

    // Get plugins that either have no videos or stale videos
    const plugins = await ctx.db.query("plugins").take(args.limit ?? 100);

    const stalePlugins = [];
    for (const plugin of plugins) {
      const latestVideo = await ctx.db
        .query("pluginVideos")
        .withIndex("by_plugin", (q) => q.eq("plugin", plugin._id))
        .order("desc")
        .first();

      if (!latestVideo || latestVideo.fetchedAt < threshold) {
        stalePlugins.push({
          ...plugin,
          lastVideoFetch: latestVideo?.fetchedAt ?? null,
        });
      }
    }

    return stalePlugins;
  },
});

// ============================================
// MUTATIONS
// ============================================

export const upsert = mutation({
  args: {
    plugin: v.id("plugins"),
    platform: v.string(),
    videoId: v.string(),
    videoUrl: v.string(),
    title: v.optional(v.string()),
    caption: v.optional(v.string()),
    thumbnail: v.string(),
    author: v.string(),
    authorHandle: v.string(),
    authorUrl: v.optional(v.string()),
    duration: v.optional(v.number()),
    views: v.optional(v.number()),
    likes: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    relevanceScore: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if video already exists
    const existing = await ctx.db
      .query("pluginVideos")
      .withIndex("by_plugin_platform", (q) =>
        q.eq("plugin", args.plugin).eq("platform", args.platform)
      )
      .filter((q) => q.eq(q.field("videoId"), args.videoId))
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        title: args.title,
        caption: args.caption,
        thumbnail: args.thumbnail,
        views: args.views,
        likes: args.likes,
        relevanceScore: args.relevanceScore,
        fetchedAt: now,
      });
      return existing._id;
    }

    // Create new
    return await ctx.db.insert("pluginVideos", {
      plugin: args.plugin,
      platform: args.platform,
      videoId: args.videoId,
      videoUrl: args.videoUrl,
      title: args.title,
      caption: args.caption,
      thumbnail: args.thumbnail,
      author: args.author,
      authorHandle: args.authorHandle,
      authorUrl: args.authorUrl,
      duration: args.duration,
      views: args.views,
      likes: args.likes,
      publishedAt: args.publishedAt,
      fetchedAt: now,
      relevanceScore: args.relevanceScore,
      isVerified: false,
      isFeatured: false,
      isActive: true,
    });
  },
});

export const bulkUpsert = mutation({
  args: {
    videos: v.array(
      v.object({
        plugin: v.id("plugins"),
        platform: v.string(),
        videoId: v.string(),
        videoUrl: v.string(),
        title: v.optional(v.string()),
        caption: v.optional(v.string()),
        thumbnail: v.string(),
        author: v.string(),
        authorHandle: v.string(),
        authorUrl: v.optional(v.string()),
        duration: v.optional(v.number()),
        views: v.optional(v.number()),
        likes: v.optional(v.number()),
        publishedAt: v.optional(v.number()),
        relevanceScore: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results = { created: 0, updated: 0 };

    for (const video of args.videos) {
      const existing = await ctx.db
        .query("pluginVideos")
        .withIndex("by_plugin_platform", (q) =>
          q.eq("plugin", video.plugin).eq("platform", video.platform)
        )
        .filter((q) => q.eq(q.field("videoId"), video.videoId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          title: video.title,
          caption: video.caption,
          thumbnail: video.thumbnail,
          views: video.views,
          likes: video.likes,
          relevanceScore: video.relevanceScore,
          fetchedAt: now,
        });
        results.updated++;
      } else {
        await ctx.db.insert("pluginVideos", {
          ...video,
          fetchedAt: now,
          isVerified: false,
          isFeatured: false,
          isActive: true,
        });
        results.created++;
      }
    }

    return results;
  },
});

export const setFeatured = mutation({
  args: {
    id: v.id("pluginVideos"),
    isFeatured: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isFeatured: args.isFeatured });
  },
});

export const setVerified = mutation({
  args: {
    id: v.id("pluginVideos"),
    isVerified: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isVerified: args.isVerified });
  },
});

export const deactivate = mutation({
  args: { id: v.id("pluginVideos") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isActive: false });
  },
});

export const deleteOldVideos = mutation({
  args: {
    olderThanDays: v.optional(v.number()),
    platform: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const daysAgo = args.olderThanDays ?? 30;
    const threshold = Date.now() - daysAgo * 24 * 60 * 60 * 1000;

    let query = ctx.db
      .query("pluginVideos")
      .withIndex("by_fetched");

    const oldVideos = await query.take(500);

    let deleted = 0;
    for (const video of oldVideos) {
      if (video.fetchedAt < threshold && !video.isVerified && !video.isFeatured) {
        if (!args.platform || video.platform === args.platform) {
          await ctx.db.delete(video._id);
          deleted++;
        }
      }
    }

    return { deleted };
  },
});
