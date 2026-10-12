import type { Metadata } from "next";
import Link from "next/link";
import {
  Microphone,
  WaveSquare,
  Guitar,
  CurrencyCircleDollar,
  CassetteTape,
  Faders,
  CaretRight,
} from "@phosphor-icons/react/dist/ssr";
import { BreadcrumbSchema } from "@/components/SchemaMarkup";
import { CURATED_CATEGORIES } from "./curated-categories";

export const metadata: Metadata = {
  title: "Best Plugin Chains by Category | ProChain",
  description:
    "Browse curated collections of the best plugin chains for vocals, mastering, guitar, mixing, and more. Community-rated signal chains for every genre and workflow.",
  openGraph: {
    title: "Best Plugin Chains by Category | ProChain",
    description:
      "Browse curated collections of the best plugin chains for vocals, mastering, guitar, mixing, and more.",
    url: "https://pluginradar.com/chains/best",
  },
};

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Microphone,
  WaveSquare,
  Guitar,
  CurrencyCircleDollar,
  CassetteTape,
  Faders,
};

export default function BestChainsIndexPage() {
  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Chains", url: "/chains" },
          { name: "Best", url: "/chains/best" },
        ]}
      />

      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-3">
            Best Plugin Chains by Category
          </h1>
          <p className="text-stone-400 text-lg max-w-2xl">
            Curated collections of top-rated signal chains for every genre and
            workflow. Built and rated by the community.
          </p>
        </div>

        {/* Category Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CURATED_CATEGORIES.map((cat) => {
            const Icon = ICON_MAP[cat.icon] || Faders;
            return (
              <Link
                key={cat.slug}
                href={`/chains/best/${cat.slug}`}
                className="group block rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] hover:from-white/[0.07] hover:to-white/[0.03] transition-all duration-300 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[#deff0a]" weight="bold" />
                  </div>
                  <CaretRight className="w-4 h-4 text-stone-600 group-hover:text-stone-400 group-hover:translate-x-0.5 transition-all mt-1" />
                </div>
                <h2 className="font-semibold text-white text-lg mb-2 group-hover:text-white transition">
                  {cat.title}
                </h2>
                <p className="text-sm text-stone-500 leading-relaxed">
                  {cat.shortDescription}
                </p>
              </Link>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-stone-500 text-sm mb-4">
            Load any chain directly into your DAW with ProChain.
          </p>
          <Link
            href="/download"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#deff0a] text-black font-semibold rounded-xl hover:bg-[#d4f000] transition"
          >
            Download ProChain
            <CaretRight className="w-4 h-4" weight="bold" />
          </Link>
        </div>
      </div>
    </>
  );
}
