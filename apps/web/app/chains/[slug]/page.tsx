import { Suspense } from "react";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convex-server";
import ChainDetailClient from "./ChainDetailClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  let chain: any = null;
  try {
    chain = await convexServer.query(api.pluginDirectory.getChain, { slug });
  } catch {
    // Convex unavailable — fall back to slug-based metadata
  }

  if (!chain) {
    const name = slug
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      title: `${name} — Plugin Chain | ProChain`,
      description: `View the "${name}" plugin chain. See which plugins are used, load it into your DAW, and share with friends.`,
    };
  }

  const pluginNames = chain.slots
    .slice(0, 5)
    .map((s: any) => s.pluginData?.name || s.pluginName)
    .filter(Boolean)
    .join(", ");

  const title = `${chain.name} — Plugin Chain | ProChain`;
  const description = chain.description
    ? chain.description.slice(0, 155)
    : `${chain.name} plugin chain${chain.author ? ` by ${chain.author.name}` : ""}${pluginNames ? ` using ${pluginNames}` : ""}. Browse, rate, and fork community chains on ProChain.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://pluginradar.com/chains/${slug}`,
    },
  };
}

export default async function ChainDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let initialChain: any = null;
  try {
    initialChain = await convexServer.query(api.pluginDirectory.getChain, {
      slug,
    });
  } catch {
    // Convex unavailable — client will fetch on hydration
  }

  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 lg:px-6 py-8 animate-pulse">
          <div className="h-4 bg-white/[0.03] rounded w-24 mb-6" />
          <div className="h-8 bg-white/[0.03] rounded w-64 mb-2" />
          <div className="h-4 bg-white/[0.03] rounded w-40 mb-4" />
        </div>
      }
    >
      <ChainDetailClient slug={slug} initialChain={initialChain} />
    </Suspense>
  );
}
