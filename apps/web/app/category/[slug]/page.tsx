import { Suspense } from "react";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convex-server";
import CategoryClient from "./CategoryClient";
import { BreadcrumbSchema } from "@/components/SchemaMarkup";

const categoryLabels: Record<string, { name: string; description: string }> = {
  synth: { name: "Synthesizers", description: "Virtual instruments for creating sounds from scratch" },
  effect: { name: "Effects", description: "Audio processors for shaping and transforming sound" },
  eq: { name: "Equalizers", description: "Frequency spectrum processors for tonal balance" },
  compressor: { name: "Compressors", description: "Dynamic range processors for punch and control" },
  reverb: { name: "Reverbs", description: "Spatial effects for adding depth and ambiance" },
  delay: { name: "Delays", description: "Time-based effects for echoes and rhythmic patterns" },
  sampler: { name: "Samplers", description: "Sample playback instruments and drum machines" },
  utility: { name: "Utilities", description: "Tools for metering, routing, and workflow enhancement" },
  instrument: { name: "Instruments", description: "Virtual instruments for music production" },
  bundle: { name: "Bundles", description: "Plugin collections and subscription packages" },
  saturator: { name: "Saturators", description: "Saturation and harmonic distortion processors" },
  limiter: { name: "Limiters", description: "Peak limiting and loudness maximizing processors" },
  gate: { name: "Gates", description: "Noise gate and expander processors" },
  chorus: { name: "Chorus", description: "Modulation effects for width and movement" },
  phaser: { name: "Phasers", description: "Phase-shifting modulation effects" },
  flanger: { name: "Flangers", description: "Flanging modulation effects" },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const info = categoryLabels[slug] || {
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    description: `Browse ${slug} plugins`,
  };

  let pluginCount = 0;
  try {
    const categories = await convexServer.query(api.plugins.getCategories);
    const match = categories?.find((c: { name: string; count: number }) => c.name === slug);
    pluginCount = match?.count ?? 0;
  } catch {}

  const title = `Best ${info.name} Plugins 2026 — Free & Paid | ProChain by Plugin Radar`;
  const description = `${info.description}. Browse ${pluginCount > 0 ? `${pluginCount}+ ` : ""}${info.name.toLowerCase()} plugins with price comparisons, reviews, and tutorials.`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://procha.in/category/${slug}`,
    },
    openGraph: { title, description, url: `https://procha.in/category/${slug}` },
  };
}

export const generateStaticParams = () =>
  Object.keys(categoryLabels).map((slug) => ({ slug }));

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let initialPlugins: any = null;
  let initialCategories: any = null;
  try {
    [initialPlugins, initialCategories] = await Promise.all([
      convexServer.query(api.plugins.list, { category: slug, limit: 100 }),
      convexServer.query(api.plugins.getCategories),
    ]);
  } catch {}

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Plugins", url: "/plugins" },
          { name: categoryLabels[slug]?.name || slug, url: `/category/${slug}` },
        ]}
      />
      <Suspense
        fallback={
          <div className="container mx-auto px-4 lg:px-6 py-10">
            <div className="animate-pulse">
              <div className="h-4 bg-white/[0.04] rounded w-1/4 mb-8" />
              <div className="h-8 bg-white/[0.04] rounded w-1/3 mb-4" />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i}>
                    <div className="aspect-video bg-white/[0.03] rounded-xl mb-3" />
                    <div className="h-4 bg-white/[0.04] rounded w-3/4" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
      >
        <CategoryClient slug={slug} initialPlugins={initialPlugins} initialCategories={initialCategories} />
      </Suspense>
    </>
  );
}
