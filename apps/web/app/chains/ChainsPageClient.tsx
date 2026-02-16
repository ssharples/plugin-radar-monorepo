"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BreadcrumbSchema } from "@/components/SchemaMarkup";
import {
  SortAscending,
  LinkSimple,
  Funnel,
  X,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { ChainBrowserSidebar } from "@/components/chains/ChainBrowserSidebar";
import { ChainCardRedesign } from "@/components/chains/ChainCardRedesign";
import { CHAIN_USE_CASE_GROUPS } from "@plugin-radar/shared/chainUseCases";
import { useAuth } from "@/components/auth-provider";

const SORT_OPTIONS = [
  { value: "recent", label: "Most Recent" },
  { value: "popular", label: "Most Popular" },
  { value: "downloads", label: "Most Downloaded" },
];

const PAGE_SIZE = 30;

// All group values for quick lookup
const GROUP_VALUES = new Set(CHAIN_USE_CASE_GROUPS.map((g) => g.value));

interface ChainsPageClientProps {
  initialData: {
    chains: any[];
    hasMore: boolean;
  } | null;
  initialCategory: string;
  initialGenre: string;
  initialSort: string;
  initialSearch: string;
}

export default function ChainsPageClient({
  initialData,
  initialCategory,
  initialGenre,
  initialSort,
  initialSearch,
}: ChainsPageClientProps) {
  const { sessionToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read filter state from URL params (with server-provided defaults as fallback)
  const category = searchParams.get("category") || initialCategory;
  const genre = searchParams.get("genre") || initialGenre;
  const sortBy = searchParams.get("sort") || initialSort;
  const searchFromUrl = searchParams.get("q") || initialSearch;

  const [searchInput, setSearchInput] = useState(searchFromUrl);
  const [showCompatible, setShowCompatible] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  // Resolve category → useCaseGroup / useCase
  const useCaseGroup = category && GROUP_VALUES.has(category) ? category : undefined;
  const useCase = category && !GROUP_VALUES.has(category) ? category : undefined;

  const liveResult = useQuery(api.pluginDirectory.browseChainsPaginated, {
    useCaseGroup,
    useCase,
    search: searchFromUrl.trim() || undefined,
    genre: genre || undefined,
    sortBy,
    sessionToken: sessionToken || undefined,
    limit: displayCount,
    offset: 0,
  });

  // Server data shown until live query resolves
  const result = liveResult ?? initialData;
  const chains = result?.chains;
  const hasMore = result?.hasMore ?? false;

  // Client-side compatibility filter
  const filteredChains = useMemo(() => {
    if (!chains) return undefined;
    if (!showCompatible) return chains;
    return chains.filter((chain: any) => {
      if (chain.compatibility === undefined) return true;
      return chain.compatibility >= 100;
    });
  }, [chains, showCompatible]);

  const handleLoadMore = useCallback(() => {
    setDisplayCount((prev) => prev + PAGE_SIZE);
  }, []);

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/chains?${params.toString()}`);
  };

  const handleCategoryChange = (val: string) => {
    updateFilter("category", val || null);
  };

  const handleGenreChange = (val: string) => {
    updateFilter("genre", val || null);
  };

  const handleSortChange = (val: string) => {
    updateFilter("sort", val === "recent" ? null : val);
  };

  const handleSearchSubmit = () => {
    updateFilter("q", searchInput.trim() || null);
  };

  return (
    <div className="relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-6 py-10 relative">
        <BreadcrumbSchema
          items={[
            { name: "Home", url: "/" },
            { name: "Chains", url: "/chains" },
          ]}
        />

        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-stone-100 mb-2">
            Community Chains
          </h1>
          <p className="text-stone-400 text-sm max-w-xl">
            Discover plugin chains built by producers and engineers. Rate them, fork them, make them yours. Every chain works with any VST3 or AU plugin.
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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
              placeholder="Search chains..."
              className="w-full pl-9 pr-4 py-2 bg-white/[0.04] border border-white/[0.06] rounded-xl text-stone-200 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/30 text-sm"
            />
          </div>

          {/* Filter chip bar */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border transition ${
                mobileFiltersOpen
                  ? "bg-white/10 border-[#deff0a]/20 text-white"
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
                  handleCategoryChange(category === group.value ? "" : group.value)
                }
                className={`shrink-0 px-3 py-1.5 rounded-xl text-sm transition ${
                  category === group.value
                    ? "bg-white text-black font-semibold shadow-lg shadow-[#deff0a]/20"
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
              onChange={(e) => handleSortChange(e.target.value)}
              className="px-3 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-xl text-stone-200 text-sm focus:outline-none focus:border-[#deff0a]/30 transition"
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
                searchQuery={searchInput}
                onSearchChange={setSearchInput}
                category={category}
                onCategoryChange={(val) => {
                  handleCategoryChange(val);
                  setMobileFiltersOpen(false);
                }}
                genre={genre}
                onGenreChange={handleGenreChange}
                sortBy={sortBy}
                onSortChange={handleSortChange}
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
              searchQuery={searchInput}
              onSearchChange={setSearchInput}
              category={category}
              onCategoryChange={handleCategoryChange}
              genre={genre}
              onGenreChange={handleGenreChange}
              sortBy={sortBy}
              onSortChange={handleSortChange}
              showCompatible={showCompatible}
              onCompatibleChange={setShowCompatible}
            />
          </div>

          {/* Main Grid */}
          <div className="flex-1 min-w-0">
            {/* Active filter indicators */}
            {(category || genre) && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-xs text-stone-500">Filtered by:</span>
                {category && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/10 border border-[#deff0a]/20 rounded-full text-xs text-white">
                    {category}
                    <button
                      onClick={() => handleCategoryChange("")}
                      className="hover:text-[#deff0a] transition"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {genre && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/10 border border-[#deff0a]/20 rounded-full text-xs text-white">
                    {genre}
                    <button
                      onClick={() => handleGenreChange("")}
                      className="hover:text-[#deff0a] transition"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
            )}

            {filteredChains ? (
              filteredChains.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredChains.map((chain: any) => (
                    <ChainCardRedesign key={chain._id} chain={chain} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <LinkSimple className="w-12 h-12 text-stone-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-stone-100 mb-2">
                    No chains found
                  </h3>
                  <p className="text-stone-400">
                    {category || searchFromUrl || genre
                      ? "Try adjusting your filters or search terms."
                      : "No chains shared yet. Be the first — build a chain in ProChain and share it with the community."}
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
            {filteredChains && hasMore && (
              <div className="mt-8 text-center">
                <button
                  onClick={handleLoadMore}
                  className="px-6 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl text-stone-300 text-sm font-medium transition"
                >
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
