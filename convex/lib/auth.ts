import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Verify a session token and return the authenticated user.
 * Use this in all social mutations that require authentication.
 */
export async function getSessionUser(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string,
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

/**
 * Verify an authenticated administrator session.
 * Keep this check server-side even though admin pages hide themselves in the
 * browser; Convex queries and mutations are callable independently.
 */
export async function getAdminSessionUser(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string,
): Promise<{ userId: Id<"users">; user: any }> {
  const session = await getSessionUser(ctx, sessionToken);
  if (!session.user.isAdmin) {
    throw new Error("Unauthorized: Admin access required");
  }
  return session;
}

/**
 * Authenticate a trusted enrichment worker. Missing configuration is an
 * authentication failure, never an invitation to run without credentials.
 */
export function requireWorkerApiKey(apiKey: string): void {
  const expectedKey = process.env.ENRICHMENT_API_KEY?.trim();
  if (!expectedKey) {
    throw new Error("Worker authentication is not configured");
  }
  if (!apiKey || apiKey !== expectedKey) {
    throw new Error("Unauthorized: Invalid worker credentials");
  }
}
