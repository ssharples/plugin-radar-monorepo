"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth-provider";
import { UserAvatar } from "@/components/social/UserAvatar";
import { SendChainModal } from "@/components/social/SendChainModal";
import Link from "next/link";
import { useState } from "react";
import {
  Users,
  UserPlus,
  Check,
  X,
  PaperPlaneTilt,
  UserMinus,
  LinkSimple,
  Clock,
  MagnifyingGlass,
  ArrowRight,
} from "@phosphor-icons/react";

type SharedChainTab = "received" | "sent";

export default function FriendsPage() {
  const { isAuthenticated, sessionToken } = useAuth();
  const [sendChainOpen, setSendChainOpen] = useState(false);
  const [sharedTab, setSharedTab] = useState<SharedChainTab>("received");
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);

  const friends = useQuery(
    api.friends.getFriends,
    isAuthenticated && sessionToken ? { sessionToken } : "skip"
  );

  const pendingRequests = useQuery(
    api.friends.getPendingRequests,
    isAuthenticated && sessionToken ? { sessionToken } : "skip"
  );

  const receivedChains = useQuery(
    api.privateChains.getReceivedChains,
    isAuthenticated && sessionToken ? { sessionToken } : "skip"
  );

  const sentChains = useQuery(
    api.privateChains.getSentChains,
    isAuthenticated && sessionToken ? { sessionToken } : "skip"
  );

  const acceptRequest = useMutation(api.friends.acceptFriendRequest);
  const rejectRequest = useMutation(api.friends.rejectFriendRequest);
  const removeFriend = useMutation(api.friends.removeFriend);
  const acceptChain = useMutation(api.privateChains.acceptChain);
  const rejectChain = useMutation(api.privateChains.rejectChain);

  // Unauthenticated state
  if (!isAuthenticated || !sessionToken) {
    return (
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 lg:px-6 py-16 text-center relative">
          <Users className="w-12 h-12 text-stone-600 mx-auto mb-4" />
          <h1
            className="text-2xl font-bold text-stone-100 mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Friends
          </h1>
          <p className="text-stone-400 mb-6">
            Sign in to manage your friends and share chains.
          </p>
          <Link
            href="/account"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#deff0a] hover:bg-[#ccff00] text-stone-900 font-semibold rounded-xl transition shadow-lg shadow-[#deff0a]/20"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  const handleAcceptRequest = async (requestId: any) => {
    await acceptRequest({ sessionToken, requestId });
  };

  const handleRejectRequest = async (requestId: any) => {
    await rejectRequest({ sessionToken, requestId });
  };

  const handleRemoveFriend = async (friendId: any) => {
    setRemovingFriendId(friendId);
    try {
      await removeFriend({ sessionToken, friendId });
    } finally {
      setRemovingFriendId(null);
    }
  };

  const handleAcceptChain = async (shareId: any) => {
    await acceptChain({ sessionToken, shareId });
  };

  const handleRejectChain = async (shareId: any) => {
    await rejectChain({ sessionToken, shareId });
  };

  function timeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-6 py-10 relative">
        <div className="flex items-center justify-between mb-8">
          <h1
            className="text-2xl font-bold text-stone-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Friends
          </h1>
          <Link
            href="/users"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl transition"
          >
            <MagnifyingGlass className="w-4 h-4" />
            Find People
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Column 1: Friend Requests */}
          <div>
            <h2 className="text-sm font-medium text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Friend Requests
              {pendingRequests && pendingRequests.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-bold bg-[#deff0a] text-stone-900 rounded-full">
                  {pendingRequests.length}
                </span>
              )}
            </h2>

            {pendingRequests === undefined ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse h-16 bg-white/[0.03] border border-white/[0.06] rounded-xl"
                  />
                ))}
              </div>
            ) : pendingRequests.length === 0 ? (
              <div className="text-center py-8 glass-card rounded-xl">
                <UserPlus className="w-8 h-8 text-stone-600 mx-auto mb-2" />
                <p className="text-sm text-stone-500">No pending requests</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingRequests.map((request: any) => (
                  <div
                    key={request.requestId}
                    className="flex items-center gap-3 p-3 glass-card rounded-xl"
                  >
                    <UserAvatar name={request.username} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-200 truncate">
                        {request.username}
                      </p>
                      <p className="text-xs text-stone-500">
                        {timeAgo(request.sentAt)}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleAcceptRequest(request.requestId)}
                        className="p-1.5 bg-[#deff0a]/15 hover:bg-[#deff0a]/25 text-[#deff0a] rounded-lg transition"
                        title="Accept"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRejectRequest(request.requestId)}
                        className="p-1.5 bg-white/[0.04] hover:bg-red-500/20 text-stone-400 hover:text-red-400 rounded-lg transition"
                        title="Decline"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column 2: My Friends */}
          <div>
            <h2 className="text-sm font-medium text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Users className="w-4 h-4" />
              My Friends
              {friends && friends.length > 0 && (
                <span className="text-xs text-stone-500">({friends.length})</span>
              )}
            </h2>

            {friends === undefined ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse h-14 bg-white/[0.03] border border-white/[0.06] rounded-xl"
                  />
                ))}
              </div>
            ) : friends.length === 0 ? (
              <div className="text-center py-8 glass-card rounded-xl">
                <Users className="w-8 h-8 text-stone-600 mx-auto mb-2" />
                <p className="text-sm text-stone-500 mb-3">No friends yet</p>
                <Link
                  href="/users"
                  className="text-sm text-[#deff0a] hover:underline"
                >
                  Discover people
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {friends.map((friend: any) => (
                  <div
                    key={friend.userId}
                    className="flex items-center gap-3 p-3 glass-card rounded-xl group"
                  >
                    <Link href={`/profile/${friend.userId}`} className="shrink-0">
                      <UserAvatar name={friend.username} size="sm" />
                    </Link>
                    <Link
                      href={`/profile/${friend.userId}`}
                      className="flex-1 min-w-0 text-sm font-medium text-stone-200 hover:text-white truncate transition"
                    >
                      {friend.username}
                    </Link>
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setSendChainOpen(true)}
                        className="p-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-stone-400 hover:text-stone-200 rounded-lg transition"
                        title="Send chain"
                      >
                        <PaperPlaneTilt className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveFriend(friend.userId)}
                        disabled={removingFriendId === friend.userId}
                        className="p-1.5 bg-white/[0.04] hover:bg-red-500/20 text-stone-400 hover:text-red-400 rounded-lg transition"
                        title="Remove friend"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column 3: Shared Chains */}
          <div>
            <h2 className="text-sm font-medium text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <LinkSimple className="w-4 h-4" />
              Shared Chains
            </h2>

            {/* Sub-tabs */}
            <div className="flex gap-1 mb-4 bg-white/[0.04] rounded-lg p-0.5">
              <button
                onClick={() => setSharedTab("received")}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                  sharedTab === "received"
                    ? "bg-white/[0.1] text-white"
                    : "text-stone-500 hover:text-stone-300"
                }`}
              >
                Received
                {receivedChains && receivedChains.length > 0 && (
                  <span className="ml-1 px-1 py-0.5 text-[10px] font-bold bg-[#deff0a] text-stone-900 rounded-full">
                    {receivedChains.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setSharedTab("sent")}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                  sharedTab === "sent"
                    ? "bg-white/[0.1] text-white"
                    : "text-stone-500 hover:text-stone-300"
                }`}
              >
                Sent
              </button>
            </div>

            {sharedTab === "received" && (
              <>
                {receivedChains === undefined ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div
                        key={i}
                        className="animate-pulse h-16 bg-white/[0.03] border border-white/[0.06] rounded-xl"
                      />
                    ))}
                  </div>
                ) : receivedChains.length === 0 ? (
                  <div className="text-center py-8 glass-card rounded-xl">
                    <PaperPlaneTilt className="w-8 h-8 text-stone-600 mx-auto mb-2" />
                    <p className="text-sm text-stone-500">No received chains</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {receivedChains.map((share: any) => (
                      <div
                        key={share._id}
                        className="p-3 glass-card rounded-xl"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <LinkSimple className="w-4 h-4 text-stone-500" />
                          <span className="text-sm font-medium text-stone-200 truncate">
                            {share.chainName}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-stone-500">
                            from {share.senderUsername} &middot;{" "}
                            {timeAgo(share.sentAt)}
                          </span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleAcceptChain(share._id)}
                              className="px-2.5 py-1 text-xs font-medium bg-[#deff0a]/15 hover:bg-[#deff0a]/25 text-[#deff0a] rounded-lg transition"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleRejectChain(share._id)}
                              className="px-2.5 py-1 text-xs font-medium bg-white/[0.04] hover:bg-red-500/20 text-stone-400 hover:text-red-400 rounded-lg transition"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                        <p className="text-[11px] text-stone-600 mt-1.5">
                          Open ProChain desktop to load this chain
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {sharedTab === "sent" && (
              <>
                {sentChains === undefined ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div
                        key={i}
                        className="animate-pulse h-14 bg-white/[0.03] border border-white/[0.06] rounded-xl"
                      />
                    ))}
                  </div>
                ) : sentChains.length === 0 ? (
                  <div className="text-center py-8 glass-card rounded-xl">
                    <PaperPlaneTilt className="w-8 h-8 text-stone-600 mx-auto mb-2" />
                    <p className="text-sm text-stone-500">No sent chains</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sentChains.map((share: any) => (
                      <div
                        key={share._id}
                        className="flex items-center gap-3 p-3 glass-card rounded-xl"
                      >
                        <LinkSimple className="w-4 h-4 text-stone-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-200 truncate">
                            {share.chainName}
                          </p>
                          <p className="text-xs text-stone-500">
                            to {share.recipientUsername} &middot;{" "}
                            {timeAgo(share.sentAt)}
                          </p>
                        </div>
                        <StatusBadge status={share.status} />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <SendChainModal isOpen={sendChainOpen} onClose={() => setSendChainOpen(false)} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return (
        <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/15 text-yellow-400 rounded-full">
          Pending
        </span>
      );
    case "imported":
      return (
        <span className="px-2 py-0.5 text-xs font-medium bg-green-500/15 text-green-400 rounded-full">
          Accepted
        </span>
      );
    case "rejected":
      return (
        <span className="px-2 py-0.5 text-xs font-medium bg-red-500/15 text-red-400 rounded-full">
          Rejected
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 text-xs font-medium bg-stone-700 text-stone-400 rounded-full">
          {status}
        </span>
      );
  }
}
