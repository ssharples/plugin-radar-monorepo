"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

interface Plugin {
  _id: Id<"plugins">;
  name: string;
  slug: string;
  category: string;
  description?: string;
  shortDescription?: string;
  imageUrl?: string;
  currentPrice?: number;
  msrp?: number;
  isFree: boolean;
  formats?: string[];
  worksWellOn?: string[];
  sonicCharacter?: string[];
  skillLevel?: string;
}

export function PluginCard({ plugin, showSaleBadge = true }: { plugin: Plugin; showSaleBadge?: boolean }) {
  const activeSales = useQuery(
    api.sales.getActiveForPlugin,
    showSaleBadge ? { plugin: plugin._id } : "skip"
  );

  const sale = activeSales?.[0];

  const price = plugin.isFree
    ? "Free"
    : sale
    ? `$${(sale.salePrice / 100).toFixed(0)}`
    : plugin.currentPrice
    ? `$${(plugin.currentPrice / 100).toFixed(0)}`
    : plugin.msrp
    ? `$${(plugin.msrp / 100).toFixed(0)}`
    : null;

  const originalPrice = sale ? `$${(sale.originalPrice / 100).toFixed(0)}` : null;

  return (
    <Link href={`/plugins/${plugin.slug}`} className="group block">
      <div className="relative rounded-xl overflow-hidden transition-all duration-300 group-hover:glow-amber-sm">
        {/* Image container */}
        <div className="aspect-[4/3] relative overflow-hidden bg-[#1e1b18]">
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
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1714] via-transparent to-transparent opacity-60" />
          <div className="absolute inset-0 bg-amber-500/0 group-hover:bg-amber-500/[0.03] transition-colors duration-300" />

          {/* Badges — top right */}
          <div className="absolute top-2.5 right-2.5 flex gap-1.5">
            {sale && (
              <span className="price-tag-sale px-2 py-0.5 rounded-md text-[11px] tracking-wide shadow-lg">
                -{sale.discountPercent}%
              </span>
            )}
            <span className="px-2 py-0.5 bg-black/50 backdrop-blur-sm rounded-md text-[11px] text-stone-300 capitalize">
              {plugin.category}
            </span>
          </div>

          {/* Price badge — bottom left */}
          {price && (
            <div className="absolute bottom-2.5 left-2.5">
              <span className={`
                inline-block px-2.5 py-1 rounded-md text-sm font-semibold backdrop-blur-sm
                ${plugin.isFree
                  ? "price-tag-free shadow-lg shadow-green-500/20"
                  : sale
                    ? "bg-amber-500 text-stone-900 shadow-lg shadow-amber-500/25"
                    : "bg-black/60 text-white"
                }
              `}>
                {price}
                {originalPrice && (
                  <span className="ml-1.5 text-[11px] line-through opacity-60">{originalPrice}</span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Info area */}
        <div className="p-3 pb-3.5 bg-white/[0.02]">
          <h3 className="font-medium text-stone-200 group-hover:text-amber-400 transition-colors duration-200 truncate text-[15px]">
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
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/0 to-transparent group-hover:via-amber-500/40 transition-all duration-500" />
      </div>
    </Link>
  );
}
