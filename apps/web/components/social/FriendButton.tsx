"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface FriendshipStatus {
  status: "self" | "none" | "pending" | "accepted" | "blocked";
  direction?: "outgoing" | "incoming";
  requestId?: Id<"friends">;
}

interface FriendButtonProps {
  friendshipStatus: FriendshipStatus;
  targetUserId: Id<"users">;
  sessionToken: string;
}

export function FriendButton({
  friendshipStatus,
  targetUserId,
  sessionToken,
}: FriendButtonProps) {
  const [hovering, setHovering] = useState(false);
  const [acting, setActing] = useState(false);

  const sendRequest = useMutation(api.friends.sendFriendRequest);
  const acceptRequest = useMutation(api.friends.acceptFriendRequest);
  const rejectRequest = useMutation(api.friends.rejectFriendRequest);
  const removeFriend = useMutation(api.friends.removeFriend);

  if (friendshipStatus.status === "self" || friendshipStatus.status === "blocked") {
    return null;
  }

  const handleAction = async (action: () => Promise<any>) => {
    if (acting) return;
    setActing(true);
    try {
      await action();
    } finally {
      setActing(false);
    }
  };

  if (acting) {
    return (
      <button
        disabled
        className="px-4 py-2 text-sm font-medium rounded-xl bg-stone-800 text-stone-500 border border-stone-700 opacity-60 cursor-not-allowed"
      >
        ...
      </button>
    );
  }

  // No relationship — show "Add Friend"
  if (friendshipStatus.status === "none") {
    return (
      <button
        onClick={() =>
          handleAction(() =>
            sendRequest({ sessionToken, friendId: targetUserId })
          )
        }
        className="px-4 py-2 text-sm font-semibold rounded-xl bg-[#deff0a] hover:bg-[#ccff00] text-stone-900 transition-colors shadow-lg shadow-[#deff0a]/20"
      >
        Add Friend
      </button>
    );
  }

  // Pending outgoing — show "Request Sent"
  if (friendshipStatus.status === "pending" && friendshipStatus.direction === "outgoing") {
    return (
      <button
        disabled
        className="px-4 py-2 text-sm font-medium rounded-xl bg-stone-800 text-stone-400 border border-stone-700 cursor-default"
      >
        Request Sent
      </button>
    );
  }

  // Pending incoming — show Accept / Decline
  if (friendshipStatus.status === "pending" && friendshipStatus.direction === "incoming") {
    return (
      <div className="flex gap-2">
        <button
          onClick={() =>
            handleAction(() =>
              acceptRequest({
                sessionToken,
                requestId: friendshipStatus.requestId!,
              })
            )
          }
          className="px-4 py-2 text-sm font-semibold rounded-xl bg-[#deff0a] hover:bg-[#ccff00] text-stone-900 transition-colors shadow-lg shadow-[#deff0a]/20"
        >
          Accept
        </button>
        <button
          onClick={() =>
            handleAction(() =>
              rejectRequest({
                sessionToken,
                requestId: friendshipStatus.requestId!,
              })
            )
          }
          className="px-4 py-2 text-sm font-medium rounded-xl bg-stone-800 hover:bg-red-500/20 text-stone-300 hover:text-red-400 border border-stone-700 hover:border-red-500/30 transition-colors"
        >
          Decline
        </button>
      </div>
    );
  }

  // Accepted — show "Friends" → hover "Remove"
  if (friendshipStatus.status === "accepted") {
    return (
      <button
        onClick={() =>
          handleAction(() =>
            removeFriend({ sessionToken, friendId: targetUserId })
          )
        }
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={`px-4 py-2 text-sm font-medium rounded-xl border transition-colors ${
          hovering
            ? "bg-red-500/20 text-red-400 border-red-500/30"
            : "bg-stone-800 text-stone-300 border-stone-600"
        }`}
      >
        {hovering ? "Remove" : "Friends"}
      </button>
    );
  }

  return null;
}
