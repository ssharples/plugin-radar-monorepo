"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth-provider";
import {
  Heart,
  DownloadSimple,
  Eye,
  BookmarkSimple,
  User,
  GitFork,
  LinkSimple,
  CaretRight,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { CompatibilityBadge } from "./CompatibilityBadge";

export function ChainCardRedesign({ chain }: { chain: any }) {
  const { sessionToken, isAuthenticated } = useAuth();
  const addToCollection = useMutation(api.pluginDirectory.addToCollection);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);

  const handleBookmark = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated || !sessionToken || bookmarking) return;
    setBookmarking(true);
    try {
      await addToCollection({
        sessionToken,
        chainId: chain._id,
        source: "web",
      });
      setBookmarked(true);
    } catch (err: any) {
      if (err?.message?.includes("already")) {
        setBookmarked(true);
      }
    }
    setBookmarking(false);
  };

  // Get enriched slots (from updated browseChains) or fall back to raw slots
  const slots = chain.slots || [];
  const maxVisible = 5;
  const visibleSlots = slots.slice(0, maxVisible);
  const overflowCount = Math.max(0, slots.length - maxVisible);

  // Count slots that have parameters
  const paramsCount = slots.filter(
    (s: any) => s.parameters && s.parameters.length > 0
  ).length;

  return (
    <Link
      href={`/chains/${chain.slug}`}
      className="group block rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] hover:from-white/[0.07] hover:to-white/[0.03] transition-all duration-300 overflow-hidden hover-lift"
    >
      {/* Top section: Category + Bookmark */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 glass-button text-[10px] font-bold uppercase tracking-widest text-white/80 rounded-md">
            {chain.category}
          </span>
          {chain.useCase && (
            <span className="px-2 py-0.5 bg-white/[0.06] border border-white/[0.08] rounded text-[10px] text-stone-400">
              {chain.useCase}
            </span>
          )}
          {chain.compatibility !== undefined && (
            <CompatibilityBadge percentage={chain.compatibility} />
          )}
        </div>
        <button
          onClick={handleBookmark}
          disabled={bookmarking || bookmarked}
          className={`p-1.5 rounded-lg transition-all duration-200 ${
            bookmarked
              ? "bg-white/15 text-white"
              : "bg-transparent text-stone-500 hover:bg-white/10 hover:text-white"
          } disabled:cursor-default`}
          title={
            bookmarked
              ? "In collection"
              : isAuthenticated
                ? "Add to collection"
                : "Log in to bookmark"
          }
        >
          <BookmarkSimple
            className="w-4 h-4"
            weight={bookmarked ? "fill" : "regular"}
          />
        </button>
      </div>

      {/* Chain Name */}
      <div className="px-5 pb-1">
        <h3 className="font-display font-bold text-lg text-white group-hover:text-white leading-tight line-clamp-1">
          {chain.name}
        </h3>
        {chain.author && (
          <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-0.5">
            <User className="w-3 h-3" />
            <span>{chain.author.name}</span>
          </div>
        )}
      </div>

      {/* Plugin Strip — the visual centerpiece */}
      <div className="px-5 py-3">
        <div className="flex items-center gap-2 overflow-hidden">
          {visibleSlots.map((slot: any, i: number) => {
            const hasImage = slot.pluginData?.imageUrl;
            const pluginName =
              slot.pluginData?.name || slot.pluginName || "Plugin";
            const hasParams =
              slot.parameters && slot.parameters.length > 0;

            return (
              <div
                key={i}
                className="shrink-0 flex flex-col items-center gap-1 group/slot"
              >
                {/* Plugin thumbnail */}
                <div
                  className={`relative w-12 h-12 rounded-lg overflow-hidden border transition-all duration-200 ${
                    slot.bypassed
                      ? "border-white/[0.04] opacity-40"
                      : "border-white/[0.08] group-hover:border-white/[0.15]"
                  } bg-white/[0.03]`}
                >
                  {hasImage ? (
                    <img
                      src={slot.pluginData.imageUrl}
                      alt={pluginName}
                      className="w-full h-full object-contain p-0.5"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <LinkSimple className="w-4 h-4 text-stone-600" />
                    </div>
                  )}
                  {/* Position badge */}
                  <div className="absolute -top-0.5 -left-0.5 w-3.5 h-3.5 bg-stone-900 border border-white/[0.1] rounded-full flex items-center justify-center">
                    <span className="text-[8px] font-mono text-stone-400">
                      {slot.position + 1}
                    </span>
                  </div>
                  {/* Params indicator dot */}
                  {hasParams && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#deff0a] rounded-full border border-stone-900" />
                  )}
                </div>
                {/* Plugin name */}
                <span className="text-[9px] text-stone-500 group-hover:text-stone-400 transition-colors max-w-[52px] truncate text-center leading-tight">
                  {pluginName.length > 10
                    ? pluginName.replace(/\s+/g, " ").split(" ")[0]
                    : pluginName}
                </span>
              </div>
            );
          })}

          {/* Overflow indicator */}
          {overflowCount > 0 && (
            <div className="shrink-0 flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] flex items-center justify-center">
                <span className="text-xs font-mono text-stone-500">
                  +{overflowCount}
                </span>
              </div>
              <span className="text-[9px] text-stone-600">more</span>
            </div>
          )}
        </div>
      </div>

      {/* Tags row */}
      {chain.tags && chain.tags.length > 0 && (
        <div className="px-5 pb-2 flex flex-wrap gap-1">
          {chain.tags.slice(0, 3).map((tag: string) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded-full text-stone-500"
            >
              {tag}
            </span>
          ))}
          {chain.tags.length > 3 && (
            <span className="text-[10px] text-stone-600 font-mono px-1">
              +{chain.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer: Stats + Params indicator */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.05] bg-white/[0.01]">
        <div className="flex items-center gap-3 text-[11px] text-stone-500">
          <span className="flex items-center gap-1">
            <Heart className="w-3 h-3" />
            <span className="font-mono">{chain.likes || 0}</span>
          </span>
          <span className="flex items-center gap-1">
            <GitFork className="w-3 h-3" />
            <span className="font-mono">{chain.forks || 0}</span>
          </span>
          <span className="flex items-center gap-1">
            <DownloadSimple className="w-3 h-3" />
            <span className="font-mono">{chain.downloads || 0}</span>
          </span>
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            <span className="font-mono">{chain.views || 0}</span>
          </span>
        </div>

        {/* Params indicator */}
        <div className="flex items-center gap-2">
          {paramsCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-[#deff0a]/70 font-medium">
              <SlidersHorizontal className="w-3 h-3" />
              <span>{paramsCount} presets</span>
            </span>
          )}
          <CaretRight className="w-3.5 h-3.5 text-stone-600 group-hover:text-stone-400 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </Link>
  );
}
