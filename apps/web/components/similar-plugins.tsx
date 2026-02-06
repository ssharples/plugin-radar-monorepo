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
  category: string;
  limit?: number;
}) {
  const similar = useQuery(api.plugins.similar, { pluginId, category, limit });

  if (!similar || similar.length === 0) return null;

  return (
    <section className="mb-12">
      <h2 className="text-xl font-semibold text-white mb-6">Similar Plugins</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {similar.map((plugin) => (
          <PluginCard key={plugin._id} plugin={plugin} />
        ))}
      </div>
    </section>
  );
}
