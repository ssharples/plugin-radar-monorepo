"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "./auth-provider";
import type { Id } from "@/convex/_generated/dataModel";
import { Heart } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";

interface WishlistButtonProps {
  pluginId: Id<"plugins">;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function WishlistButton({ pluginId, size = "md", showLabel = true }: WishlistButtonProps) {
  const router = useRouter();
  const { user, isAuthenticated, sessionToken } = useAuth();

  const wishlistItem = useQuery(
    api.wishlists.getForPlugin,
    sessionToken ? { sessionToken, plugin: pluginId } : "skip"
  );

  const addToWishlist = useMutation(api.wishlists.add);
  const removeFromWishlist = useMutation(api.wishlists.remove);

  const isInWishlist = !!wishlistItem;

  const handleClick = async () => {
    if (!isAuthenticated || !user) {
      router.push("/account");
      return;
    }

    if (isInWishlist) {
      await removeFromWishlist({ sessionToken: sessionToken!, plugin: pluginId });
    } else {
      await addToWishlist({ sessionToken: sessionToken!, plugin: pluginId });
    }
  };

  const sizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-4 py-3",
    lg: "px-6 py-4 text-lg",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  return (
    <button
      onClick={handleClick}
      className={`${sizeClasses[size]} rounded-xl transition flex items-center gap-2 ${
        isInWishlist
          ? "bg-pink-500/20 text-pink-400 hover:bg-pink-500/30"
          : "bg-stone-800 text-white hover:bg-stone-700"
      }`}
      title={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
    >
      <Heart
        className={iconSizes[size]}
        weight={isInWishlist ? "fill" : "regular"}
      />
      {showLabel && (
        <span className="hidden sm:inline">
          {isInWishlist ? "Saved" : "Wishlist"}
        </span>
      )}
    </button>
  );
}
