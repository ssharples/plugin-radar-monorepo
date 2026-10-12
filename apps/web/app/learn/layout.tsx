import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learn — Plugin Chaining Guides & Techniques | ProChain",
  description:
    "Guides, techniques, and genre-specific plugin chains for mixing and mastering. Learn how to build better signal chains.",
  openGraph: {
    title: "Learn — Plugin Chaining Guides & Techniques | ProChain",
    description:
      "Guides, techniques, and genre-specific plugin chains for mixing and mastering.",
    url: "https://pluginradar.com/learn",
  },
};

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
