import { Suspense } from "react";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convex-server";
import CompareBrowseClient from "./CompareBrowseClient";
import { BreadcrumbSchema } from "@/components/SchemaMarkup";

export const metadata: Metadata = {
  title:
    "Audio Plugin Comparisons: Side-by-Side Reviews (2026) | Plugin Radar",
  description:
    "Compare audio plugins side by side. Feature comparisons, pricing, and expert recommendations for EQ, compressor, reverb, and more plugins.",
  alternates: {
    canonical: "https://procha.in/compare",
  },
  openGraph: {
    title:
      "Audio Plugin Comparisons: Side-by-Side Reviews (2026) | Plugin Radar",
    description:
      "Compare audio plugins side by side. Feature comparisons, pricing, and expert recommendations for EQ, compressor, reverb, and more plugins.",
    url: "https://procha.in/compare",
  },
};

export default async function ComparisonsPage() {
  let initialComparisons: any[] | null = null;
  try {
    initialComparisons = await convexServer.query(
      api.agentEnrich.listComparisons,
      { limit: 200 }
    );
  } catch {
    // Convex unavailable — client will fetch on hydration
  }

  const comparisonCount = initialComparisons?.length ?? 0;

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Compare Plugins", url: "/compare" },
        ]}
      />

      <div className="relative">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none" />

        <div className="container mx-auto px-4 lg:px-6 py-10 relative">
          <p className="text-xs text-stone-500 uppercase tracking-wider mb-3">
            Head to Head
          </p>
          <h1
            className="text-3xl font-bold text-stone-100 mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Plugin Comparisons
          </h1>
          <p className="text-stone-400 mb-4">
            Honest, detailed breakdowns of competing plugins. Sound quality,
            workflow, CPU load, and value — compared side by side.
          </p>

          {/* SEO intro text */}
          <p className="text-stone-500 text-sm mb-8 max-w-3xl leading-relaxed">
            Choosing between two similar audio plugins? Our{" "}
            {comparisonCount > 0 ? `${comparisonCount}+ ` : ""}side-by-side
            comparisons break down the differences in features, pricing, and
            real-world performance so you can make an informed decision. Filter
            by category to find the matchup that matters to you.
          </p>

          <div className="section-line mb-8" />

          <Suspense
            fallback={
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse bg-white/[0.03] border border-white/[0.06] rounded-xl p-5"
                  >
                    <div className="h-5 bg-white/[0.04] rounded w-1/3 mb-3" />
                    <div className="h-6 bg-white/[0.04] rounded w-3/4 mb-3" />
                    <div className="h-4 bg-white/[0.04] rounded w-1/2" />
                  </div>
                ))}
              </div>
            }
          >
            <CompareBrowseClient initialComparisons={initialComparisons} />
          </Suspense>
        </div>
      </div>
    </>
  );
}
