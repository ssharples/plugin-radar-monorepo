"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { PluginCard } from "@/components/plugin-card";
import {
  ArrowRight,
  Lightning,
  Clock,
  Gift,
  Fire,
  TrendUp,
  Link as LinkIcon,
  ShareNetwork,
  MagnifyingGlass,
  WaveSquare,
  SlidersHorizontal,
  ArrowsLeftRight,
  Gauge,
  ArrowCounterClockwise,
  Check,
  X as XIcon,
  Warning,
  DownloadSimple,
  Users,
  Waveform,
  GitFork,
} from "@phosphor-icons/react";

export default function Home() {
  const stats = useQuery(api.stats.overview);
  const plugins = useQuery(api.plugins.list, { limit: 8 });
  const manufacturers = useQuery(api.manufacturers.list, { limit: 10 });
  const activeSales = useQuery(api.sales.listActive, { limit: 6 });
  const trendingPlugins = useQuery(api.mentions.getTrendingPlugins, { limit: 6 });
  const chains = useQuery(api.pluginDirectory.browseChains, {
    sortBy: "popular",
    limit: 6,
  });

  return (
    <div className="relative">
      {/* ===== HERO SECTION ===== */}
      <section className="relative overflow-hidden">
        {/* Background gradient — warm amber */}
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.04] via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-amber-500/[0.05] rounded-full blur-[140px]" />

        <div className="container mx-auto px-4 lg:px-6 pt-20 pb-16 relative">
          <div className="max-w-3xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium mb-6">
              <LinkIcon weight="bold" className="w-3.5 h-3.5" />
              The first cross-DAW plugin chain platform
            </div>

            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] mb-5"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <span className="text-stone-100">Build plugin chains.</span>
              <br />
              <span className="text-amber-400">Share them with the world.</span>
            </h1>
            <p className="text-lg text-stone-400 max-w-xl leading-relaxed mb-8">
              Build effect chains with any VST/AU/AAX plugin. Share with friends
              across any DAW. Discover vocal chains, mix bus setups, and mastering
              presets from the community.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="#download"
                className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-stone-900 font-semibold rounded-xl transition-all shadow-lg shadow-amber-500/25 hover:shadow-amber-500/35 text-sm"
              >
                <DownloadSimple weight="bold" className="w-4 h-4" />
                Download Free
              </Link>
              <Link
                href="/chains"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/[0.05] hover:bg-white/[0.08] text-stone-200 font-medium rounded-xl transition-all border border-white/[0.08] text-sm"
              >
                Browse Chains
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-16">
            <StatCard
              value={stats?.totalPlugins ? `${stats.totalPlugins.toLocaleString()}+` : "..."}
              label="Plugins Supported"
              icon={<div className="w-2 h-2 rounded-full bg-amber-400" />}
            />
            <StatCard
              value="Any DAW"
              label="Cross-Platform"
              icon={<div className="w-2 h-2 rounded-full bg-emerald-400" />}
            />
            <StatCard
              value="Free"
              label="Open Community"
              icon={<div className="w-2 h-2 rounded-full bg-violet-400" />}
            />
            <StatCard
              value="Unlimited"
              label="Chains & Presets"
              icon={<div className="w-2 h-2 rounded-full bg-cyan-400" />}
            />
          </div>
        </div>
      </section>

      <div className="section-line" />

      {/* ===== HOW IT WORKS ===== */}
      <section className="container mx-auto px-4 lg:px-6 py-20">
        <div className="text-center mb-14">
          <p className="text-xs text-amber-400 uppercase tracking-[0.2em] font-semibold mb-3">How It Works</p>
          <h2
            className="text-3xl font-bold text-stone-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Three steps to better mixing
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <StepCard
            number="01"
            icon={<SlidersHorizontal weight="duotone" className="w-7 h-7 text-amber-400" />}
            title="Build Your Chain"
            description="Drag any plugins from your collection into a visual chain editor. Set up serial or parallel routing. See per-plugin metering in real-time."
          />
          <StepCard
            number="02"
            icon={<ShareNetwork weight="duotone" className="w-7 h-7 text-amber-400" />}
            title="Share With Anyone"
            description="Save your chain to the cloud and share with a link. Friends load it in their DAW — with automatic plugin compatibility matching."
          />
          <StepCard
            number="03"
            icon={<MagnifyingGlass weight="duotone" className="w-7 h-7 text-amber-400" />}
            title="Discover & Learn"
            description="Browse chains shared by the community. Find vocal chains, drum bus setups, mastering presets. Fork them, tweak them, make them yours."
          />
        </div>
      </section>

      <div className="section-line" />

      {/* ===== COMPARISON TABLE ===== */}
      <section className="container mx-auto px-4 lg:px-6 py-20">
        <div className="text-center mb-12">
          <p className="text-xs text-amber-400 uppercase tracking-[0.2em] font-semibold mb-3">Why PluginRadar</p>
          <h2
            className="text-3xl font-bold text-stone-100 mb-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            The only chain platform that works with every plugin
          </h2>
          <p className="text-stone-500 max-w-lg mx-auto">
            No ecosystem lock-in. No subscription. Just your plugins, working together.
          </p>
        </div>
        <div className="max-w-3xl mx-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left py-4 px-4 text-stone-500 font-medium">Feature</th>
                <th className="py-4 px-4 text-center">
                  <span className="text-amber-400 font-semibold">PluginRadar</span>
                </th>
                <th className="py-4 px-4 text-center text-stone-500 font-medium">Waves StudioVerse</th>
                <th className="py-4 px-4 text-center text-stone-500 font-medium">Your DAW</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              <CompareRow
                feature="Works with ANY plugin"
                us={true}
                waves={false}
                daw={true}
                wavesNote="Waves only"
              />
              <CompareRow
                feature="Cross-DAW chains"
                us={true}
                waves={true}
                daw={false}
              />
              <CompareRow
                feature="Community sharing"
                us={true}
                waves={true}
                daw={false}
              />
              <CompareRow
                feature="Per-plugin metering"
                us={true}
                waves={false}
                daw={false}
              />
              <CompareRow
                feature="Parallel / serial routing"
                us={true}
                waves="partial"
                daw="partial"
              />
              <CompareRow
                feature="Plugin compatibility check"
                us={true}
                waves={false}
                daw={false}
              />
              <CompareRow
                feature="Free to use"
                us={true}
                waves={false}
                daw={true}
                wavesNote="Subscription"
              />
            </tbody>
          </table>
        </div>
      </section>

      <div className="section-line" />

      {/* ===== BUILT FOR ENGINEERS ===== */}
      <section className="container mx-auto px-4 lg:px-6 py-20">
        <div className="text-center mb-14">
          <p className="text-xs text-amber-400 uppercase tracking-[0.2em] font-semibold mb-3">Pro Features</p>
          <h2
            className="text-3xl font-bold text-stone-100 mb-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Built for engineers who care about signal flow
          </h2>
          <p className="text-stone-500 max-w-lg mx-auto">
            Advanced routing. Real-time metering. Zero hassle.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          <FeatureCard
            icon={<Gauge weight="duotone" className="w-6 h-6" />}
            title="Per-Plugin Metering"
            description="See output levels after every plugin in the chain. Spot gain staging issues at a glance — no DAW offers this."
          />
          <FeatureCard
            icon={<GitFork weight="duotone" className="w-6 h-6" />}
            title="Parallel Processing"
            description="Split, process, merge — visually. Drag-and-drop parallel compression without the aux send headache."
          />
          <FeatureCard
            icon={<ArrowsLeftRight weight="duotone" className="w-6 h-6" />}
            title="A/B/C Snapshots"
            description="Save three chain configurations. Switch between them instantly for rapid comparison."
          />
          <FeatureCard
            icon={<Waveform weight="duotone" className="w-6 h-6" />}
            title="LUFS Targeting"
            description="Built-in loudness monitoring with target matching. Hit your loudness specs every time."
          />
          <FeatureCard
            icon={<ArrowCounterClockwise weight="duotone" className="w-6 h-6" />}
            title="Undo / Redo"
            description="Experiment fearlessly with full history. Every chain edit is reversible."
          />
          <FeatureCard
            icon={<Users weight="duotone" className="w-6 h-6" />}
            title="Friends & Sharing"
            description="Add friends, share chains privately, fork each other's setups. Collaborate without leaving the plugin."
          />
        </div>
      </section>

      <div className="section-line" />

      {/* ===== COMMUNITY CHAINS ===== */}
      {chains && chains.length > 0 && (
        <>
          <section className="container mx-auto px-4 lg:px-6 py-16">
            <SectionHeader
              title="Popular Chains"
              subtitle="Shared by the community"
              href="/chains"
              linkText="Browse all chains"
              icon={<LinkIcon weight="bold" className="w-5 h-5 text-amber-400" />}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {chains.map((chain: any) => (
                <ChainCard key={chain._id} chain={chain} />
              ))}
            </div>
          </section>
          <div className="section-line" />
        </>
      )}

      {/* ===== DOWNLOAD CTA ===== */}
      <section id="download" className="container mx-auto px-4 lg:px-6 py-20">
        <div className="relative rounded-2xl overflow-hidden border border-amber-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.08] via-transparent to-orange-500/[0.05]" />
          <div className="relative px-8 py-14 text-center">
            <h2
              className="text-3xl font-bold text-stone-100 mb-3"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Ready to build your first chain?
            </h2>
            <p className="text-stone-400 max-w-md mx-auto mb-8">
              Download the free desktop plugin. Works with any DAW on macOS and Windows.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="#"
                className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-stone-900 font-semibold rounded-xl transition-all shadow-lg shadow-amber-500/25 text-sm"
              >
                <DownloadSimple weight="bold" className="w-4 h-4" />
                Download for macOS
              </a>
              <a
                href="#"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/[0.06] hover:bg-white/[0.1] text-stone-200 font-medium rounded-xl transition-all border border-white/[0.08] text-sm"
              >
                <DownloadSimple weight="bold" className="w-4 h-4" />
                Download for Windows
              </a>
            </div>
            <p className="text-stone-600 text-xs mt-4">
              VST3 / AU / AAX — Free forever, no account required
            </p>
          </div>
        </div>
      </section>

      <div className="section-line" />

      {/* ===== TRENDING PLUGINS (Demoted) ===== */}
      {trendingPlugins === undefined ? (
        <SectionSkeleton title="Trending Plugins" />
      ) : trendingPlugins.length > 0 ? (
        <section className="container mx-auto px-4 lg:px-6 py-14">
          <SectionHeader
            title="Trending Plugins"
            subtitle="Popular in the community this week"
            href="/plugins"
            linkText="Browse all"
            icon={<TrendUp weight="bold" className="w-5 h-5 text-amber-400" />}
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {trendingPlugins.map((plugin: any) => (
              <PluginCard key={plugin._id} plugin={plugin} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ===== HOT DEALS (Demoted) ===== */}
      {activeSales && activeSales.length > 0 && (
        <section className="container mx-auto px-4 lg:px-6 py-14">
          <SectionHeader
            title="Plugin Deals"
            subtitle="Save on plugins for your chains"
            href="/sales"
            linkText="All sales"
            icon={<Fire weight="fill" className="w-5 h-5 text-amber-400" />}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeSales.map((sale: any, i: number) => (
              <SaleCard key={sale._id} sale={sale} index={i} />
            ))}
          </div>
        </section>
      )}

      <div className="section-line" />

      {/* ===== PLUGIN CATALOG (Demoted) ===== */}
      <section className="container mx-auto px-4 lg:px-6 py-14">
        <SectionHeader
          title="Plugin Directory"
          subtitle="Discover plugins for your chains"
          href="/plugins"
          linkText="Browse all"
        />
        {plugins ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {plugins.items.map((plugin: any) => (
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
            {manufacturers.map((m: any) => (
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

function StatCard({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-xl px-5 py-4 animate-fade-in-up">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span
          className="text-2xl font-bold text-stone-100 tabular-nums"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {value}
        </span>
      </div>
      <span className="text-xs text-stone-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function StepCard({
  number,
  icon,
  title,
  description,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="glass-card rounded-xl p-6 text-center group hover:border-amber-500/20 transition-all">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 mb-5 group-hover:bg-amber-500/15 transition-colors">
        {icon}
      </div>
      <div className="text-[10px] text-amber-400/60 font-mono uppercase tracking-widest mb-2">
        Step {number}
      </div>
      <h3
        className="text-lg font-semibold text-stone-100 mb-2"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h3>
      <p className="text-stone-500 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function CompareRow({
  feature,
  us,
  waves,
  daw,
  wavesNote,
}: {
  feature: string;
  us: boolean | "partial";
  waves: boolean | "partial";
  daw: boolean | "partial";
  wavesNote?: string;
}) {
  const renderCell = (val: boolean | "partial", note?: string) => {
    if (val === true)
      return <Check weight="bold" className="w-5 h-5 text-emerald-400 mx-auto" />;
    if (val === "partial")
      return <Warning weight="fill" className="w-4 h-4 text-amber-400/70 mx-auto" />;
    return (
      <div className="flex flex-col items-center gap-0.5">
        <XIcon weight="bold" className="w-4 h-4 text-stone-600 mx-auto" />
        {note && <span className="text-[10px] text-stone-600">{note}</span>}
      </div>
    );
  };

  return (
    <tr className="hover:bg-white/[0.02] transition-colors">
      <td className="py-3.5 px-4 text-stone-300">{feature}</td>
      <td className="py-3.5 px-4 text-center bg-amber-500/[0.03]">
        {renderCell(us)}
      </td>
      <td className="py-3.5 px-4 text-center">{renderCell(waves, wavesNote)}</td>
      <td className="py-3.5 px-4 text-center">{renderCell(daw)}</td>
    </tr>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="glass-card rounded-xl p-5 group hover:border-amber-500/15 transition-all">
      <div className="text-amber-400 mb-3 group-hover:text-amber-300 transition-colors">
        {icon}
      </div>
      <h3 className="font-semibold text-stone-100 mb-1.5 text-sm">{title}</h3>
      <p className="text-stone-500 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function ChainCard({ chain }: { chain: any }) {
  return (
    <Link
      href={`/chains/${chain.slug}`}
      className="block glass-card rounded-xl p-5 hover:border-amber-500/25 transition group"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-400 capitalize">
          {chain.category}
        </span>
        <span className="text-xs text-stone-500">
          {chain.pluginCount} plugin{chain.pluginCount !== 1 ? "s" : ""}
        </span>
      </div>
      <h3 className="font-semibold text-stone-100 group-hover:text-amber-400 transition truncate mb-1">
        {chain.name}
      </h3>
      {chain.author && (
        <p className="text-stone-500 text-sm mb-3">by {chain.author.name}</p>
      )}
      {chain.tags && chain.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {chain.tags.slice(0, 3).map((tag: string) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded-full text-stone-500"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-4 text-xs text-stone-600">
        <span className="flex items-center gap-1">❤️ {chain.likes}</span>
        <span className="flex items-center gap-1">⬇️ {chain.downloads}</span>
      </div>
    </Link>
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
          <h2
            className="text-xl font-semibold text-stone-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
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
  const daysLeft = timeLeft
    ? Math.floor(timeLeft / (1000 * 60 * 60 * 24))
    : null;
  const hoursLeft = timeLeft
    ? Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    : null;
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
          <span
            className={`text-xs px-2 py-1 rounded-md ${
              isUrgent
                ? "bg-red-500/10 text-red-400"
                : "bg-white/[0.04] text-stone-500"
            }`}
          >
            {daysLeft && daysLeft > 0 ? `${daysLeft}d ` : ""}
            {hoursLeft}h left
          </span>
        )}
      </div>
      <h3 className="font-medium text-stone-200 mb-2 truncate">
        {sale.saleName || "Sale"}
      </h3>
      <div className="flex items-baseline gap-2.5">
        <span
          className="text-xl font-bold text-amber-400"
          style={{ fontFamily: "var(--font-display)" }}
        >
          ${(sale.salePrice / 100).toFixed(0)}
        </span>
        <span className="text-stone-500 line-through text-sm">
          ${(sale.originalPrice / 100).toFixed(0)}
        </span>
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
        <h2
          className="text-xl font-semibold text-stone-100"
          style={{ fontFamily: "var(--font-display)" }}
        >
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
