"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { BreadcrumbSchema } from "@/components/SchemaMarkup";
import {
  SortAscending,
  LinkSimple,
  Funnel,
  X,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { ChainBrowserSidebar } from "@/components/chains/ChainBrowserSidebar";
import { ChainCard } from "@/components/chains/ChainCard";
import { CHAIN_USE_CASE_GROUPS } from "../../../../packages/shared/src/chainUseCases";

const SORT_OPTIONS = [
  { value: "recent", label: "Most Recent" },
  { value: "popular", label: "Most Popular" },
  { value: "downloads", label: "Most Downloaded" },
];

export default function ChainsPage() {
  const [category, setCategory] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCompatible, setShowCompatible] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const chains = useQuery(api.pluginDirectory.browseChains, {
    category: category || undefined,
    sortBy,
    limit: 30,
  });

  // Client-side search filter
  const filteredChains = chains?.filter((chain: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      chain.name?.toLowerCase().includes(q) ||
      chain.category?.toLowerCase().includes(q) ||
      chain.tags?.some((t: string) => t.toLowerCase().includes(q))
    );
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

        {/* Mobile: Filter chips + sort */}
        <div className="lg:hidden mb-6 space-y-3">
          {/* Search bar */}
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chains..."
              className="w-full pl-9 pr-4 py-2 bg-white/[0.04] border border-white/[0.06] rounded-xl text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500/30 text-sm"
            />
          </div>

          {/* Filter chip bar */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border transition ${
                mobileFiltersOpen
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                  : "bg-white/[0.04] border-white/[0.06] text-stone-300"
              }`}
            >
              <Funnel className="w-3.5 h-3.5" />
              Filters
            </button>
            {CHAIN_USE_CASE_GROUPS.map((group) => (
              <button
                key={group.value}
                onClick={() =>
                  setCategory(category === group.value ? "" : group.value)
                }
                className={`shrink-0 px-3 py-1.5 rounded-xl text-sm transition ${
                  category === group.value
                    ? "bg-amber-500 text-stone-900 font-semibold shadow-lg shadow-amber-500/20"
                    : "bg-white/[0.04] text-stone-300 hover:bg-white/[0.08] border border-white/[0.06]"
                }`}
              >
                {group.emoji} {group.label}
              </button>
            ))}
          </div>

          {/* Sort dropdown */}
          <div className="flex items-center gap-2">
            <SortAscending className="w-4 h-4 text-stone-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-xl text-stone-200 text-sm focus:outline-none focus:border-amber-500/30 transition"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Mobile filter panel */}
          {mobileFiltersOpen && (
            <div className="bg-stone-900/80 border border-stone-800 rounded-xl p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-stone-200">Filters</h3>
                <button
                  onClick={() => setMobileFiltersOpen(false)}
                  className="text-stone-500 hover:text-stone-300 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ChainBrowserSidebar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                category={category}
                onCategoryChange={(val) => {
                  setCategory(val);
                  setMobileFiltersOpen(false);
                }}
                sortBy={sortBy}
                onSortChange={setSortBy}
                showCompatible={showCompatible}
                onCompatibleChange={setShowCompatible}
              />
            </div>
          )}
        </div>

        {/* Desktop: Sidebar + Grid */}
        <div className="flex gap-8">
          {/* Sidebar — desktop only */}
          <div className="hidden lg:block">
            <ChainBrowserSidebar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              category={category}
              onCategoryChange={setCategory}
              sortBy={sortBy}
              onSortChange={setSortBy}
              showCompatible={showCompatible}
              onCompatibleChange={setShowCompatible}
            />
          </div>

          {/* Main Grid */}
          <div className="flex-1 min-w-0">
            {/* Active filter indicator */}
            {category && (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-stone-500">Filtered by:</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs text-amber-400">
                  {category}
                  <button
                    onClick={() => setCategory("")}
                    className="hover:text-amber-300 transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              </div>
            )}

            {filteredChains ? (
              filteredChains.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredChains.map((chain: any) => (
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
                    {category || searchQuery
                      ? "Try different filters or check back later."
                      : "Be the first to share a chain from the desktop app."}
                  </p>
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse bg-stone-900/50 border border-stone-800 rounded-xl p-5"
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

            {/* Load More */}
            {filteredChains && filteredChains.length >= 30 && (
              <div className="mt-8 text-center">
                <button className="px-6 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl text-stone-300 text-sm font-medium transition">
                  Load More
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
