import { MutationCtx } from "../_generated/server";

/**
 * Simple rate limiter using a Convex table.
 *
 * Each (key) gets a sliding-window counter stored in the `rateLimits` table.
 * If the window has expired the counter resets; otherwise it increments.
 * Throws if the limit is exceeded.
 */
export async function checkRateLimit(
  ctx: MutationCtx,
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<void> {
  const now = Date.now();

  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  if (!existing) {
    // First request for this key — create the record
    await ctx.db.insert("rateLimits", {
      key,
      count: 1,
      windowStart: now,
    });
    return;
  }

  // Check if the window has expired
  if (now - existing.windowStart >= windowMs) {
    // Reset the window
    await ctx.db.patch(existing._id, {
      count: 1,
      windowStart: now,
    });
    return;
  }

  // Window is still active — check limit
  if (existing.count >= maxRequests) {
    const remainingMs = windowMs - (now - existing.windowStart);
    const remainingSec = Math.ceil(remainingMs / 1000);
    throw new Error(
      `Rate limit exceeded. Try again in ${remainingSec} seconds.`
    );
  }

  // Increment counter
  await ctx.db.patch(existing._id, {
    count: existing.count + 1,
  });
}
