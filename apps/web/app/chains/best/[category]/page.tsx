import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convex-server";
import { BreadcrumbSchema } from "@/components/SchemaMarkup";
import { ChainCardRedesign } from "@/components/chains/ChainCardRedesign";
import { CURATED_CATEGORY_MAP, CURATED_CATEGORIES } from "../curated-categories";

interface Props {
  params: Promise<{ category: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const cat = CURATED_CATEGORY_MAP.get(category);
  if (!cat) return { title: "Not Found" };

  return {
    title: `${cat.title} | ProChain`,
    description: cat.description,
    openGraph: {
      title: `${cat.title} | ProChain`,
      description: cat.description,
      url: `https://pluginradar.com/chains/best/${cat.slug}`,
    },
  };
}

export function generateStaticParams() {
  return CURATED_CATEGORIES.map((cat) => ({ category: cat.slug }));
}

export default async function CuratedCategoryPage({ params }: Props) {
  const { category } = await params;
  const cat = CURATED_CATEGORY_MAP.get(category);
  if (!cat) notFound();

  let chains: any[] = [];
  try {
    const result = await convexServer.query(
      api.pluginDirectory.browseChainsPaginated,
      {
        useCaseGroup: cat.useCaseGroup,
        genre: cat.genre || undefined,
        sortBy: "popular",
        limit: 20,
        offset: 0,
      }
    );
    chains = result?.chains || [];
  } catch {
    // Convex unavailable — show empty state
  }

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Chains", url: "/chains" },
          { name: "Best", url: "/chains/best" },
          { name: cat.title, url: `/chains/best/${cat.slug}` },
        ]}
      />

      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Header */}
        <div className="mb-10">
          <nav className="flex items-center gap-1.5 text-sm text-stone-500 mb-4">
            <Link href="/chains" className="hover:text-stone-300 transition">
              Chains
            </Link>
            <CaretRight className="w-3 h-3" />
            <Link
              href="/chains/best"
              className="hover:text-stone-300 transition"
            >
              Best
            </Link>
            <CaretRight className="w-3 h-3" />
            <span className="text-stone-300">{cat.title}</span>
          </nav>

          <h1 className="text-3xl font-bold text-white mb-3">{cat.title}</h1>
          <p className="text-stone-400 text-lg max-w-3xl">{cat.description}</p>
        </div>

        {/* Chain Grid */}
        {chains.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {chains.map((chain: any) => (
              <ChainCardRedesign key={chain._id} chain={chain} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 border border-white/[0.06] rounded-2xl bg-white/[0.02] mb-12">
            <p className="text-stone-400 text-lg mb-2">No chains yet</p>
            <p className="text-stone-600 text-sm mb-6">
              Be the first to share a chain in this category.
            </p>
            <Link
              href="/download"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#deff0a] text-black font-semibold rounded-xl hover:bg-[#d4f000] transition text-sm"
            >
              Download ProChain
              <CaretRight className="w-3.5 h-3.5" weight="bold" />
            </Link>
          </div>
        )}

        {/* Browse all + CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-white/[0.06]">
          <Link
            href="/chains"
            className="text-stone-400 hover:text-white transition text-sm"
          >
            Browse all chains
          </Link>
          <Link
            href="/download"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#deff0a] text-black font-semibold rounded-xl hover:bg-[#d4f000] transition text-sm"
          >
            Load in ProChain
            <CaretRight className="w-3.5 h-3.5" weight="bold" />
          </Link>
        </div>
      </div>
    </>
  );
}
