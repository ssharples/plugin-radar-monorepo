import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free Audio Plugins 2026 | PluginRadar",
  description:
    "Discover free VST plugins, instruments, and effects for your DAW. EQ, compressor, reverb, synth, and more — all free to download.",
  openGraph: {
    title: "Free Audio Plugins 2026 | PluginRadar",
    description:
      "Discover free VST plugins, instruments, and effects for your DAW. EQ, compressor, reverb, synth, and more — all free to download.",
    url: "https://pluginradar.com/free",
  },
};

export default function FreeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
