"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/auth-provider";
import { UserAvatar } from "@/components/social/UserAvatar";
import { FollowButton } from "@/components/social/FollowButton";
import { FriendButton } from "@/components/social/FriendButton";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  LinkSimple,
  Heart,
  DownloadSimple,
  Eye,
  Users,
  User,
  Cpu,
  LockKey,
  Intersect,
} from "@phosphor-icons/react";

type Tab = "chains" | "library" | "stats" | "followers" | "following" | "common";

export default function ProfilePage() {
  const params = useParams();
  const userId = params.userId as Id<"users">;
  const { user: currentUser, isAuthenticated, sessionToken } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("chains");

  const profileUser = useQuery(api.users.get, { id: userId });
  const stats = useQuery(api.pluginDirectory.getUserStats, { userId });
  const isFollowingUser = useQuery(
    api.social.isFollowing,
    isAuthenticated && sessionToken && currentUser?._id !== userId
      ? { sessionToken, userId }
      : "skip"
  );

  const friendshipStatus = useQuery(
    api.friends.getFriendshipStatus,
    isAuthenticated && sessionToken && currentUser?._id !== userId
      ? { sessionToken, targetUserId: userId }
      : "skip"
  );

  const followMutation = useMutation(api.social.followUser);
  const unfollowMutation = useMutation(api.social.unfollowUser);

  const handleFollow = async () => {
    if (!sessionToken) return;
    await followMutation({ sessionToken, userId });
  };

  const handleUnfollow = async () => {
    if (!sessionToken) return;
    await unfollowMutation({ sessionToken, userId });
  };

  // Loading state
  if (profileUser === undefined) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#deff0a] border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  // User not found
  if (profileUser === null) {
    return (
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 lg:px-6 py-16 text-center relative">
          <User className="w-12 h-12 text-stone-600 mx-auto mb-4" />
          <h1
            className="text-2xl font-bold text-stone-100 mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            User not found
          </h1>
          <p className="text-stone-400">
            This user doesn&apos;t exist or their profile is unavailable.
          </p>
        </div>
      </div>
    );
  }

  const isOwnProfile = currentUser?._id === userId;

  const tabs: { key: Tab; label: string }[] = [
    { key: "chains", label: "Chains" },
    { key: "library", label: "Plugins" },
    ...(isAuthenticated && !isOwnProfile
      ? [{ key: "common" as const, label: "In Common" }]
      : []),
    { key: "stats", label: "Stats" },
    { key: "followers", label: "Followers" },
    { key: "following", label: "Following" },
  ];

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-6 py-10 relative">
        {/* Profile Header */}
        <div className="glass-card rounded-xl p-6 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
            <UserAvatar
              name={profileUser.name}
              avatarUrl={profileUser.avatarUrl}
              size="lg"
            />
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1
                  className="text-2xl font-bold text-stone-100"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {profileUser.name || "Anonymous"}
                </h1>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${profileUser.tier === "premium"
                    ? "bg-white text-black"
                    : "bg-stone-700 text-stone-300"
                    }`}
                >
                  {profileUser.tier === "premium" ? "Premium" : "Free"}
                </span>
              </div>
              <p className="text-stone-400 text-sm">
                Member since{" "}
                {new Date(profileUser.createdAt ?? Date.now()).toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            {isAuthenticated && !isOwnProfile && (
              <div className="flex gap-2">
                {isFollowingUser !== undefined && (
                  <FollowButton
                    isFollowing={isFollowingUser}
                    onFollow={handleFollow}
                    onUnfollow={handleUnfollow}
                    loading={isFollowingUser === undefined}
                  />
                )}
                {friendshipStatus && sessionToken && (
                  <FriendButton
                    friendshipStatus={friendshipStatus}
                    targetUserId={userId}
                    sessionToken={sessionToken}
                  />
                )}
              </div>
            )}
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-6 text-sm">
            <div className="text-center">
              <div className="text-lg font-semibold text-stone-100">
                {stats?.chainCount ?? 0}
              </div>
              <div className="text-stone-400">Chains</div>
            </div>
            <div className="w-px h-8 bg-white/[0.06]" />
            <div className="text-center">
              <div className="text-lg font-semibold text-stone-100">
                {stats?.totalDownloads ?? 0}
              </div>
              <div className="text-stone-400">Downloads</div>
            </div>
            <div className="w-px h-8 bg-white/[0.06]" />
            <div className="text-center">
              <div className="text-lg font-semibold text-stone-100">
                {stats?.totalLikes ?? 0}
              </div>
              <div className="text-stone-400">Likes</div>
            </div>
            <div className="w-px h-8 bg-white/[0.06]" />
            <div className="text-center">
              <div className="text-lg font-semibold text-stone-100">
                {stats?.followerCount ?? 0}
              </div>
              <div className="text-stone-400">Followers</div>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-4 border-b border-white/[0.06] mb-8 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium transition whitespace-nowrap ${activeTab === tab.key
                ? "text-[#deff0a] border-b-2 border-[#deff0a]"
                : "text-stone-400 hover:text-stone-200"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "chains" && (
          <ChainsTab userId={userId} sessionToken={sessionToken} />
        )}
        {activeTab === "library" && <LibraryTab userId={userId} sessionToken={sessionToken} />}
        {activeTab === "common" && <CommonPluginsTab userId={userId} sessionToken={sessionToken} />}
        {activeTab === "stats" && <StatsTab userId={userId} sessionToken={sessionToken} />}
        {activeTab === "followers" && <FollowersTab userId={userId} />}
        {activeTab === "following" && <FollowingTab userId={userId} />}
      </div>
    </div>
  );
}

// ============================================
// Chains Tab
// ============================================

function ChainsTab({
  userId,
  sessionToken,
}: {
  userId: Id<"users">;
  sessionToken: string | null;
}) {
  const chains = useQuery(api.pluginDirectory.getChainsByUser, {
    userId,
    sessionToken: sessionToken ?? undefined,
  });

  if (chains === undefined) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse bg-white/[0.03] border border-white/[0.06] rounded-xl p-5"
          >
            <div className="h-5 bg-white/[0.04] rounded w-3/4 mb-3" />
            <div className="h-4 bg-white/[0.04] rounded w-1/2 mb-4" />
            <div className="flex gap-2 mb-4">
              <div className="h-6 bg-white/[0.04] rounded w-16" />
            </div>
            <div className="h-4 bg-white/[0.04] rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (chains.length === 0) {
    return (
      <div className="text-center py-16">
        <LinkSimple className="w-12 h-12 text-stone-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-stone-100 mb-2">
          No chains shared yet
        </h3>
        <p className="text-stone-400">
          This user hasn&apos;t shared any plugin chains.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {chains.map((chain: any) => (
        <Link
          key={chain._id}
          href={`/chains/${chain.slug}`}
          className="block glass-card rounded-xl p-5 hover:border-[#deff0a]/30 transition group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-xs text-stone-400 capitalize">
              {chain.category}
            </span>
            <span className="text-xs text-stone-500">
              {chain.pluginCount} plugin{chain.pluginCount !== 1 ? "s" : ""}
            </span>
          </div>

          <h3 className="font-semibold text-stone-100 group-hover:text-white transition truncate mb-3">
            {chain.name}
          </h3>

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
      ))}
    </div>
  );
}

// ============================================
// Followers Tab
// ============================================

function FollowersTab({ userId }: { userId: Id<"users"> }) {
  const followers = useQuery(api.social.getFollowers, { userId });

  if (followers === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse flex items-center gap-3 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl"
          >
            <div className="w-8 h-8 bg-white/[0.04] rounded-full" />
            <div className="h-4 bg-white/[0.04] rounded w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (followers.length === 0) {
    return (
      <div className="text-center py-16">
        <Users className="w-12 h-12 text-stone-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-stone-100 mb-2">
          No followers yet
        </h3>
        <p className="text-stone-400">
          This user doesn&apos;t have any followers yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {followers.filter(Boolean).map((follower: any) => (
        <Link
          key={follower!._id}
          href={`/profile/${follower!._id}`}
          className="flex items-center gap-3 p-3 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl transition border border-transparent hover:border-white/[0.06]"
        >
          <UserAvatar
            name={follower!.name}
            avatarUrl={follower!.avatarUrl}
            size="sm"
          />
          <span className="text-stone-200 font-medium">
            {follower!.name || "User"}
          </span>
        </Link>
      ))}
    </div>
  );
}

// ============================================
// Following Tab
// ============================================

function FollowingTab({ userId }: { userId: Id<"users"> }) {
  const following = useQuery(api.social.getFollowing, { userId });

  if (following === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse flex items-center gap-3 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl"
          >
            <div className="w-8 h-8 bg-white/[0.04] rounded-full" />
            <div className="h-4 bg-white/[0.04] rounded w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (following.length === 0) {
    return (
      <div className="text-center py-16">
        <Users className="w-12 h-12 text-stone-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-stone-100 mb-2">
          Not following anyone yet
        </h3>
        <p className="text-stone-400">
          This user isn&apos;t following anyone yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {following.filter(Boolean).map((user: any) => (
        <Link
          key={user!._id}
          href={`/profile/${user!._id}`}
          className="flex items-center gap-3 p-3 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl transition border border-transparent hover:border-white/[0.06]"
        >
          <UserAvatar
            name={user!.name}
            avatarUrl={user!.avatarUrl}
            size="sm"
          />
          <span className="text-stone-200 font-medium">
            {user!.name || "User"}
          </span>
        </Link>
      ))}
    </div>
  );
}

// ============================================
// Library Tab
// ============================================

function LibraryTab({
  userId,
  sessionToken,
}: {
  userId: Id<"users">;
  sessionToken: string | null;
}) {
  const ownedPlugins = useQuery(api.userProfiles.getProfileOwnedPlugins, {
    userId,
    sessionToken: sessionToken ?? undefined,
  });

  if (ownedPlugins === undefined) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
            <div className="w-12 h-12 bg-white/[0.04] rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-white/[0.04] rounded w-32" />
              <div className="h-3 bg-white/[0.04] rounded w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Handle Private State
  if (ownedPlugins === null) {
    return (
      <div className="text-center py-16">
        <LockKey className="w-12 h-12 text-stone-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-stone-100 mb-2">Private Library</h3>
        <p className="text-stone-400">This user has chosen not to display their owned plugins.</p>
      </div>
    );
  }

  if (ownedPlugins.length === 0) {
    return (
      <div className="text-center py-16">
        <Cpu className="w-12 h-12 text-stone-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-stone-100 mb-2">No plugins to display</h3>
        <p className="text-stone-400">This user hasn&apos;t synced any plugins yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {ownedPlugins.map((item) => (
        <Link
          key={item._id}
          href={`/plugins/${item.pluginData?.slug}`}
          className="flex items-center gap-4 p-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.1] rounded-xl transition group"
        >
          {item.pluginData?.imageUrl ? (
            <img
              src={item.pluginData.imageUrl}
              alt={item.pluginData.name}
              className="w-12 h-12 object-cover rounded-lg group-hover:scale-105 transition duration-300 pointer-events-none"
            />
          ) : (
            <div className="w-12 h-12 bg-white/[0.05] rounded-lg flex items-center justify-center">
              <Cpu className="w-6 h-6 text-stone-500" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-stone-100 font-semibold group-hover:text-[#deff0a] transition truncate">
              {item.pluginData?.name}
            </h3>
            <p className="text-stone-500 text-sm truncate">
              {item.pluginData?.manufacturer || "Unknown"}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ============================================
// Common Plugins Tab
// ============================================

function CommonPluginsTab({
  userId,
  sessionToken,
}: {
  userId: Id<"users">;
  sessionToken: string | null;
}) {
  const commonData = useQuery(
    api.userProfiles.getCommonPlugins,
    sessionToken ? { sessionToken, targetUserId: userId } : "skip"
  );

  if (commonData === undefined) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
            <div className="w-12 h-12 bg-white/[0.04] rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-white/[0.04] rounded w-32" />
              <div className="h-3 bg-white/[0.04] rounded w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (commonData === null) {
    return null;
  }

  if ("private" in commonData && commonData.private) {
    return (
      <div className="text-center py-16">
        <LockKey className="w-12 h-12 text-stone-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-stone-100 mb-2">Private Library</h3>
        <p className="text-stone-400">This user has chosen not to display their owned plugins.</p>
      </div>
    );
  }

  const plugins = "commonPlugins" in commonData ? commonData.commonPlugins : [];
  const theirTotal = "theirTotal" in commonData ? commonData.theirTotal : 0;

  if (plugins.length === 0) {
    return (
      <div className="text-center py-16">
        <Intersect className="w-12 h-12 text-stone-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-stone-100 mb-2">No plugins in common</h3>
        <p className="text-stone-400">You don&apos;t share any plugins with this user yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="glass-card rounded-xl p-4 mb-6">
        <p className="text-sm text-stone-300">
          <span className="text-[#deff0a] font-semibold">{plugins.length}</span> plugins in common
          out of <span className="font-medium text-stone-200">{theirTotal}</span> in their library
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plugins.map((plugin: any) => (
          <Link
            key={plugin.pluginId}
            href={`/plugins/${plugin.slug}`}
            className="flex items-center gap-4 p-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.1] rounded-xl transition group"
          >
            {plugin.imageUrl ? (
              <img
                src={plugin.imageUrl}
                alt={plugin.name}
                className="w-12 h-12 object-cover rounded-lg group-hover:scale-105 transition duration-300 pointer-events-none"
              />
            ) : (
              <div className="w-12 h-12 bg-white/[0.05] rounded-lg flex items-center justify-center">
                <Cpu className="w-6 h-6 text-stone-500" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="text-stone-100 font-semibold group-hover:text-[#deff0a] transition truncate">
                {plugin.name}
              </h3>
              <p className="text-stone-500 text-sm truncate">
                {plugin.manufacturer || "Unknown"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Stats Tab
// ============================================

function StatsTab({
  userId,
  sessionToken,
}: {
  userId: Id<"users">;
  sessionToken: string | null;
}) {
  const topPlugins = useQuery(api.userProfiles.getProfileTopPlugins, {
    userId,
    sessionToken: sessionToken ?? undefined,
    limit: 10,
  });

  if (topPlugins === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex justify-between items-center">
            <div className="space-y-2">
              <div className="h-4 bg-white/[0.04] rounded w-40" />
              <div className="h-3 bg-white/[0.04] rounded w-24" />
            </div>
            <div className="h-6 bg-white/[0.04] rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  // Handle Private State
  if (topPlugins === null) {
    return (
      <div className="text-center py-16">
        <LockKey className="w-12 h-12 text-stone-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-stone-100 mb-2">Private Stats</h3>
        <p className="text-stone-400">This user has chosen not to display their plugin statistics.</p>
      </div>
    );
  }

  if (topPlugins.length === 0) {
    return (
      <div className="text-center py-16">
        <Cpu className="w-12 h-12 text-stone-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-stone-100 mb-2">No usage data</h3>
        <p className="text-stone-400">This user hasn&apos;t generated any plugin usage stats yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {topPlugins.map((stat, idx) => (
        <div
          key={stat._id}
          className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/[0.05] rounded-xl"
        >
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-white/[0.05] flex items-center justify-center font-mono text-sm text-stone-400 font-bold border border-white/[0.06]">
              #{idx + 1}
            </div>
            <div>
              <h3 className="text-stone-100 font-semibold">{stat.pluginName}</h3>
              <p className="text-stone-500 text-sm">
                {stat.manufacturer} {stat.category ? `• ${stat.category}` : ""}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[#deff0a] font-bold font-mono text-lg">{stat.loadCount}</div>
            <div className="text-stone-500 text-[10px] sm:text-xs uppercase tracking-wider">Loads</div>
          </div>
        </div>
      ))}
    </div>
  );
}
