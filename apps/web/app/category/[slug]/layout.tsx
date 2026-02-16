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
  const category = formatSlug(slug);
  return {
    title: `${category} Plugins | Plugin Radar`,
    description: `Browse the best ${category.toLowerCase()} audio plugins. Compare prices, read reviews, and find deals.`,
  };
}

export default function CategoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
