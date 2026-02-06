"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { BreadcrumbSchema } from "@/components/SchemaMarkup";
import {
  Heart,
  DownloadSimple,
  Copy,
  Check,
  ArrowLeft,
  LinkSimple,
  CheckCircle,
  XCircle,
} from "@phosphor-icons/react";
import { useState } from "react";
import { StarRating } from "@/components/social/StarRating";
import { CommentSection } from "@/components/social/CommentSection";
import type { Comment } from "@/components/social/CommentSection";
import { FollowButton } from "@/components/social/FollowButton";
import { ForkButton } from "@/components/social/ForkButton";
import { UserAvatar } from "@/components/social/UserAvatar";

export default function ChainDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { user, isAuthenticated, sessionToken } = useAuth();

  const chain = useQuery(api.pluginDirectory.getChain, { slug });

  const compatibility = useQuery(
    api.pluginDirectory.checkChainCompatibility,
    chain && user ? { chainId: chain._id, userId: user._id } : "skip"
  );

  // Social queries
  const ratingData = useQuery(
    api.social.getChainRating,
    chain
      ? { chainId: chain._id, sessionToken: sessionToken ?? undefined }
      : "skip"
  );

  const comments = useQuery(
    api.social.getComments,
    chain ? { chainId: chain._id } : "skip"
  );

  const isFollowingAuthor = useQuery(
    api.social.isFollowing,
    chain && sessionToken && chain.user && user && chain.user !== user._id
      ? { sessionToken, userId: chain.user }
      : "skip"
  );

  // Mutations
  const toggleLike = useMutation(api.pluginDirectory.toggleChainLike);
  const downloadChain = useMutation(api.pluginDirectory.downloadChain);
  const rateChainMutation = useMutation(api.social.rateChain);
  const addCommentMutation = useMutation(api.social.addComment);
  const deleteCommentMutation = useMutation(api.social.deleteComment);
  const followUserMutation = useMutation(api.social.followUser);
  const unfollowUserMutation = useMutation(api.social.unfollowUser);
  const forkChainMutation = useMutation(api.social.forkChain);

  const [copiedShareCode, setCopiedShareCode] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  if (chain === undefined) {
    return <ChainSkeleton />;
  }

  if (chain === null) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-16 text-center">
        <LinkSimple className="w-12 h-12 text-stone-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-stone-100 mb-2">Chain not found</h1>
        <p className="text-stone-400 mb-6">
          This chain may have been removed or the link is incorrect.
        </p>
        <Link
          href="/chains"
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-900 font-semibold rounded-xl transition shadow-lg shadow-amber-500/20"
        >
          <ArrowLeft className="w-4 h-4" />
          Browse Chains
        </Link>
      </div>
    );
  }

  const handleCopyShareCode = () => {
    navigator.clipboard.writeText(chain.shareCode ?? "");
    setCopiedShareCode(true);
    setTimeout(() => setCopiedShareCode(false), 2000);
  };

  const handleLike = async () => {
    if (!user) return;
    await toggleLike({ chainId: chain._id, userId: user._id });
  };

  const handleDownload = async () => {
    if (!user) return;
    setIsDownloading(true);
    try {
      await downloadChain({ chainId: chain._id, userId: user._id });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRate = async (rating: number) => {
    if (!sessionToken) return;
    await rateChainMutation({ sessionToken, chainId: chain._id, rating });
  };

  const handleAddComment = async (content: string, parentId?: string) => {
    if (!sessionToken) return;
    await addCommentMutation({
      sessionToken,
      chainId: chain._id,
      content,
      parentCommentId: parentId as any,
    });
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!sessionToken) return;
    await deleteCommentMutation({ sessionToken, commentId: commentId as any });
  };

  const handleFollow = async () => {
    if (!sessionToken || !chain.user) return;
    await followUserMutation({ sessionToken, userId: chain.user });
  };

  const handleUnfollow = async () => {
    if (!sessionToken || !chain.user) return;
    await unfollowUserMutation({ sessionToken, userId: chain.user });
  };

  const handleFork = async (newName: string) => {
    if (!sessionToken) return;
    await forkChainMutation({ sessionToken, chainId: chain._id, newName });
  };

  // Map Convex comments to the Comment interface
  const mappedComments: Comment[] = (comments ?? []).map((c: any) => ({
    _id: c._id,
    authorName: c.authorName,
    userId: c.userId,
    content: c.content,
    createdAt: c.createdAt,
    parentCommentId: c.parentCommentId,
  }));

  const isOwnChain = user && chain.user === user._id;

  return (
    <div className="relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-6 py-8 relative">
        <BreadcrumbSchema
          items={[
            { name: "Home", url: "/" },
            { name: "Chains", url: "/chains" },
            { name: chain.name, url: `/chains/${slug}` },
          ]}
        />

        {/* Back link */}
        <Link
          href="/chains"
          className="inline-flex items-center gap-1 text-stone-400 hover:text-stone-100 transition text-sm mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Chains
        </Link>

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start gap-6 mb-8">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-xs text-stone-400 capitalize">
                {chain.category}
              </span>
              {chain.genre && (
                <span className="px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-xs text-stone-400">
                  {chain.genre}
                </span>
              )}
              {chain.useCase && (
                <span className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-400">
                  {chain.useCase}
                </span>
              )}
              {chain.forkedFrom && (
                <span className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-400">
                  fork
                </span>
              )}
            </div>
            <h1
              className="text-3xl font-bold text-stone-100 mb-2"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {chain.name}
            </h1>

            {/* Author row with avatar + follow */}
            {chain.author && (
              <div className="flex items-center gap-3 mb-1">
                <UserAvatar
                  name={chain.author.name}
                  avatarUrl={chain.author.avatarUrl}
                  size="sm"
                />
                <span className="text-stone-400">by {chain.author.name}</span>
                {isAuthenticated && !isOwnChain && (
                  <FollowButton
                    isFollowing={isFollowingAuthor ?? false}
                    onFollow={handleFollow}
                    onUnfollow={handleUnfollow}
                  />
                )}
              </div>
            )}

            {/* Forked from badge */}
            {chain.forkedFrom && (
              <p className="text-xs text-stone-500 mt-1">
                Forked from another chain
              </p>
            )}

            {chain.description && (
              <p className="text-stone-400 mt-3 max-w-2xl">{chain.description}</p>
            )}

            {/* Tags */}
            {chain.tags && chain.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {chain.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="text-xs px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400/80"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Rating */}
            {ratingData && (
              <div className="mt-4 flex items-center gap-3">
                <StarRating
                  rating={ratingData.average}
                  count={ratingData.count}
                  interactive={isAuthenticated}
                  onRate={handleRate}
                />
                {ratingData.userRating && (
                  <span className="text-xs text-stone-500">
                    Your rating: {ratingData.userRating}/5
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions sidebar */}
          <div className="flex flex-col gap-3 lg:w-64 shrink-0">
            {/* Compatibility */}
            {compatibility && (
              <div
                className={`p-4 rounded-xl border ${
                  compatibility.canFullyLoad
                    ? "bg-amber-500/10 border-amber-500/30"
                    : "glass-card"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {compatibility.canFullyLoad ? (
                    <CheckCircle className="w-5 h-5 text-amber-400" weight="fill" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-stone-600 flex items-center justify-center">
                      <span className="text-xs text-stone-400">
                        {compatibility.percentage}
                      </span>
                    </div>
                  )}
                  <span className="text-sm font-medium text-stone-100">
                    {compatibility.percentage}% compatible
                  </span>
                </div>
                <p className="text-xs text-stone-400">
                  You have {compatibility.ownedCount} of {compatibility.totalCount}{" "}
                  plugins
                </p>
                {/* Compatibility bar */}
                <div className="mt-2 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      compatibility.canFullyLoad
                        ? "bg-amber-400"
                        : compatibility.percentage >= 50
                          ? "bg-yellow-400"
                          : "bg-red-400"
                    }`}
                    style={{ width: `${compatibility.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action buttons */}
            {isAuthenticated && user && (
              <div className="flex gap-2">
                <button
                  onClick={handleLike}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-stone-200 rounded-xl transition text-sm border border-white/[0.06]"
                >
                  <Heart className="w-4 h-4" />
                  Like ({chain.likes})
                </button>
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-900 font-semibold rounded-xl transition text-sm disabled:opacity-50 shadow-lg shadow-amber-500/20"
                >
                  <DownloadSimple className="w-4 h-4" />
                  {isDownloading ? "..." : "Download"}
                </button>
              </div>
            )}

            {/* Fork button */}
            {isAuthenticated && (
              <ForkButton
                onFork={handleFork}
                chainName={chain.name}
              />
            )}

            {/* Share code */}
            <div className="glass-card rounded-xl p-3">
              <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">Share Code</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-lg font-mono text-amber-400 tracking-widest">
                  {chain.shareCode}
                </code>
                <button
                  onClick={handleCopyShareCode}
                  className="p-1.5 text-stone-400 hover:text-stone-100 transition"
                  title="Copy share code"
                >
                  {copiedShareCode ? (
                    <Check className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs text-stone-500 px-1">
              <span>{chain.views} views</span>
              <span>{chain.downloads} downloads</span>
              <span>{chain.likes} likes</span>
            </div>
          </div>
        </div>

        <div className="section-line mb-8" />

        {/* Plugin Slots */}
        <section>
          <h2
            className="text-xl font-semibold text-stone-100 mb-4"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Plugins ({chain.pluginCount})
          </h2>
          <div className="space-y-3">
            {chain.slots.map((slot: any, index: number) => (
              <SlotRow
                key={index}
                slot={slot}
                compatibility={compatibility?.slots?.find(
                  (s: any) => s.position === slot.position
                )}
              />
            ))}
          </div>
        </section>

        <div className="section-line my-8" />

        {/* Comments Section */}
        <section>
          <CommentSection
            comments={mappedComments}
            currentUserId={user?._id ?? null}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
            loading={comments === undefined}
          />
        </section>
      </div>
    </div>
  );
}

function SlotRow({
  slot,
  compatibility,
}: {
  slot: any;
  compatibility?: { owned: boolean };
}) {
  const hasMatch = !!slot.pluginData;

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border transition ${
        slot.bypassed
          ? "bg-white/[0.02] border-white/[0.03] opacity-60"
          : "glass-card"
      }`}
    >
      {/* Position */}
      <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-sm font-mono text-stone-400 shrink-0">
        {slot.position + 1}
      </div>

      {/* Plugin image or placeholder */}
      {hasMatch && slot.pluginData.imageUrl ? (
        <div className="w-14 h-10 rounded overflow-hidden bg-white/[0.04] shrink-0">
          <img
            src={slot.pluginData.imageUrl}
            alt={slot.pluginData.name}
            className="w-full h-full object-contain"
          />
        </div>
      ) : (
        <div className="w-14 h-10 rounded bg-white/[0.04] flex items-center justify-center text-stone-600 shrink-0">
          <LinkSimple className="w-5 h-5" />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {hasMatch ? (
            <Link
              href={`/plugins/${slot.pluginData.slug}`}
              className="font-medium text-stone-100 hover:text-amber-400 transition truncate"
            >
              {slot.pluginData.name}
            </Link>
          ) : (
            <span className="font-medium text-stone-100 truncate">
              {slot.pluginName}
            </span>
          )}
          {slot.bypassed && (
            <span className="text-xs px-1.5 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded text-stone-500">
              bypassed
            </span>
          )}
        </div>
        <p className="text-sm text-stone-500 truncate">
          {hasMatch ? slot.pluginData.manufacturer : slot.manufacturer}
          {slot.presetName && (
            <span className="text-stone-600"> &middot; {slot.presetName}</span>
          )}
        </p>
      </div>

      {/* Price (if matched) */}
      {hasMatch && (
        <div className="text-right shrink-0">
          <span
            className={`text-sm font-medium ${
              slot.pluginData.isFree ? "text-green-400" : "text-stone-100"
            }`}
          >
            {slot.pluginData.isFree
              ? "Free"
              : slot.pluginData.currentPrice
                ? `$${(slot.pluginData.currentPrice / 100).toFixed(0)}`
                : ""}
          </span>
        </div>
      )}

      {/* Owned indicator */}
      {compatibility !== undefined && (
        <div className="shrink-0">
          {compatibility.owned ? (
            <CheckCircle className="w-5 h-5 text-amber-400" weight="fill" />
          ) : (
            <XCircle className="w-5 h-5 text-stone-600" />
          )}
        </div>
      )}
    </div>
  );
}

function ChainSkeleton() {
  return (
    <div className="container mx-auto px-4 lg:px-6 py-8 animate-pulse">
      <div className="h-4 bg-white/[0.03] rounded w-24 mb-6" />
      <div className="h-8 bg-white/[0.03] rounded w-64 mb-2" />
      <div className="h-4 bg-white/[0.03] rounded w-40 mb-4" />
      <div className="h-16 bg-white/[0.03] rounded w-full max-w-2xl mb-8" />
      <div className="h-6 bg-white/[0.03] rounded w-32 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-white/[0.03] border border-white/[0.06] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
