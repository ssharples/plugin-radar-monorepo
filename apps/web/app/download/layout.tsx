import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download ProChain — Free Open Beta",
  description:
    "Download ProChain free during open beta. Build plugin chains with any VST3 or AU plugin, share them with the community, and discover what other producers use.",
};

export default function DownloadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
