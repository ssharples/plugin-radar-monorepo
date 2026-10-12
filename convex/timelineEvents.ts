import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// QUERIES
// ============================================

export const getForPlugin = query({
  args: {
    plugin: v.id("plugins"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const events = await ctx.db
      .query("timelineEvents")
      .withIndex("by_plugin_occurred", (q) => q.eq("plugin", args.plugin))
      .order("desc")
      .take(limit);

    // Enrich with related data
    const enriched = await Promise.all(
      events.map(async (event) => {
        const plugin = event.plugin ? await ctx.db.get(event.plugin) : null;
        const manufacturer = event.manufacturer
          ? await ctx.db.get(event.manufacturer)
          : null;

        return {
          ...event,
          pluginData: plugin,
          manufacturerData: manufacturer,
        };
      })
    );

    return enriched;
  },
});

export const getForManufacturer = query({
  args: {
    manufacturer: v.id("manufacturers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 30;

    const events = await ctx.db
      .query("timelineEvents")
      .withIndex("by_manufacturer_occurred", (q) =>
        q.eq("manufacturer", args.manufacturer)
      )
      .order("desc")
      .take(limit);

    // Enrich with plugin data
    const enriched = await Promise.all(
      events.map(async (event) => {
        const plugin = event.plugin ? await ctx.db.get(event.plugin) : null;
        const manufacturer = event.manufacturer
          ? await ctx.db.get(event.manufacturer)
          : null;

        return {
          ...event,
          pluginData: plugin,
          manufacturerData: manufacturer,
        };
      })
    );

    return enriched;
  },
});

export const getRecent = query({
  args: {
    limit: v.optional(v.number()),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let events;
    if (args.type) {
      const eventType = args.type;
      events = await ctx.db
        .query("timelineEvents")
        .withIndex("by_type", (q) => q.eq("type", eventType))
        .order("desc")
        .take(limit);
    } else {
      events = await ctx.db
        .query("timelineEvents")
        .withIndex("by_occurred")
        .order("desc")
        .take(limit);
    }

    // Enrich with related data
    const enriched = await Promise.all(
      events.map(async (event) => {
        const plugin = event.plugin ? await ctx.db.get(event.plugin) : null;
        const manufacturer = event.manufacturer
          ? await ctx.db.get(event.manufacturer)
          : plugin
            ? await ctx.db.get(plugin.manufacturer)
            : null;

        return {
          ...event,
          pluginData: plugin,
          manufacturerData: manufacturer,
        };
      })
    );

    return enriched;
  },
});

// ============================================
// MUTATIONS
// ============================================

export const create = mutation({
  args: {
    type: v.string(),
    plugin: v.optional(v.id("plugins")),
    manufacturer: v.optional(v.id("manufacturers")),
    sale: v.optional(v.id("sales")),
    version: v.optional(v.id("versions")),
    title: v.string(),
    description: v.optional(v.string()),
    versionNumber: v.optional(v.string()),
    oldPrice: v.optional(v.number()),
    newPrice: v.optional(v.number()),
    discountPercent: v.optional(v.number()),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // If plugin is provided but no manufacturer, get it from the plugin
    let manufacturer = args.manufacturer;
    if (args.plugin && !manufacturer) {
      const plugin = await ctx.db.get(args.plugin);
      if (plugin) {
        manufacturer = plugin.manufacturer;
      }
    }

    return await ctx.db.insert("timelineEvents", {
      type: args.type,
      plugin: args.plugin,
      manufacturer: manufacturer,
      sale: args.sale,
      version: args.version,
      title: args.title,
      description: args.description,
      versionNumber: args.versionNumber,
      oldPrice: args.oldPrice,
      newPrice: args.newPrice,
      discountPercent: args.discountPercent,
      occurredAt: args.occurredAt ?? Date.now(),
      createdAt: Date.now(),
    });
  },
});

export const createRelease = mutation({
  args: {
    plugin: v.id("plugins"),
    versionNumber: v.optional(v.string()),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const plugin = await ctx.db.get(args.plugin);
    if (!plugin) throw new Error("Plugin not found");

    const title = `${plugin.name} released!`;

    return await ctx.db.insert("timelineEvents", {
      type: "release",
      plugin: args.plugin,
      manufacturer: plugin.manufacturer,
      title,
      versionNumber: args.versionNumber ?? plugin.currentVersion,
      occurredAt: args.occurredAt ?? Date.now(),
      createdAt: Date.now(),
    });
  },
});

export const createUpdate = mutation({
  args: {
    plugin: v.id("plugins"),
    versionNumber: v.string(),
    version: v.optional(v.id("versions")),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const plugin = await ctx.db.get(args.plugin);
    if (!plugin) throw new Error("Plugin not found");

    const title = `Updated ${plugin.name} to version ${args.versionNumber}`;

    return await ctx.db.insert("timelineEvents", {
      type: "update",
      plugin: args.plugin,
      manufacturer: plugin.manufacturer,
      version: args.version,
      title,
      versionNumber: args.versionNumber,
      occurredAt: args.occurredAt ?? Date.now(),
      createdAt: Date.now(),
    });
  },
});

export const createSaleStarted = mutation({
  args: {
    plugin: v.id("plugins"),
    sale: v.optional(v.id("sales")),
    newPrice: v.number(),
    oldPrice: v.number(),
    discountPercent: v.number(),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const plugin = await ctx.db.get(args.plugin);
    if (!plugin) throw new Error("Plugin not found");

    const title = `${plugin.name} went on offer`;

    return await ctx.db.insert("timelineEvents", {
      type: "sale_started",
      plugin: args.plugin,
      manufacturer: plugin.manufacturer,
      sale: args.sale,
      title,
      oldPrice: args.oldPrice,
      newPrice: args.newPrice,
      discountPercent: args.discountPercent,
      occurredAt: args.occurredAt ?? Date.now(),
      createdAt: Date.now(),
    });
  },
});

export const createSaleEnded = mutation({
  args: {
    plugin: v.id("plugins"),
    sale: v.optional(v.id("sales")),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const plugin = await ctx.db.get(args.plugin);
    if (!plugin) throw new Error("Plugin not found");

    const title = `${plugin.name} offer ended`;

    return await ctx.db.insert("timelineEvents", {
      type: "sale_ended",
      plugin: args.plugin,
      manufacturer: plugin.manufacturer,
      sale: args.sale,
      title,
      occurredAt: args.occurredAt ?? Date.now(),
      createdAt: Date.now(),
    });
  },
});

export const createAnnouncement = mutation({
  args: {
    plugin: v.optional(v.id("plugins")),
    manufacturer: v.id("manufacturers"),
    title: v.string(),
    description: v.optional(v.string()),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("timelineEvents", {
      type: "announcement",
      plugin: args.plugin,
      manufacturer: args.manufacturer,
      title: args.title,
      description: args.description,
      occurredAt: args.occurredAt ?? Date.now(),
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("timelineEvents") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
