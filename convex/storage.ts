import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";

// Generate upload URL for client-side uploads
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Store a file and return the storage ID
export const storeFile = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    return args.storageId;
  },
});

// Get URL for a storage ID
export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// Get multiple URLs
export const getUrls = query({
  args: { storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, args) => {
    const urls: Record<string, string | null> = {};
    for (const id of args.storageIds) {
      urls[id] = await ctx.storage.getUrl(id);
    }
    return urls;
  },
});

// Delete a file from storage
export const deleteFile = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await ctx.storage.delete(args.storageId);
  },
});

// Upload image from URL (server-side action)
export const uploadFromUrl = action({
  args: {
    url: v.string(),
    pluginId: v.optional(v.id("plugins")),
    manufacturerId: v.optional(v.id("manufacturers")),
  },
  handler: async (ctx, args) => {
    try {
      // Fetch the image
      const response = await fetch(args.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      
      const contentType = response.headers.get("content-type") || "image/png";
      const blob = await response.blob();
      
      // Upload to Convex storage
      const storageId = await ctx.storage.store(blob);
      
      // If pluginId provided, update the plugin
      if (args.pluginId) {
        await ctx.runMutation(api.plugins.update, {
          id: args.pluginId,
          imageStorageId: storageId,
        });
      }
      
      // If manufacturerId provided, update the manufacturer logo
      if (args.manufacturerId) {
        await ctx.runMutation(api.manufacturers.update, {
          id: args.manufacturerId,
          logoStorageId: storageId,
        });
      }
      
      return { storageId, contentType };
    } catch (error) {
      console.error("Failed to upload from URL:", error);
      throw error;
    }
  },
});

// Batch upload images for plugins
export const batchUploadPluginImages = action({
  args: {
    plugins: v.array(v.object({
      pluginId: v.id("plugins"),
      imageUrl: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const results = [];
    
    for (const { pluginId, imageUrl } of args.plugins) {
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          results.push({ pluginId, success: false, error: `HTTP ${response.status}` });
          continue;
        }
        
        const blob = await response.blob();
        const storageId = await ctx.storage.store(blob);
        
        await ctx.runMutation(api.plugins.update, {
          id: pluginId,
          imageStorageId: storageId,
        });
        
        results.push({ pluginId, success: true, storageId });
      } catch (error: any) {
        results.push({ pluginId, success: false, error: error.message });
      }
    }
    
    return results;
  },
});
