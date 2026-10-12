"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useState } from "react";
import { MagnifyingGlass, MusicNote } from "@phosphor-icons/react";

export default function ManufacturersPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const allManufacturers = useQuery(api.manufacturers.list, { limit: 200 });
  const searchResults = useQuery(
    api.manufacturers.search,
    searchQuery.trim() ? { query: searchQuery.trim() } : "skip"
  );

  const manufacturers = searchQuery.trim() ? searchResults : allManufacturers;

  // Sort alphabetically
  const sorted = manufacturers?.slice().sort((a, b) => a.name.localeCompare(b.name));

  // Group by first letter
  const grouped = sorted?.reduce((acc, m) => {
    const letter = m.name[0].toUpperCase();
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(m);
    return acc;
  }, {} as Record<string, typeof sorted>);

  return (
    <div className="relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-6 py-10 relative">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs text-stone-500 uppercase tracking-wider mb-3">Browse Companies</p>
          <h1
            className="text-3xl font-bold text-stone-100 mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Manufacturers
          </h1>
          <p className="text-stone-400">
            Browse audio software companies and their plugins
          </p>
        </div>

        <div className="section-line mb-8" />

        {/* Search */}
        <div className="relative max-w-md mb-8">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search manufacturers..."
            className="w-full pl-10 pr-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500/50 backdrop-blur transition"
          />
        </div>

        {/* Manufacturer Grid */}
        {grouped ? (
          Object.keys(grouped).length > 0 ? (
            <div className="space-y-8">
              {Object.keys(grouped)
                .sort()
                .map((letter) => (
                  <div key={letter}>
                    <h2 className="text-lg font-semibold text-amber-400 mb-4 sticky top-16 bg-[#1a1714] py-2 z-10">
                      {letter}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {grouped[letter]?.map((manufacturer) => (
                        <ManufacturerCard key={manufacturer._id} manufacturer={manufacturer} />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <MagnifyingGlass className="w-12 h-12 text-stone-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-stone-100 mb-2">No manufacturers found</h3>
              <p className="text-stone-400">Try a different search term</p>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-white/[0.03] rounded-xl p-4">
                <div className="w-12 h-12 bg-white/[0.04] rounded-lg mb-3" />
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

function ManufacturerCard({ manufacturer }: { manufacturer: any }) {
  return (
    <Link
      href={`/manufacturers/${manufacturer.slug}`}
      className="group glass-card rounded-xl p-4 hover:border-amber-500/30 transition"
    >
      <div className="flex items-start gap-3">
        {manufacturer.logoUrl ? (
          <img
            src={manufacturer.logoUrl}
            alt={manufacturer.name}
            className="w-12 h-12 rounded-lg object-contain bg-white"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-white/[0.04] flex items-center justify-center">
            <MusicNote className="w-6 h-6 text-stone-500" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-stone-100 group-hover:text-amber-400 transition truncate">
            {manufacturer.name}
          </h3>
          <p className="text-stone-500 text-sm">
            {manufacturer.pluginCount} plugin{manufacturer.pluginCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      {manufacturer.description && (
        <p className="mt-3 text-stone-400 text-sm line-clamp-2">{manufacturer.description}</p>
      )}
    </Link>
  );
}
