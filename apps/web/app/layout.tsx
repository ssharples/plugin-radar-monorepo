import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/convex-provider";
import { OwnedPluginsProvider } from "@/components/owned-plugins-provider";
import { Navigation } from "@/components/navigation";
import { LaunchBanner } from "@/components/LaunchBanner";
import { Footer } from "@/components/footer";
import { GrainientBackground } from "@/components/GrainientBackground";
import { LenisProvider } from "@/components/lenis-provider";
import { Suspense } from "react";
import { RefTracker } from "@/components/ref-tracker";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "ProChain — The Open Plugin Chain Platform",
  description:
    "Build, share, and discover plugin chains for any VST3, AU, or AAX plugin. $30 launch price (50% off). Rate, comment, and fork chains like GitHub repos.",
  metadataBase: new URL("https://procha.in"),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "ProChain",
    title: "ProChain — The Open Plugin Chain Platform",
    description:
      "Build, share, and discover plugin chains for any VST3, AU, or AAX plugin. $30 launch price (50% off).",
    url: "https://procha.in",
  },
  twitter: {
    card: "summary_large_image",
    title: "ProChain — The Open Plugin Chain Platform",
    description:
      "Build, share, and discover plugin chains for any VST3, AU, or AAX plugin. $30 launch price (50% off).",
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
        <Suspense>
          <RefTracker />
        </Suspense>
        <LenisProvider>
          <ConvexClientProvider>
            <OwnedPluginsProvider>
              <LaunchBanner />
              <Navigation />
              <main className="flex-1">{children}</main>
              <Footer />
            </OwnedPluginsProvider>
          </ConvexClientProvider>
        </LenisProvider>
      </body>
    </html>
  );
}
