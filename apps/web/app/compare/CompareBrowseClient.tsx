"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowRight, Scales, Eye } from "@phosphor-icons/react";
import { getCategoryColor, getCategoryBadgeStyle } from "@/lib/category-colors";

interface Comparison {
  slug: string;
  pluginA: string | undefined;
  pluginB: string | undefined;
  category: string;
  views: number;
}

interface CompareBrowseClientProps {
  initialComparisons: Comparison[] | null;
}

export default function CompareBrowseClient({ initialComparisons }: CompareBrowseClientProps) {
  const liveComparisons = useQuery(api.agentEnrich.listComparisons, { limit: 200 });
  const comparisons = liveComparisons ?? initialComparisons;
  const loading = comparisons === undefined || comparisons === null;

  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const items = comparisons ?? [];
  const categories: string[] = [
    "all",
    ...Array.from(new Set<string>(items.map((c) => c.category))),
  ];
  const filtered =
    selectedCategory === "all"
      ? items
      : items.filter((c) => c.category === selectedCategory);

  return (
    <>
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 mb-8">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-xl capitalize transition text-sm ${
              selectedCategory === cat
                ? "bg-white text-black font-semibold shadow-lg shadow-[#deff0a]/20"
                : "bg-white/[0.04] text-stone-300 hover:bg-white/[0.08] border border-white/[0.06]"
            }`}
          >
            {cat === "all" ? (
              "All"
            ) : (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: getCategoryColor(cat) ?? "#a8a29e" }}
                />
                {cat}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Comparisons Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse bg-white/[0.03] border border-white/[0.06] rounded-xl p-5"
            >
              <div className="h-5 bg-white/[0.04] rounded w-1/3 mb-3" />
              <div className="h-6 bg-white/[0.04] rounded w-3/4 mb-3" />
              <div className="h-4 bg-white/[0.04] rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((comparison) => (
            <Link
              key={comparison.slug}
              href={`/compare/${comparison.slug}`}
              className="block glass-card rounded-xl p-5 hover:border-[#deff0a]/30 transition group"
            >
              {/* Top row: category badge + arrow */}
              <div className="flex items-center justify-between mb-4">
                <span
                  className="text-xs px-2.5 py-1 rounded capitalize font-medium"
                  style={getCategoryBadgeStyle(comparison.category)}
                >
                  {comparison.category}
                </span>
                <span className="text-white/60 text-sm flex items-center gap-1 group-hover:text-[#deff0a] group-hover:gap-2 transition-all">
                  Compare
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>

              {/* VS title */}
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-base font-semibold text-stone-100 group-hover:text-white transition leading-tight">
                  {comparison.pluginA}
                </h3>
                <span className="text-xs font-bold text-[#deff0a]/70 uppercase tracking-wider shrink-0">
                  vs
                </span>
                <h3 className="text-base font-semibold text-stone-100 group-hover:text-white transition leading-tight">
                  {comparison.pluginB}
                </h3>
              </div>

              {/* Views count */}
              {comparison.views > 0 && (
                <div className="flex items-center gap-1 text-stone-500 text-xs">
                  <Eye className="w-3.5 h-3.5" />
                  <span>
                    {comparison.views.toLocaleString()} view
                    {comparison.views !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16">
          <Scales className="w-12 h-12 text-stone-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-stone-100 mb-2">
            No comparisons in this category
          </h3>
          <p className="text-stone-400">
            Try selecting a different category or check back as we add new
            comparisons.
          </p>
        </div>
      )}
    </>
  );
}
