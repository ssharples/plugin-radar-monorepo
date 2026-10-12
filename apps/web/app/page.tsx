import Link from "next/link";
import {
  ArrowRight,
  DownloadSimple,
  CheckCircle,
  ArrowsLeftRight,
  GitFork,
  CloudArrowUp,
  SlidersHorizontal,
  Users,
} from "@phosphor-icons/react/dist/ssr";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convex-server";
import { PluginCard } from "@/components/plugin-card";
import { ChainCardRedesign } from "@/components/chains/ChainCardRedesign";
import { InteractiveHeroBackground } from "@/components/InteractiveHeroBackground";
import { CHAIN_USE_CASE_GROUPS } from "@plugin-radar/shared/chainUseCases";

// Refresh the chains, plugins and counts every five minutes.
export const revalidate = 300;

// Return null instead of failing the page when Convex can't be reached.
async function load<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export default async function Home() {
  const [stats, chainsResult, trendingPlugins, plugins, manufacturers] = await Promise.all([
    load(() => convexServer.query(api.stats.overview, {})),
    load(() =>
      convexServer.query(api.pluginDirectory.browseChainsPaginated, {
        sortBy: "popular",
        limit: 6,
        offset: 0,
      })
    ),
    load(() => convexServer.query(api.mentions.getTrendingPlugins, { limit: 6 })),
    load(() => convexServer.query(api.plugins.list, { limit: 6 })),
    load(() => convexServer.query(api.manufacturers.list, { limit: 12 })),
  ]);

  const chains = chainsResult?.chains ?? [];
  const hasTrending = !!trendingPlugins && trendingPlugins.length > 0;
  const pluginsToShow: any[] = (hasTrending ? trendingPlugins : plugins?.items) ?? [];

  return (
    <div className="relative">
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] via-transparent to-transparent" />
        <InteractiveHeroBackground />

        <div className="container mx-auto px-4 lg:px-6 py-16 lg:py-24 grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center relative z-10">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold text-[#deff0a] bg-[#deff0a]/10 border border-[#deff0a]/20 rounded-full px-3 py-1 mb-6">
              Works with VST3, AU and AAX plugins from any brand
            </p>
            <h1 className="text-3xl sm:text-4xl xl:text-5xl font-bold tracking-tight text-stone-100 leading-[1.1]">
              Plugin chains you can share.
              <span className="block text-stone-500">With anyone, using any brand.</span>
            </h1>
            <p className="mt-6 text-lg text-stone-400 max-w-xl leading-relaxed">
              Build a chain in the ProChain plugin, save it to the cloud, and share it.
              When someone opens it, we show which plugins they already own and suggest
              swaps for the ones they don&apos;t.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/chains"
                className="neon-button inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm"
              >
                Browse chains
                <ArrowRight weight="bold" className="w-4 h-4" />
              </Link>
              <Link
                href="/plugins"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/[0.05] hover:bg-white/[0.08] text-stone-200 font-medium rounded-xl transition-all border border-white/[0.08] text-sm"
              >
                Explore plugins
              </Link>
            </div>
            {stats && (
              <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <Stat value={stats.totalPlugins?.toLocaleString()} label="plugins in the catalog" />
                <Stat value={stats.totalManufacturers?.toLocaleString()} label="brands" />
                <Stat value={stats.freePlugins?.toLocaleString()} label="free plugins" />
              </dl>
            )}
          </div>

          <ChainPreview />
        </div>
      </section>

      <div className="section-line" />

      {/* ===== BROWSE BY USE ===== */}
      <section className="container mx-auto px-4 lg:px-6 py-16">
        <SectionHeader title="Find a chain for the job" href="/chains" linkText="All chains" />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {CHAIN_USE_CASE_GROUPS.map((group) => (
            <Link
              key={group.value}
              href={`/chains?category=${group.value}`}
              className="glass-card neon-border-hover rounded-xl p-4"
            >
              <span className="text-2xl" aria-hidden="true">{group.emoji}</span>
              <p className="mt-3 font-semibold text-stone-100">{group.label}</p>
              <p className="text-xs text-stone-500 mt-0.5">
                {group.useCases.slice(0, 2).map((u) => u.label).join(", ")}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* ===== COMMUNITY CHAINS ===== */}
      <section className="container mx-auto px-4 lg:px-6 pb-16">
        <SectionHeader title="Popular chains" href="/chains?sort=popular" linkText="Browse all" />
        {chains.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {chains.map((chain: any) => (
              <ChainCardRedesign key={chain._id} chain={chain} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/[0.1] p-10 text-center">
            <p className="text-stone-200 font-semibold">No public chains yet</p>
            <p className="mt-1 text-sm text-stone-500 max-w-md mx-auto">
              Build a chain in the ProChain plugin and press Share. It will show up here for
              everyone to load, rate and fork.
            </p>
          </div>
        )}
      </section>

      <div className="section-line" />

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works" className="container mx-auto px-4 lg:px-6 py-16">
        <p className="text-xs text-[#deff0a] uppercase tracking-[0.2em] font-semibold mb-3">How it works</p>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-100 mb-10">
          Build it once. Load it anywhere.
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          <Step
            n={1}
            icon={<SlidersHorizontal className="w-5 h-5" />}
            title="Build"
            text="Load ProChain on any track in your DAW. Drop in plugins from any brand, in series or in parallel."
          />
          <Step
            n={2}
            icon={<CloudArrowUp className="w-5 h-5" />}
            title="Share"
            text="Save the chain to the cloud with its settings. Keep it private, send it to a friend, or make it public."
          />
          <Step
            n={3}
            icon={<ArrowsLeftRight className="w-5 h-5" />}
            title="Load anywhere"
            text="Anyone can open your chain. If they're missing a plugin, ProChain suggests one they own instead."
          />
        </div>
      </section>

      <div className="section-line" />

      {/* ===== WHY ===== */}
      <section className="container mx-auto px-4 lg:px-6 py-16">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-100 mb-3">
          Not locked to one brand
        </h2>
        <p className="text-stone-400 max-w-2xl mb-10">
          Other chain libraries only load their own maker&apos;s plugins. ProChain loads the
          plugins you already have, whoever made them.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Feature
            icon={<CheckCircle className="w-5 h-5" />}
            title="Chains I can use"
            text="Sign in and filter to chains you can load right now with the plugins you own."
          />
          <Feature
            icon={<ArrowsLeftRight className="w-5 h-5" />}
            title="Smart swaps"
            text="Missing a plugin? See close matches you own, or where to get it."
          />
          <Feature
            icon={<GitFork className="w-5 h-5" />}
            title="Fork and remix"
            text="Copy any public chain, change it, and share your take. The original creator gets credit."
          />
          <Feature
            icon={<Users className="w-5 h-5" />}
            title="Follow creators"
            text="Rate and comment on chains, and follow the engineers whose sound you like."
          />
        </div>
      </section>

      {/* ===== PLUGINS ===== */}
      <section className="container mx-auto px-4 lg:px-6 pb-16">
        <SectionHeader
          title={hasTrending ? "Trending plugins" : "Plugins"}
          href="/plugins"
          linkText="Browse the catalog"
        />
        {pluginsToShow.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {pluginsToShow.slice(0, 6).map((plugin: any) => (
              <PluginCard key={plugin._id} plugin={plugin} />
            ))}
          </div>
        )}

        {manufacturers && manufacturers.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {manufacturers.map((m: any) => (
              <Link
                key={m._id}
                href={`/manufacturers/${m.slug}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.15] text-sm text-stone-300 hover:text-white transition-colors"
              >
                {m.name}
                <span className="text-stone-500 text-xs tabular-nums">{m.pluginCount}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="section-line" />

      {/* ===== GET PROCHAIN ===== */}
      <section id="get-prochain" className="container mx-auto px-4 lg:px-6 py-20">
        <div className="relative rounded-2xl overflow-hidden border border-[#deff0a]/10">
          <div className="absolute inset-0 bg-gradient-to-br from-[#deff0a]/[0.03] via-transparent to-transparent" />
          <div className="relative px-8 py-14 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-100">
              Get the ProChain plugin
            </h2>
            <p className="mt-4 text-stone-400 max-w-xl mx-auto">
              Load it in Logic Pro, Ableton Live, Reaper, Studio One, Cubase and more. Browsing
              and sharing chains on this site is free.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
              <Link
                href="/pricing"
                className="neon-button inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm"
              >
                <DownloadSimple weight="bold" className="w-4 h-4" />
                Start free trial
              </Link>
              <Link
                href="/account"
                className="inline-flex items-center justify-center px-6 py-3 bg-white/[0.06] hover:bg-white/[0.1] text-stone-200 font-medium rounded-xl transition-all border border-white/[0.08] text-sm"
              >
                Create a free account
              </Link>
            </div>
            <p className="text-stone-600 text-xs mt-4">
              7-day free trial. Then $30 (50% off launch sale). No subscription.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ===== PIECES ===== */

function Stat({ value, label }: { value?: string; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="sr-only">{label}</dt>
      <dd className="font-bold text-stone-100 tabular-nums">{value ?? "–"}</dd>
      <span className="text-stone-500">{label}</span>
    </div>
  );
}

// An illustration of a shared chain, showing what a visitor sees when they
// open someone else's chain: which plugins they own and a suggested swap.
function ChainPreview() {
  const slots = [
    { name: "Pro-Q 3", brand: "FabFilter", owned: true },
    { name: "CLA-76", brand: "Waves", owned: true },
    { name: "Decapitator", brand: "Soundtoys", owned: false, swap: "Saturn 2" },
    { name: "ValhallaRoom", brand: "Valhalla DSP", owned: true },
  ];
  return (
    <div className="glass-card-strong rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-stone-100">Lead Vocal — Bright &amp; Upfront</p>
          <p className="text-xs text-stone-500">by @mixbymaya · 4 plugins</p>
        </div>
        <span className="text-xs font-semibold text-[#deff0a] bg-[#deff0a]/10 border border-[#deff0a]/20 rounded-full px-2.5 py-1">
          You own 3 of 4
        </span>
      </div>
      <ol className="space-y-2">
        {slots.map((s, i) => (
          <li
            key={s.name}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
              s.owned ? "border-white/[0.06] bg-black/40" : "border-[#deff0a]/25 bg-[#deff0a]/[0.04]"
            }`}
          >
            <span className="w-5 text-xs text-stone-500 tabular-nums">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${s.owned ? "text-stone-200" : "text-stone-400 line-through"}`}>
                {s.name}
              </p>
              <p className="text-xs text-stone-500">{s.brand}</p>
            </div>
            {s.owned ? (
              <CheckCircle weight="fill" className="w-4 h-4 text-green-500" aria-label="Owned" />
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-[#deff0a]">
                <ArrowsLeftRight className="w-3.5 h-3.5" />
                Swap for {s.swap}
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex gap-2">
        <span className="neon-button flex-1 inline-flex items-center justify-center h-9 rounded-lg text-sm">
          Load in ProChain
        </span>
        <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-white/[0.1] text-sm text-stone-300">
          <GitFork className="w-4 h-4" /> Fork
        </span>
      </div>
    </div>
  );
}

function SectionHeader({ title, href, linkText }: { title: string; href: string; linkText: string }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-100">{title}</h2>
      <Link
        href={href}
        className="shrink-0 inline-flex items-center gap-1 text-sm text-stone-400 hover:text-[#deff0a] transition-colors"
      >
        {linkText}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

function Step({ n, icon, title, text }: { n: number; icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="glass-card neon-border-hover rounded-xl p-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-9 h-9 rounded-lg bg-[#deff0a]/10 text-[#deff0a] flex items-center justify-center">
          {icon}
        </span>
        <span className="text-xs text-stone-500 tabular-nums">Step {n}</span>
      </div>
      <h3 className="font-semibold text-stone-100">{title}</h3>
      <p className="mt-1 text-sm text-stone-400 leading-relaxed">{text}</p>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="glass-card neon-border-hover rounded-xl p-5">
      <span className="text-[#deff0a]">{icon}</span>
      <h3 className="mt-3 font-semibold text-stone-100">{title}</h3>
      <p className="mt-1 text-sm text-stone-400 leading-relaxed">{text}</p>
    </div>
  );
}
