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
} from "@phosphor-icons/react";
import { CompatibilityBadge } from "./CompatibilityBadge";

export function ChainCard({ chain }: { chain: any }) {
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
      // If already in collection, still show as bookmarked
      if (err?.message?.includes("already")) {
        setBookmarked(true);
      }
    }
    setBookmarking(false);
  };

  return (
    <Link
      href={`/chains/${chain.slug}`}
      className="block bg-stone-900/50 border border-stone-800 rounded-xl p-5 hover:border-amber-500/25 transition group"
    >
      {/* Top row: category + compatibility */}
      <div className="flex items-center justify-between mb-3">
        <span className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-400 capitalize">
          {chain.category}
        </span>
        <div className="flex items-center gap-2">
          {chain.compatibility !== undefined && (
            <CompatibilityBadge percentage={chain.compatibility} />
          )}
          <button
            onClick={handleBookmark}
            disabled={bookmarking || bookmarked}
            className={`p-1 transition ${
              bookmarked
                ? "text-amber-400"
                : "text-stone-600 hover:text-amber-400"
            } disabled:cursor-default`}
            title={bookmarked ? "In collection" : isAuthenticated ? "Add to collection" : "Log in to bookmark"}
          >
            <BookmarkSimple className="w-4 h-4" weight={bookmarked ? "fill" : "regular"} />
          </button>
        </div>
      </div>

      {/* Name */}
      <h3 className="font-semibold text-stone-100 group-hover:text-amber-400 transition truncate mb-1">
        {chain.name}
      </h3>

      {/* Author */}
      {chain.author && (
        <p className="text-stone-500 text-sm mb-3">by {chain.author.name}</p>
      )}

      {/* Plugin count */}
      <p className="text-xs text-stone-600 font-mono mb-3">
        {chain.pluginCount} plugin{chain.pluginCount !== 1 ? "s" : ""}
      </p>

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
