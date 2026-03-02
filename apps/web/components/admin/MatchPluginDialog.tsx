"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth-provider";
import { Id } from "@/convex/_generated/dataModel";
import { MagnifyingGlass, Check, X, Spinner } from "@phosphor-icons/react";

export function MatchPluginDialog({
  queueItemId,
  pluginName,
  manufacturer,
  onClose,
  onResolved,
}: {
  queueItemId: Id<"enrichmentQueue">;
  pluginName: string;
  manufacturer: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const { sessionToken } = useAuth();
  const [searchQuery, setSearchQuery] = useState(pluginName);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchResults = useQuery(
    api.plugins.search,
    searchQuery.trim().length >= 2 ? { query: searchQuery.trim() } : "skip"
  );

  const resolveUnmatched = useMutation(api.pluginDirectory.resolveUnmatchedPlugin);

  async function handleMatch(pluginId: Id<"plugins">) {
    if (!sessionToken || resolving) return;
    setResolving(true);
    setError(null);
    try {
      await resolveUnmatched({ sessionToken, queueItemId, pluginId });
      onResolved();
    } catch (e: any) {
      setError(e.message || "Failed to resolve");
      setResolving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg bg-neutral-900 border border-white/[0.08] rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-stone-100">
              Match Plugin
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              {pluginName} — {manufacturer}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-stone-400 hover:text-stone-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-white/[0.06]">
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search catalog plugins..."
              autoFocus
              className="w-full pl-9 pr-3 py-2 text-sm bg-white/[0.04] border border-white/[0.08] rounded-lg text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-[#deff0a]/30"
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {searchResults === undefined && searchQuery.trim().length >= 2 && (
            <div className="px-5 py-8 text-center">
              <Spinner className="w-5 h-5 text-stone-500 animate-spin mx-auto" />
            </div>
          )}

          {searchResults && searchResults.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-stone-500">
              No plugins found for &ldquo;{searchQuery}&rdquo;
            </div>
          )}

          {searchResults &&
            searchResults.map((plugin) => (
              <div
                key={plugin._id}
                className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.03] border-b border-white/[0.04] last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-200 truncate">
                    {plugin.name}
                  </p>
                  <p className="text-xs text-stone-500 truncate">
                    {plugin.category} &middot;{" "}
                    {plugin.ownerCount
                      ? `${plugin.ownerCount} owners`
                      : "No owners yet"}
                  </p>
                </div>
                <button
                  onClick={() => handleMatch(plugin._id)}
                  disabled={resolving}
                  className="ml-3 shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#deff0a]/10 text-[#deff0a] rounded-lg hover:bg-[#deff0a]/20 disabled:opacity-50 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  Match
                </button>
              </div>
            ))}

          {searchQuery.trim().length < 2 && (
            <div className="px-5 py-8 text-center text-sm text-stone-500">
              Type at least 2 characters to search
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 py-3 border-t border-white/[0.06]">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-stone-400 hover:text-stone-200 bg-white/[0.04] hover:bg-white/[0.08] rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
