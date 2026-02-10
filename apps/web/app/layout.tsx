import type { Metadata } from "next";
import { Cutive_Mono, Nosifer } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/convex-provider";
import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";

const cutiveMono = Cutive_Mono({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: "400",
});

const nosifer = Nosifer({
  subsets: ["latin"],
  variable: "--font-display",
  weight: "400",
});

export const metadata: Metadata = {
  title: "Propane — Build & Share Plugin Chains Across Any DAW",
  description: "Build effect chains with any VST/AU/AAX plugin. Share with friends cross-DAW. Discover vocal chains, mix bus setups, and mastering presets from the community.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cutiveMono.variable} ${nosifer.variable}`}>
      <body className="font-sans antialiased bg-black min-h-screen flex flex-col text-stone-300">
        <ConvexClientProvider>
          <Navigation />
          <main className="flex-1">{children}</main>
          <Footer />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
