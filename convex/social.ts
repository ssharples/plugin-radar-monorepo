import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getSessionUser } from "./lib/auth";
import { checkRateLimit } from "./lib/rateLimit";

// ============================================
// COMMENTS
// ============================================

/**
 * Add a comment to a chain
 */
export const addComment = mutation({
  args: {
    sessionToken: v.string(),
    chainId: v.id("pluginChains"),
    content: v.string(),
    parentCommentId: v.optional(v.id("chainComments")),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await getSessionUser(ctx, args.sessionToken);

    // Rate limit: 10 comments per minute per user
    await checkRateLimit(ctx, `comment:${userId}`, 10, 60 * 1000);

    const chain = await ctx.db.get(args.chainId);
    if (!chain) throw new Error("Chain not found");

    if (args.parentCommentId) {
      const parent = await ctx.db.get(args.parentCommentId);
      if (!parent || parent.chainId !== args.chainId) {
        throw new Error("Parent comment not found on this chain");
      }
    }

    const commentId = await ctx.db.insert("chainComments", {
      chainId: args.chainId,
      userId,
      authorName: user.name || user.email,
      content: args.content,
      createdAt: Date.now(),
      parentCommentId: args.parentCommentId,
    });

    return commentId;
  },
});

/**
 * Get all comments for a chain, sorted newest first
 */
export const getComments = query({
  args: {
    chainId: v.id("pluginChains"),
  },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("chainComments")
      .withIndex("by_chain", (q) => q.eq("chainId", args.chainId))
      .collect();

    // Enrich with author info
    const enriched = await Promise.all(
      comments.map(async (comment) => {
        const author = await ctx.db.get(comment.userId);
        return {
          ...comment,
          author: author
            ? { name: author.name, email: author.email, avatarUrl: author.avatarUrl }
            : null,
        };
      })
    );

    // Sort newest first
    enriched.sort((a, b) => b.createdAt - a.createdAt);

    return enriched;
  },
});

/**
 * Delete a comment (only the author can delete their own comments)
 */
export const deleteComment = mutation({
  args: {
    sessionToken: v.string(),
    commentId: v.id("chainComments"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    if (comment.userId !== userId) {
      throw new Error("You can only delete your own comments");
    }

    await ctx.db.delete(args.commentId);
    return { success: true };
  },
});

// ============================================
// RATINGS
// ============================================

/**
 * Rate a chain (1-5), upserts existing rating
 */
export const rateChain = mutation({
  args: {
    sessionToken: v.string(),
    chainId: v.id("pluginChains"),
    rating: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.rating < 1 || args.rating > 5 || !Number.isInteger(args.rating)) {
      throw new Error("Rating must be an integer between 1 and 5");
    }

    const { userId } = await getSessionUser(ctx, args.sessionToken);

    const chain = await ctx.db.get(args.chainId);
    if (!chain) throw new Error("Chain not found");

    // Check for existing rating by this user on this chain
    const existing = await ctx.db
      .query("chainRatings")
      .withIndex("by_chain_user", (q) =>
        q.eq("chainId", args.chainId).eq("userId", userId)
      )
      .first();

    if (existing) {
      // Update existing rating
      await ctx.db.patch(existing._id, {
        rating: args.rating,
        createdAt: Date.now(),
      });
      return { updated: true, ratingId: existing._id };
    } else {
      // Insert new rating
      const ratingId = await ctx.db.insert("chainRatings", {
        chainId: args.chainId,
        userId,
        rating: args.rating,
        createdAt: Date.now(),
      });
      return { updated: false, ratingId };
    }
  },
});

/**
 * Get chain rating stats. Optionally include the requesting user's rating.
 */
export const getChainRating = query({
  args: {
    chainId: v.id("pluginChains"),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get all ratings for this chain using the composite index
    // We need to query by chainId only, so we use the index prefix
    const ratings = await ctx.db
      .query("chainRatings")
      .withIndex("by_chain_user", (q) => q.eq("chainId", args.chainId))
      .collect();

    const count = ratings.length;
    const average =
      count > 0
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / count
        : 0;

    // Get user's own rating if authenticated
    let userRating: number | null = null;
    if (args.sessionToken) {
      const session = await ctx.db
        .query("sessions")
        .withIndex("by_token", (q) => q.eq("token", args.sessionToken!))
        .first();

      if (session && session.expiresAt >= Date.now()) {
        const userRatingDoc = ratings.find(
          (r) => r.userId === session.userId
        );
        userRating = userRatingDoc ? userRatingDoc.rating : null;
      }
    }

    return {
      average: Math.round(average * 10) / 10,
      count,
      userRating,
    };
  },
});

// ============================================
// FOLLOWING
// ============================================

/**
 * Follow a user
 */
export const followUser = mutation({
  args: {
    sessionToken: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId: followerId } = await getSessionUser(ctx, args.sessionToken);

    if (followerId === args.userId) {
      throw new Error("You cannot follow yourself");
    }

    // Check target user exists
    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("User not found");

    // Prevent duplicate follows
    const existing = await ctx.db
      .query("userFollows")
      .withIndex("by_follower_followed", (q) =>
        q.eq("followerId", followerId).eq("followedId", args.userId)
      )
      .first();

    if (existing) {
      throw new Error("Already following this user");
    }

    await ctx.db.insert("userFollows", {
      followerId,
      followedId: args.userId,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Unfollow a user
 */
export const unfollowUser = mutation({
  args: {
    sessionToken: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId: followerId } = await getSessionUser(ctx, args.sessionToken);

    const existing = await ctx.db
      .query("userFollows")
      .withIndex("by_follower_followed", (q) =>
        q.eq("followerId", followerId).eq("followedId", args.userId)
      )
      .first();

    if (!existing) {
      throw new Error("Not following this user");
    }

    await ctx.db.delete(existing._id);
    return { success: true };
  },
});

/**
 * Check if the authenticated user is following a target user
 */
export const isFollowing = query({
  args: {
    sessionToken: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId: followerId } = await getSessionUser(ctx, args.sessionToken);

    const existing = await ctx.db
      .query("userFollows")
      .withIndex("by_follower_followed", (q) =>
        q.eq("followerId", followerId).eq("followedId", args.userId)
      )
      .first();

    return !!existing;
  },
});

/**
 * Get a user's followers
 */
export const getFollowers = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const follows = await ctx.db
      .query("userFollows")
      .withIndex("by_followed", (q) => q.eq("followedId", args.userId))
      .collect();

    const followers = await Promise.all(
      follows.map(async (f) => {
        const user = await ctx.db.get(f.followerId);
        return user
          ? {
              _id: user._id,
              name: user.name,
              email: user.email,
              avatarUrl: user.avatarUrl,
              followedAt: f.createdAt,
            }
          : null;
      })
    );

    return followers.filter(Boolean);
  },
});

/**
 * Get users that a user is following
 */
export const getFollowing = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const follows = await ctx.db
      .query("userFollows")
      .withIndex("by_follower", (q) => q.eq("followerId", args.userId))
      .collect();

    const following = await Promise.all(
      follows.map(async (f) => {
        const user = await ctx.db.get(f.followedId);
        return user
          ? {
              _id: user._id,
              name: user.name,
              email: user.email,
              avatarUrl: user.avatarUrl,
              followedAt: f.createdAt,
            }
          : null;
      })
    );

    return following.filter(Boolean);
  },
});

// ============================================
// FORKING
// ============================================

/**
 * Fork a chain: copy it under the current user with a new name
 */
export const forkChain = mutation({
  args: {
    sessionToken: v.string(),
    chainId: v.id("pluginChains"),
    newName: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    const original = await ctx.db.get(args.chainId);
    if (!original) throw new Error("Chain not found");

    // Generate slug
    const baseSlug = args.newName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    let slug = baseSlug;
    let counter = 1;
    while (
      await ctx.db
        .query("pluginChains")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first()
    ) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Generate share code
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let shareCode = "";
    for (let i = 0; i < 6; i++) {
      shareCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const now = Date.now();

    // Create forked chain
    const forkedChainId = await ctx.db.insert("pluginChains", {
      user: userId,
      name: args.newName,
      slug,
      description: original.description,
      category: original.category,
      tags: original.tags,
      genre: original.genre,
      useCase: original.useCase,
      slots: original.slots,
      pluginCount: original.pluginCount,
      views: 0,
      downloads: 0,
      likes: 0,
      isPublic: false,
      shareCode,
      forkedFrom: args.chainId,
      createdAt: now,
      updatedAt: now,
    });

    // Record the fork
    await ctx.db.insert("chainForks", {
      originalChainId: args.chainId,
      forkedChainId,
      userId,
      createdAt: now,
    });

    return { chainId: forkedChainId, slug, shareCode };
  },
});
