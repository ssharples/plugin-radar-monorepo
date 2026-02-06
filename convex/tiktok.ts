import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// QUERIES
// ============================================

export const getForPlugin = query({
  args: {
    plugin: v.id("plugins"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("tiktokPosts")
      .withIndex("by_plugin", (q) => q.eq("plugin", args.plugin))
      .order("desc")
      .take(limit);
  },
});

export const getByVideoId = query({
  args: { videoId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tiktokPosts")
      .withIndex("by_video_id", (q) => q.eq("videoId", args.videoId))
      .first();
  },
});

export const getByKeyword = query({
  args: {
    keyword: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("tiktokPosts")
      .withIndex("by_keyword", (q) => q.eq("searchKeyword", args.keyword))
      .order("desc")
      .take(limit);
  },
});

export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("tiktokPosts")
      .withIndex("by_fetched")
      .order("desc")
      .take(limit);
  },
});

export const getTopByPlays = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("tiktokPosts")
      .withIndex("by_plays")
      .order("desc")
      .take(limit);
  },
});

export const getUnprocessed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    return await ctx.db
      .query("tiktokPosts")
      .withIndex("by_processed", (q) => q.eq("isProcessed", false))
      .take(limit);
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("tiktokPosts").collect();
    const withPlugin = all.filter(p => p.plugin);
    const totalPlays = all.reduce((sum, p) => sum + p.playCount, 0);
    const totalLikes = all.reduce((sum, p) => sum + p.likeCount, 0);

    // Unique keywords
    const keywords = new Set(all.map(p => p.searchKeyword));

    return {
      totalPosts: all.length,
      linkedToPlugins: withPlugin.length,
      unprocessed: all.filter(p => !p.isProcessed).length,
      uniqueKeywords: keywords.size,
      totalPlays,
      totalLikes,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

export const upsert = mutation({
  args: {
    videoId: v.string(),
    videoUrl: v.string(),
    searchKeyword: v.string(),
    caption: v.string(),
    coverUrl: v.string(),
    authorId: v.string(),
    authorUniqueId: v.string(),
    authorNickname: v.string(),
    authorAvatarUrl: v.optional(v.string()),
    authorFollowers: v.optional(v.number()),
    authorVerified: v.optional(v.boolean()),
    playCount: v.number(),
    likeCount: v.number(),
    commentCount: v.number(),
    shareCount: v.number(),
    collectCount: v.optional(v.number()),
    duration: v.number(),
    musicId: v.optional(v.string()),
    musicTitle: v.optional(v.string()),
    musicAuthor: v.optional(v.string()),
    createTime: v.number(),
    plugin: v.optional(v.id("plugins")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if already exists
    const existing = await ctx.db
      .query("tiktokPosts")
      .withIndex("by_video_id", (q) => q.eq("videoId", args.videoId))
      .first();

    if (existing) {
      // Update stats
      await ctx.db.patch(existing._id, {
        playCount: args.playCount,
        likeCount: args.likeCount,
        commentCount: args.commentCount,
        shareCount: args.shareCount,
        collectCount: args.collectCount,
        authorFollowers: args.authorFollowers,
        fetchedAt: now,
        // Update plugin link if provided
        ...(args.plugin ? { plugin: args.plugin } : {}),
      });
      return existing._id;
    }

    // Create new
    return await ctx.db.insert("tiktokPosts", {
      ...args,
      fetchedAt: now,
      isProcessed: !!args.plugin,
      isRelevant: undefined,
    });
  },
});

export const bulkUpsert = mutation({
  args: {
    posts: v.array(v.object({
      videoId: v.string(),
      videoUrl: v.string(),
      searchKeyword: v.string(),
      caption: v.string(),
      coverUrl: v.string(),
      authorId: v.string(),
      authorUniqueId: v.string(),
      authorNickname: v.string(),
      authorAvatarUrl: v.optional(v.string()),
      authorFollowers: v.optional(v.number()),
      authorVerified: v.optional(v.boolean()),
      playCount: v.number(),
      likeCount: v.number(),
      commentCount: v.number(),
      shareCount: v.number(),
      collectCount: v.optional(v.number()),
      duration: v.number(),
      musicId: v.optional(v.string()),
      musicTitle: v.optional(v.string()),
      musicAuthor: v.optional(v.string()),
      createTime: v.number(),
      plugin: v.optional(v.id("plugins")),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let created = 0;
    let updated = 0;

    for (const post of args.posts) {
      const existing = await ctx.db
        .query("tiktokPosts")
        .withIndex("by_video_id", (q) => q.eq("videoId", post.videoId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          playCount: post.playCount,
          likeCount: post.likeCount,
          commentCount: post.commentCount,
          shareCount: post.shareCount,
          collectCount: post.collectCount,
          authorFollowers: post.authorFollowers,
          fetchedAt: now,
          ...(post.plugin ? { plugin: post.plugin } : {}),
        });
        updated++;
      } else {
        await ctx.db.insert("tiktokPosts", {
          ...post,
          fetchedAt: now,
          isProcessed: !!post.plugin,
          isRelevant: undefined,
        });
        created++;
      }
    }

    return { created, updated };
  },
});

export const linkToPlugin = mutation({
  args: {
    postId: v.id("tiktokPosts"),
    plugin: v.id("plugins"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.postId, {
      plugin: args.plugin,
      isProcessed: true,
    });
  },
});

export const markRelevance = mutation({
  args: {
    postId: v.id("tiktokPosts"),
    isRelevant: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.postId, {
      isRelevant: args.isRelevant,
      isProcessed: true,
    });
  },
});
