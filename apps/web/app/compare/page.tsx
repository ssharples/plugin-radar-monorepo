"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowRight, Scales } from "@phosphor-icons/react";

export default function ComparisonsPage() {
  const comparisons = useQuery(api.agentEnrich.listComparisons, { limit: 200 });
  const loading = comparisons === undefined;
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const items = comparisons ?? [];
  const categories = ['all', ...new Set(items.map(c => c.category))];
  const filtered = selectedCategory === 'all'
    ? items
    : items.filter(c => c.category === selectedCategory);

  return (
    <div className="relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-6 py-10 relative">
        <p className="text-xs text-stone-500 uppercase tracking-wider mb-3">Side by Side</p>
        <h1
          className="text-3xl font-bold text-stone-100 mb-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Plugin Comparisons
        </h1>
        <p className="text-stone-400 mb-8">
          Side-by-side comparisons of popular audio plugins to help you choose the right one.
        </p>

        <div className="section-line mb-8" />

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 mb-8">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl capitalize transition ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-stone-900 font-semibold shadow-lg shadow-amber-500/20'
                  : 'bg-white/[0.04] text-stone-300 hover:bg-white/[0.08] border border-white/[0.06]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Comparisons Grid */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                <div className="h-5 bg-white/[0.04] rounded w-1/3 mb-3" />
                <div className="h-6 bg-white/[0.04] rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map(comparison => (
              <Link
                key={comparison.slug}
                href={`/compare/${comparison.slug}`}
                className="block glass-card rounded-xl p-5 hover:border-amber-500/30 transition group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-stone-400 capitalize">
                    {comparison.category}
                  </span>
                  <span className="text-amber-400 text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
                    Compare
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-stone-100 group-hover:text-amber-400 transition">
                  {comparison.pluginA} vs {comparison.pluginB}
                </h3>
              </Link>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <Scales className="w-12 h-12 text-stone-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-stone-100 mb-2">No comparisons found</h3>
            <p className="text-stone-400">No comparisons found for this category.</p>
          </div>
        )}
      </div>
    </div>
  );
}
