"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import type { Id } from "@/convex/_generated/dataModel";

export function ComparisonLinks({ pluginId }: { pluginId: Id<"plugins"> }) {
  const comparisons = useQuery(api.comparisons.getForPlugin, {
    pluginId,
    limit: 5,
  });

  if (!comparisons || comparisons.length === 0) return null;

  return (
    <section className="mb-12">
      <h2 className="text-xl font-semibold text-white mb-4">Compare With</h2>
      <div className="flex flex-wrap gap-2">
        {comparisons.map((c) => (
          <Link
            key={c._id}
            href={`/compare/${c.slug}`}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 border border-stone-700 hover:border-white/50 rounded-lg text-stone-300 hover:text-white transition text-sm"
          >
            vs {c.otherPluginName}
          </Link>
        ))}
      </div>
    </section>
  );
}
