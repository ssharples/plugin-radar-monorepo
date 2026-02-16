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
    description: `Details, pricing, and reviews for ${name}. Compare prices across stores and find the best deals.`,
  };
}

export default function PluginDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
