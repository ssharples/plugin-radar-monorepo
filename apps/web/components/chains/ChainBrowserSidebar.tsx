"use client";

import { MagnifyingGlass, SortAscending } from "@phosphor-icons/react";
import { UseCaseCategoryTree } from "./UseCaseCategoryTree";

const SORT_OPTIONS = [
  { value: "recent", label: "Most Recent" },
  { value: "popular", label: "Most Popular" },
  { value: "downloads", label: "Most Downloaded" },
];

const GENRE_OPTIONS = [
  "Electronic",
  "Hip-Hop",
  "Rock",
  "Pop",
  "R&B",
  "Metal",
  "Jazz",
  "Ambient",
  "Country",
  "Classical",
  "Lo-Fi",
  "Reggaeton",
];

export function ChainBrowserSidebar({
  searchQuery,
  onSearchChange,
  category,
  onCategoryChange,
  genre,
  onGenreChange,
  sortBy,
  onSortChange,
  showCompatible,
  onCompatibleChange,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  genre: string;
  onGenreChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  showCompatible: boolean;
  onCompatibleChange: (value: boolean) => void;
}) {
  return (
    <aside className="w-full lg:w-[240px] shrink-0 space-y-6">
      {/* Search */}
      <div>
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search chains..."
            className="w-full pl-9 pr-4 py-2 bg-white/[0.04] border border-white/[0.06] rounded-xl text-stone-200 placeholder-stone-500 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-[#deff0a]/20 transition-all text-sm"
          />
        </div>
      </div>

      {/* Category Tree */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
          Categories
        </h3>
        <UseCaseCategoryTree
          selectedCategory={category}
          onSelect={onCategoryChange}
        />
      </div>

      {/* Genre Filter */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
          Genre
        </h3>
        <div className="space-y-0.5">
          <button
            onClick={() => onGenreChange("")}
            className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition ${
              genre === ""
                ? "bg-white/10 text-white font-medium"
                : "text-stone-400 hover:text-stone-200 hover:bg-white/[0.04]"
            }`}
          >
            All Genres
          </button>
          {GENRE_OPTIONS.map((g) => (
            <button
              key={g}
              onClick={() => onGenreChange(genre === g ? "" : g)}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition ${
                genre === g
                  ? "bg-white/10 text-white font-medium"
                  : "text-stone-400 hover:text-stone-200 hover:bg-white/[0.04]"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Compatibility filter */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={showCompatible}
            onChange={(e) => onCompatibleChange(e.target.checked)}
            className="w-4 h-4 rounded border-stone-700 bg-white/[0.04] text-[#deff0a] focus:ring-[#deff0a]/20 focus:ring-offset-0"
          />
          <span className="text-sm text-stone-400 group-hover:text-stone-300 transition">
            Compatible only
          </span>
        </label>
      </div>

      {/* Sort */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
          Sort By
        </h3>
        <div className="flex items-center gap-2">
          <SortAscending className="w-4 h-4 text-stone-500" />
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="flex-1 px-3 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-xl text-stone-200 text-sm focus:outline-none focus:border-white/30 transition"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </aside>
  );
}
