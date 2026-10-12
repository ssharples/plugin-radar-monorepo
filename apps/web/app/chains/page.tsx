import { Suspense } from "react";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convex-server";
import { CHAIN_USE_CASE_GROUPS } from "@plugin-radar/shared/chainUseCases";
import ChainsPageClient from "./ChainsPageClient";

const GROUP_VALUES = new Set(CHAIN_USE_CASE_GROUPS.map((g) => g.value));
const GROUP_MAP = new Map(CHAIN_USE_CASE_GROUPS.map((g) => [g.value, g.label]));
const USE_CASE_MAP = new Map(
  CHAIN_USE_CASE_GROUPS.flatMap((g) =>
    g.useCases.map((uc) => [uc.value, uc.label])
  )
);
const PAGE_SIZE = 30;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const category = typeof params.category === "string" ? params.category : "";
  const genre = typeof params.genre === "string" ? params.genre : "";

  const parts: string[] = [];
  if (genre) parts.push(genre);
  if (category) {
    const label = GROUP_MAP.get(category) || USE_CASE_MAP.get(category) || category;
    parts.push(label);
  }
  parts.push("Plugin Chains");

  const title =
    parts.length > 1
      ? `${parts.join(" ")} | ProChain`
      : "Plugin Chains — Browse & Share Signal Chains | ProChain";

  const description =
    category || genre
      ? `Browse ${genre ? genre + " " : ""}${category ? category + " " : ""}plugin chains built by producers and engineers. Free to use during open beta.`
      : "Browse community-built plugin chains for mixing, mastering, and sound design. Filter by genre, use case, or plugin compatibility. Free to use during open beta.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: "https://pluginradar.com/chains",
    },
  };
}

export default async function ChainsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const category = (typeof params.category === "string" ? params.category : "") || "";
  const genre = (typeof params.genre === "string" ? params.genre : "") || "";
  const sortBy = (typeof params.sort === "string" ? params.sort : "") || "recent";
  const search = (typeof params.q === "string" ? params.q : "") || "";

  // Resolve category → useCaseGroup / useCase (same logic as client)
  const useCaseGroup = category && GROUP_VALUES.has(category) ? category : undefined;
  const useCase = category && !GROUP_VALUES.has(category) ? category : undefined;

  // Fetch initial data server-side (no auth — sessionToken lives in localStorage)
  let initialData: { chains: any[]; hasMore: boolean } | null = null;
  try {
    initialData = await convexServer.query(
      api.pluginDirectory.browseChainsPaginated,
      {
        useCaseGroup,
        useCase,
        search: search.trim() || undefined,
        genre: genre || undefined,
        sortBy,
        limit: PAGE_SIZE,
        offset: 0,
      }
    );
  } catch {
    // Convex unavailable — client will fetch on hydration
  }

  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8 text-stone-600 text-sm">
          Loading...
        </div>
      }
    >
      <ChainsPageClient
        initialData={initialData}
        initialCategory={category}
        initialGenre={genre}
        initialSort={sortBy}
        initialSearch={search}
      />
    </Suspense>
  );
}
