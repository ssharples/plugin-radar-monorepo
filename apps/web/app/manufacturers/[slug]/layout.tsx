import { Metadata } from "next";

function formatSlug(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = formatSlug(slug);
  return {
    title: `${name} | Plugin Radar`,
    description: `Browse audio plugins by ${name}. View their full catalog, pricing, and deals.`,
  };
}

export default function ManufacturerDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
