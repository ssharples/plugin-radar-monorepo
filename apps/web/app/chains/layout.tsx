import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plugin Chains | PluginRadar",
  description:
    "Browse shared plugin chains for mixing, mastering, recording, and sound design. Load them into your DAW with the PluginRadar desktop app.",
  openGraph: {
    title: "Plugin Chains | PluginRadar",
    description:
      "Browse shared plugin chains for mixing, mastering, recording, and sound design.",
    url: "https://pluginradar.com/chains",
  },
};

export default function ChainsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
