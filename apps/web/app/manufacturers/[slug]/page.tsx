import { Suspense } from "react";
import type { Metadata } from "next";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convex-server";
import ManufacturerClient from "./ManufacturerClient";
import { ManufacturerSchema, BreadcrumbSchema } from "@/components/SchemaMarkup";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  let manufacturer: any = null;
  try {
    manufacturer = await convexServer.query(api.manufacturers.getBySlug, { slug });
  } catch {}

  if (!manufacturer) {
    const name = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      title: `${name} Plugins | ProChain by Plugin Radar`,
      description: `Browse plugins by ${name}. Compare prices, read reviews, and find the best deals.`,
    };
  }

  const title = `${manufacturer.name} Plugins — ${manufacturer.pluginCount || ""} Products | ProChain by Plugin Radar`;
  const description = manufacturer.description
    ? manufacturer.description.slice(0, 155)
    : `Browse ${manufacturer.pluginCount || ""} plugins by ${manufacturer.name}. Price comparisons, reviews, tutorials, and deals.`;

  return {
    title,
    description,
    alternates: { canonical: `https://procha.in/manufacturers/${slug}` },
    openGraph: {
      title,
      description,
      url: `https://procha.in/manufacturers/${slug}`,
      ...(manufacturer.logoUrl && { images: [manufacturer.logoUrl] }),
    },
  };
}

export default async function ManufacturerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let initialManufacturer: any = null;
  let initialPlugins: any = null;
  try {
    initialManufacturer = await convexServer.query(api.manufacturers.getBySlug, { slug });
    if (initialManufacturer) {
      initialPlugins = await convexServer.query(api.plugins.list, {
        manufacturer: initialManufacturer._id,
        limit: 100,
      });
    }
  } catch {}

  return (
    <>
      {initialManufacturer && (
        <>
          <ManufacturerSchema
            manufacturer={{
              name: initialManufacturer.name,
              slug: initialManufacturer.slug || slug,
              website: initialManufacturer.website,
              description: initialManufacturer.description,
              logoUrl: initialManufacturer.logoUrl,
            }}
          />
          <BreadcrumbSchema
            items={[
              { name: "Home", url: "/" },
              { name: "Manufacturers", url: "/manufacturers" },
              { name: initialManufacturer.name, url: `/manufacturers/${slug}` },
            ]}
          />
        </>
      )}
      <Suspense
        fallback={
          <div className="container mx-auto px-4 lg:px-6 py-8">
            <div className="animate-pulse">
              <div className="h-8 bg-white/[0.03] rounded w-1/4 mb-4" />
              <div className="h-4 bg-white/[0.03] rounded w-1/3 mb-8" />
            </div>
          </div>
        }
      >
        <ManufacturerClient slug={slug} initialManufacturer={initialManufacturer} initialPlugins={initialPlugins} />
      </Suspense>
    </>
  );
}
