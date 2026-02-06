import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Verify a session token and return the authenticated user.
 * Use this in all social mutations that require authentication.
 */
export async function getSessionUser(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string
): Promise<{ userId: Id<"users">; user: any }> {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", sessionToken))
    .first();

  if (!session || session.expiresAt < Date.now()) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db.get(session.userId);
  if (!user) {
    throw new Error("User not found");
  }

  return { userId: session.userId, user };
}
