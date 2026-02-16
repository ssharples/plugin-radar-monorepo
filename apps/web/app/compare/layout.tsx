import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare Plugins | Plugin Radar",
  description:
    "Compare audio plugins side by side. Evaluate features, pricing, and specifications to find the best plugin for your needs.",
  openGraph: {
    title: "Compare Plugins | Plugin Radar",
    description:
      "Compare audio plugins side by side. Evaluate features, pricing, and specifications to find the best plugin for your needs.",
    url: "https://pluginradar.com/compare",
  },
};

export default function CompareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
