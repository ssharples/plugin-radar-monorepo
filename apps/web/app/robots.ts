import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/account", "/wishlist", "/collection", "/alerts", "/sales"],
      },
    ],
    sitemap: "https://pluginradar.com/sitemap.xml",
  };
}
