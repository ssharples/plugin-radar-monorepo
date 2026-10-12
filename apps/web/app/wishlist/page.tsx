"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth-provider";
import Link from "next/link";
import { Heart, Trash, Tag, ArrowRight, Waveform } from "@phosphor-icons/react";

export default function WishlistPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const wishlist = useQuery(
    api.wishlists.listByUser,
    user ? { user: user._id } : "skip"
  );
  const removeFromWishlist = useMutation(api.wishlists.remove);

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
            <Heart className="w-8 h-8 text-stone-500" />
          </div>
          <h1
            className="text-2xl font-bold text-stone-100 mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Your Wishlist
          </h1>
          <p className="text-stone-400 mb-6">Sign in to save plugins and track prices</p>
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-wider mb-3">Your Favorites</p>
            <h1
              className="text-2xl font-bold text-stone-100"
              style={{ fontFamily: "var(--font-display)" }}
            >
              My Wishlist
            </h1>
            <p className="text-stone-400">
              {wishlist?.length || 0} plugin{wishlist?.length !== 1 ? "s" : ""} saved
            </p>
          </div>
        </div>

        <div className="section-line mb-8" />

        {wishlist && wishlist.length > 0 ? (
          <div className="space-y-4">
            {wishlist.map((item) => {
              const plugin = item.pluginData;
              const manufacturer = item.manufacturerData;
              const sale = item.activeSale;

              if (!plugin) return null;

              const currentPrice = sale
                ? sale.salePrice
                : plugin.currentPrice ?? plugin.msrp;

              const targetReached =
                item.targetPrice && currentPrice && currentPrice <= item.targetPrice;

              return (
                <div
                  key={item._id}
                  className={`glass-card rounded-xl p-4 flex gap-4 ${
                    targetReached
                      ? "!border-amber-500/40"
                      : sale
                      ? "!border-red-500/20"
                      : ""
                  }`}
                >
                  {/* Plugin Image */}
                  <Link href={`/plugins/${plugin.slug}`} className="shrink-0">
                    <div className="w-24 h-16 rounded-lg overflow-hidden bg-white/[0.04]">
                      {plugin.imageUrl ? (
                        <img
                          src={plugin.imageUrl}
                          alt={plugin.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Waveform className="w-6 h-6 text-stone-600" />
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Plugin Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/plugins/${plugin.slug}`}
                          className="font-medium text-stone-100 hover:text-amber-400 transition"
                        >
                          {plugin.name}
                        </Link>
                        <p className="text-stone-500 text-sm">
                          {manufacturer?.name || "Unknown"}
                        </p>
                      </div>

                      {/* Price */}
                      <div className="text-right shrink-0">
                        {plugin.isFree ? (
                          <span className="price-tag-free text-xs px-2 py-1 rounded">Free</span>
                        ) : sale ? (
                          <div>
                            <span className="text-amber-400 font-semibold">
                              ${(sale.salePrice / 100).toFixed(0)}
                            </span>
                            <span className="text-stone-500 line-through text-sm ml-2">
                              ${(sale.originalPrice / 100).toFixed(0)}
                            </span>
                            <span className="block text-xs text-red-400">
                              -{sale.discountPercent}% off
                            </span>
                          </div>
                        ) : currentPrice ? (
                          <span className="text-stone-100 font-semibold">
                            ${(currentPrice / 100).toFixed(0)}
                          </span>
                        ) : (
                          <span className="text-stone-500">&mdash;</span>
                        )}
                      </div>
                    </div>

                    {/* Status Badges */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {targetReached && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500/15 text-amber-400 rounded text-xs border border-amber-500/20">
                          <Tag className="w-3 h-3" />
                          Target price reached!
                        </span>
                      )}
                      {sale && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/15 text-red-400 rounded text-xs border border-red-500/20">
                          On Sale
                        </span>
                      )}
                      {item.targetPrice && !targetReached && (
                        <span className="text-xs text-stone-500">
                          Target: ${(item.targetPrice / 100).toFixed(0)}
                        </span>
                      )}
                    </div>

                    {item.notes && (
                      <p className="text-stone-400 text-sm mt-2 line-clamp-1">{item.notes}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {sale && (
                      <a
                        href={sale.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-stone-900 text-sm font-semibold rounded-xl transition shadow-lg shadow-amber-500/20"
                      >
                        Get Deal
                      </a>
                    )}
                    <button
                      onClick={() =>
                        user &&
                        removeFromWishlist({ user: user._id, plugin: plugin._id })
                      }
                      className="p-2 text-stone-500 hover:text-red-400 transition"
                      title="Remove from wishlist"
                    >
                      <Trash className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 glass-card rounded-xl">
            <Heart className="w-16 h-16 mx-auto mb-4 text-stone-600" />
            <h3 className="text-xl font-semibold text-stone-100 mb-2">Your wishlist is empty</h3>
            <p className="text-stone-400 mb-6">
              Save plugins you're interested in to track prices and get notified of sales
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
