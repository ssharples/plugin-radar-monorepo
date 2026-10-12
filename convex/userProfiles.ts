import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getSessionUser } from "./lib/auth";
import { checkRateLimit } from "./lib/rateLimit";

// ============================================
// USER PROFILES
// ============================================

/**
 * Create or update the current user's profile.
 * Username must be unique (stored lowercase).
 */
export const upsertProfile = mutation({
  args: {
    sessionToken: v.string(),
    username: v.string(),
    email: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    instagramHandle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    // Rate limit: 5 profile updates per hour
    await checkRateLimit(ctx, `profile_update:${userId}`, 5, 60 * 60 * 1000);

    const now = Date.now();
    const username = args.username.toLowerCase().trim();

    if (username.length < 3 || username.length > 30) {
      throw new Error("Username must be between 3 and 30 characters");
    }

    if (!/^[a-z0-9_.-]+$/.test(username)) {
      throw new Error("Username can only contain letters, numbers, underscores, dots, and hyphens");
    }

    // Check username uniqueness
    const existingUsername = await ctx.db
      .query("userProfiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();

    if (existingUsername && existingUsername.userId !== userId) {
      throw new Error("Username is already taken");
    }

    // Normalize instagram handle (strip @ prefix)
    const instagram = args.instagramHandle
      ? args.instagramHandle.toLowerCase().replace(/^@/, "").trim()
      : undefined;

    // Check if profile already exists for this user
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        username,
        email: args.email?.toLowerCase().trim(),
        phoneNumber: args.phoneNumber?.trim(),
        instagramHandle: instagram,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("userProfiles", {
        userId,
        username,
        email: args.email?.toLowerCase().trim(),
        phoneNumber: args.phoneNumber?.trim(),
        instagramHandle: instagram,
        updatedAt: now,
      });
    }
  },
});

/**
 * Get the current user's profile.
 */
export const getProfile = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    return await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

/**
 * Search for users by username, email, phone, or instagram handle.
 * Tries each index sequentially — no table scans.
 */
export const searchUsers = query({
  args: {
    sessionToken: v.string(),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);
    const q = args.query.toLowerCase().trim().replace(/^@/, "");

    if (q.length < 2) {
      return [];
    }

    const results: Array<{
      _id: any;
      userId: any;
      username: string;
      matchedOn: string;
    }> = [];
    const seenUserIds = new Set<string>();

    // 1. Search by username (exact match on index)
    const byUsername = await ctx.db
      .query("userProfiles")
      .withIndex("by_username", (qb) => qb.eq("username", q))
      .first();

    if (byUsername && byUsername.userId !== userId) {
      results.push({
        _id: byUsername._id,
        userId: byUsername.userId,
        username: byUsername.username,
        matchedOn: "username",
      });
      seenUserIds.add(byUsername.userId);
    }

    // 2. Search by email
    const byEmail = await ctx.db
      .query("userProfiles")
      .withIndex("by_email", (qb) => qb.eq("email", q))
      .first();

    if (byEmail && byEmail.userId !== userId && !seenUserIds.has(byEmail.userId)) {
      results.push({
        _id: byEmail._id,
        userId: byEmail.userId,
        username: byEmail.username,
        matchedOn: "email",
      });
      seenUserIds.add(byEmail.userId);
    }

    // 3. Search by phone
    const byPhone = await ctx.db
      .query("userProfiles")
      .withIndex("by_phone", (qb) => qb.eq("phoneNumber", args.query.trim()))
      .first();

    if (byPhone && byPhone.userId !== userId && !seenUserIds.has(byPhone.userId)) {
      results.push({
        _id: byPhone._id,
        userId: byPhone.userId,
        username: byPhone.username,
        matchedOn: "phone",
      });
      seenUserIds.add(byPhone.userId);
    }

    // 4. Search by instagram handle
    const byInstagram = await ctx.db
      .query("userProfiles")
      .withIndex("by_instagram", (qb) => qb.eq("instagramHandle", q))
      .first();

    if (byInstagram && byInstagram.userId !== userId && !seenUserIds.has(byInstagram.userId)) {
      results.push({
        _id: byInstagram._id,
        userId: byInstagram.userId,
        username: byInstagram.username,
        matchedOn: "instagram",
      });
    }

    return results;
  },
});
