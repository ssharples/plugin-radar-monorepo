"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useState } from "react";
import { BreadcrumbSchema } from "@/components/SchemaMarkup";
import {
  SortAscending,
  Heart,
  DownloadSimple,
  Eye,
  LinkSimple,
} from "@phosphor-icons/react";

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "mixing", label: "Mixing" },
  { value: "mastering", label: "Mastering" },
  { value: "recording", label: "Recording" },
  { value: "sound-design", label: "Sound Design" },
  { value: "vocals", label: "Vocals" },
  { value: "drums", label: "Drums" },
  { value: "bass", label: "Bass" },
  { value: "guitar", label: "Guitar" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "Most Recent" },
  { value: "popular", label: "Most Popular" },
  { value: "downloads", label: "Most Downloaded" },
];

export default function ChainsPage() {
  const [category, setCategory] = useState("");
  const [sortBy, setSortBy] = useState("recent");

  const chains = useQuery(api.pluginDirectory.browseChains, {
    category: category || undefined,
    sortBy,
    limit: 30,
  });

  return (
    <div className="relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-6 py-10 relative">
        <BreadcrumbSchema
          items={[
            { name: "Home", url: "/" },
            { name: "Chains", url: "/chains" },
          ]}
        />

        {/* Header */}
        <div className="mb-8">
          <p className="text-xs text-stone-500 uppercase tracking-wider mb-3">Community</p>
          <h1
            className="text-3xl font-bold text-stone-100 mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Plugin Chains
          </h1>
          <p className="text-stone-400 max-w-2xl">
            Browse plugin chains shared by the community. Load them into your DAW
            with the PluginRadar desktop app.
          </p>
        </div>

        <div className="section-line mb-8" />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-8">
          {/* Category tabs */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                className={`px-3 py-1.5 rounded-xl text-sm transition ${
                  category === cat.value
                    ? "bg-amber-500 text-stone-900 font-semibold shadow-lg shadow-amber-500/20"
                    : "bg-white/[0.04] text-stone-300 hover:bg-white/[0.08] border border-white/[0.06]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2 ml-auto">
            <SortAscending className="w-4 h-4 text-stone-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 text-sm focus:outline-none focus:border-amber-500/50 transition"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Chains Grid */}
        {chains ? (
          chains.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {chains.map((chain) => (
                <ChainCard key={chain._id} chain={chain} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <LinkSimple className="w-12 h-12 text-stone-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-stone-100 mb-2">
                No chains found
              </h3>
              <p className="text-stone-400">
                {category
                  ? "Try a different category or check back later."
                  : "Be the first to share a chain from the desktop app."}
              </p>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse bg-white/[0.03] border border-white/[0.06] rounded-xl p-5"
              >
                <div className="h-5 bg-white/[0.04] rounded w-3/4 mb-3" />
                <div className="h-4 bg-white/[0.04] rounded w-1/2 mb-4" />
                <div className="flex gap-2 mb-4">
                  <div className="h-6 bg-white/[0.04] rounded w-16" />
                  <div className="h-6 bg-white/[0.04] rounded w-16" />
                </div>
                <div className="h-4 bg-white/[0.04] rounded w-1/3" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChainCard({ chain }: { chain: any }) {
  return (
    <Link
      href={`/chains/${chain.slug}`}
      className="block glass-card rounded-xl p-5 hover:border-amber-500/30 transition group"
    >
      {/* Category + plugin count */}
      <div className="flex items-center justify-between mb-3">
        <span className="px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-xs text-stone-400 capitalize">
          {chain.category}
        </span>
        <span className="text-xs text-stone-500">
          {chain.pluginCount} plugin{chain.pluginCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Name */}
      <h3 className="font-semibold text-stone-100 group-hover:text-amber-400 transition truncate mb-1">
        {chain.name}
      </h3>

      {/* Author */}
      {chain.author && (
        <p className="text-stone-500 text-sm mb-3">by {chain.author.name}</p>
      )}

      {/* Tags */}
      {chain.tags && chain.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {chain.tags.slice(0, 4).map((tag: string) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400/80"
            >
              {tag}
            </span>
          ))}
          {chain.tags.length > 4 && (
            <span className="text-xs text-stone-500">
              +{chain.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-stone-500">
        <span className="flex items-center gap-1">
          <Heart className="w-3.5 h-3.5" />
          {chain.likes}
        </span>
        <span className="flex items-center gap-1">
          <DownloadSimple className="w-3.5 h-3.5" />
          {chain.downloads}
        </span>
        <span className="flex items-center gap-1">
          <Eye className="w-3.5 h-3.5" />
          {chain.views}
        </span>
      </div>
    </Link>
  );
}
