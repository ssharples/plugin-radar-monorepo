"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowRight, ArrowLeft, Trophy, TrendUp, Scales } from "@phosphor-icons/react";
import {
  BreadcrumbSchema,
  ComparisonSchema,
  FAQSchema
} from "@/components/SchemaMarkup";

export default function ComparePage() {
  const params = useParams();
  const slug = params.slug as string;
  const data = useQuery(api.agentEnrich.getComparisonWithPlugins, { slug });
  const loading = data === undefined;

  if (loading) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-8 animate-pulse">
        <div className="h-4 bg-white/[0.03] rounded w-48 mb-6" />
        <div className="h-10 bg-white/[0.03] rounded w-96 mb-2" />
        <div className="h-4 bg-white/[0.03] rounded w-64 mb-8" />
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl h-80" />
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl h-80" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-16 text-center">
        <Scales className="w-12 h-12 text-stone-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-stone-100 mb-4">Comparison Not Found</h1>
        <Link href="/compare" className="text-amber-400 hover:text-amber-300 transition inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          Back to Comparisons
        </Link>
      </div>
    );
  }

  const { pluginA, pluginB } = data;

  // Generate FAQ questions for schema markup
  const faqQuestions = data.faqs ?? [
    {
      question: `What's the difference between ${pluginA.name} and ${pluginB.name}?`,
      answer: `${pluginA.name} is priced at ${pluginA.price} while ${pluginB.name} costs ${pluginB.price}. Both are ${data.category} plugins. ${data.priceWinner === 'a' ? pluginA.name : pluginB.name} offers better value, while ${data.trendingWinner === 'a' ? pluginA.name : pluginB.name} is currently more popular based on recent discussions.`
    },
    {
      question: `Which ${data.category} plugin is better: ${pluginA.name} or ${pluginB.name}?`,
      answer: `Both are excellent ${data.category} plugins. Try both demos to see which workflow suits you better.`
    },
  ];

  // Breadcrumb items
  const breadcrumbItems = [
    { name: 'Home', url: '/' },
    { name: 'Compare', url: '/compare' },
    { name: data.title, url: `/compare/${data.slug}` }
  ];

  return (
    <div className="relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] via-transparent to-transparent pointer-events-none" />

      {/* Schema.org Structured Data */}
      <BreadcrumbSchema items={breadcrumbItems} />
      <ComparisonSchema
        title={data.title}
        description={data.metaDescription}
        slug={data.slug}
        pluginA={{
          name: pluginA.name,
          slug: pluginA.slug,
          manufacturer: pluginA.manufacturer,
          price: pluginA.priceRaw,
          currency: 'USD',
          isFree: pluginA.isFree
        }}
        pluginB={{
          name: pluginB.name,
          slug: pluginB.slug,
          manufacturer: pluginB.manufacturer,
          price: pluginB.priceRaw,
          currency: 'USD',
          isFree: pluginB.isFree
        }}
      />
      <FAQSchema questions={faqQuestions} />

      <div className="container mx-auto px-4 lg:px-6 py-8 max-w-5xl relative">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-stone-500 mb-6">
          <Link href="/" className="hover:text-stone-100 transition">Home</Link>
          <span className="text-stone-600">/</span>
          <Link href="/compare" className="hover:text-stone-100 transition">Compare</Link>
          <span className="text-stone-600">/</span>
          <span className="text-stone-300">{data.title}</span>
        </nav>

        {/* Title */}
        <h1
          className="text-3xl font-bold text-stone-100 mb-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {data.title}
        </h1>
        <p className="text-stone-400 mb-8">{data.metaDescription}</p>

        <div className="section-line mb-8" />

        {/* Main Comparison Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <PluginCard plugin={pluginA} isWinner={data.priceWinner === 'a' || data.trendingWinner === 'a'} />
          <PluginCard plugin={pluginB} isWinner={data.priceWinner === 'b' || data.trendingWinner === 'b'} />
        </div>

        {/* Comparison Table */}
        <div className="glass-card rounded-xl overflow-hidden mb-12">
          <div className="grid grid-cols-3 bg-white/[0.04] p-4 font-semibold text-stone-100">
            <div>Feature</div>
            <div className="text-center">{pluginA.name}</div>
            <div className="text-center">{pluginB.name}</div>
          </div>

          <ComparisonRow
            label="Price"
            valueA={pluginA.price}
            valueB={pluginB.price}
            winner={data.priceWinner}
          />
          <ComparisonRow
            label="Manufacturer"
            valueA={pluginA.manufacturer}
            valueB={pluginB.manufacturer}
          />
          <ComparisonRow
            label="Category"
            valueA={pluginA.category}
            valueB={pluginB.category}
          />
          <ComparisonRow
            label="Formats"
            valueA={pluginA.formats.join(', ') || 'N/A'}
            valueB={pluginB.formats.join(', ') || 'N/A'}
          />
          <ComparisonRow
            label="Platforms"
            valueA={pluginA.platforms.join(', ') || 'N/A'}
            valueB={pluginB.platforms.join(', ') || 'N/A'}
          />
        </div>

        {/* Verdict */}
        <div className="bg-gradient-to-br from-amber-500/[0.06] to-transparent glass-card !border-amber-500/20 rounded-xl p-6 mb-12">
          <h2
            className="text-xl font-semibold text-stone-100 mb-4"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Which Should You Choose?
          </h2>
          <div className="text-stone-300 space-y-3">
            {data.summary && <p>{data.summary}</p>}
            {data.priceWinner && (
              <p className="flex items-start gap-2">
                <Trophy className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" weight="fill" />
                <span>
                  <strong className="text-amber-400">Best Value:</strong>{' '}
                  {data.priceWinner === 'a' ? pluginA.name : pluginB.name} is more affordable
                  {data.priceWinner === 'a' && pluginA.isFree ? " (it's free!)" : ''}.
                </span>
              </p>
            )}
            {data.trendingWinner && (
              <p className="flex items-start gap-2">
                <TrendUp className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
                <span>
                  <strong className="text-orange-400">Most Popular:</strong>{' '}
                  {data.trendingWinner === 'a' ? pluginA.name : pluginB.name} is trending higher
                  with more recent discussions and tutorials online.
                </span>
              </p>
            )}
            <p className="text-stone-400 text-sm mt-4">
              Both are great {data.category} plugins. Try the demos to see which workflow suits you better.
            </p>
          </div>
        </div>

        {/* CTA Links */}
        <div className="grid md:grid-cols-2 gap-4">
          <Link
            href={`/plugins/${pluginA.slug}`}
            className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-900 font-semibold py-3 px-6 rounded-xl transition shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
          >
            View {pluginA.name}
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href={`/plugins/${pluginB.slug}`}
            className="flex items-center justify-center gap-2 bg-white/[0.05] hover:bg-white/[0.08] text-stone-200 font-medium py-3 px-6 rounded-xl transition border border-white/[0.06]"
          >
            View {pluginB.name}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function PluginCard({ plugin, isWinner }: { plugin: { name: string; manufacturer: string; description?: string; price: string; isFree: boolean; imageUrl?: string; productUrl: string; tags: string[] }; isWinner: boolean }) {
  return (
    <div className={`glass-card rounded-xl p-6 ${isWinner ? '!border-amber-500/40' : ''}`}>
      {isWinner && (
        <div className="text-amber-400 text-sm font-semibold mb-3 flex items-center gap-1">
          <Trophy className="w-4 h-4" weight="fill" />
          Recommended
        </div>
      )}

      <div className="aspect-video rounded-xl overflow-hidden mb-4 bg-white/[0.03]">
        {plugin.imageUrl ? (
          <img src={plugin.imageUrl} alt={plugin.name} className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-600">
            <Scales className="w-12 h-12" />
          </div>
        )}
      </div>

      <h3
        className="text-xl font-bold text-stone-100 mb-1"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {plugin.name}
      </h3>
      <p className="text-stone-400 text-sm mb-3">by {plugin.manufacturer}</p>

      {plugin.description && (
        <p className="text-stone-300 text-sm mb-4 line-clamp-3">{plugin.description}</p>
      )}

      <div className="flex items-center justify-between">
        <span className={`text-2xl font-bold ${plugin.isFree ? 'text-green-400' : 'text-stone-100'}`}>
          {plugin.price}
        </span>
        <a
          href={plugin.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-400 hover:text-amber-300 text-sm transition flex items-center gap-1"
        >
          Official Page
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </div>

      {plugin.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {plugin.tags.slice(0, 4).map(tag => (
            <span key={tag} className="text-xs px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-stone-400">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ComparisonRow({
  label,
  valueA,
  valueB,
  winner
}: {
  label: string;
  valueA: string;
  valueB: string;
  winner?: string | null;
}) {
  return (
    <div className="grid grid-cols-3 p-4 border-t border-white/[0.06]">
      <div className="text-stone-400">{label}</div>
      <div className={`text-center ${winner === 'a' ? 'text-amber-400 font-semibold' : 'text-stone-100'}`}>
        {valueA}
      </div>
      <div className={`text-center ${winner === 'b' ? 'text-amber-400 font-semibold' : 'text-stone-100'}`}>
        {valueB}
      </div>
    </div>
  );
}
