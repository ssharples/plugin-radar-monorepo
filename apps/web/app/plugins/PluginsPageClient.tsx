"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { PluginCard } from "@/components/plugin-card";
import { Funnel, X, MagnifyingGlass } from "@phosphor-icons/react";

interface PluginsPageClientProps {
  initialPlugins: any[] | null;
  initialTotal: number | null;
  initialCategories: { name: string; count: number }[] | null;
  initialFormats: string[] | null;
  initialPlatforms: string[] | null;
  initialEnrichmentOptions: any | null;
  isSearchMode: boolean;
}

export default function PluginsPageClient({
  initialPlugins,
  initialTotal,
  initialCategories,
  initialFormats,
  initialPlatforms,
  initialEnrichmentOptions,
  isSearchMode,
}: PluginsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") || "";
  const category = searchParams.get("category") || undefined;
  const format = searchParams.get("format") || undefined;
  const platform = searchParams.get("platform") || undefined;
  const free = searchParams.get("free") === "true" ? true : undefined;
  const sortBy = searchParams.get("sort") || "newest";
  const worksWellOn =
    searchParams.get("worksWellOn")?.split(",").filter(Boolean) || undefined;
  const useCases =
    searchParams.get("useCases")?.split(",").filter(Boolean) || undefined;
  const skillLevel = searchParams.get("skillLevel") || undefined;
  const cpuUsage = searchParams.get("cpuUsage") || undefined;

  const [showFilters, setShowFilters] = useState(false);

  const searchResults = useQuery(
    api.plugins.search,
    q ? { query: q, category, isFree: free } : "skip"
  );

  const browseResults = useQuery(
    api.plugins.browse,
    !q
      ? {
          category,
          format,
          platform,
          isFree: free,
          sortBy,
          limit: 48,
          worksWellOn:
            worksWellOn && worksWellOn.length > 0 ? worksWellOn : undefined,
          useCases:
            useCases && useCases.length > 0 ? useCases : undefined,
          skillLevel,
          cpuUsage,
        }
      : "skip"
  );

  const liveCategories = useQuery(api.plugins.getCategories);
  const liveFormats = useQuery(api.plugins.getFormats);
  const livePlatforms = useQuery(api.plugins.getPlatforms);
  const liveEnrichmentOptions = useQuery(api.plugins.getEnrichmentOptions);

  // Fallback: live data ?? server-provided initial data
  const categories = liveCategories ?? initialCategories;
  const formats = liveFormats ?? initialFormats;
  const platforms = livePlatforms ?? initialPlatforms;
  const enrichmentOptions = liveEnrichmentOptions ?? initialEnrichmentOptions;

  // For plugins, pick live data first, then fall back to initial
  let plugins: any[] | undefined;
  let total: number | undefined;

  if (q) {
    plugins = searchResults ?? (isSearchMode ? (initialPlugins ?? undefined) : undefined);
    total = plugins?.length;
  } else {
    const liveBrowse = browseResults;
    if (liveBrowse) {
      plugins = liveBrowse.items;
      total = liveBrowse.total;
    } else if (!isSearchMode && initialPlugins) {
      plugins = initialPlugins;
      total = initialTotal ?? undefined;
    }
  }

  const updateFilters = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/plugins?${params.toString()}`);
  };

  const clearAllFilters = () => {
    router.push("/plugins");
  };

  const updateMultiFilter = (
    key: string,
    value: string,
    checked: boolean
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    const currentValues =
      params.get(key)?.split(",").filter(Boolean) || [];

    let newValues: string[];
    if (checked) {
      newValues = [...currentValues, value];
    } else {
      newValues = currentValues.filter((v) => v !== value);
    }

    if (newValues.length === 0) {
      params.delete(key);
    } else {
      params.set(key, newValues.join(","));
    }
    router.push(`/plugins?${params.toString()}`);
  };

  const hasActiveFilters =
    category ||
    format ||
    platform ||
    free ||
    q ||
    (worksWellOn && worksWellOn.length > 0) ||
    (useCases && useCases.length > 0) ||
    skillLevel ||
    cpuUsage;

  return (
    <div>
      {/* Header */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent" />
        <div className="container mx-auto px-4 lg:px-6 pt-10 pb-6 relative">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1
                className="text-3xl font-bold text-stone-100"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Browse Plugins
              </h1>
              {total !== undefined && (
                <p className="text-stone-500 text-sm mt-1">
                  {total.toLocaleString()} plugin{total !== 1 ? "s" : ""}{" "}
                  found
                </p>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-medium ${
                showFilters
                  ? "bg-white/10 text-white border border-[#deff0a]/20"
                  : "bg-white/[0.04] text-stone-400 hover:bg-white/[0.07] hover:text-stone-200 border border-white/[0.06]"
              }`}
            >
              <Funnel className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#deff0a]" />
              )}
            </button>
          </div>

          {/* Search bar */}
          <div className="relative max-w-xl">
            <MagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
            <input
              type="text"
              defaultValue={q}
              onChange={(e) => {
                const value = e.target.value;
                if (value) {
                  updateFilters("q", value);
                } else {
                  updateFilters("q", null);
                }
              }}
              placeholder="Search plugins by name, manufacturer, or category..."
              className="w-full pl-11 pr-4 py-2.5 bg-white/[0.04] border border-white/[0.06] rounded-xl text-stone-200 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/30 focus:ring-1 focus:ring-[#deff0a]/20 transition-all text-sm"
            />
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 lg:px-6 pb-14">
        {/* Active Filters */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 mb-6">
            {q && (
              <FilterTag
                label={`Search: "${q}"`}
                onRemove={() => updateFilters("q", null)}
              />
            )}
            {category && (
              <FilterTag
                label={`Category: ${category}`}
                onRemove={() => updateFilters("category", null)}
              />
            )}
            {format && (
              <FilterTag
                label={`Format: ${format}`}
                onRemove={() => updateFilters("format", null)}
              />
            )}
            {platform && (
              <FilterTag
                label={`Platform: ${platform}`}
                onRemove={() => updateFilters("platform", null)}
              />
            )}
            {free && (
              <FilterTag
                label="Free Only"
                onRemove={() => updateFilters("free", null)}
              />
            )}
            {worksWellOn?.map((w) => (
              <FilterTag
                key={`worksWellOn-${w}`}
                label={`Works On: ${w.replace(/-/g, " ")}`}
                onRemove={() => updateMultiFilter("worksWellOn", w, false)}
              />
            ))}
            {useCases?.map((u) => (
              <FilterTag
                key={`useCases-${u}`}
                label={`Use Case: ${u.replace(/-/g, " ")}`}
                onRemove={() => updateMultiFilter("useCases", u, false)}
              />
            ))}
            {skillLevel && (
              <FilterTag
                label={`Skill: ${skillLevel}`}
                onRemove={() => updateFilters("skillLevel", null)}
              />
            )}
            {cpuUsage && (
              <FilterTag
                label={`CPU: ${cpuUsage.replace(/-/g, " ")}`}
                onRemove={() => updateFilters("cpuUsage", null)}
              />
            )}
            <button
              onClick={clearAllFilters}
              className="text-xs text-stone-500 hover:text-white transition"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Filters Panel */}
        {showFilters && (
          <div className="glass-card rounded-xl p-6 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
              <FilterSelect
                label="Category"
                value={category || ""}
                onChange={(v) => updateFilters("category", v || null)}
                placeholder="All Categories"
                options={
                  categories?.map((cat) => ({
                    value: cat.name,
                    label: `${cat.name} (${cat.count})`,
                  })) || []
                }
              />
              <FilterSelect
                label="Format"
                value={format || ""}
                onChange={(v) => updateFilters("format", v || null)}
                placeholder="All Formats"
                options={
                  formats?.map((f) => ({ value: f, label: f })) || []
                }
              />
              <FilterSelect
                label="Platform"
                value={platform || ""}
                onChange={(v) => updateFilters("platform", v || null)}
                placeholder="All Platforms"
                options={
                  platforms?.map((p) => ({ value: p, label: p })) || []
                }
              />
              <FilterSelect
                label="Price"
                value={free ? "true" : ""}
                onChange={(v) => updateFilters("free", v || null)}
                placeholder="All Prices"
                options={[{ value: "true", label: "Free Only" }]}
              />
              <FilterSelect
                label="Sort By"
                value={sortBy}
                onChange={(v) => updateFilters("sort", v)}
                placeholder="Newest First"
                options={[
                  { value: "newest", label: "Newest First" },
                  { value: "name", label: "Name A-Z" },
                ]}
              />
            </div>

            {/* Discovery Filters */}
            <div className="border-t border-white/[0.04] pt-4">
              <p className="text-xs text-stone-500 uppercase tracking-wider mb-3">
                Discovery Filters
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <FilterSelect
                  label="Works Well On"
                  value=""
                  onChange={(v) =>
                    v && updateMultiFilter("worksWellOn", v, true)
                  }
                  placeholder={
                    worksWellOn && worksWellOn.length > 0
                      ? `${worksWellOn.length} selected`
                      : "Select..."
                  }
                  options={
                    enrichmentOptions?.worksWellOn
                      .filter(
                        (opt: any) => !worksWellOn?.includes(opt.value)
                      )
                      .map((opt: any) => ({
                        value: opt.value,
                        label: opt.label,
                      })) || []
                  }
                />
                <FilterSelect
                  label="Use Case"
                  value=""
                  onChange={(v) =>
                    v && updateMultiFilter("useCases", v, true)
                  }
                  placeholder={
                    useCases && useCases.length > 0
                      ? `${useCases.length} selected`
                      : "Select..."
                  }
                  options={
                    enrichmentOptions?.useCases
                      .filter(
                        (opt: any) => !useCases?.includes(opt.value)
                      )
                      .map((opt: any) => ({
                        value: opt.value,
                        label: opt.label,
                      })) || []
                  }
                />
                <FilterSelect
                  label="Skill Level"
                  value={skillLevel || ""}
                  onChange={(v) =>
                    updateFilters("skillLevel", v || null)
                  }
                  placeholder="All Levels"
                  options={
                    enrichmentOptions?.skillLevel.map((opt: any) => ({
                      value: opt.value,
                      label: opt.label,
                    })) || []
                  }
                />
                <FilterSelect
                  label="CPU Usage"
                  value={cpuUsage || ""}
                  onChange={(v) =>
                    updateFilters("cpuUsage", v || null)
                  }
                  placeholder="Any CPU Usage"
                  options={
                    enrichmentOptions?.cpuUsage.map((opt: any) => ({
                      value: opt.value,
                      label: opt.label,
                    })) || []
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Results Grid */}
        {plugins ? (
          plugins.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {plugins.map((plugin: any) => (
                <PluginCard key={plugin._id} plugin={plugin} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/[0.03] flex items-center justify-center">
                <MagnifyingGlass className="w-7 h-7 text-stone-600" />
              </div>
              <h3
                className="text-lg font-semibold text-stone-200 mb-2"
                style={{ fontFamily: "var(--font-display)" }}
              >
                No plugins match your search
              </h3>
              <p className="text-stone-500 text-sm mb-4">
                Try different keywords or remove some filters to see more
                results.
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="px-5 py-2 bg-white text-black rounded-xl text-sm font-medium hover:bg-[#deff0a] transition-all shadow-lg shadow-[#deff0a]/20"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[4/3] bg-white/[0.03] rounded-xl mb-2" />
                <div className="h-4 bg-white/[0.04] rounded w-3/4 mb-2" />
                <div className="h-3 bg-white/[0.03] rounded w-1/2" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  placeholder,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs text-stone-500 uppercase tracking-wider mb-2">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-xl text-stone-200 text-sm focus:outline-none focus:border-[#deff0a]/30 focus:ring-1 focus:ring-[#deff0a]/20 transition-all appearance-none cursor-pointer"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FilterTag({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 text-white rounded-lg text-xs border border-[#deff0a]/15">
      {label}
      <button onClick={onRemove} className="hover:text-white transition">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}
