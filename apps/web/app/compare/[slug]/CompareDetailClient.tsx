"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ArrowRight,
  ArrowLeft,
  ArrowDown,
  Trophy,
  TrendUp,
  Scales,
  Check,
  X,
  CaretDown,
  Lightning,
  Target,
  MusicNote,
  SlidersHorizontal,
  Cpu,
  GameController,
} from "@phosphor-icons/react";
import { getCategoryBadgeStyle } from "@/lib/category-colors";
import {
  BreadcrumbSchema,
  ComparisonSchema,
  FAQSchema,
} from "@/components/SchemaMarkup";

interface CompareDetailClientProps {
  slug: string;
  initialData: any | null;
}

export default function CompareDetailClient({
  slug,
  initialData,
}: CompareDetailClientProps) {
  const liveData = useQuery(api.agentEnrich.getComparisonWithPlugins, { slug });
  const data = liveData ?? initialData;
  const loading = data === undefined;

  const relatedComparisons = useQuery(
    api.comparisons.getRelatedByCategory,
    data ? { category: data.category, excludeSlug: slug, limit: 6 } : "skip"
  );

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
        <h1 className="text-2xl font-bold text-stone-100 mb-4">
          Comparison Not Found
        </h1>
        <Link
          href="/compare"
          className="text-white hover:text-[#deff0a] transition inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Comparisons
        </Link>
      </div>
    );
  }

  const { pluginA, pluginB } = data;
  const categoryLabel = data.category
    ? data.category.charAt(0).toUpperCase() + data.category.slice(1)
    : "Audio";

  // Generate FAQ questions for schema markup
  const faqQuestions = data.faqs?.length
    ? data.faqs
    : [
        {
          question: `Is ${pluginA.name} better than ${pluginB.name}?`,
          answer:
            data.summary ||
            `Both ${pluginA.name} and ${pluginB.name} are excellent ${categoryLabel} plugins. ${data.priceWinner === "a" ? pluginA.name + " offers better value" : data.priceWinner === "b" ? pluginB.name + " offers better value" : "They are comparably priced"}. ${data.trendingWinner === "a" ? pluginA.name + " is currently more popular" : data.trendingWinner === "b" ? pluginB.name + " is currently more popular" : "Both are widely discussed"} in online communities.`,
        },
        {
          question: `Is ${pluginA.name} worth the price over ${pluginB.name}?`,
          answer: `${pluginA.name} is priced at ${pluginA.price} while ${pluginB.name} costs ${pluginB.price}. ${data.priceWinner === "a" ? pluginA.name + " is the more affordable option" : data.priceWinner === "b" ? pluginB.name + " is the more affordable option" : "Both are similarly priced"}.${pluginA.isFree ? " " + pluginA.name + " is completely free." : ""}${pluginB.isFree ? " " + pluginB.name + " is completely free." : ""} Consider trying demos of both to determine which one best fits your workflow.`,
        },
        {
          question: `Which is better for ${pluginA.useCases?.[0] || pluginA.worksWellOn?.[0] || "mixing"}: ${pluginA.name} or ${pluginB.name}?`,
          answer: `For ${pluginA.useCases?.[0] || pluginA.worksWellOn?.[0] || "mixing"}, both plugins are viable options. ${pluginA.name} ${pluginA.tonalCharacter?.length ? "is known for its " + pluginA.tonalCharacter.join(", ") + " character" : "is a solid choice"}, while ${pluginB.name} ${pluginB.tonalCharacter?.length ? "offers a " + pluginB.tonalCharacter.join(", ") + " sound" : "is equally capable"}. Your choice depends on the sonic character you prefer.`,
        },
        {
          question: `Can ${pluginA.name} replace ${pluginB.name}?`,
          answer: `While both are ${categoryLabel} plugins, ${pluginA.name} and ${pluginB.name} have different strengths. ${pluginA.effectType ? pluginA.name + " is a " + pluginA.effectType : ""} ${pluginB.effectType ? (pluginA.effectType ? "while " : "") + pluginB.name + " is a " + pluginB.effectType : ""}. Many producers use both for different situations rather than treating them as direct replacements.`,
        },
        {
          question: `What's the main difference between ${pluginA.name} and ${pluginB.name}?`,
          answer: `The key differences are: price (${pluginA.price} vs ${pluginB.price}), ${pluginA.tonalCharacter?.length || pluginB.tonalCharacter?.length ? "tonal character (" + (pluginA.tonalCharacter?.join(", ") || "neutral") + " vs " + (pluginB.tonalCharacter?.join(", ") || "neutral") + "), " : ""}and target use case. ${data.summary || "Both are well-regarded in the audio production community."}`,
        },
      ];

  // Breadcrumb items
  const breadcrumbItems = [
    { name: "Home", url: "/" },
    { name: "Compare", url: "/compare" },
    {
      name: `${pluginA.name} vs ${pluginB.name}`,
      url: `/compare/${data.slug}`,
    },
  ];

  return (
    <div className="relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none" />

      {/* Schema.org Structured Data */}
      <BreadcrumbSchema items={breadcrumbItems} />
      <ComparisonSchema
        title={`${pluginA.name} vs ${pluginB.name}`}
        description={data.metaDescription}
        slug={data.slug}
        pluginA={{
          name: pluginA.name,
          slug: pluginA.slug,
          manufacturer: pluginA.manufacturer,
          price: pluginA.priceRaw,
          currency: "USD",
          isFree: pluginA.isFree,
        }}
        pluginB={{
          name: pluginB.name,
          slug: pluginB.slug,
          manufacturer: pluginB.manufacturer,
          price: pluginB.priceRaw,
          currency: "USD",
          isFree: pluginB.isFree,
        }}
      />
      <FAQSchema questions={faqQuestions} />

      <div className="container mx-auto px-4 lg:px-6 py-8 max-w-5xl relative">
        {/* ==================== (a) Breadcrumbs ==================== */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm text-stone-500 mb-6"
        >
          <Link href="/" className="hover:text-stone-100 transition">
            Home
          </Link>
          <span className="text-stone-600">/</span>
          <Link href="/compare" className="hover:text-stone-100 transition">
            Compare
          </Link>
          <span className="text-stone-600">/</span>
          <span className="text-stone-300">
            {pluginA.name} vs {pluginB.name}
          </span>
        </nav>

        {/* ==================== (b) H1 Title ==================== */}
        <h1
          className="text-3xl md:text-4xl font-bold text-stone-100 mb-3"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pluginA.name} vs {pluginB.name}
        </h1>
        <p className="text-stone-400 text-lg mb-8 max-w-3xl">
          {data.metaDescription ||
            `Compare ${pluginA.name} and ${pluginB.name} — pricing, features, and which ${categoryLabel} plugin is right for your mix.`}
        </p>

        <div className="section-line mb-8" />

        {/* ==================== (c) At a Glance Verdict Box ==================== */}
        <div className="glass-card !border-[#deff0a]/20 rounded-xl p-6 mb-10">
          <h2
            className="text-lg font-semibold text-stone-100 mb-3 flex items-center gap-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <Lightning className="w-5 h-5 text-[#deff0a]" weight="fill" />
            At a Glance
          </h2>
          <p className="text-stone-300 mb-4 leading-relaxed">
            {data.summary ||
              `${pluginA.name} (${pluginA.price}) and ${pluginB.name} (${pluginB.price}) are both ${categoryLabel} plugins. ${data.priceWinner ? (data.priceWinner === "a" ? pluginA.name : pluginB.name) + " wins on price" : "They are comparably priced"}${data.trendingWinner ? ", while " + (data.trendingWinner === "a" ? pluginA.name : pluginB.name) + " is currently more popular" : ""}.`}
          </p>
          <div className="flex flex-wrap gap-3 mb-4">
            {data.priceWinner && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#deff0a]/10 border border-[#deff0a]/30 rounded-lg text-sm font-medium text-[#deff0a]">
                <Trophy className="w-4 h-4" weight="fill" />
                Best Value:{" "}
                {data.priceWinner === "a" ? pluginA.name : pluginB.name}
              </span>
            )}
            {data.trendingWinner && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 rounded-lg text-sm font-medium text-orange-400">
                <TrendUp className="w-4 h-4" />
                Most Popular:{" "}
                {data.trendingWinner === "a" ? pluginA.name : pluginB.name}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium capitalize"
              style={getCategoryBadgeStyle(data.category)}
            >
              {categoryLabel}
            </span>
          </div>
          <a
            href="#comparison-table"
            className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-[#deff0a] transition"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            Jump to detailed comparison
          </a>
        </div>

        {/* ==================== (d) Side-by-Side Plugin Cards ==================== */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <PluginCard
            plugin={pluginA}
            isWinner={data.priceWinner === "a"}
            winnerLabel={
              data.priceWinner === "a"
                ? "Best Value"
                : data.trendingWinner === "a"
                  ? "Most Popular"
                  : undefined
            }
          />
          <PluginCard
            plugin={pluginB}
            isWinner={data.priceWinner === "b"}
            winnerLabel={
              data.priceWinner === "b"
                ? "Best Value"
                : data.trendingWinner === "b"
                  ? "Most Popular"
                  : undefined
            }
          />
        </div>

        {/* ==================== (e) Feature Comparison Table ==================== */}
        <div id="comparison-table" className="scroll-mt-8 mb-12">
          <h2
            className="text-xl font-semibold text-stone-100 mb-4"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Feature Comparison
          </h2>
          <div className="glass-card rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_1fr] bg-white/[0.04] p-4 font-semibold text-stone-100 text-sm md:text-base">
              <div>Feature</div>
              <div className="text-center">{pluginA.name}</div>
              <div className="text-center">{pluginB.name}</div>
            </div>

            {/* Scrollable on mobile */}
            <div className="divide-y divide-white/[0.06]">
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
                capitalize
              />
              {(pluginA.subcategory || pluginB.subcategory) && (
                <ComparisonRow
                  label="Subcategory"
                  valueA={pluginA.subcategory || "---"}
                  valueB={pluginB.subcategory || "---"}
                  capitalize
                />
              )}
              {(pluginA.effectType || pluginB.effectType) && (
                <ComparisonRow
                  label="Effect Type"
                  valueA={pluginA.effectType || "---"}
                  valueB={pluginB.effectType || "---"}
                  capitalize
                />
              )}
              {(pluginA.circuitEmulation || pluginB.circuitEmulation) && (
                <ComparisonRow
                  label="Circuit Emulation"
                  valueA={pluginA.circuitEmulation || "---"}
                  valueB={pluginB.circuitEmulation || "---"}
                />
              )}
              {(pluginA.tonalCharacter?.length ||
                pluginB.tonalCharacter?.length) && (
                <ComparisonRow
                  label="Tonal Character"
                  valueA={pluginA.tonalCharacter?.join(", ") || "---"}
                  valueB={pluginB.tonalCharacter?.join(", ") || "---"}
                  capitalize
                />
              )}
              {(pluginA.keyFeatures?.length ||
                pluginB.keyFeatures?.length) && (
                <KeyFeaturesRow
                  pluginA={pluginA}
                  pluginB={pluginB}
                />
              )}
              <ComparisonRow
                label="Formats"
                valueA={
                  pluginA.formats?.length
                    ? pluginA.formats.join(", ")
                    : "N/A"
                }
                valueB={
                  pluginB.formats?.length
                    ? pluginB.formats.join(", ")
                    : "N/A"
                }
              />
              <ComparisonRow
                label="Platforms"
                valueA={
                  pluginA.platforms?.length
                    ? pluginA.platforms.join(", ")
                    : "N/A"
                }
                valueB={
                  pluginB.platforms?.length
                    ? pluginB.platforms.join(", ")
                    : "N/A"
                }
                capitalize
              />
              {(pluginA.skillLevel || pluginB.skillLevel) && (
                <ComparisonRow
                  label="Skill Level"
                  valueA={pluginA.skillLevel || "---"}
                  valueB={pluginB.skillLevel || "---"}
                  capitalize
                />
              )}
              {(pluginA.cpuUsage || pluginB.cpuUsage) && (
                <ComparisonRow
                  label="CPU Usage"
                  valueA={pluginA.cpuUsage || "---"}
                  valueB={pluginB.cpuUsage || "---"}
                  capitalize
                />
              )}
              {(pluginA.learningCurve || pluginB.learningCurve) && (
                <ComparisonRow
                  label="Learning Curve"
                  valueA={pluginA.learningCurve || "---"}
                  valueB={pluginB.learningCurve || "---"}
                  capitalize
                />
              )}
              <ComparisonRow
                label="Has Demo / Trial"
                valueA={
                  pluginA.hasDemo
                    ? "Yes"
                    : pluginA.hasTrial
                      ? "Trial"
                      : "No"
                }
                valueB={
                  pluginB.hasDemo
                    ? "Yes"
                    : pluginB.hasTrial
                      ? "Trial"
                      : "No"
                }
              />
              {(pluginA.mentionScore || pluginB.mentionScore) && (
                <ComparisonRow
                  label="Trending Score"
                  valueA={
                    pluginA.mentionScore
                      ? String(Math.round(pluginA.mentionScore))
                      : "---"
                  }
                  valueB={
                    pluginB.mentionScore
                      ? String(Math.round(pluginB.mentionScore))
                      : "---"
                  }
                  winner={data.trendingWinner}
                />
              )}
            </div>
          </div>
        </div>

        {/* ==================== (f) Pros & Cons Section ==================== */}
        {(data.pros || data.cons) && (
          <div className="mb-12">
            <h2
              className="text-xl font-semibold text-stone-100 mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Pros & Cons
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <ProsConsCard
                pluginName={pluginA.name}
                pros={data.pros?.a}
                cons={data.cons?.a}
              />
              <ProsConsCard
                pluginName={pluginB.name}
                pros={data.pros?.b}
                cons={data.cons?.b}
              />
            </div>
          </div>
        )}

        {/* ==================== (g) Best For / Use Cases ==================== */}
        {(data.bestFor ||
          pluginA.useCases?.length ||
          pluginB.useCases?.length ||
          pluginA.worksWellOn?.length ||
          pluginB.worksWellOn?.length ||
          pluginA.genreSuitability?.length ||
          pluginB.genreSuitability?.length) && (
          <div className="mb-12">
            <h2
              className="text-xl font-semibold text-stone-100 mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Who Should Use Which?
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <BestForCard
                pluginName={pluginA.name}
                bestFor={data.bestFor?.a}
                useCases={pluginA.useCases}
                worksWellOn={pluginA.worksWellOn}
                genreSuitability={pluginA.genreSuitability}
              />
              <BestForCard
                pluginName={pluginB.name}
                bestFor={data.bestFor?.b}
                useCases={pluginB.useCases}
                worksWellOn={pluginB.worksWellOn}
                genreSuitability={pluginB.genreSuitability}
              />
            </div>
          </div>
        )}

        {/* ==================== (h) Detailed Verdict ==================== */}
        <div className="bg-gradient-to-br from-white/[0.06] to-transparent glass-card !border-[#deff0a]/20 rounded-xl p-6 mb-12">
          <h2
            className="text-xl font-semibold text-stone-100 mb-4"
            style={{ fontFamily: "var(--font-display)" }}
          >
            The Verdict: Which Should You Choose?
          </h2>
          <div className="text-stone-300 space-y-4">
            {data.verdict ? (
              <p className="leading-relaxed">{data.verdict}</p>
            ) : data.summary ? (
              <p className="leading-relaxed">{data.summary}</p>
            ) : (
              <p className="leading-relaxed">
                Both {pluginA.name} and {pluginB.name} are solid{" "}
                {categoryLabel.toLowerCase()} plugins with different strengths.
                Your choice should depend on your workflow, budget, and sonic
                preferences.
              </p>
            )}

            {data.priceWinner && (
              <div className="flex items-start gap-3 bg-[#deff0a]/5 border border-[#deff0a]/20 rounded-lg p-4">
                <Trophy
                  className="w-5 h-5 text-[#deff0a] mt-0.5 shrink-0"
                  weight="fill"
                />
                <div>
                  <strong className="text-[#deff0a]">Best Value</strong>
                  <p className="text-stone-300 text-sm mt-0.5">
                    {data.priceWinner === "a" ? pluginA.name : pluginB.name} is
                    the more affordable option at{" "}
                    {data.priceWinner === "a" ? pluginA.price : pluginB.price}
                    {(data.priceWinner === "a" && pluginA.isFree) ||
                    (data.priceWinner === "b" && pluginB.isFree)
                      ? " (completely free!)"
                      : ""}
                    .
                  </p>
                </div>
              </div>
            )}

            {data.trendingWinner && (
              <div className="flex items-start gap-3 bg-orange-500/5 border border-orange-500/20 rounded-lg p-4">
                <TrendUp className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
                <div>
                  <strong className="text-orange-400">Most Popular</strong>
                  <p className="text-stone-300 text-sm mt-0.5">
                    {data.trendingWinner === "a" ? pluginA.name : pluginB.name}{" "}
                    is trending higher with more recent discussions, tutorials,
                    and mentions across the web.
                  </p>
                </div>
              </div>
            )}

            <p className="text-stone-400 text-sm pt-2">
              We recommend trying demos of both plugins to see which workflow
              and sonic character suits your projects best.
            </p>
          </div>
        </div>

        {/* ==================== (i) FAQ Section ==================== */}
        <div className="mb-12">
          <h2
            className="text-xl font-semibold text-stone-100 mb-4"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Frequently Asked Questions
          </h2>
          <div className="space-y-2">
            {faqQuestions.map(
              (faq: { question: string; answer: string }, i: number) => (
                <FAQAccordionItem
                  key={i}
                  question={faq.question}
                  answer={faq.answer}
                />
              )
            )}
          </div>
        </div>

        {/* ==================== (j) Related Comparisons ==================== */}
        {relatedComparisons && relatedComparisons.length > 0 && (
          <div className="mb-12">
            <h2
              className="text-xl font-semibold text-stone-100 mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              You Might Also Compare
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {relatedComparisons.map((c: any) => (
                <Link
                  key={c.slug}
                  href={`/compare/${c.slug}`}
                  className="block glass-card rounded-xl p-4 hover:border-[#deff0a]/30 transition group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded capitalize"
                      style={getCategoryBadgeStyle(c.category)}
                    >
                      {c.category}
                    </span>
                    <span className="text-white text-sm flex items-center gap-1 group-hover:gap-2 transition-all opacity-60 group-hover:opacity-100">
                      Compare
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <p className="text-stone-100 font-medium group-hover:text-white transition">
                    {c.pluginA} vs {c.pluginB}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ==================== (k) CTA Section ==================== */}
        <div className="glass-card rounded-xl p-6 mb-8">
          <h2
            className="text-lg font-semibold text-stone-100 mb-4 text-center"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Explore Both Plugins
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Link
              href={`/plugins/${pluginA.slug}`}
              className="flex items-center justify-center gap-2 bg-white hover:bg-[#deff0a] text-stone-900 font-semibold py-3 px-6 rounded-xl transition shadow-lg shadow-[#deff0a]/10 hover:shadow-[#deff0a]/20"
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
    </div>
  );
}

/* =========================================================================
   SUB-COMPONENTS
   ========================================================================= */

function PluginCard({
  plugin,
  isWinner,
  winnerLabel,
}: {
  plugin: any;
  isWinner: boolean;
  winnerLabel?: string;
}) {
  return (
    <div
      className={`glass-card rounded-xl p-6 ${isWinner ? "!border-[#deff0a]/40" : ""}`}
    >
      {winnerLabel && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-3 rounded-lg bg-[#deff0a]/10 border border-[#deff0a]/30 text-[#deff0a] text-sm font-semibold">
          <Trophy className="w-4 h-4" weight="fill" />
          {winnerLabel}
        </div>
      )}

      <div className="aspect-video rounded-xl overflow-hidden mb-4 bg-white/[0.03]">
        {plugin.imageUrl ? (
          <img
            src={plugin.imageUrl}
            alt={`${plugin.name} by ${plugin.manufacturer}`}
            className="w-full h-full object-contain"
            loading="lazy"
          />
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
      <p className="text-stone-400 text-sm mb-3">
        by{" "}
        <Link
          href={`/manufacturers/${plugin.manufacturerSlug}`}
          className="hover:text-stone-200 transition"
        >
          {plugin.manufacturer}
        </Link>
      </p>

      {/* Price */}
      <div className="flex items-center justify-between mb-3">
        <span
          className={`text-2xl font-bold ${plugin.isFree ? "text-green-400" : "text-stone-100"}`}
        >
          {plugin.price}
        </span>
        {plugin.effectType && (
          <span className="text-xs px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-stone-400 capitalize">
            {plugin.effectType}
          </span>
        )}
      </div>

      {/* Key specs */}
      <div className="space-y-1.5 text-sm text-stone-400 mb-4">
        {plugin.formats?.length > 0 && (
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span>{plugin.formats.join(", ")}</span>
          </div>
        )}
        {plugin.platforms?.length > 0 && (
          <div className="flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 shrink-0" />
            <span className="capitalize">{plugin.platforms.join(", ")}</span>
          </div>
        )}
        {plugin.mentionScore != null && plugin.mentionScore > 0 && (
          <div className="flex items-center gap-2">
            <TrendUp className="w-3.5 h-3.5 shrink-0" />
            <span>Trending score: {Math.round(plugin.mentionScore)}</span>
          </div>
        )}
      </div>

      {/* Description */}
      {plugin.description && (
        <p className="text-stone-300 text-sm mb-4 line-clamp-3">
          {plugin.description}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Link
          href={`/plugins/${plugin.slug}`}
          className="text-white hover:text-[#deff0a] text-sm transition flex items-center gap-1"
        >
          View Details
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <a
          href={plugin.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-stone-500 hover:text-stone-300 text-sm transition flex items-center gap-1"
        >
          Official Page
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}

function ComparisonRow({
  label,
  valueA,
  valueB,
  winner,
  capitalize: shouldCapitalize,
}: {
  label: string;
  valueA: string;
  valueB: string;
  winner?: string | null;
  capitalize?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr] p-4">
      <div className="text-stone-400 text-sm">{label}</div>
      <div
        className={`text-center text-sm ${shouldCapitalize ? "capitalize" : ""} ${
          winner === "a"
            ? "text-[#deff0a] font-semibold"
            : "text-stone-200"
        }`}
      >
        {valueA}
        {winner === "a" && (
          <Trophy
            className="w-3.5 h-3.5 inline-block ml-1.5 text-[#deff0a]"
            weight="fill"
          />
        )}
      </div>
      <div
        className={`text-center text-sm ${shouldCapitalize ? "capitalize" : ""} ${
          winner === "b"
            ? "text-[#deff0a] font-semibold"
            : "text-stone-200"
        }`}
      >
        {valueB}
        {winner === "b" && (
          <Trophy
            className="w-3.5 h-3.5 inline-block ml-1.5 text-[#deff0a]"
            weight="fill"
          />
        )}
      </div>
    </div>
  );
}

function KeyFeaturesRow({
  pluginA,
  pluginB,
}: {
  pluginA: any;
  pluginB: any;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr] p-4">
      <div className="text-stone-400 text-sm">Key Features</div>
      <div className="text-sm text-stone-200 px-2">
        {pluginA.keyFeatures?.length ? (
          <ul className="list-disc list-inside space-y-0.5">
            {pluginA.keyFeatures.slice(0, 5).map((f: string, i: number) => (
              <li key={i} className="text-stone-300">
                {f}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-stone-500">---</span>
        )}
      </div>
      <div className="text-sm text-stone-200 px-2">
        {pluginB.keyFeatures?.length ? (
          <ul className="list-disc list-inside space-y-0.5">
            {pluginB.keyFeatures.slice(0, 5).map((f: string, i: number) => (
              <li key={i} className="text-stone-300">
                {f}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-stone-500">---</span>
        )}
      </div>
    </div>
  );
}

function ProsConsCard({
  pluginName,
  pros,
  cons,
}: {
  pluginName: string;
  pros?: string[];
  cons?: string[];
}) {
  if (!pros?.length && !cons?.length) return null;

  return (
    <div className="glass-card rounded-xl p-5">
      <h3
        className="text-lg font-semibold text-stone-100 mb-4"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {pluginName}
      </h3>

      {pros && pros.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium text-green-400 mb-2">Pros</p>
          <ul className="space-y-1.5">
            {pros.map((pro, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-stone-300"
              >
                <Check
                  className="w-4 h-4 text-green-400 mt-0.5 shrink-0"
                  weight="bold"
                />
                {pro}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cons && cons.length > 0 && (
        <div>
          <p className="text-sm font-medium text-red-400 mb-2">Cons</p>
          <ul className="space-y-1.5">
            {cons.map((con, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-stone-300"
              >
                <X
                  className="w-4 h-4 text-red-400 mt-0.5 shrink-0"
                  weight="bold"
                />
                {con}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BestForCard({
  pluginName,
  bestFor,
  useCases,
  worksWellOn,
  genreSuitability,
}: {
  pluginName: string;
  bestFor?: string[];
  useCases?: string[];
  worksWellOn?: string[];
  genreSuitability?: string[];
}) {
  const hasBestFor = bestFor && bestFor.length > 0;
  const hasUseCases = useCases && useCases.length > 0;
  const hasWorksWellOn = worksWellOn && worksWellOn.length > 0;
  const hasGenres = genreSuitability && genreSuitability.length > 0;

  if (!hasBestFor && !hasUseCases && !hasWorksWellOn && !hasGenres) return null;

  return (
    <div className="glass-card rounded-xl p-5">
      <h3
        className="text-lg font-semibold text-stone-100 mb-4"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {pluginName}
      </h3>

      {hasBestFor && (
        <div className="mb-4">
          <p className="text-sm font-medium text-[#deff0a] mb-2 flex items-center gap-1.5">
            <Target className="w-4 h-4" />
            Best For
          </p>
          <ul className="space-y-1">
            {bestFor.map((item, i) => (
              <li key={i} className="text-sm text-stone-300 flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-[#deff0a] mt-0.5 shrink-0" weight="bold" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasUseCases && (
        <div className="mb-4">
          <p className="text-sm font-medium text-stone-400 mb-2 flex items-center gap-1.5">
            <SlidersHorizontal className="w-4 h-4" />
            Use Cases
          </p>
          <div className="flex flex-wrap gap-1.5">
            {useCases.map((uc, i) => (
              <span
                key={i}
                className="text-xs px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-stone-300"
              >
                {uc}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasWorksWellOn && (
        <div className="mb-4">
          <p className="text-sm font-medium text-stone-400 mb-2 flex items-center gap-1.5">
            <MusicNote className="w-4 h-4" />
            Works Well On
          </p>
          <div className="flex flex-wrap gap-1.5">
            {worksWellOn.map((item, i) => (
              <span
                key={i}
                className="text-xs px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-stone-300"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasGenres && (
        <div>
          <p className="text-sm font-medium text-stone-400 mb-2 flex items-center gap-1.5">
            <GameController className="w-4 h-4" />
            Genre Suitability
          </p>
          <div className="flex flex-wrap gap-1.5">
            {genreSuitability.map((genre, i) => (
              <span
                key={i}
                className="text-xs px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-stone-300"
              >
                {genre}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FAQAccordionItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.02] transition"
        aria-expanded={isOpen}
      >
        <h3 className="text-sm font-medium text-stone-100 pr-4">
          {question}
        </h3>
        <CaretDown
          className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          <p className="text-sm text-stone-400 leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}
