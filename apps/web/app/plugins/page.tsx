import { Suspense } from "react";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convex-server";
import PluginsPageClient from "./PluginsPageClient";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const category = typeof params.category === "string" ? params.category : "";
  const free = params.free === "true";
  const q = typeof params.q === "string" ? params.q : "";

  const parts: string[] = [];
  if (free) parts.push("Free");
  if (category) parts.push(category);
  if (q) parts.push(`"${q}"`);
  parts.push("Plugins");

  const title =
    parts.length > 1
      ? `${parts.join(" ")} | Plugin Radar`
      : "Browse Plugins | Plugin Radar";

  const description =
    category || free || q
      ? `Browse ${free ? "free " : ""}${category ? category + " " : ""}audio plugins${q ? ` matching "${q}"` : ""}. VST, AU, and AAX effects and instruments from top manufacturers.`
      : "Browse and discover audio plugins — VST, AU, and AAX effects and instruments from top manufacturers. Filter by category, compare prices, and find the best deals.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: "https://pluginradar.com/plugins",
    },
  };
}

export default async function PluginsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "") || "";
  const category =
    (typeof params.category === "string" ? params.category : "") || undefined;
  const format =
    (typeof params.format === "string" ? params.format : "") || undefined;
  const platform =
    (typeof params.platform === "string" ? params.platform : "") || undefined;
  const free = params.free === "true" ? true : undefined;
  const sortBy =
    (typeof params.sort === "string" ? params.sort : "") || "newest";
  const worksWellOn =
    typeof params.worksWellOn === "string"
      ? params.worksWellOn.split(",").filter(Boolean)
      : undefined;
  const useCases =
    typeof params.useCases === "string"
      ? params.useCases.split(",").filter(Boolean)
      : undefined;
  const skillLevel =
    (typeof params.skillLevel === "string" ? params.skillLevel : "") ||
    undefined;
  const cpuUsage =
    (typeof params.cpuUsage === "string" ? params.cpuUsage : "") || undefined;

  const isSearchMode = !!q;

  // Fetch all initial data in parallel
  let initialPlugins: any[] | null = null;
  let initialTotal: number | null = null;
  let initialCategories: any[] | null = null;
  let initialFormats: string[] | null = null;
  let initialPlatforms: string[] | null = null;
  let initialEnrichmentOptions: any | null = null;

  try {
    const [pluginResult, categories, formats, platforms, enrichmentOptions] =
      await Promise.all([
        isSearchMode
          ? convexServer.query(api.plugins.search, {
              query: q,
              category,
              isFree: free,
            })
          : convexServer.query(api.plugins.browse, {
              category,
              format,
              platform,
              isFree: free,
              sortBy,
              limit: 48,
              worksWellOn:
                worksWellOn && worksWellOn.length > 0
                  ? worksWellOn
                  : undefined,
              useCases:
                useCases && useCases.length > 0 ? useCases : undefined,
              skillLevel,
              cpuUsage,
            }),
        convexServer.query(api.plugins.getCategories, {}),
        convexServer.query(api.plugins.getFormats, {}),
        convexServer.query(api.plugins.getPlatforms, {}),
        convexServer.query(api.plugins.getEnrichmentOptions, {}),
      ]);

    if (isSearchMode) {
      // search returns array directly
      initialPlugins = pluginResult as any[];
      initialTotal = initialPlugins?.length ?? null;
    } else {
      // browse returns { items, total }
      const browseResult = pluginResult as { items: any[]; total: number };
      initialPlugins = browseResult.items;
      initialTotal = browseResult.total;
    }

    initialCategories = categories;
    initialFormats = formats;
    initialPlatforms = platforms;
    initialEnrichmentOptions = enrichmentOptions;
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
      <PluginsPageClient
        initialPlugins={initialPlugins}
        initialTotal={initialTotal}
        initialCategories={initialCategories}
        initialFormats={initialFormats}
        initialPlatforms={initialPlatforms}
        initialEnrichmentOptions={initialEnrichmentOptions}
        isSearchMode={isSearchMode}
      />
    </Suspense>
  );
}
