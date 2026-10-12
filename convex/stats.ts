import { query } from "./_generated/server";

export const overview = query({
  args: {},
  handler: async (ctx) => {
    // Get counts
    const [plugins, manufacturers, activeSales, stores] = await Promise.all([
      ctx.db.query("plugins").collect(),
      ctx.db.query("manufacturers").collect(),
      ctx.db
        .query("sales")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect(),
      ctx.db
        .query("stores")
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect(),
    ]);
    
    const now = Date.now();
    const validSales = activeSales.filter(
      (s) => !s.endsAt || s.endsAt > now
    );
    
    // Category breakdown
    const categories: Record<string, number> = {};
    for (const plugin of plugins) {
      categories[plugin.category] = (categories[plugin.category] || 0) + 1;
    }
    
    // Free vs paid
    const freeCount = plugins.filter((p) => p.isFree).length;
    
    return {
      totalPlugins: plugins.length,
      totalManufacturers: manufacturers.length,
      activeSales: validSales.length,
      stores: stores.length,
      freePlugins: freeCount,
      paidPlugins: plugins.length - freeCount,
      categories,
    };
  },
});

export const recentActivity = query({
  args: {},
  handler: async (ctx) => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    
    const [recentPlugins, recentSales] = await Promise.all([
      ctx.db
        .query("plugins")
        .withIndex("by_updated")
        .order("desc")
        .take(100),
      ctx.db
        .query("sales")
        .withIndex("by_created")
        .order("desc")
        .take(100),
    ]);
    
    return {
      pluginsAddedToday: recentPlugins.filter((p) => p.createdAt > oneDayAgo).length,
      pluginsUpdatedToday: recentPlugins.filter(
        (p) => p.updatedAt > oneDayAgo && p.createdAt < oneDayAgo
      ).length,
      pluginsAddedThisWeek: recentPlugins.filter((p) => p.createdAt > oneWeekAgo).length,
      salesAddedToday: recentSales.filter((s) => s.createdAt > oneDayAgo).length,
      salesAddedThisWeek: recentSales.filter((s) => s.createdAt > oneWeekAgo).length,
    };
  },
});
