import { Suspense } from "react";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convex-server";
import PluginDetailClient from "./PluginDetailClient";
import { PluginSchema, BreadcrumbSchema } from "@/components/SchemaMarkup";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  let plugin: any = null;
  try {
    plugin = await convexServer.query(api.plugins.getBySlugWithManufacturer, { slug });
  } catch {
    // Convex unavailable — fall back to slug-based metadata
  }

  if (!plugin) {
    const name = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      title: `${name} | ProChain by Plugin Radar`,
      description: `Details, pricing, and reviews for ${name}. Compare prices across stores and find the best deals.`,
    };
  }

  const manufacturer = plugin.manufacturerData?.name || "";
  const category = plugin.category ? plugin.category.charAt(0).toUpperCase() + plugin.category.slice(1) : "";
  const title = `${plugin.name} by ${manufacturer} | ProChain by Plugin Radar`;
  const description = plugin.description
    ? plugin.description.slice(0, 155)
    : `${plugin.name} ${category} plugin by ${manufacturer}. View pricing, tutorials, presets, and similar plugins on Plugin Radar.`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://procha.in/plugins/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `https://procha.in/plugins/${slug}`,
      ...(plugin.resolvedImageUrl && { images: [plugin.resolvedImageUrl] }),
    },
  };
}

export default async function PluginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let initialPlugin: any = null;
  try {
    initialPlugin = await convexServer.query(api.plugins.getBySlugWithManufacturer, { slug });
  } catch {
    // Convex unavailable — client will fetch on hydration
  }

  return (
    <>
      {/* Structured data for SEO */}
      {initialPlugin && (
        <>
          <PluginSchema
            plugin={{
              name: initialPlugin.name,
              slug: initialPlugin.slug || slug,
              manufacturer: initialPlugin.manufacturerData?.name || "",
              manufacturerSlug: initialPlugin.manufacturerData?.slug,
              description: initialPlugin.description,
              price: initialPlugin.price,
              currency: initialPlugin.currency,
              isFree: initialPlugin.isFree,
              imageUrl: initialPlugin.resolvedImageUrl || initialPlugin.imageUrl,
              productUrl: initialPlugin.productUrl || `https://procha.in/plugins/${slug}`,
              category: initialPlugin.category || "effect",
              formats: initialPlugin.formats,
              platforms: initialPlugin.platforms,
            }}
          />
          <BreadcrumbSchema
            items={[
              { name: "Home", url: "/" },
              { name: "Plugins", url: "/plugins" },
              ...(initialPlugin.manufacturerData ? [{
                name: initialPlugin.manufacturerData.name,
                url: `/manufacturers/${initialPlugin.manufacturerData.slug}`,
              }] : []),
              { name: initialPlugin.name, url: `/plugins/${slug}` },
            ]}
          />
        </>
      )}
      <Suspense
        fallback={
          <div className="container mx-auto px-4 lg:px-6 py-10">
            <div className="animate-pulse">
              <div className="h-4 bg-white/[0.04] rounded w-1/4 mb-8" />
              <div className="grid md:grid-cols-[300px_1fr] lg:grid-cols-[340px_1fr] gap-8">
                <div className="aspect-square bg-white/[0.03] rounded-2xl" />
                <div>
                  <div className="h-5 bg-white/[0.04] rounded w-1/4 mb-4" />
                  <div className="h-10 bg-white/[0.04] rounded w-3/4 mb-3" />
                  <div className="h-4 bg-white/[0.04] rounded w-1/3 mb-6" />
                </div>
              </div>
            </div>
          </div>
        }
      >
        <PluginDetailClient slug={slug} initialPlugin={initialPlugin} />
      </Suspense>
    </>
  );
}
