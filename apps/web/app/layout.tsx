import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/convex-provider";
import { OwnedPluginsProvider } from "@/components/owned-plugins-provider";
import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";
import { GrainientBackground } from "@/components/GrainientBackground";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "ProChain — The Open Plugin Chain Platform",
  description:
    "Build, share, and discover plugin chains for any VST3, AU, or AAX plugin. Free during open beta. Rate, comment, and fork chains like GitHub repos.",
  metadataBase: new URL("https://pluginradar.com"),
  openGraph: {
    type: "website",
    siteName: "ProChain",
    title: "ProChain — The Open Plugin Chain Platform",
    description:
      "Build, share, and discover plugin chains for any VST3, AU, or AAX plugin. Free during open beta.",
    url: "https://pluginradar.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "ProChain — The Open Plugin Chain Platform",
    description:
      "Build, share, and discover plugin chains for any VST3, AU, or AAX plugin. Free during open beta.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <body className="font-mono antialiased bg-neutral-950 min-h-screen flex flex-col text-neutral-200">
        <div className="fixed inset-0 -z-10">
          <GrainientBackground />
        </div>
        <ConvexClientProvider>
          <OwnedPluginsProvider>
            <Navigation />
            <main className="flex-1">{children}</main>
            <Footer />
          </OwnedPluginsProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
