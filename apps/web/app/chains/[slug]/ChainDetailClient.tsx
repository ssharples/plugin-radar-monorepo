"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { BreadcrumbSchema } from "@/components/SchemaMarkup";
import {
  Heart,
  DownloadSimple,
  Copy,
  Check,
  ArrowLeft,
  ArrowRight,
  LinkSimple,
  CheckCircle,
  XCircle,
  BookmarkSimple,
  CaretDown,
  UserCirclePlus,
} from "@phosphor-icons/react";
import { useState } from "react";
import { StarRating } from "@/components/social/StarRating";
import { CommentSection } from "@/components/social/CommentSection";
import type { Comment } from "@/components/social/CommentSection";
import { FollowButton } from "@/components/social/FollowButton";
import { ForkButton } from "@/components/social/ForkButton";
import { UserAvatar } from "@/components/social/UserAvatar";
import { SendChainModal } from "@/components/social/SendChainModal";

interface ChainDetailClientProps {
  slug: string;
  initialChain: any | null;
}

export default function ChainDetailClient({
  slug,
  initialChain,
}: ChainDetailClientProps) {
  const { user, isAuthenticated, sessionToken } = useAuth();

  const liveChain = useQuery(api.pluginDirectory.getChain, { slug });
  const chain = liveChain ?? initialChain;

  const compatibility = useQuery(
    api.pluginDirectory.checkChainCompatibility,
    chain && sessionToken ? { chainId: chain._id, sessionToken } : "skip"
  );

  // Substitution plan -- only fires when authenticated + chain has missing plugins
  const substitutionPlan = useQuery(
    api.pluginDirectory.generateSubstitutionPlan,
    chain && sessionToken && compatibility && !compatibility.canFullyLoad
      ? { chainId: chain._id, sessionToken }
      : "skip"
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
  const addToCollectionMutation = useMutation(api.pluginDirectory.addToCollection);

  const [copiedShareCode, setCopiedShareCode] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [inCollection, setInCollection] = useState(false);
  const [addingToCollection, setAddingToCollection] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);

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
          className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-[#ccff00] text-stone-900 font-semibold rounded-xl transition shadow-lg shadow-[#deff0a]/20"
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
    if (!sessionToken) return;
    await toggleLike({ chainId: chain._id, sessionToken });
  };

  const handleDownload = async () => {
    if (!sessionToken) return;
    setIsDownloading(true);
    try {
      await downloadChain({ chainId: chain._id, sessionToken });
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

  const handleAddToCollection = async () => {
    if (!sessionToken || addingToCollection) return;
    setAddingToCollection(true);
    try {
      await addToCollectionMutation({
        sessionToken,
        chainId: chain._id,
        source: "web",
      });
      setInCollection(true);
    } catch (err: any) {
      if (err?.message?.includes("already")) {
        setInCollection(true);
      }
    }
    setAddingToCollection(false);
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
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none" />

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
                <span className="px-2 py-1 bg-white/10 border border-[#deff0a]/20 rounded text-xs text-white">
                  {chain.useCase}
                </span>
              )}
              {chain.forkedFrom && (
                <span className="px-2 py-1 bg-white/10 border border-[#deff0a]/20 rounded text-xs text-white">
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
                    className="text-xs px-2.5 py-1 bg-white/10 border border-[#deff0a]/20 rounded-full text-white/80"
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
                    ? "bg-white/10 border-[#deff0a]/30"
                    : "glass-card"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {compatibility.canFullyLoad ? (
                    <CheckCircle className="w-5 h-5 text-white" weight="fill" />
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
                        ? "bg-[#deff0a]"
                        : compatibility.percentage >= 50
                          ? "bg-yellow-400"
                          : "bg-red-400"
                    }`}
                    style={{ width: `${compatibility.percentage}%` }}
                  />
                </div>

                {/* Substitution plan summary */}
                {substitutionPlan && substitutionPlan.missingCount > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    {substitutionPlan.canAutoSubstitute ? (
                      <p className="text-xs text-green-400">
                        All {substitutionPlan.missingCount} missing plugin{substitutionPlan.missingCount > 1 ? "s have" : " has"} viable substitutes ({substitutionPlan.overallConfidence}% avg confidence)
                      </p>
                    ) : (
                      <p className="text-xs text-stone-400">
                        {substitutionPlan.slots.filter((s: any) => s.status === "missing" && s.bestSubstitute).length} of {substitutionPlan.missingCount} missing plugin{substitutionPlan.missingCount > 1 ? "s" : ""} can be swapped ({substitutionPlan.overallConfidence}% avg)
                      </p>
                    )}
                  </div>
                )}
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
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-[#ccff00] text-stone-900 font-semibold rounded-xl transition text-sm disabled:opacity-50 shadow-lg shadow-[#deff0a]/20"
                >
                  <DownloadSimple className="w-4 h-4" />
                  {isDownloading ? "..." : "Download"}
                </button>
              </div>
            )}

            {/* Add to collection */}
            {isAuthenticated && user && !isOwnChain && (
              <button
                onClick={handleAddToCollection}
                disabled={addingToCollection || inCollection}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl transition text-sm border ${
                  inCollection
                    ? "bg-white/10 border-[#deff0a]/30 text-white"
                    : "bg-white/[0.04] hover:bg-white/[0.08] text-stone-200 border-white/[0.06]"
                } disabled:cursor-default`}
              >
                <BookmarkSimple className="w-4 h-4" weight={inCollection ? "fill" : "regular"} />
                {inCollection ? "In Collection" : addingToCollection ? "Adding..." : "Add to Collection"}
              </button>
            )}

            {/* Fork button */}
            {isAuthenticated && (
              <ForkButton
                onFork={handleFork}
                chainName={chain.name}
              />
            )}

            {/* Send to friend */}
            {isAuthenticated && !isOwnChain && (
              <button
                onClick={() => setSendModalOpen(true)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-stone-200 rounded-xl transition text-sm border border-white/[0.06]"
              >
                <UserCirclePlus className="w-4 h-4" />
                Send to Friend
              </button>
            )}

            {/* Share code */}
            <div className="glass-card rounded-xl p-3">
              <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">Share Code</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-lg font-mono text-white tracking-widest">
                  {chain.shareCode}
                </code>
                <button
                  onClick={handleCopyShareCode}
                  className="p-1.5 text-stone-400 hover:text-stone-100 transition"
                  title="Copy share code"
                >
                  {copiedShareCode ? (
                    <Check className="w-4 h-4 text-white" />
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
                substitution={substitutionPlan?.slots?.find(
                  (s: any) => s.slotPosition === slot.position
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

      {/* Send to friend modal */}
      <SendChainModal
        isOpen={sendModalOpen}
        onClose={() => setSendModalOpen(false)}
        preSelectedChainId={chain._id}
        preSelectedChainName={chain.name}
      />
    </div>
  );
}

function SlotRow({
  slot,
  compatibility,
  substitution,
}: {
  slot: any;
  compatibility?: { owned: boolean };
  substitution?: any;
}) {
  const hasMatch = !!slot.pluginData;
  const hasParams = slot.parameters && slot.parameters.length > 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div
        className={`flex items-center gap-4 p-4 rounded-xl border transition ${
          slot.bypassed
            ? "bg-white/[0.02] border-white/[0.03] opacity-60"
            : "glass-card"
        } ${hasParams ? "cursor-pointer" : ""}`}
        onClick={() => hasParams && setExpanded(!expanded)}
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
                className="font-medium text-stone-100 hover:text-white transition truncate"
                onClick={(e) => e.stopPropagation()}
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

        {/* Param count indicator */}
        {hasParams && (
          <span className="text-xs text-stone-500 font-mono shrink-0">
            {slot.parameters.length} params
            <CaretDown
              className={`inline w-3 h-3 ml-1 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </span>
        )}

        {/* Free badge (if matched) */}
        {hasMatch && slot.pluginData.isFree && (
          <div className="text-right shrink-0">
            <span className="text-sm font-medium text-green-400">Free</span>
          </div>
        )}

        {/* Owned indicator */}
        {compatibility !== undefined && (
          <div className="shrink-0">
            {compatibility.owned ? (
              <CheckCircle className="w-5 h-5 text-white" weight="fill" />
            ) : (
              <XCircle className="w-5 h-5 text-stone-600" />
            )}
          </div>
        )}
      </div>

      {/* Substitution suggestion for missing plugins */}
      {substitution?.status === "missing" && substitution.bestSubstitute && (
        <div className="ml-8 mt-1 mb-1 flex items-center gap-2 text-xs">
          <ArrowRight className="w-3.5 h-3.5 text-stone-500 shrink-0" />
          <span className="text-stone-400">Swap with</span>
          <span className="font-medium text-stone-200">
            {substitution.bestSubstitute.pluginName}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded-full font-mono ${
              substitution.bestSubstitute.combinedScore >= 70
                ? "bg-green-500/15 text-green-400"
                : substitution.bestSubstitute.combinedScore >= 50
                  ? "bg-yellow-500/15 text-yellow-400"
                  : "bg-red-500/15 text-red-400"
            }`}
          >
            {substitution.bestSubstitute.combinedScore}%
          </span>
          {substitution.bestSubstitute.hasParameterMap && (
            <span className="text-stone-600">with param translation</span>
          )}
          {substitution.bestSubstitute.reasons && (
            <span className="text-stone-600 truncate max-w-[200px]">
              &middot; {substitution.bestSubstitute.reasons}
            </span>
          )}
        </div>
      )}

      {/* Crowdpool badge for owned slots */}
      {substitution?.status === "owned" && substitution.paramMapInfo?.hasMap && substitution.paramMapInfo.contributorCount > 0 && (
        <div className="ml-8 mt-0.5 mb-1 text-[11px] text-stone-600">
          Map verified by {substitution.paramMapInfo.contributorCount} user{substitution.paramMapInfo.contributorCount > 1 ? "s" : ""}
        </div>
      )}

      {/* Expandable parameter grid */}
      {expanded && hasParams && (
        <div className="ml-8 mt-1 mb-2 p-3 bg-white/[0.02] border border-white/[0.04] rounded-lg">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {slot.parameters.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-stone-400 truncate">{p.name}</span>
                <span className="text-stone-200 font-mono ml-2 shrink-0">{p.value}</span>
              </div>
            ))}
          </div>
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
