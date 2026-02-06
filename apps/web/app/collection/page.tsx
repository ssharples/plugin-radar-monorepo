"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth-provider";
import Link from "next/link";
import { Package, Trash, ArrowRight, PiggyBank, Waveform } from "@phosphor-icons/react";

export default function CollectionPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const collection = useQuery(
    api.ownedPlugins.listByUser,
    user ? { user: user._id } : "skip"
  );
  const totalValue = useQuery(
    api.ownedPlugins.totalValue,
    user ? { user: user._id } : "skip"
  );
  const removeFromCollection = useMutation(api.ownedPlugins.remove);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] via-transparent to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 lg:px-6 py-16 text-center relative">
          <div className="w-16 h-16 bg-white/[0.04] border border-white/[0.06] rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-stone-500" />
          </div>
          <h1
            className="text-2xl font-bold text-stone-100 mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            My Collection
          </h1>
          <p className="text-stone-400 mb-6">Sign in to track your plugin collection</p>
          <Link
            href="/account"
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-stone-900 font-semibold rounded-xl transition shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
          >
            Sign In
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-6 py-10 relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-wider mb-3">Your Plugins</p>
            <h1
              className="text-2xl font-bold text-stone-100"
              style={{ fontFamily: "var(--font-display)" }}
            >
              My Collection
            </h1>
            <p className="text-stone-400">
              {collection?.length || 0} plugin{collection?.length !== 1 ? "s" : ""} owned
            </p>
          </div>

          {/* Value Stats */}
          {totalValue && totalValue.msrpTotal > 0 && (
            <div className="flex gap-4 glass-card rounded-xl p-4">
              <div className="text-center">
                <p className="text-xs text-stone-500 uppercase tracking-wider">MSRP Value</p>
                <p className="text-stone-100 font-semibold">
                  ${(totalValue.msrpTotal / 100).toLocaleString()}
                </p>
              </div>
              <div className="text-center border-l border-white/[0.06] pl-4">
                <p className="text-xs text-stone-500 uppercase tracking-wider">You Paid</p>
                <p className="text-stone-100 font-semibold">
                  ${(totalValue.paidTotal / 100).toLocaleString()}
                </p>
              </div>
              {totalValue.saved > 0 && (
                <div className="text-center border-l border-white/[0.06] pl-4">
                  <p className="text-xs text-stone-500 uppercase tracking-wider">You Saved</p>
                  <p className="text-amber-400 font-semibold flex items-center gap-1">
                    <PiggyBank className="w-4 h-4" />
                    ${(totalValue.saved / 100).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="section-line mb-8" />

        {collection && collection.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {collection.map((item) => {
              const plugin = item.pluginData;
              const manufacturer = item.manufacturerData;

              if (!plugin) return null;

              return (
                <div
                  key={item._id}
                  className="glass-card rounded-xl overflow-hidden group"
                >
                  {/* Plugin Image */}
                  <Link href={`/plugins/${plugin.slug}`}>
                    <div className="aspect-video relative bg-white/[0.02]">
                      {plugin.imageUrl ? (
                        <img
                          src={plugin.imageUrl}
                          alt={plugin.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Waveform className="w-10 h-10 text-stone-600" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <span className="px-2 py-1 bg-amber-500/90 text-stone-900 text-xs font-semibold rounded">
                          Owned
                        </span>
                      </div>
                    </div>
                  </Link>

                  {/* Plugin Info */}
                  <div className="p-4">
                    <Link
                      href={`/plugins/${plugin.slug}`}
                      className="font-medium text-stone-100 hover:text-amber-400 transition block truncate"
                    >
                      {plugin.name}
                    </Link>
                    <p className="text-stone-500 text-sm truncate">
                      {manufacturer?.name || "Unknown"}
                    </p>

                    {/* Purchase Info */}
                    <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between text-sm">
                      <div>
                        {item.purchasePrice ? (
                          <span className="text-stone-100">
                            ${(item.purchasePrice / 100).toFixed(0)}
                          </span>
                        ) : plugin.isFree ? (
                          <span className="text-green-400">Free</span>
                        ) : (
                          <span className="text-stone-500">&mdash;</span>
                        )}
                        {item.purchaseDate && (
                          <span className="text-stone-500 ml-2">
                            {new Date(item.purchaseDate).toLocaleDateString("en-US", {
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() =>
                          user &&
                          removeFromCollection({ user: user._id, plugin: plugin._id })
                        }
                        className="p-1 text-stone-500 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                        title="Remove from collection"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 glass-card rounded-xl">
            <Package className="w-16 h-16 mx-auto mb-4 text-stone-600" />
            <h3 className="text-xl font-semibold text-stone-100 mb-2">
              Your collection is empty
            </h3>
            <p className="text-stone-400 mb-6">
              Mark plugins you own to keep track of your collection
            </p>
            <Link
              href="/plugins"
              className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-stone-900 font-semibold rounded-xl transition shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
            >
              Browse Plugins
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
