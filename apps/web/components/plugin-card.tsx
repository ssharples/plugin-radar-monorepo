"use client";

import Link from "next/link";
import type { Id } from "@/convex/_generated/dataModel";
import { useOwnedPlugins } from "./owned-plugins-provider";

interface Plugin {
  _id: Id<"plugins">;
  name: string;
  slug: string;
  category: string;
  description?: string;
  shortDescription?: string;
  imageUrl?: string;
  isFree: boolean;
  formats?: string[];
  worksWellOn?: string[];
  sonicCharacter?: string[];
  skillLevel?: string;
}

export function PluginCard({ plugin }: { plugin: Plugin }) {
  const ownedPlugins = useOwnedPlugins();
  const isOwned = ownedPlugins.has(plugin._id);

  return (
    <Link href={`/plugins/${plugin.slug}`} className="group block">
      <div className="relative rounded-xl overflow-hidden transition-all duration-300 group-hover:glow-glass-sm">
        {/* Image container */}
        <div className="aspect-[4/3] relative overflow-hidden bg-[#0a0a0a]">
          {plugin.imageUrl ? (
            <img
              src={plugin.imageUrl}
              alt={plugin.name}
              className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-stone-600">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.5"/>
                </svg>
              </div>
            </div>
          )}

          {/* Warm overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#000000] via-transparent to-transparent opacity-60" />
          <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.03] transition-colors duration-300" />

          {/* Badges — top right */}
          <div className="absolute top-2.5 right-2.5 flex gap-1.5">
            {isOwned && (
              <span className="px-2 py-0.5 bg-emerald-500/80 backdrop-blur-sm rounded-md text-[11px] text-white font-medium tracking-wide shadow-lg shadow-emerald-500/20 flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Owned
              </span>
            )}
            <span className="px-2 py-0.5 bg-black/50 backdrop-blur-sm rounded-md text-[11px] text-stone-300 capitalize">
              {plugin.category}
            </span>
          </div>

          {/* Free badge — bottom left */}
          {plugin.isFree && (
            <div className="absolute bottom-2.5 left-2.5">
              <span className="inline-block px-2.5 py-1 rounded-md text-sm font-semibold backdrop-blur-sm price-tag-free shadow-lg shadow-green-500/20">
                Free
              </span>
            </div>
          )}
        </div>

        {/* Info area */}
        <div className="p-3 pb-3.5 bg-white/[0.02]">
          <h3 className="font-medium text-stone-200 group-hover:text-white transition-colors duration-200 truncate text-[15px]">
            {plugin.name}
          </h3>
          <p className="text-stone-500 text-xs mt-0.5 truncate leading-relaxed">
            {plugin.shortDescription || plugin.description?.slice(0, 55)}
          </p>

          {/* Formats row */}
          {plugin.formats && plugin.formats.length > 0 && (
            <div className="flex gap-1 mt-2.5">
              {plugin.formats.slice(0, 3).map((f: string) => (
                <span key={f} className="text-[10px] px-1.5 py-0.5 bg-white/[0.04] rounded text-stone-500 uppercase tracking-wider">
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Bottom border glow on hover */}
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/0 to-transparent group-hover:via-white/40 transition-all duration-500" />
      </div>
    </Link>
  );
}
