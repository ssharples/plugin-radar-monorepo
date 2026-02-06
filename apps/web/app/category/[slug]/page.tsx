"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PluginCard } from "@/components/plugin-card";
import Link from "next/link";
import { CaretRight, MagnifyingGlass } from "@phosphor-icons/react";

const categoryLabels: Record<string, { name: string; description: string }> = {
  synth: {
    name: "Synthesizers",
    description: "Virtual instruments for creating sounds from scratch",
  },
  effect: {
    name: "Effects",
    description: "Audio processors for shaping and transforming sound",
  },
  eq: {
    name: "Equalizers",
    description: "Frequency spectrum processors for tonal balance",
  },
  compressor: {
    name: "Compressors",
    description: "Dynamic range processors for punch and control",
  },
  reverb: {
    name: "Reverbs",
    description: "Spatial effects for adding depth and ambiance",
  },
  delay: {
    name: "Delays",
    description: "Time-based effects for echoes and rhythmic patterns",
  },
  sampler: {
    name: "Samplers",
    description: "Sample playback instruments and drum machines",
  },
  utility: {
    name: "Utilities",
    description: "Tools for metering, routing, and workflow enhancement",
  },
  instrument: {
    name: "Instruments",
    description: "Virtual instruments for music production",
  },
  bundle: {
    name: "Bundles",
    description: "Plugin collections and subscription packages",
  },
};

export default function CategoryPage() {
  const params = useParams();
  const slug = params.slug as string;

  const plugins = useQuery(api.plugins.list, { category: slug, limit: 100 });
  const categories = useQuery(api.plugins.getCategories);

  const categoryInfo = categoryLabels[slug] || {
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    description: `Browse ${slug} plugins`,
  };

  const currentCategory = categories?.find((c) => c.name === slug);

  return (
    <div className="relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-6 py-10 relative">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-stone-400 mb-6">
          <Link href="/" className="hover:text-stone-100 transition">
            Home
          </Link>
          <CaretRight className="w-3 h-3" />
          <Link href="/plugins" className="hover:text-stone-100 transition">
            Plugins
          </Link>
          <CaretRight className="w-3 h-3" />
          <span className="text-stone-200">{categoryInfo.name}</span>
        </nav>

        {/* Header */}
        <div className="mb-8">
          <p className="text-xs text-stone-500 uppercase tracking-wider mb-3">Category</p>
          <h1
            className="text-3xl font-bold text-stone-100 mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {categoryInfo.name}
          </h1>
          <p className="text-stone-400">{categoryInfo.description}</p>
          {currentCategory && (
            <p className="text-amber-400 text-sm mt-2">
              {currentCategory.count} plugin{currentCategory.count !== 1 ? "s" : ""} available
            </p>
          )}
        </div>

        <div className="section-line mb-8" />

        {/* Category Nav */}
        {categories && (
          <div className="flex flex-wrap gap-2 mb-8">
            {categories.map((cat) => (
              <Link
                key={cat.name}
                href={`/category/${cat.name}`}
                className={`px-4 py-2 rounded-xl transition text-sm ${
                  cat.name === slug
                    ? "bg-amber-500 text-stone-900 font-semibold shadow-lg shadow-amber-500/20"
                    : "bg-white/[0.04] text-stone-300 hover:bg-white/[0.08] hover:text-stone-100 border border-white/[0.06]"
                }`}
              >
                {categoryLabels[cat.name]?.name || cat.name}
                <span className="ml-2 text-xs opacity-70">({cat.count})</span>
              </Link>
            ))}
          </div>
        )}

        {/* Plugins Grid */}
        {plugins ? (
          plugins.items.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {plugins.items.map((plugin) => (
                <PluginCard key={plugin._id} plugin={plugin} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <MagnifyingGlass className="w-12 h-12 text-stone-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-stone-100 mb-2">
                No {categoryInfo.name.toLowerCase()} found
              </h3>
              <p className="text-stone-400">
                Check back later for new additions
              </p>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-video bg-white/[0.03] rounded-xl mb-3" />
                <div className="h-4 bg-white/[0.04] rounded w-3/4 mb-2" />
                <div className="h-3 bg-white/[0.04] rounded w-1/2" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
