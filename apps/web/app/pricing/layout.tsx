import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Buy ProChain — $50 Lifetime License",
  description:
    "Get ProChain for $50 one-time. Build plugin chains with any VST3 or AU plugin, share them with the community, and discover what other producers use.",
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
