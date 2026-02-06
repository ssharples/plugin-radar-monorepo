"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { PluginCard } from "@/components/plugin-card";
import { ArrowRight, Lightning, Clock, Gift, Fire, TrendUp } from "@phosphor-icons/react";

export default function Home() {
  const stats = useQuery(api.stats.overview);
  const plugins = useQuery(api.plugins.list, { limit: 12 });
  const manufacturers = useQuery(api.manufacturers.list, { limit: 10 });
  const activeSales = useQuery(api.sales.listActive, { limit: 6 });
  const trendingPlugins = useQuery(api.mentions.getTrendingPlugins, { limit: 6 });
  const newPlugins = useQuery(api.plugins.newThisWeek, { limit: 6 });
  const freePlugins = useQuery(api.plugins.freePlugins, { limit: 6 });

  return (
    <div className="relative">
      {/* ===== HERO SECTION ===== */}
      <section className="relative overflow-hidden">
        {/* Background warm gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.03] via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amber-500/[0.04] rounded-full blur-[120px]" />

        <div className="container mx-auto px-4 lg:px-6 pt-16 pb-12 relative">
          <div className="max-w-3xl">
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-5"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <span className="text-stone-100">Never miss a </span>
              <span className="text-amber-400">deal</span>
              <span className="text-stone-100"> on audio plugins</span>
            </h1>
            <p className="text-lg text-stone-400 max-w-xl leading-relaxed mb-8">
              Track prices across 900+ plugins from 34 manufacturers. Get alerts when prices drop, discover free tools, and build your perfect collection.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/sales"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-900 font-semibold rounded-xl transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 text-sm"
              >
                <Lightning weight="fill" className="w-4 h-4" />
                Browse Deals
              </Link>
              <Link
                href="/plugins"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/[0.05] hover:bg-white/[0.08] text-stone-200 font-medium rounded-xl transition-all border border-white/[0.06] text-sm"
              >
                Explore Plugins
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Stats row */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-14">
              <StatCard value={stats.totalPlugins} label="Plugins Tracked" icon={<div className="w-2 h-2 rounded-full bg-amber-500" />} />
              <StatCard value={stats.totalManufacturers} label="Manufacturers" icon={<div className="w-2 h-2 rounded-full bg-blue-400" />} />
              <StatCard value={stats.activeSales} label="Active Sales" icon={<div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />} />
              <StatCard value={stats.freePlugins} label="Free Plugins" icon={<div className="w-2 h-2 rounded-full bg-green-400" />} />
            </div>
          )}
        </div>
      </section>

      <div className="section-line" />

      {/* ===== HOT DEALS ===== */}
      {activeSales && activeSales.length > 0 && (
        <section className="container mx-auto px-4 lg:px-6 py-14">
          <SectionHeader
            title="Hot Deals"
            subtitle="Limited-time savings on premium plugins"
            href="/sales"
            linkText="All sales"
            icon={<Fire weight="fill" className="w-5 h-5 text-red-400" />}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeSales.map((sale, i) => (
              <SaleCard key={sale._id} sale={sale} index={i} />
            ))}
          </div>
        </section>
      )}

      <div className="section-line" />

      {/* ===== TRENDING ===== */}
      {trendingPlugins === undefined ? (
        <SectionSkeleton title="Trending" />
      ) : trendingPlugins.length > 0 ? (
        <section className="container mx-auto px-4 lg:px-6 py-14">
          <SectionHeader
            title="Trending"
            subtitle="Most talked about this week"
            href="/plugins"
            linkText="Browse all"
            icon={<TrendUp weight="bold" className="w-5 h-5 text-amber-400" />}
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {trendingPlugins.map((plugin) => (
              <PluginCard key={plugin._id} plugin={plugin} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ===== NEW THIS WEEK ===== */}
      {newPlugins === undefined ? (
        <SectionSkeleton title="New This Week" />
      ) : newPlugins.length > 0 ? (
        <section className="container mx-auto px-4 lg:px-6 py-14">
          <SectionHeader
            title="New This Week"
            subtitle="Recently added to the catalog"
            href="/plugins"
            linkText="View all new"
            icon={<Clock weight="bold" className="w-5 h-5 text-purple-400" />}
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {newPlugins.map((plugin) => (
              <PluginCard key={plugin._id} plugin={plugin} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ===== FREE PLUGINS ===== */}
      {freePlugins === undefined ? (
        <SectionSkeleton title="Free Plugins" />
      ) : freePlugins.length > 0 ? (
        <section className="container mx-auto px-4 lg:px-6 py-14">
          <SectionHeader
            title="Free Plugins"
            subtitle="Professional tools, zero cost"
            href="/free"
            linkText="See all free"
            icon={<Gift weight="bold" className="w-5 h-5 text-green-400" />}
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {freePlugins.slice(0, 6).map((plugin) => (
              <PluginCard key={plugin._id} plugin={plugin} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="section-line" />

      {/* ===== LATEST PLUGINS ===== */}
      <section className="container mx-auto px-4 lg:px-6 py-14">
        <SectionHeader
          title="Latest Plugins"
          subtitle="Browse the full catalog"
          href="/plugins"
          linkText="Browse all"
        />
        {plugins ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {plugins.items.map((plugin) => (
              <PluginCard key={plugin._id} plugin={plugin} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}
      </section>

      {/* ===== MANUFACTURERS ===== */}
      <section className="container mx-auto px-4 lg:px-6 pb-14">
        <SectionHeader
          title="Top Brands"
          subtitle="Explore by manufacturer"
          href="/manufacturers"
          linkText="View all"
        />
        {manufacturers ? (
          <div className="flex flex-wrap gap-2">
            {manufacturers.map((m) => (
              <Link
                key={m._id}
                href={`/manufacturers/${m.slug}`}
                className="group inline-flex items-center gap-2 px-4 py-2 glass-card rounded-xl hover:border-amber-500/20 transition-all duration-200"
              >
                <span className="text-stone-300 text-sm group-hover:text-amber-400 transition-colors">
                  {m.name}
                </span>
                <span className="text-stone-600 text-xs tabular-nums">
                  {m.pluginCount}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-stone-600 text-sm">Loading...</div>
        )}
      </section>
    </div>
  );
}

/* ===== SUB-COMPONENTS ===== */

function StatCard({ value, label, icon }: { value: number; label: string; icon: React.ReactNode }) {
  return (
    <div className="glass-card rounded-xl px-5 py-4 animate-fade-in-up">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-2xl font-bold text-stone-100 tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
          {value.toLocaleString()}
        </span>
      </div>
      <span className="text-xs text-stone-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  href,
  linkText,
  icon,
}: {
  title: string;
  subtitle?: string;
  href: string;
  linkText: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <h2 className="text-xl font-semibold text-stone-100" style={{ fontFamily: "var(--font-display)" }}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-stone-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      <Link
        href={href}
        className="text-sm text-stone-500 hover:text-amber-400 transition-colors flex items-center gap-1 shrink-0"
      >
        {linkText}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

function SaleCard({ sale, index }: { sale: any; index: number }) {
  const timeLeft = sale.endsAt ? sale.endsAt - Date.now() : null;
  const daysLeft = timeLeft ? Math.floor(timeLeft / (1000 * 60 * 60 * 24)) : null;
  const hoursLeft = timeLeft ? Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)) : null;
  const isUrgent = daysLeft !== null && daysLeft <= 2;

  return (
    <div
      className={`glass-card rounded-xl p-4 hover:border-amber-500/15 transition-all duration-300 animate-fade-in-up stagger-${index + 1}`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="price-tag-sale px-2.5 py-1 rounded-lg text-sm shadow-lg shadow-red-500/15">
          -{sale.discountPercent}%
        </span>
        {timeLeft && timeLeft > 0 && (
          <span className={`text-xs px-2 py-1 rounded-md ${
            isUrgent
              ? "bg-red-500/10 text-red-400"
              : "bg-white/[0.04] text-stone-500"
          }`}>
            {daysLeft && daysLeft > 0 ? `${daysLeft}d ` : ""}{hoursLeft}h left
          </span>
        )}
      </div>
      <h3 className="font-medium text-stone-200 mb-2 truncate">{sale.saleName || "Sale"}</h3>
      <div className="flex items-baseline gap-2.5">
        <span className="text-xl font-bold text-amber-400" style={{ fontFamily: "var(--font-display)" }}>
          ${(sale.salePrice / 100).toFixed(0)}
        </span>
        <span className="text-stone-500 line-through text-sm">${(sale.originalPrice / 100).toFixed(0)}</span>
        <span className="text-xs text-green-400/70 ml-auto">
          Save ${((sale.originalPrice - sale.salePrice) / 100).toFixed(0)}
        </span>
      </div>
      {sale.promoCode && (
        <div className="mt-3 px-2.5 py-1.5 bg-white/[0.03] rounded-lg text-xs text-stone-400 font-mono tracking-wider border border-white/[0.04]">
          CODE: <span className="text-amber-400/80">{sale.promoCode}</span>
        </div>
      )}
    </div>
  );
}

function SectionSkeleton({ title }: { title: string }) {
  return (
    <section className="container mx-auto px-4 lg:px-6 py-14">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-stone-100" style={{ fontFamily: "var(--font-display)" }}>
          {title}
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden">
      <div className="aspect-[4/3] bg-white/[0.03] animate-pulse" />
      <div className="p-3 bg-white/[0.02]">
        <div className="h-4 bg-white/[0.04] rounded w-3/4 mb-2 animate-pulse" />
        <div className="h-3 bg-white/[0.03] rounded w-1/2 animate-pulse" />
      </div>
    </div>
  );
}
