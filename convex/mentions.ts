import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// QUERIES
// ============================================

// Get mentions for a specific plugin
export const getForPlugin = query({
  args: {
    plugin: v.id("plugins"),
    source: v.optional(v.string()), // filter by source type
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    let mentions;
    if (args.source) {
      mentions = await ctx.db
        .query("pluginMentions")
        .withIndex("by_plugin_platform", (q) =>
          q.eq("plugin", args.plugin).eq("platform", args.source!)
        )
        .order("desc")
        .take(limit);
    } else {
      mentions = await ctx.db
        .query("pluginMentions")
        .withIndex("by_plugin", (q) => q.eq("plugin", args.plugin))
        .order("desc")
        .take(limit);
    }

    return mentions;
  },
});

// Get YouTube videos for a plugin (convenience query)
export const getYouTubeVideos = query({
  args: {
    plugin: v.id("plugins"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 8;

    const mentions = await ctx.db
      .query("pluginMentions")
      .withIndex("by_plugin_platform", (q) =>
        q.eq("plugin", args.plugin).eq("platform", "youtube")
      )
      .order("desc")
      .take(limit);

    // Transform to a cleaner video format, handling both legacy and new field names
    return mentions.map((m) => ({
      id: m.sourceId,
      title: m.title,
      thumbnail: m.thumbnailUrl || `https://i.ytimg.com/vi/${m.sourceId}/mqdefault.jpg`,
      channel: m.channelName || m.author || "Unknown",
      channelUrl: m.channelUrl,
      viewCount: m.viewCount ?? m.views,
      publishedAt: m.publishedAt,
      duration: m.duration,
      durationSeconds: m.durationSeconds,
      mentionType: m.mentionType,
      url: m.sourceUrl,
    }));
  },
});

// Get trending plugins based on mention score (uses index for efficiency)
export const getTrendingPlugins = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    // Get plugins sorted by mention score using index
    const plugins = await ctx.db
      .query("plugins")
      .withIndex("by_mention_score")
      .order("desc")
      .take(limit * 2); // Get extra to filter nulls

    // Filter out plugins without scores and take limit
    return plugins
      .filter((p) => p.mentionScore && p.mentionScore > 0)
      .slice(0, limit);
  },
});

// Get mention stats for a specific plugin (with platform breakdown)
export const getMentionStats = query({
  args: { plugin: v.id("plugins") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const day7 = now - 7 * 24 * 60 * 60 * 1000;
    const day30 = now - 30 * 24 * 60 * 60 * 1000;

    const mentions = await ctx.db
      .query("pluginMentions")
      .withIndex("by_plugin", (q) => q.eq("plugin", args.plugin))
      .collect();

    const count7d = mentions.filter((m) => m.publishedAt >= day7).length;
    const count30d = mentions.filter((m) => m.publishedAt >= day30).length;

    // Platform breakdown
    const byPlatform: Record<string, number> = {};
    for (const m of mentions) {
      byPlatform[m.platform] = (byPlatform[m.platform] || 0) + 1;
    }

    return {
      total: mentions.length,
      count7d,
      count30d,
      byPlatform,
    };
  },
});

// Get recent mentions across all plugins
export const getRecent = query({
  args: {
    limit: v.optional(v.number()),
    platform: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    // Get all mentions and filter/sort in memory since we don't have a discoveredAt index
    const allMentions = await ctx.db
      .query("pluginMentions")
      .withIndex("by_published")
      .order("desc")
      .take(200);

    let mentions = allMentions;
    if (args.platform) {
      mentions = mentions.filter((m) => m.platform === args.platform);
    }

    mentions = mentions.slice(0, limit);

    // Fetch plugin info for each mention
    const mentionsWithPlugins = await Promise.all(
      mentions.map(async (m) => {
        const plugin = await ctx.db.get(m.plugin);
        return {
          ...m,
          pluginName: plugin?.name,
          pluginSlug: plugin?.slug,
        };
      })
    );

    return mentionsWithPlugins;
  },
});

// ============================================
// MUTATIONS
// ============================================

// Add a new mention (dual-writes both legacy and new field names)
export const create = mutation({
  args: {
    plugin: v.id("plugins"),
    platform: v.string(), // "youtube", "reddit", etc.
    sourceId: v.string(),
    sourceUrl: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    channelName: v.optional(v.string()),
    channelId: v.optional(v.string()),
    channelUrl: v.optional(v.string()),
    channelThumbnail: v.optional(v.string()),
    viewCount: v.optional(v.number()),
    likeCount: v.optional(v.number()),
    commentCount: v.optional(v.number()),
    publishedAt: v.number(),
    mentionType: v.optional(v.string()),
    sentiment: v.optional(v.string()),
    duration: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for duplicate
    const existing = await ctx.db
      .query("pluginMentions")
      .withIndex("by_source_id", (q) => q.eq("sourceId", args.sourceId))
      .first();

    if (existing) {
      // Update existing mention with new data (dual-write both field conventions)
      await ctx.db.patch(existing._id, {
        title: args.title,
        description: args.description,
        thumbnailUrl: args.thumbnailUrl,
        viewCount: args.viewCount,
        likeCount: args.likeCount,
        commentCount: args.commentCount,
        views: args.viewCount,
        likes: args.likeCount,
        comments: args.commentCount,
        fetchedAt: now,
      });
      return existing._id;
    }

    // Create new mention (dual-write both field conventions)
    const mentionId = await ctx.db.insert("pluginMentions", {
      plugin: args.plugin,
      platform: args.platform,
      sourceId: args.sourceId,
      sourceUrl: args.sourceUrl,
      title: args.title,
      description: args.description,
      thumbnailUrl: args.thumbnailUrl,
      channelName: args.channelName,
      channelId: args.channelId,
      channelUrl: args.channelUrl,
      channelThumbnail: args.channelThumbnail,
      viewCount: args.viewCount,
      likeCount: args.likeCount,
      commentCount: args.commentCount,
      views: args.viewCount,
      likes: args.likeCount,
      comments: args.commentCount,
      publishedAt: args.publishedAt,
      fetchedAt: now,
      discoveredAt: now,
      mentionType: args.mentionType,
      sentiment: args.sentiment,
      isVerified: false,
      duration: args.duration,
      durationSeconds: args.durationSeconds,
    });

    return mentionId;
  },
});

// Batch create mentions (dual-writes both legacy and new field names)
export const batchCreate = mutation({
  args: {
    mentions: v.array(
      v.object({
        plugin: v.id("plugins"),
        platform: v.string(),
        sourceId: v.string(),
        sourceUrl: v.string(),
        title: v.string(),
        description: v.optional(v.string()),
        thumbnailUrl: v.optional(v.string()),
        channelName: v.optional(v.string()),
        channelId: v.optional(v.string()),
        channelUrl: v.optional(v.string()),
        viewCount: v.optional(v.number()),
        likeCount: v.optional(v.number()),
        commentCount: v.optional(v.number()),
        publishedAt: v.number(),
        mentionType: v.optional(v.string()),
        duration: v.optional(v.string()),
        durationSeconds: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results = [];
    const now = Date.now();

    for (const mention of args.mentions) {
      // Check for duplicate
      const existing = await ctx.db
        .query("pluginMentions")
        .withIndex("by_source_id", (q) => q.eq("sourceId", mention.sourceId))
        .first();

      if (existing) {
        results.push({ sourceId: mention.sourceId, action: "skipped" });
        continue;
      }

      // Dual-write both field conventions
      await ctx.db.insert("pluginMentions", {
        ...mention,
        views: mention.viewCount,
        likes: mention.likeCount,
        comments: mention.commentCount,
        fetchedAt: now,
        discoveredAt: now,
        isVerified: false,
      });

      results.push({ sourceId: mention.sourceId, action: "created" });
    }

    return results;
  },
});

// Recalculate mention scores for all plugins (with platform weights)
export const recalculateScores = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const day7 = now - 7 * 24 * 60 * 60 * 1000;
    const day30 = now - 30 * 24 * 60 * 60 * 1000;

    // Platform weights
    const platformWeights: Record<string, number> = {
      youtube: 1.5,
      reddit: 1.2,
      tiktok: 1.0,
      instagram: 0.9,
      twitter: 0.8,
    };

    // Get all plugins
    const plugins = await ctx.db.query("plugins").collect();

    let updated = 0;

    for (const plugin of plugins) {
      const mentions = await ctx.db
        .query("pluginMentions")
        .withIndex("by_plugin", (q) => q.eq("plugin", plugin._id))
        .collect();

      if (mentions.length === 0) continue;

      // Count mentions
      const count7d = mentions.filter((m) => m.publishedAt >= day7).length;
      const count30d = mentions.filter((m) => m.publishedAt >= day30).length;

      // Calculate weighted score
      let score = 0;
      for (const m of mentions) {
        // Recency weight
        const ageMs = now - m.publishedAt;
        const ageDays = ageMs / (24 * 60 * 60 * 1000);
        let recencyWeight = 1.0;
        if (ageDays <= 7) recencyWeight = 1.0;
        else if (ageDays <= 30) recencyWeight = 0.5;
        else recencyWeight = 0.25;

        // Platform weight
        const platformWeight = platformWeights[m.platform] || 1.0;

        // Engagement score (logarithmic) — read both field naming conventions
        const views = m.viewCount ?? m.views ?? 0;
        const likes = m.likeCount ?? m.likes ?? 0;
        const comments = m.commentCount ?? m.comments ?? 0;
        const engagementScore = Math.log10(1 + views + likes * 10 + comments * 20);

        score += recencyWeight * platformWeight * engagementScore;
      }

      // Update plugin
      await ctx.db.patch(plugin._id, {
        mentionCount7d: count7d,
        mentionCount30d: count30d,
        mentionScore: Math.round(score * 100) / 100,
        lastMentionScan: now,
      });

      updated++;
    }

    return { updated };
  },
});

// Delete old mentions (older than N days, default 90)
export const cleanupOld = mutation({
  args: {
    olderThanDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.olderThanDays ?? 90;
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000;

    const oldMentions = await ctx.db
      .query("pluginMentions")
      .withIndex("by_published")
      .filter((q) => q.lt(q.field("publishedAt"), threshold))
      .take(500);

    let deleted = 0;
    for (const mention of oldMentions) {
      await ctx.db.delete(mention._id);
      deleted++;
    }

    return { deleted };
  },
});
