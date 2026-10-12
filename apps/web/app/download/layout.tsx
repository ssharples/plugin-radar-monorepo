import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download ProChain — $30 Launch Price",
  description:
    "Download ProChain for $30 launch price (regular $60). Build plugin chains with any VST3 or AU plugin, share them with the community, and discover what other producers use.",
};

export default function DownloadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
