import Script from "next/script";

// =============================================
// PLUGIN SCHEMA (SoftwareApplication)
// =============================================

interface PluginSchemaProps {
  plugin: {
    name: string;
    slug: string;
    manufacturer: string;
    manufacturerSlug?: string;
    description?: string;
    price?: number; // in cents
    currency?: string;
    isFree?: boolean;
    imageUrl?: string;
    productUrl: string;
    category: string;
    formats?: string[];
    platforms?: string[];
    rating?: number;
    reviewCount?: number;
  };
}

export function PluginSchema({ plugin }: PluginSchemaProps) {
  const priceValue = plugin.isFree ? 0 : (plugin.price ?? 0) / 100;
  
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": plugin.name,
    "applicationCategory": "MultimediaApplication",
    "applicationSubCategory": `Audio ${formatCategory(plugin.category)} Plugin`,
    "operatingSystem": formatPlatforms(plugin.platforms),
    "offers": {
      "@type": "Offer",
      "price": priceValue,
      "priceCurrency": plugin.currency || "USD",
      "availability": "https://schema.org/InStock"
    },
    "author": {
      "@type": "Organization",
      "name": plugin.manufacturer,
      ...(plugin.manufacturerSlug && {
        "url": `https://pluginradar.com/manufacturers/${plugin.manufacturerSlug}`
      })
    },
    ...(plugin.imageUrl && { "image": plugin.imageUrl }),
    "url": `https://pluginradar.com/plugins/${plugin.slug}`,
    ...(plugin.description && { "description": plugin.description }),
    ...(plugin.formats && plugin.formats.length > 0 && {
      "softwareRequirements": plugin.formats.join(", ")
    }),
    ...(plugin.rating && plugin.reviewCount && {
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": plugin.rating,
        "bestRating": 5,
        "worstRating": 1,
        "reviewCount": plugin.reviewCount
      }
    })
  };

  return (
    <Script
      id={`schema-plugin-${plugin.slug}`}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// =============================================
// BREADCRUMB SCHEMA
// =============================================

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface BreadcrumbSchemaProps {
  items: BreadcrumbItem[];
}

export function BreadcrumbSchema({ items }: BreadcrumbSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url.startsWith("http") ? item.url : `https://pluginradar.com${item.url}`
    }))
  };

  return (
    <Script
      id="schema-breadcrumb"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// =============================================
// FAQ SCHEMA
// =============================================

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSchemaProps {
  questions: FAQItem[];
}

export function FAQSchema({ questions }: FAQSchemaProps) {
  if (questions.length === 0) return null;
  
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": questions.map(q => ({
      "@type": "Question",
      "name": q.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": q.answer
      }
    }))
  };

  return (
    <Script
      id="schema-faq"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// =============================================
// COMPARISON SCHEMA (for vs pages)
// =============================================

interface ComparisonSchemaProps {
  title: string;
  description: string;
  slug: string;
  pluginA: {
    name: string;
    slug: string;
    manufacturer: string;
    price?: number;
    currency?: string;
    isFree?: boolean;
  };
  pluginB: {
    name: string;
    slug: string;
    manufacturer: string;
    price?: number;
    currency?: string;
    isFree?: boolean;
  };
}

export function ComparisonSchema({ title, description, slug, pluginA, pluginB }: ComparisonSchemaProps) {
  // Use ItemList schema to represent the comparison
  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": title,
    "description": description,
    "url": `https://pluginradar.com/compare/${slug}`,
    "numberOfItems": 2,
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "item": {
          "@type": "SoftwareApplication",
          "name": pluginA.name,
          "url": `https://pluginradar.com/plugins/${pluginA.slug}`,
          "applicationCategory": "MultimediaApplication",
          "offers": {
            "@type": "Offer",
            "price": pluginA.isFree ? 0 : (pluginA.price ?? 0) / 100,
            "priceCurrency": pluginA.currency || "USD"
          }
        }
      },
      {
        "@type": "ListItem",
        "position": 2,
        "item": {
          "@type": "SoftwareApplication",
          "name": pluginB.name,
          "url": `https://pluginradar.com/plugins/${pluginB.slug}`,
          "applicationCategory": "MultimediaApplication",
          "offers": {
            "@type": "Offer",
            "price": pluginB.isFree ? 0 : (pluginB.price ?? 0) / 100,
            "priceCurrency": pluginB.currency || "USD"
          }
        }
      }
    ]
  };

  return (
    <Script
      id={`schema-comparison-${slug}`}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// =============================================
// ORGANIZATION SCHEMA (for manufacturer pages)
// =============================================

interface ManufacturerSchemaProps {
  manufacturer: {
    name: string;
    slug: string;
    website?: string;
    description?: string;
    logoUrl?: string;
  };
}

export function ManufacturerSchema({ manufacturer }: ManufacturerSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": manufacturer.name,
    "url": manufacturer.website,
    ...(manufacturer.description && { "description": manufacturer.description }),
    ...(manufacturer.logoUrl && { "logo": manufacturer.logoUrl }),
    "sameAs": manufacturer.website ? [manufacturer.website] : []
  };

  return (
    <Script
      id={`schema-manufacturer-${manufacturer.slug}`}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// =============================================
// WEBSITE SCHEMA (for homepage)
// =============================================

export function WebsiteSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "PluginRadar",
    "url": "https://pluginradar.com",
    "description": "Track audio plugin deals, discover new tools, never miss a sale.",
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://pluginradar.com/plugins?q={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    }
  };

  return (
    <Script
      id="schema-website"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// =============================================
// HELPER FUNCTIONS
// =============================================

function formatCategory(category: string): string {
  const categoryMap: Record<string, string> = {
    eq: "Equalizer",
    compressor: "Compressor",
    reverb: "Reverb",
    delay: "Delay",
    synth: "Synthesizer",
    sampler: "Sampler",
    utility: "Utility",
    bundle: "Bundle",
    effect: "Effect",
    instrument: "Instrument",
    saturator: "Saturator",
    limiter: "Limiter",
    gate: "Gate",
    chorus: "Chorus",
    phaser: "Phaser",
    flanger: "Flanger",
  };
  
  return categoryMap[category.toLowerCase()] || category;
}

function formatPlatforms(platforms?: string[]): string {
  if (!platforms || platforms.length === 0) {
    return "Windows, macOS";
  }
  
  const platformMap: Record<string, string> = {
    windows: "Windows",
    mac: "macOS",
    linux: "Linux",
  };
  
  return platforms
    .map(p => platformMap[p.toLowerCase()] || p)
    .join(", ");
}
