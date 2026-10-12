import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";
import { getSessionUser } from "./lib/auth";

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
    priority: v.optional(v.string()), // "high", "normal", "low"
  },
  handler: async (ctx, args) => {
    // Verify user is admin
    const { userId, user } = await getSessionUser(ctx, args.sessionToken);
    if (!user.isAdmin) {
      throw new Error("Unauthorized: Admin access required");
    }
    
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
  args: { jobId: v.id("enrichmentJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

/**
 * List pending enrichment jobs
 */
export const listPendingJobs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(args.limit || 20);
  },
});

/**
 * Update job status (called by agent webhook)
 */
export const updateJobStatus = mutation({
  args: {
    jobId: v.id("enrichmentJobs"),
    status: v.string(),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Job not found");
    }
    
    const updates: any = {
      status: args.status,
    };
    
    if (args.status === "completed" || args.status === "failed") {
      updates.completedAt = Date.now();
    }
    
    if (args.status === "processing") {
      updates.startedAt = Date.now();
    }
    
    if (args.result) {
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
  args: {},
  handler: async (ctx) => {
    // Get highest priority pending job
    const job = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .first();
    
    if (!job) {
      return null;
    }
    
    // Mark as processing
    await ctx.db.patch(job._id, {
      status: "processing",
      startedAt: Date.now(),
    });
    
    return job;
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
    action: v.string(), // "enrich", "compare", "status"
    pluginSlug: v.optional(v.string()),
    jobId: v.optional(v.string()),
    apiKey: v.string(), // Simple API key for auth
  },
  handler: async (ctx, args) => {
    // API key verification (requires ENRICHMENT_API_KEY env var)
    const expectedKey = process.env.ENRICHMENT_API_KEY;
    if (!expectedKey) {
      throw new Error("ENRICHMENT_API_KEY environment variable is not set");
    }
    if (args.apiKey !== expectedKey) {
      throw new Error("Invalid API key");
    }
    
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
      const job = await ctx.db.get(args.jobId as any);
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
  args: {},
  handler: async (ctx) => {
    // Try high → normal → low priority
    for (const priority of ["high", "normal", "low"]) {
      const item = await ctx.db
        .query("enrichmentQueue")
        .withIndex("by_priority_status", (q) =>
          q.eq("priority", priority).eq("status", "pending")
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
    queueItemId: v.id("enrichmentQueue"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    createdPluginId: v.optional(v.id("plugins")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.queueItemId);
    if (!item) throw new Error("Queue item not found");

    const updates: Record<string, any> = {
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
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    const items = args.status
      ? await ctx.db
          .query("enrichmentQueue")
          .withIndex("by_status", (idx) => idx.eq("status", args.status!))
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("enrichmentQueue")
          .order("desc")
          .take(limit);

    // Sort by userCount descending for display
    return items.sort((a, b) => b.userCount - a.userCount);
  },
});
