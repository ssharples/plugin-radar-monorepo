"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "./auth-provider";
import type { Id } from "@/convex/_generated/dataModel";
import { CheckCircle, Package } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";

interface OwnButtonProps {
  pluginId: Id<"plugins">;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function OwnButton({ pluginId, size = "md", showLabel = true }: OwnButtonProps) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  const ownedPlugin = useQuery(
    api.ownedPlugins.getForPlugin,
    user ? { user: user._id, plugin: pluginId } : "skip"
  );

  const addToCollection = useMutation(api.ownedPlugins.add);
  const removeFromCollection = useMutation(api.ownedPlugins.remove);

  const isOwned = !!ownedPlugin;

  const handleClick = async () => {
    if (!isAuthenticated || !user) {
      router.push("/account");
      return;
    }

    if (isOwned) {
      await removeFromCollection({ user: user._id, plugin: pluginId });
    } else {
      await addToCollection({ user: user._id, plugin: pluginId });
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
        isOwned
          ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
          : "bg-stone-800 text-white hover:bg-stone-700"
      }`}
      title={isOwned ? "Remove from collection" : "Mark as owned"}
    >
      {isOwned ? (
        <CheckCircle className={iconSizes[size]} weight="fill" />
      ) : (
        <Package className={iconSizes[size]} />
      )}
      {showLabel && (
        <span className="hidden sm:inline">{isOwned ? "Owned" : "I Own This"}</span>
      )}
    </button>
  );
}
