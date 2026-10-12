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
    showOwnedPlugins: v.optional(v.boolean()),
    showPluginStats: v.optional(v.boolean()),
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

    // Validate optional string field lengths
    if (args.email && args.email.length > 254) {
      throw new Error("Email too long (max 254 characters)");
    }
    if (args.phoneNumber && args.phoneNumber.length > 30) {
      throw new Error("Phone number too long (max 30 characters)");
    }
    if (args.instagramHandle && args.instagramHandle.length > 30) {
      throw new Error("Instagram handle too long (max 30 characters)");
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

    // Wrap the write in a try-catch to handle the race condition where two
    // concurrent mutations both pass the uniqueness check above but then one
    // commits first. Convex will retry the losing mutation, which will then
    // see the existing username via the index query and throw. This catch
    // provides a clean error message for any edge case that slips through.
    try {
      if (existing) {
        await ctx.db.patch(existing._id, {
          username,
          email: args.email?.toLowerCase().trim(),
          phoneNumber: args.phoneNumber?.trim(),
          instagramHandle: instagram,
          showOwnedPlugins: args.showOwnedPlugins,
          showPluginStats: args.showPluginStats,
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
          showOwnedPlugins: args.showOwnedPlugins ?? true,
          showPluginStats: args.showPluginStats ?? true,
          updatedAt: now,
        });
      }
    } catch (e: any) {
      // If the write fails due to a concurrent mutation that claimed the
      // same username, surface a user-friendly message instead of an
      // internal Convex error.
      if (e?.message?.includes("username") || e?.message?.includes("unique")) {
        throw new Error("Username is already taken");
      }
      throw e;
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

/**
 * Get a user's owned plugins (if their privacy settings allow it).
 */
export const getProfileOwnedPlugins = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // Determine the caller's ID (to bypass privacy if it's their own profile)
    let callerId = null;
    if (args.sessionToken) {
      try {
        const session = await getSessionUser(ctx, args.sessionToken);
        callerId = session.userId;
      } catch (e) {
        // Not authenticated
      }
    }

    const isSelf = callerId === args.userId;

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    // If not self, and privacy is set to false, don't return list
    if (!isSelf && profile && profile.showOwnedPlugins === false) {
      return null; // Signals it's private
    }

    const owned = await ctx.db
      .query("ownedPlugins")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .collect();

    // Enrich with basic plugin data
    const enriched = await Promise.all(
      owned.map(async (o) => {
        const plugin = await ctx.db.get(o.plugin);
        let manufacturerName = undefined;
        if (plugin?.manufacturer) {
          const mfg = await ctx.db.get(plugin.manufacturer);
          manufacturerName = mfg?.name;
        }
        return {
          ...o,
          pluginData: plugin ? {
            name: plugin.name,
            slug: plugin.slug,
            manufacturer: manufacturerName,
            imageUrl: plugin.imageUrl,
            category: plugin.category,
          } : null,
        };
      })
    );

    return enriched.filter((o) => o.pluginData !== null);
  },
});

/**
 * Get plugins in common between the authenticated user and a target user.
 * Respects the target user's privacy settings.
 */
export const getCommonPlugins = query({
  args: {
    sessionToken: v.string(),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId } = await getSessionUser(ctx, args.sessionToken);

    if (userId === args.targetUserId) {
      return null; // No "in common" for your own profile
    }

    // Check target user's privacy settings
    const targetProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.targetUserId))
      .first();

    if (targetProfile && targetProfile.showOwnedPlugins === false) {
      return { private: true as const };
    }

    // Fetch both users' owned plugins
    const myOwned = await ctx.db
      .query("ownedPlugins")
      .withIndex("by_user", (q) => q.eq("user", userId))
      .collect();

    const theirOwned = await ctx.db
      .query("ownedPlugins")
      .withIndex("by_user", (q) => q.eq("user", args.targetUserId))
      .collect();

    // Intersect on plugin ID
    const theirPluginIds = new Set(theirOwned.map((o) => o.plugin.toString()));
    const commonOwnedRecords = myOwned.filter((o) =>
      theirPluginIds.has(o.plugin.toString())
    );

    // Enrich common plugins with metadata
    const commonPlugins = await Promise.all(
      commonOwnedRecords.map(async (o) => {
        const plugin = await ctx.db.get(o.plugin);
        if (!plugin) return null;
        let manufacturerName = undefined;
        if (plugin.manufacturer) {
          const mfg = await ctx.db.get(plugin.manufacturer);
          manufacturerName = mfg?.name;
        }
        return {
          pluginId: plugin._id,
          name: plugin.name,
          slug: plugin.slug,
          manufacturer: manufacturerName,
          category: plugin.category,
          imageUrl: plugin.imageUrl,
        };
      })
    );

    return {
      private: false as const,
      commonPlugins: commonPlugins.filter(Boolean),
      myTotal: myOwned.length,
      theirTotal: theirOwned.length,
    };
  },
});

/**
 * Get a user's top loaded plugins (if their privacy settings allow it).
 */
export const getProfileTopPlugins = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
    sessionToken: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    let callerId = null;
    if (args.sessionToken) {
      try {
        const session = await getSessionUser(ctx, args.sessionToken);
        callerId = session.userId;
      } catch (e) {
        // Not authenticated
      }
    }

    const isSelf = callerId === args.userId;

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    // If not self, and privacy is set to false, don't return list
    if (!isSelf && profile && profile.showPluginStats === false) {
      return null; // Signals it's private
    }

    const limit = args.limit || 10;

    const usages = await ctx.db
      .query("userPluginUsage")
      .withIndex("by_user", (q) => q.eq("user", args.userId))
      .collect();

    // Sort descending by loadCount and take top N
    const topUsages = usages
      .sort((a, b) => b.loadCount - a.loadCount)
      .slice(0, limit);

    return topUsages;
  },
});
