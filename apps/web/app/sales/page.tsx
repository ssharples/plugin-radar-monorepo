"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Tag, Clock, Fire, Percent } from "@phosphor-icons/react";

export default function SalesPage() {
  const [filter, setFilter] = useState<"all" | "ending-soon" | "biggest">("all");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const allSales = useQuery(api.sales.listActiveWithPlugins, { limit: 100 });
  const expiringSoon = useQuery(api.sales.expiringSoon, { withinHours: 48 });
  const biggestDiscounts = useQuery(api.sales.biggestDiscounts, { limit: 50 });

  const displaySales =
    filter === "ending-soon"
      ? allSales?.filter((s) => expiringSoon?.some((e) => e._id === s._id))
      : filter === "biggest"
      ? allSales?.filter((s) => biggestDiscounts?.some((b) => b._id === s._id))
      : allSales;

  const sortedSales =
    filter === "biggest"
      ? displaySales?.slice().sort((a, b) => b.discountPercent - a.discountPercent)
      : filter === "ending-soon"
      ? displaySales?.slice().sort((a, b) => (a.endsAt || Infinity) - (b.endsAt || Infinity))
      : displaySales;

  return (
    <div>
      {/* Header */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-red-500/[0.03] via-transparent to-transparent" />
        <div className="container mx-auto px-4 lg:px-6 pt-10 pb-8 relative">
          <div className="flex items-center gap-3 mb-2">
            <Fire weight="fill" className="w-6 h-6 text-red-400" />
            <h1
              className="text-3xl font-bold text-stone-100"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Active Sales
            </h1>
          </div>
          <p className="text-stone-500 text-sm">
            {allSales?.length || 0} deals on audio plugins right now
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 lg:px-6 pb-14">
        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-8">
          <FilterTab
            active={filter === "all"}
            onClick={() => setFilter("all")}
            icon={<Tag className="w-4 h-4" />}
            label="All Deals"
            count={allSales?.length}
          />
          <FilterTab
            active={filter === "ending-soon"}
            onClick={() => setFilter("ending-soon")}
            icon={<Clock className="w-4 h-4" />}
            label="Ending Soon"
            count={expiringSoon?.length}
          />
          <FilterTab
            active={filter === "biggest"}
            onClick={() => setFilter("biggest")}
            icon={<Percent className="w-4 h-4" />}
            label="Biggest Discounts"
          />
        </div>

        {/* Sales Grid */}
        {sortedSales ? (
          sortedSales.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedSales.map((sale) => (
                <SaleCard key={sale._id} sale={sale} now={now} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/[0.03] flex items-center justify-center">
                <Tag className="w-7 h-7 text-stone-600" />
              </div>
              <h3 className="text-lg font-semibold text-stone-200 mb-2" style={{ fontFamily: "var(--font-display)" }}>
                No sales found
              </h3>
              <p className="text-stone-500 text-sm">Check back soon for new deals</p>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="glass-card rounded-xl p-4 animate-pulse">
                <div className="h-6 bg-white/[0.04] rounded w-1/4 mb-3" />
                <div className="h-5 bg-white/[0.04] rounded w-3/4 mb-2" />
                <div className="h-4 bg-white/[0.04] rounded w-1/2 mb-4" />
                <div className="h-8 bg-white/[0.04] rounded w-1/3" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-medium ${
        active
          ? "bg-amber-500 text-stone-900 shadow-lg shadow-amber-500/20"
          : "bg-white/[0.04] text-stone-400 hover:bg-white/[0.07] hover:text-stone-200 border border-white/[0.06]"
      }`}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span className={`text-xs tabular-nums ${active ? "text-stone-900/60" : "text-stone-600"}`}>
          ({count})
        </span>
      )}
    </button>
  );
}

function SaleCard({ sale, now }: { sale: any; now: number }) {
  const plugin = sale.pluginData;
  const store = sale.storeData;

  const timeLeft = sale.endsAt ? sale.endsAt - now : null;
  const isEndingSoon = timeLeft && timeLeft < 48 * 60 * 60 * 1000;
  const isExpired = timeLeft && timeLeft <= 0;

  const daysLeft = timeLeft ? Math.floor(timeLeft / (1000 * 60 * 60 * 24)) : null;
  const hoursLeft = timeLeft
    ? Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    : null;

  if (isExpired || !plugin) return null;

  return (
    <div className="glass-card rounded-xl overflow-hidden hover:border-amber-500/15 transition-all duration-300 group">
      {/* Plugin Image */}
      <Link href={`/plugins/${plugin.slug}`} className="block">
        <div className="aspect-video relative overflow-hidden bg-[#1e1b18]">
          {plugin.imageUrl ? (
            <img
              src={plugin.imageUrl}
              alt={plugin.name}
              className="w-full h-full object-contain group-hover:scale-[1.03] transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-stone-600">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.5" />
                </svg>
              </div>
            </div>
          )}

          {/* Warm overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1714] via-transparent to-transparent opacity-50" />
          <div className="absolute inset-0 bg-amber-500/0 group-hover:bg-amber-500/[0.03] transition-colors duration-300" />

          {/* Discount Badge */}
          <div className="absolute top-3 left-3">
            <span className="price-tag-sale px-2.5 py-1 rounded-lg text-sm font-bold shadow-lg shadow-red-500/15">
              -{sale.discountPercent}%
            </span>
          </div>

          {/* Timer */}
          {timeLeft && timeLeft > 0 && (
            <div
              className={`absolute top-3 right-3 px-2 py-1 rounded-md text-xs font-medium ${
                isEndingSoon
                  ? "bg-red-500/10 text-red-400"
                  : "bg-black/50 backdrop-blur-sm text-stone-300"
              }`}
            >
              {daysLeft && daysLeft > 0 ? `${daysLeft}d ` : ""}
              {hoursLeft}h left
            </div>
          )}
        </div>
      </Link>

      {/* Details */}
      <div className="p-4">
        <Link href={`/plugins/${plugin.slug}`}>
          <h3 className="font-medium text-stone-200 group-hover:text-amber-400 transition truncate">
            {plugin.name}
          </h3>
        </Link>

        {sale.saleName && (
          <p className="text-stone-500 text-xs truncate mt-0.5">{sale.saleName}</p>
        )}

        {/* Price */}
        <div className="flex items-baseline gap-2.5 mt-3">
          <span className="text-xl font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}>
            ${(sale.salePrice / 100).toFixed(0)}
          </span>
          <span className="text-stone-500 line-through text-sm">
            ${(sale.originalPrice / 100).toFixed(0)}
          </span>
          <span className="text-xs text-green-400/70 ml-auto">
            Save ${((sale.originalPrice - sale.salePrice) / 100).toFixed(0)}
          </span>
        </div>

        {/* Promo Code & Store */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.04]">
          {sale.promoCode ? (
            <div className="px-2.5 py-1 bg-white/[0.03] rounded-lg text-xs text-amber-400/80 font-mono tracking-wider border border-white/[0.04]">
              {sale.promoCode}
            </div>
          ) : (
            <span className="text-xs text-stone-600">No code needed</span>
          )}

          {store ? (
            <span className="text-xs text-stone-500">{store.name}</span>
          ) : (
            <a
              href={sale.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-amber-400 hover:text-amber-300 transition"
            >
              Get Deal →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
