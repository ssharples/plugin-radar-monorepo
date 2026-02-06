"use client";

import { useState } from "react";

interface FollowButtonProps {
  isFollowing: boolean;
  onFollow: () => Promise<void>;
  onUnfollow: () => Promise<void>;
  loading?: boolean;
}

export function FollowButton({
  isFollowing,
  onFollow,
  onUnfollow,
  loading,
}: FollowButtonProps) {
  const [hovering, setHovering] = useState(false);
  const [acting, setActing] = useState(false);

  const busy = loading || acting;

  const handleClick = async () => {
    if (busy) return;
    setActing(true);
    try {
      if (isFollowing) {
        await onUnfollow();
      } else {
        await onFollow();
      }
    } finally {
      setActing(false);
    }
  };

  if (busy) {
    return (
      <button
        disabled
        className="px-4 py-2 text-sm font-medium rounded-xl bg-stone-800 text-stone-500 border border-stone-700 opacity-60 cursor-not-allowed"
      >
        ...
      </button>
    );
  }

  if (!isFollowing) {
    return (
      <button
        onClick={handleClick}
        className="px-4 py-2 text-sm font-semibold rounded-xl bg-amber-500 hover:bg-amber-400 text-white transition-colors shadow-lg shadow-amber-500/20"
      >
        Follow
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={`px-4 py-2 text-sm font-medium rounded-xl border transition-colors ${
        hovering
          ? "bg-red-500/20 text-red-400 border-red-500/30"
          : "bg-stone-800 text-stone-300 border-stone-600"
      }`}
    >
      {hovering ? "Unfollow" : "Following"}
    </button>
  );
}
