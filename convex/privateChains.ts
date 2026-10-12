import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getSessionUser } from "./lib/auth";
import { checkRateLimit } from "./lib/rateLimit";

// ============================================
// PRIVATE CHAIN SHARING
// ============================================

/**
 * Send a chain to a friend.
 * Looks up recipient by identifier (username, email, phone, or instagram) using indexes.
 * Must be friends with the recipient.
 */
export const sendChain = mutation({
  args: {
    sessionToken: v.string(),
    recipientIdentifier: v.string(),
    chainId: v.id("pluginChains"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    // Rate limit: 20 chain sends per hour
    await checkRateLimit(ctx, `chain_send:${userId}`, 20, 60 * 60 * 1000);

    // Look up the chain
    const chain = await ctx.db.get(args.chainId);
    if (!chain) {
      throw new Error("Chain not found");
    }

    // Verify the sender owns this chain
    if (chain.user !== userId) {
      throw new Error("You can only share chains you own");
    }

    // Resolve recipient by identifier using indexes (NOT table scans)
    const identifier = args.recipientIdentifier.toLowerCase().trim().replace(/^@/, "");

    let recipientProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_username", (q) => q.eq("username", identifier))
      .first();

    if (!recipientProfile) {
      recipientProfile = await ctx.db
        .query("userProfiles")
        .withIndex("by_email", (q) => q.eq("email", identifier))
        .first();
    }

    if (!recipientProfile) {
      recipientProfile = await ctx.db
        .query("userProfiles")
        .withIndex("by_phone", (q) => q.eq("phoneNumber", args.recipientIdentifier.trim()))
        .first();
    }

    if (!recipientProfile) {
      recipientProfile = await ctx.db
        .query("userProfiles")
        .withIndex("by_instagram", (q) => q.eq("instagramHandle", identifier))
        .first();
    }

    if (!recipientProfile) {
      throw new Error("User not found. Make sure they have a profile set up.");
    }

    const recipientId = recipientProfile.userId;

    if (recipientId === userId) {
      throw new Error("You can't send a chain to yourself");
    }

    // Check that we are friends (accepted status in either direction)
    const outgoing = await ctx.db
      .query("friends")
      .withIndex("by_user_and_friend", (q) =>
        q.eq("userId", userId).eq("friendId", recipientId)
      )
      .first();

    if (!outgoing || outgoing.status !== "accepted") {
      throw new Error("You can only send chains to friends");
    }

    // Snapshot the chain data as JSON
    const chainData = JSON.stringify({
      name: chain.name,
      description: chain.description,
      category: chain.category,
      tags: chain.tags,
      genre: chain.genre,
      useCase: chain.useCase,
      slots: chain.slots,
      pluginCount: chain.pluginCount,
      targetInputLufs: chain.targetInputLufs,
      targetInputPeakMin: chain.targetInputPeakMin,
      targetInputPeakMax: chain.targetInputPeakMax,
    });

    // Insert the private chain share
    const shareId = await ctx.db.insert("privateChains", {
      senderId: userId,
      recipientId,
      chainId: args.chainId,
      chainName: chain.name,
      chainData,
      status: "pending",
      sentAt: Date.now(),
    });

    return { shareId, recipientUsername: recipientProfile.username };
  },
});

/**
 * Get received chains (pending by default).
 */
export const getReceivedChains = query({
  args: {
    sessionToken: v.string(),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    const filterStatus = args.status ?? "pending";

    const received = await ctx.db
      .query("privateChains")
      .withIndex("by_recipient", (q) =>
        q.eq("recipientId", userId).eq("status", filterStatus)
      )
      .collect();

    const results = [];
    for (const share of received) {
      const senderProfile = await ctx.db
        .query("userProfiles")
        .withIndex("by_user", (q) => q.eq("userId", share.senderId))
        .first();

      const senderUser = await ctx.db.get(share.senderId);

      results.push({
        _id: share._id,
        chainName: share.chainName,
        chainId: share.chainId,
        senderUsername: senderProfile?.username ?? senderUser?.name ?? "Unknown",
        senderId: share.senderId,
        status: share.status,
        sentAt: share.sentAt,
      });
    }

    return results;
  },
});

/**
 * Get chains I've sent (all statuses).
 */
export const getSentChains = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    const sent = await ctx.db
      .query("privateChains")
      .withIndex("by_sender", (q) => q.eq("senderId", userId))
      .collect();

    const results = [];
    for (const share of sent) {
      const recipientProfile = await ctx.db
        .query("userProfiles")
        .withIndex("by_user", (q) => q.eq("userId", share.recipientId))
        .first();

      results.push({
        _id: share._id,
        chainName: share.chainName,
        chainId: share.chainId,
        recipientUsername: recipientProfile?.username ?? "Unknown",
        recipientId: share.recipientId,
        status: share.status,
        sentAt: share.sentAt,
        respondedAt: share.respondedAt,
      });
    }

    return results;
  },
});

/**
 * Accept a received chain — marks as imported and returns the chain data.
 */
export const acceptChain = mutation({
  args: {
    sessionToken: v.string(),
    shareId: v.id("privateChains"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    const share = await ctx.db.get(args.shareId);
    if (!share) {
      throw new Error("Shared chain not found");
    }

    if (share.recipientId !== userId) {
      throw new Error("This chain was not shared with you");
    }

    if (share.status !== "pending") {
      throw new Error("This chain has already been responded to");
    }

    // Mark as imported
    await ctx.db.patch(args.shareId, {
      status: "imported",
      respondedAt: Date.now(),
    });

    return {
      chainData: share.chainData,
      chainName: share.chainName,
      chainId: share.chainId,
    };
  },
});

/**
 * Reject a received chain.
 */
export const rejectChain = mutation({
  args: {
    sessionToken: v.string(),
    shareId: v.id("privateChains"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    const share = await ctx.db.get(args.shareId);
    if (!share) {
      throw new Error("Shared chain not found");
    }

    if (share.recipientId !== userId) {
      throw new Error("This chain was not shared with you");
    }

    if (share.status !== "pending") {
      throw new Error("This chain has already been responded to");
    }

    await ctx.db.patch(args.shareId, {
      status: "rejected",
      respondedAt: Date.now(),
    });

    return { status: "rejected" };
  },
});
