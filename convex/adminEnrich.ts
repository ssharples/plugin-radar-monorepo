import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAdminSessionUser, requireWorkerApiKey } from "./lib/auth";

const enrichmentJobStatus = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
);
const queueItemStatus = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("ignored"),
);
const enrichmentPriority = v.union(
  v.literal("high"),
  v.literal("normal"),
  v.literal("low"),
);

function assertTransition(
  current: string,
  next: string,
  transitions: Record<string, readonly string[]>,
): void {
  if (!transitions[current]?.includes(next)) {
    throw new Error(`Invalid queue transition: ${current} -> ${next}`);
  }
}

const jobTransitions: Record<string, readonly string[]> = {
  pending: ["processing"],
  processing: ["completed", "failed"],
};

const queueTransitions: Record<string, readonly string[]> = {
  pending: ["processing", "ignored"],
  processing: ["completed", "failed"],
};

function boundedLimit(limit: number | undefined, fallback: number): number {
  if (limit === undefined) return fallback;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Limit must be an integer between 1 and 100");
  }
  return limit;
}

// =============================================================================
// ADMIN ENRICHMENT TRIGGERS
// =============================================================================

/**
 * Queue a plugin for enrichment (admin only)
 * This creates a pending enrichment job that can be processed by the agent
 */
export const queueEnrichment = mutation({
  args: {
    pluginId: v.id("plugins"),
    sessionToken: v.string(),
    priority: v.optional(enrichmentPriority),
  },
  handler: async (ctx, args) => {
    const { userId } = await getAdminSessionUser(ctx, args.sessionToken);

    // Get plugin
    const plugin = await ctx.db.get(args.pluginId);
    if (!plugin) {
      throw new Error("Plugin not found");
    }

    const now = Date.now();

    // Create enrichment job
    const jobId = await ctx.db.insert("enrichmentJobs", {
      plugin: args.pluginId,
      pluginSlug: plugin.slug,
      pluginName: plugin.name,
      status: "pending",
      priority: args.priority || "normal",
      requestedBy: userId,
      requestedAt: now,
    });

    return {
      jobId,
      pluginSlug: plugin.slug,
      status: "queued",
    };
  },
});

/**
 * Get enrichment job status
 */
export const getJobStatus = query({
  args: {
    jobId: v.id("enrichmentJobs"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    await getAdminSessionUser(ctx, args.sessionToken);
    return await ctx.db.get(args.jobId);
  },
});

/**
 * List pending enrichment jobs
 */
export const listPendingJobs = query({
  args: {
    apiKey: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireWorkerApiKey(args.apiKey);
    const limit = boundedLimit(args.limit, 20);
    return await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(limit);
  },
});

/**
 * Update job status (called by agent webhook)
 */
export const updateJobStatus = mutation({
  args: {
    jobId: v.id("enrichmentJobs"),
    apiKey: v.string(),
    status: enrichmentJobStatus,
    result: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireWorkerApiKey(args.apiKey);
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Job not found");
    }

    assertTransition(job.status, args.status, jobTransitions);

    const updates: Record<string, unknown> = {
      status: args.status,
    };

    if (args.status === "completed" || args.status === "failed") {
      updates.completedAt = Date.now();
    }

    if (args.status === "processing") {
      updates.startedAt = Date.now();
    }

    if (args.result !== undefined) {
      updates.result = args.result;
    }

    if (args.error) {
      updates.error = args.error;
    }

    await ctx.db.patch(args.jobId, updates);

    return { success: true };
  },
});

/**
 * Get next pending job (for agent to process)
 */
export const claimNextJob = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    // Authenticate before touching the queue, including the empty-queue path.
    requireWorkerApiKey(args.apiKey);

    // Get highest priority pending job
    const job = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .first();

    if (!job) {
      return null;
    }

    // Mark as processing and return the post-transition shape. Returning the
    // stale pending document would let a worker process the wrong state.
    const startedAt = Date.now();
    await ctx.db.patch(job._id, {
      status: "processing",
      startedAt,
    });

    return {
      ...job,
      status: "processing" as const,
      startedAt,
    };
  },
});

// =============================================================================
// HTTP ENDPOINT FOR WEBHOOK
// =============================================================================

/**
 * Webhook endpoint to trigger enrichment from external agents
 * Called by the plugin-agent.mjs script
 */
export const webhookTrigger = mutation({
  args: {
    action: v.union(
      v.literal("enrich"),
      v.literal("compare"),
      v.literal("status"),
    ),
    pluginSlug: v.optional(v.string()),
    jobId: v.optional(v.id("enrichmentJobs")),
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    requireWorkerApiKey(args.apiKey);

    const now = Date.now();

    if (args.action === "enrich" && args.pluginSlug) {
      const slugToFind = args.pluginSlug;
      // Find plugin by slug
      const plugin = await ctx.db
        .query("plugins")
        .withIndex("by_slug", (q) => q.eq("slug", slugToFind))
        .first();

      if (!plugin) {
        return { success: false, error: "Plugin not found" };
      }

      // Create enrichment job
      const jobId = await ctx.db.insert("enrichmentJobs", {
        plugin: plugin._id,
        pluginSlug: plugin.slug,
        pluginName: plugin.name,
        status: "pending",
        priority: "high",
        requestedAt: now,
      });

      return {
        success: true,
        jobId,
        pluginSlug: args.pluginSlug,
        message: `Enrichment job queued for ${plugin.name}`,
      };
    }

    if (args.action === "status" && args.jobId) {
      const job = await ctx.db.get(args.jobId);
      return { success: true, job };
    }

    return { success: false, error: "Invalid action" };
  },
});

// =============================================================================
// ENRICHMENT QUEUE (auto-queued unmatched plugins)
// =============================================================================

/**
 * Claim the next pending queue item for processing (agent polls this)
 * Picks highest priority first, then oldest.
 */
export const claimNextQueueItem = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    requireWorkerApiKey(args.apiKey);

    // Try high → normal → low priority
    for (const priority of ["high", "normal", "low"]) {
      const item = await ctx.db
        .query("enrichmentQueue")
        .withIndex("by_priority_status", (q) =>
          q.eq("priority", priority).eq("status", "pending"),
        )
        .first();

      if (item) {
        await ctx.db.patch(item._id, {
          status: "processing",
          processedAt: Date.now(),
        });
        return {
          id: item._id,
          pluginName: item.pluginName,
          manufacturer: item.manufacturer,
          format: item.format,
          userCount: item.userCount,
        };
      }
    }
    return null;
  },
});

/**
 * Complete a queue item after enrichment (success or failure)
 */
export const completeQueueItem = mutation({
  args: {
    apiKey: v.string(),
    queueItemId: v.id("enrichmentQueue"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    createdPluginId: v.optional(v.id("plugins")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireWorkerApiKey(args.apiKey);
    const item = await ctx.db.get(args.queueItemId);
    if (!item) throw new Error("Queue item not found");

    assertTransition(item.status, args.status, queueTransitions);

    const updates: Record<string, unknown> = {
      status: args.status,
      processedAt: Date.now(),
    };

    if (args.createdPluginId) {
      updates.createdPluginId = args.createdPluginId;
    }
    if (args.error) {
      updates.error = args.error;
    }

    await ctx.db.patch(args.queueItemId, updates);
    return { success: true };
  },
});

/**
 * List enrichment queue items (admin dashboard)
 */
export const listEnrichmentQueue = query({
  args: {
    sessionToken: v.string(),
    status: v.optional(queueItemStatus),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await getAdminSessionUser(ctx, args.sessionToken);
    const limit = boundedLimit(args.limit, 50);

    const items = args.status
      ? await ctx.db
          .query("enrichmentQueue")
          .withIndex("by_status", (idx) => idx.eq("status", args.status!))
          .order("desc")
          .take(limit)
      : await ctx.db.query("enrichmentQueue").order("desc").take(limit);

    // Sort by userCount descending for display
    return items.sort((a, b) => b.userCount - a.userCount);
  },
});
