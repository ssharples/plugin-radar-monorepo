import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manufacturers | Plugin Radar",
  description:
    "Explore audio plugin manufacturers and their product catalogs. Find plugins by your favorite brands.",
  openGraph: {
    title: "Manufacturers | Plugin Radar",
    description:
      "Explore audio plugin manufacturers and their product catalogs. Find plugins by your favorite brands.",
    url: "https://pluginradar.com/manufacturers",
  },
};

export default function ManufacturersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
