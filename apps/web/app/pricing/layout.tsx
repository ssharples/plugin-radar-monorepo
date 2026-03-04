import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Buy ProChain — $30 Launch Price (50% Off)",
  description:
    "Get ProChain for $30 launch price (regular $60). Build plugin chains with any VST3 or AU plugin, share them with the community, and discover what other producers use.",
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
