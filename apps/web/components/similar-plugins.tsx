"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PluginCard } from "@/components/plugin-card";
import type { Id } from "@/convex/_generated/dataModel";

export function SimilarPlugins({
  pluginId,
  category,
  limit = 4,
}: {
  pluginId: Id<"plugins">;
  category?: string; // kept for backward compat but not used by new query
  limit?: number;
}) {
  const similar = useQuery(api.plugins.findSimilarPlugins, { pluginId, limit });

  if (!similar || similar.length === 0) return null;

  return (
    <section className="mb-12">
      <h2 className="text-xl font-semibold text-white mb-6">Similar Plugins</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {similar.map((plugin) => (
          <div key={plugin._id}>
            <PluginCard plugin={plugin} />
            {plugin.similarityReasons && (
              <p className="text-xs text-stone-500 mt-1.5 px-1 truncate">
                {plugin.similarityReasons}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
