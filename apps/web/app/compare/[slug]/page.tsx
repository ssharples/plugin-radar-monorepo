import { Suspense } from "react";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convex-server";
import CompareDetailClient from "./CompareDetailClient";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  let data: any = null;
  try {
    data = await convexServer.query(api.agentEnrich.getComparisonWithPlugins, {
      slug,
    });
  } catch {
    // Convex unavailable
  }

  if (!data) {
    const name = slug
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      title: `Compare ${name} | ProChain`,
      description: `Side-by-side comparison of ${name}. Compare features, pricing, and specifications.`,
    };
  }

  const categoryLabel = data.category
    ? data.category.charAt(0).toUpperCase() + data.category.slice(1)
    : "Audio";

  const title = `${data.pluginA.name} vs ${data.pluginB.name}: Which is Better? (2026 Comparison)`;
  const description =
    data.metaDescription ||
    `Compare ${data.pluginA.name} vs ${data.pluginB.name} — pricing, features, and which ${categoryLabel} plugin is right for your mix.`;

  const canonicalUrl = `https://procha.in/compare/${slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      type: "article",
      url: canonicalUrl,
      siteName: "Plugin Radar",
      ...(data.pluginA.imageUrl && {
        images: [{ url: data.pluginA.imageUrl, alt: data.pluginA.name }],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function CompareSlugPage({ params }: Props) {
  const { slug } = await params;

  let initialData: any = null;
  try {
    initialData = await convexServer.query(
      api.agentEnrich.getComparisonWithPlugins,
      { slug }
    );
  } catch {
    // Convex unavailable — client will fetch on hydration
  }

  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 lg:px-6 py-8 animate-pulse">
          <div className="h-4 bg-white/[0.03] rounded w-48 mb-6" />
          <div className="h-10 bg-white/[0.03] rounded w-96 mb-2" />
          <div className="h-4 bg-white/[0.03] rounded w-64 mb-8" />
        </div>
      }
    >
      <CompareDetailClient slug={slug} initialData={initialData} />
    </Suspense>
  );
}
