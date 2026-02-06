import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getSessionUser } from "./lib/auth";
import { checkRateLimit } from "./lib/rateLimit";

// ============================================
// FRIENDS SYSTEM
// ============================================

/**
 * Send a friend request to another user.
 * No self-add, no duplicates, no sending to blocked users.
 */
export const sendFriendRequest = mutation({
  args: {
    sessionToken: v.string(),
    friendId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    // Rate limit: 10 friend requests per hour
    await checkRateLimit(ctx, `friend_request:${userId}`, 10, 60 * 60 * 1000);

    // Can't add yourself
    if (userId === args.friendId) {
      throw new Error("You can't send a friend request to yourself");
    }

    // Check the target user exists
    const targetUser = await ctx.db.get(args.friendId);
    if (!targetUser) {
      throw new Error("User not found");
    }

    // Check if a relationship already exists (either direction)
    const existingOutgoing = await ctx.db
      .query("friends")
      .withIndex("by_user_and_friend", (q) =>
        q.eq("userId", userId).eq("friendId", args.friendId)
      )
      .first();

    if (existingOutgoing) {
      if (existingOutgoing.status === "blocked") {
        throw new Error("You have blocked this user");
      }
      if (existingOutgoing.status === "pending") {
        throw new Error("Friend request already sent");
      }
      if (existingOutgoing.status === "accepted") {
        throw new Error("You are already friends");
      }
    }

    const existingIncoming = await ctx.db
      .query("friends")
      .withIndex("by_user_and_friend", (q) =>
        q.eq("userId", args.friendId).eq("friendId", userId)
      )
      .first();

    if (existingIncoming) {
      if (existingIncoming.status === "blocked") {
        throw new Error("Unable to send friend request");
      }
      if (existingIncoming.status === "pending") {
        // They already sent us a request — auto-accept
        const now = Date.now();
        await ctx.db.patch(existingIncoming._id, {
          status: "accepted",
          acceptedAt: now,
        });
        // Create reciprocal record
        await ctx.db.insert("friends", {
          userId,
          friendId: args.friendId,
          status: "accepted",
          createdAt: now,
          acceptedAt: now,
        });
        return { status: "accepted" };
      }
      if (existingIncoming.status === "accepted") {
        throw new Error("You are already friends");
      }
    }

    // Create pending friend request
    await ctx.db.insert("friends", {
      userId,
      friendId: args.friendId,
      status: "pending",
      createdAt: Date.now(),
    });

    return { status: "pending" };
  },
});

/**
 * Accept an incoming friend request.
 */
export const acceptFriendRequest = mutation({
  args: {
    sessionToken: v.string(),
    requestId: v.id("friends"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Friend request not found");
    }

    // The request must be directed at us and be pending
    if (request.friendId !== userId || request.status !== "pending") {
      throw new Error("Invalid friend request");
    }

    const now = Date.now();

    // Update the original request
    await ctx.db.patch(args.requestId, {
      status: "accepted",
      acceptedAt: now,
    });

    // Create reciprocal record
    await ctx.db.insert("friends", {
      userId,
      friendId: request.userId,
      status: "accepted",
      createdAt: now,
      acceptedAt: now,
    });

    return { status: "accepted" };
  },
});

/**
 * Reject an incoming friend request.
 */
export const rejectFriendRequest = mutation({
  args: {
    sessionToken: v.string(),
    requestId: v.id("friends"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Friend request not found");
    }

    if (request.friendId !== userId || request.status !== "pending") {
      throw new Error("Invalid friend request");
    }

    // Delete the request
    await ctx.db.delete(args.requestId);

    return { status: "rejected" };
  },
});

/**
 * Remove a friend (unfriend). Deletes records in both directions.
 */
export const removeFriend = mutation({
  args: {
    sessionToken: v.string(),
    friendId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    // Delete outgoing record
    const outgoing = await ctx.db
      .query("friends")
      .withIndex("by_user_and_friend", (q) =>
        q.eq("userId", userId).eq("friendId", args.friendId)
      )
      .first();

    if (outgoing) {
      await ctx.db.delete(outgoing._id);
    }

    // Delete incoming record
    const incoming = await ctx.db
      .query("friends")
      .withIndex("by_user_and_friend", (q) =>
        q.eq("userId", args.friendId).eq("friendId", userId)
      )
      .first();

    if (incoming) {
      await ctx.db.delete(incoming._id);
    }

    return { status: "removed" };
  },
});

/**
 * Block a user. Also removes any existing friendship.
 */
export const blockUser = mutation({
  args: {
    sessionToken: v.string(),
    targetId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    if (userId === args.targetId) {
      throw new Error("You can't block yourself");
    }

    // Remove any existing friendship records (both directions)
    const outgoing = await ctx.db
      .query("friends")
      .withIndex("by_user_and_friend", (q) =>
        q.eq("userId", userId).eq("friendId", args.targetId)
      )
      .first();

    if (outgoing) {
      await ctx.db.delete(outgoing._id);
    }

    const incoming = await ctx.db
      .query("friends")
      .withIndex("by_user_and_friend", (q) =>
        q.eq("userId", args.targetId).eq("friendId", userId)
      )
      .first();

    if (incoming) {
      await ctx.db.delete(incoming._id);
    }

    // Create block record
    await ctx.db.insert("friends", {
      userId,
      friendId: args.targetId,
      status: "blocked",
      createdAt: Date.now(),
    });

    return { status: "blocked" };
  },
});

/**
 * Unblock a user.
 */
export const unblockUser = mutation({
  args: {
    sessionToken: v.string(),
    targetId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    const blockRecord = await ctx.db
      .query("friends")
      .withIndex("by_user_and_friend", (q) =>
        q.eq("userId", userId).eq("friendId", args.targetId)
      )
      .first();

    if (!blockRecord || blockRecord.status !== "blocked") {
      throw new Error("User is not blocked");
    }

    await ctx.db.delete(blockRecord._id);

    return { status: "unblocked" };
  },
});

/**
 * Get list of accepted friends with their profiles.
 */
export const getFriends = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    const friendRecords = await ctx.db
      .query("friends")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const acceptedFriends = friendRecords.filter((f) => f.status === "accepted");

    const results = [];
    for (const friend of acceptedFriends) {
      const profile = await ctx.db
        .query("userProfiles")
        .withIndex("by_user", (q) => q.eq("userId", friend.friendId))
        .first();

      const user = await ctx.db.get(friend.friendId);

      results.push({
        friendshipId: friend._id,
        userId: friend.friendId,
        username: profile?.username ?? user?.name ?? user?.email ?? "Unknown",
        acceptedAt: friend.acceptedAt,
      });
    }

    return results;
  },
});

/**
 * Get incoming pending friend requests with sender profiles.
 */
export const getPendingRequests = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    // Find requests where WE are the friendId (incoming) and status is pending
    const incoming = await ctx.db
      .query("friends")
      .withIndex("by_friend", (q) => q.eq("friendId", userId))
      .collect();

    const pending = incoming.filter((f) => f.status === "pending");

    const results = [];
    for (const request of pending) {
      const profile = await ctx.db
        .query("userProfiles")
        .withIndex("by_user", (q) => q.eq("userId", request.userId))
        .first();

      const user = await ctx.db.get(request.userId);

      results.push({
        requestId: request._id,
        fromUserId: request.userId,
        username: profile?.username ?? user?.name ?? user?.email ?? "Unknown",
        sentAt: request.createdAt,
      });
    }

    return results;
  },
});
