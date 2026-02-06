"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PluginCard } from "@/components/plugin-card";
import { BreadcrumbSchema, FAQSchema } from "@/components/SchemaMarkup";
import { CaretDown, CaretUp, Gift } from "@phosphor-icons/react";
import { useState } from "react";

const CATEGORY_LABELS: Record<string, string> = {
  eq: "Equalizer",
  compressor: "Compressor",
  reverb: "Reverb",
  delay: "Delay",
  synth: "Synthesizer",
  sampler: "Sampler",
  utility: "Utility",
  saturator: "Saturator",
  limiter: "Limiter",
  gate: "Gate",
  chorus: "Chorus",
  phaser: "Phaser",
  flanger: "Flanger",
  effect: "Effect",
  instrument: "Instrument",
  bundle: "Bundle",
};

function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category.toLowerCase()] || category;
}

export default function FreePage() {
  const plugins = useQuery(api.plugins.freePlugins, { limit: 200 });
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const grouped = plugins
    ? plugins.reduce<Record<string, typeof plugins>>((acc, plugin) => {
        const cat = plugin.category || "other";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(plugin);
        return acc;
      }, {})
    : null;

  const sortedCategories = grouped
    ? Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)
    : null;

  const totalCount = plugins?.length ?? 0;

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  return (
    <div>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Free Plugins", url: "/free" },
        ]}
      />
      <FAQSchema
        questions={[
          {
            question: "Are these free plugins really free?",
            answer:
              "Yes. Every plugin listed here is offered at no cost by the manufacturer. Some are permanently free, while others may be limited-time offers.",
          },
          {
            question: "What formats are supported?",
            answer:
              "Most free plugins are available in VST3, AU, and AAX formats. Check each plugin's detail page for specific format availability.",
          },
          {
            question: "Do free plugins work on Mac and Windows?",
            answer:
              "Most free plugins support both macOS and Windows. Check the plugin detail page for platform-specific compatibility.",
          },
        ]}
      />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-green-500/[0.03] via-transparent to-transparent" />
        <div className="container mx-auto px-4 lg:px-6 pt-10 pb-6 relative">
          <div className="flex items-center gap-3 mb-2">
            <Gift weight="bold" className="w-6 h-6 text-green-400" />
            <h1
              className="text-3xl font-bold text-stone-100"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Free Audio Plugins
            </h1>
          </div>
          <p className="text-stone-500 text-sm max-w-2xl">
            Discover {totalCount > 0 ? totalCount.toLocaleString() : ""} free VST plugins, instruments,
            and effects. No strings attached — download and start producing.
          </p>

          {/* Stats */}
          {sortedCategories && (
            <div className="flex flex-wrap gap-2 mt-5">
              <span className="px-3 py-1.5 bg-green-500/[0.08] text-green-400 rounded-xl text-xs font-medium border border-green-500/15">
                {totalCount} free plugins
              </span>
              <span className="px-3 py-1.5 bg-white/[0.04] text-stone-400 rounded-xl text-xs border border-white/[0.06]">
                {sortedCategories.length} categories
              </span>
            </div>
          )}
        </div>
      </section>

      <div className="container mx-auto px-4 lg:px-6 pb-14">
        {/* Category Sections */}
        {sortedCategories ? (
          sortedCategories.map(([category, categoryPlugins]) => {
            const isCollapsed = collapsedCategories.has(category);
            return (
              <section key={category} className="mb-10">
                <button
                  onClick={() => toggleCategory(category)}
                  className="flex items-center gap-3 mb-5 group w-full text-left"
                >
                  <h2
                    className="text-lg font-semibold text-stone-200 group-hover:text-amber-400 transition"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {getCategoryLabel(category)}
                  </h2>
                  <span className="text-xs text-stone-600 tabular-nums">
                    ({categoryPlugins.length})
                  </span>
                  <div className="flex-1 h-px bg-white/[0.04]" />
                  {isCollapsed ? (
                    <CaretDown className="w-4 h-4 text-stone-600" />
                  ) : (
                    <CaretUp className="w-4 h-4 text-stone-600" />
                  )}
                </button>
                {!isCollapsed && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {categoryPlugins.map((plugin) => (
                      <PluginCard key={plugin._id} plugin={plugin} />
                    ))}
                  </div>
                )}
              </section>
            );
          })
        ) : (
          <div>
            {Array.from({ length: 3 }).map((_, sectionIdx) => (
              <div key={sectionIdx} className="mb-10">
                <div className="h-5 bg-white/[0.04] rounded w-40 mb-5 animate-pulse" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="aspect-[4/3] bg-white/[0.03] rounded-xl mb-2" />
                      <div className="h-4 bg-white/[0.04] rounded w-3/4 mb-2" />
                      <div className="h-3 bg-white/[0.03] rounded w-1/2" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
