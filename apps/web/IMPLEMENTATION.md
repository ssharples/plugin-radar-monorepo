# PluginRadar Phase 3: Implementation Plan

> Detailed technical plan for implementing Growth Features

---

## Overview

Phase 3 focuses on three major areas:
1. **Structured Parameter Database** — Machine-readable plugin specifications
2. **Community Wiki System** — User-contributed tips and settings
3. **SEO Strategy** — Programmatic pages for organic traffic

---

## A. Structured Parameter Database

### Purpose
Enable granular plugin comparisons beyond basic metadata. Users can filter by "has sidechain input", "includes vintage mode", "supports M/S processing", etc.

### Schema Additions

```typescript
// convex/schema.ts additions

// Plugin technical parameters (extracted from docs/specs)
pluginParameters: defineTable({
  plugin: v.id("plugins"),
  
  // Core specs
  channels: v.optional(v.string()),        // "mono", "stereo", "mono-to-stereo", "surround"
  latency: v.optional(v.number()),         // samples
  oversampling: v.optional(v.array(v.string())), // ["Off", "2x", "4x", "8x"]
  sampleRates: v.optional(v.array(v.number())),  // [44100, 48000, 96000, 192000]
  
  // Inputs/Outputs  
  hasSidechain: v.boolean(),
  sidechainFilters: v.optional(v.array(v.string())), // ["HPF", "LPF", "BPF"]
  hasMidSide: v.boolean(),
  hasExternalInput: v.boolean(),
  
  // UI/UX
  hasResizableUI: v.boolean(),
  uiSizes: v.optional(v.array(v.string())),  // ["50%", "100%", "150%", "200%"]
  hasPresetBrowser: v.boolean(),
  presetCount: v.optional(v.number()),
  
  // Processing modes
  processingModes: v.optional(v.array(v.string())), // ["Digital", "Vintage", "Modern", "Smooth"]
  hasAutoGain: v.boolean(),
  hasDryWetMix: v.boolean(),
  
  // For specific plugin types
  // EQ
  bandCount: v.optional(v.number()),
  filterTypes: v.optional(v.array(v.string())), // ["Bell", "Shelf", "HPF", "LPF", "Notch"]
  hasLinearPhase: v.optional(v.boolean()),
  hasDynamicEQ: v.optional(v.boolean()),
  
  // Compressor
  compressionTypes: v.optional(v.array(v.string())), // ["VCA", "FET", "Opto", "Variable-Mu"]
  hasParallelMix: v.optional(v.boolean()),
  hasLookahead: v.optional(v.boolean()),
  attackRange: v.optional(v.object({ min: v.number(), max: v.number() })),
  releaseRange: v.optional(v.object({ min: v.number(), max: v.number() })),
  ratioRange: v.optional(v.object({ min: v.number(), max: v.number() })),
  
  // Reverb
  reverbTypes: v.optional(v.array(v.string())), // ["Hall", "Plate", "Room", "Chamber", "Spring", "Convolution"]
  hasModulation: v.optional(v.boolean()),
  hasPreDelay: v.optional(v.boolean()),
  hasEarlyReflections: v.optional(v.boolean()),
  irCount: v.optional(v.number()),  // for convolution reverbs
  
  // Delay
  delayModes: v.optional(v.array(v.string())), // ["Mono", "Stereo", "Ping-Pong", "Dual"]
  hasTapTempo: v.optional(v.boolean()),
  hasSyncToHost: v.optional(v.boolean()),
  maxDelayTime: v.optional(v.number()), // ms
  
  // Synth
  oscillatorCount: v.optional(v.number()),
  oscillatorTypes: v.optional(v.array(v.string())), // ["Saw", "Square", "Sine", "Noise", "Wavetable"]
  filterCount: v.optional(v.number()),
  voiceCount: v.optional(v.number()),
  hasArpeggiator: v.optional(v.boolean()),
  hasSequencer: v.optional(v.boolean()),
  
  // Extraction metadata
  extractedAt: v.number(),
  extractionSource: v.string(),  // "manual", "ai-docs", "ai-video"
  confidence: v.number(),        // 0-100
  verifiedBy: v.optional(v.id("users")),
})
  .index("by_plugin", ["plugin"])
  .index("by_sidechain", ["hasSidechain"])
  .index("by_midside", ["hasMidSide"]),

// Plugin features (free-form, for discovery)
pluginFeatures: defineTable({
  plugin: v.id("plugins"),
  
  feature: v.string(),           // "Vintage Console Emulation"
  category: v.string(),          // "sound-character", "workflow", "compatibility"
  description: v.optional(v.string()),
  
  // Voting (community can upvote/downvote accuracy)
  upvotes: v.number(),
  downvotes: v.number(),
  
  addedBy: v.optional(v.id("users")),
  addedAt: v.number(),
  verifiedAt: v.optional(v.number()),
})
  .index("by_plugin", ["plugin"])
  .index("by_feature", ["feature"])
  .index("by_category", ["category"]),
```

### AI Extraction Pipeline

**Script Location:** `~/clawd/projects/plugin-radar/scripts/extract-parameters.ts`

```typescript
// Pseudocode for extraction pipeline

interface ExtractionJob {
  pluginId: string;
  pluginName: string;
  manufacturer: string;
  productUrl: string;
  manualUrl?: string;
}

async function extractParameters(job: ExtractionJob) {
  const results: Partial<PluginParameters> = {};
  
  // 1. Fetch product page with Exa
  const productContent = await exa.getContents(job.productUrl, {
    text: true
  });
  
  // 2. Fetch manual if available
  let manualContent = "";
  if (job.manualUrl) {
    manualContent = await fetchPDF(job.manualUrl);
  }
  
  // 3. Use Claude to extract structured data
  const prompt = `
    Extract technical parameters from this plugin documentation.
    Plugin: ${job.pluginName} by ${job.manufacturer}
    
    Product Page:
    ${productContent}
    
    ${manualContent ? `Manual:\n${manualContent.slice(0, 50000)}` : ''}
    
    Extract JSON matching this schema:
    {
      channels: "mono" | "stereo" | "mono-to-stereo" | "surround",
      latency: number (in samples),
      hasSidechain: boolean,
      hasMidSide: boolean,
      hasResizableUI: boolean,
      presetCount: number,
      hasAutoGain: boolean,
      hasDryWetMix: boolean,
      // ... type-specific fields
    }
    
    Only include fields you're confident about. Set confidence 0-100.
  `;
  
  const extraction = await claude.complete(prompt);
  
  // 4. Store with confidence score
  await convex.mutation("pluginParameters:upsert", {
    plugin: job.pluginId,
    ...extraction.parameters,
    extractedAt: Date.now(),
    extractionSource: "ai-docs",
    confidence: extraction.confidence,
  });
}
```

### Manual Curation Workflow

1. **Priority Queue**: Top 20 plugins by popularity get manual verification
2. **Admin UI**: Dashboard at `/admin/parameters` for curators
3. **Diff View**: Show AI extraction vs manual edits
4. **Confidence Threshold**: Auto-publish if AI confidence > 90%, else queue for review

### Parameter Comparison Engine

```typescript
// convex/comparisons.ts

export const compareParameters = query({
  args: {
    pluginA: v.id("plugins"),
    pluginB: v.id("plugins"),
  },
  handler: async (ctx, { pluginA, pluginB }) => {
    const [paramsA, paramsB] = await Promise.all([
      ctx.db.query("pluginParameters")
        .withIndex("by_plugin", q => q.eq("plugin", pluginA))
        .first(),
      ctx.db.query("pluginParameters")
        .withIndex("by_plugin", q => q.eq("plugin", pluginB))
        .first(),
    ]);
    
    // Generate comparison object
    return {
      similarities: findSimilarities(paramsA, paramsB),
      differences: findDifferences(paramsA, paramsB),
      advantages: {
        a: getAdvantages(paramsA, paramsB),
        b: getAdvantages(paramsB, paramsA),
      },
    };
  },
});
```

---

## B. Community Wiki System

### Purpose
Let users contribute tips, settings, and knowledge about plugins. Build community engagement and organic content.

### Schema Additions

```typescript
// convex/schema.ts additions

// Wiki edits for plugins
wikiEdits: defineTable({
  plugin: v.id("plugins"),
  
  // Content
  section: v.string(),           // "tips", "settings", "alternatives", "workflow"
  content: v.string(),           // Markdown content
  
  // Versioning
  version: v.number(),           // 1, 2, 3...
  parentVersion: v.optional(v.number()),
  
  // Attribution
  author: v.id("users"),
  editSummary: v.optional(v.string()),
  
  // Moderation
  status: v.string(),            // "pending", "approved", "rejected", "superseded"
  moderatedBy: v.optional(v.id("users")),
  moderatedAt: v.optional(v.number()),
  moderationNote: v.optional(v.string()),
  
  // Timestamps
  createdAt: v.number(),
  publishedAt: v.optional(v.number()),
})
  .index("by_plugin", ["plugin"])
  .index("by_plugin_section", ["plugin", "section"])
  .index("by_status", ["status"])
  .index("by_author", ["author"]),

// Votes on wiki content
wikiVotes: defineTable({
  edit: v.id("wikiEdits"),
  user: v.id("users"),
  
  vote: v.number(),              // 1 (helpful) or -1 (not helpful)
  
  createdAt: v.number(),
})
  .index("by_edit", ["edit"])
  .index("by_user_edit", ["user", "edit"]),

// User reputation and achievements
userReputation: defineTable({
  user: v.id("users"),
  
  // Points
  totalPoints: v.number(),
  editPoints: v.number(),        // From wiki edits
  votePoints: v.number(),        // From votes received
  helpfulPoints: v.number(),     // From being marked helpful
  
  // Levels
  level: v.number(),             // 1-10
  title: v.string(),             // "Newcomer", "Contributor", "Expert", etc.
  
  // Badges
  badges: v.array(v.object({
    id: v.string(),
    name: v.string(),
    awardedAt: v.number(),
  })),
  
  // Activity
  totalEdits: v.number(),
  approvedEdits: v.number(),
  totalVotes: v.number(),
  
  updatedAt: v.number(),
})
  .index("by_user", ["user"])
  .index("by_points", ["totalPoints"])
  .index("by_level", ["level"]),
```

### Wiki Section Types

| Section | Description | Example Content |
|---------|-------------|-----------------|
| `tips` | Usage tips and tricks | "Use the 'Vintage' mode at -3dB for subtle warmth" |
| `settings` | Preset starting points | "Vocal compression: Ratio 4:1, Attack 10ms, Release 100ms" |
| `alternatives` | Similar plugins | "If you like X, try Y for a more transparent sound" |
| `workflow` | Integration tips | "Works great after the SSL channel strip" |
| `compatibility` | Technical notes | "Known issue with Reaper 6.x on M1 Macs" |

### UI Components

**Plugin Page Addition:**
```tsx
// components/PluginWiki.tsx
export function PluginWiki({ pluginId }: { pluginId: string }) {
  const sections = useQuery(api.wiki.getSections, { plugin: pluginId });
  const user = useUser();
  
  return (
    <div className="bg-stone-900 rounded-xl p-6">
      <h2 className="text-xl font-semibold text-white mb-4">
        Community Tips
      </h2>
      
      {sections?.map(section => (
        <WikiSection 
          key={section.id}
          section={section}
          canEdit={user?.reputation?.level >= 2}
        />
      ))}
      
      {user && <AddTipButton pluginId={pluginId} />}
    </div>
  );
}
```

### Gamification System

| Level | Title | Points Required | Perks |
|-------|-------|-----------------|-------|
| 1 | Newcomer | 0 | Can vote |
| 2 | Contributor | 50 | Can add tips (moderated) |
| 3 | Regular | 200 | Tips auto-approved |
| 4 | Trusted | 500 | Can moderate others |
| 5 | Expert | 1000 | Badge on profile |

**Badges:**
- 🎚️ **First Edit** — Made first wiki contribution
- 📚 **Knowledge Base** — 10 approved edits
- 👍 **Helpful** — 50 helpful votes on tips
- 🏆 **Top Contributor** — Monthly leaderboard top 10
- 🎹 **Specialist: Synths** — 20 tips on synth plugins

### Moderation Queue

**Admin Page:** `/admin/moderation`

```tsx
// Moderation workflow
export function ModerationQueue() {
  const pending = useQuery(api.wiki.getPending);
  
  return (
    <div>
      {pending?.map(edit => (
        <ModerationCard 
          key={edit._id}
          edit={edit}
          onApprove={() => approve(edit._id)}
          onReject={(reason) => reject(edit._id, reason)}
          onEdit={() => editAndApprove(edit._id)}
        />
      ))}
    </div>
  );
}
```

---

## C. SEO Strategy Implementation

### 1. Programmatic Comparison Pages

**Status:** ✅ 200 pages generated in `plugin-radar/data/comparisons/`

**URL Structure:** `/compare/[plugin-a]-vs-[plugin-b]`

**Generation Script:** `plugin-radar/scripts/generate-comparisons.ts`

**Next Steps:**
- [x] Generate JSON files with comparison data
- [x] Create dynamic route at `/compare/[slug]`
- [ ] Add to sitemap
- [ ] Add schema markup (Product + FAQ)
- [ ] Internal linking from plugin pages

### 2. Schema.org Markup

**Create Component:** `components/SchemaMarkup.tsx`

```tsx
// components/SchemaMarkup.tsx
import Script from "next/script";

interface PluginSchemaProps {
  plugin: {
    name: string;
    slug: string;
    manufacturer: string;
    description: string;
    price: number;
    currency: string;
    imageUrl?: string;
    productUrl: string;
    category: string;
    rating?: number;
    reviewCount?: number;
  };
}

export function PluginSchema({ plugin }: PluginSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": plugin.name,
    "applicationCategory": "MultimediaApplication",
    "applicationSubCategory": `Audio ${plugin.category}`,
    "operatingSystem": "Windows, macOS",
    "offers": {
      "@type": "Offer",
      "price": plugin.price / 100,
      "priceCurrency": plugin.currency,
      "availability": "https://schema.org/InStock"
    },
    "author": {
      "@type": "Organization",
      "name": plugin.manufacturer
    },
    "image": plugin.imageUrl,
    "url": `https://pluginradar.com/plugins/${plugin.slug}`,
    "description": plugin.description,
    ...(plugin.rating && {
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": plugin.rating,
        "reviewCount": plugin.reviewCount
      }
    })
  };

  return (
    <Script
      id={`schema-${plugin.slug}`}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

interface BreadcrumbSchemaProps {
  items: Array<{ name: string; url: string }>;
}

export function BreadcrumbSchema({ items }: BreadcrumbSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": item.name,
      "item": item.url
    }))
  };

  return (
    <Script
      id="breadcrumb-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

interface FAQSchemaProps {
  questions: Array<{ question: string; answer: string }>;
}

export function FAQSchema({ questions }: FAQSchemaProps) {
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
      id="faq-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
```

### 3. Landing Pages

**Free Plugins Page:** `/free`

```tsx
// app/free/page.tsx
export const metadata = {
  title: "Free Audio Plugins 2026 | PluginRadar",
  description: "Discover 30+ free VST plugins. Compressors, EQs, reverbs, synths and more. No signup required."
};

export default function FreePluginsPage() {
  // Filter plugins where isFree === true
  // Group by category
  // Show "best free" picks
}
```

**Category Landing Pages:** `/category/[slug]`
- `/category/compressors` — Best VST Compressors 2026
- `/category/reverbs` — Best Reverb Plugins 2026
- `/category/synths` — Best Software Synths 2026

### 4. Glossary Pages

**Location:** `/glossary/[term]`

**Terms Database:**
```typescript
// data/glossary.ts
export const glossaryTerms = [
  {
    slug: "attack-time",
    term: "Attack Time",
    definition: "The time it takes for a compressor to react once the signal exceeds the threshold...",
    relatedTerms: ["release-time", "threshold", "ratio"],
    relatedPlugins: ["compressor", "limiter", "gate"]
  },
  // ... 50+ audio terms
];
```

### 5. XML Sitemap

**Location:** `app/sitemap.ts`

```typescript
// app/sitemap.ts
import { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://pluginradar.com';
  
  // Static pages
  const staticPages = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/plugins`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/sales`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${baseUrl}/free`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/compare`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
  ];
  
  // Plugin pages
  const plugins = await getPlugins();
  const pluginPages = plugins.map(p => ({
    url: `${baseUrl}/plugins/${p.slug}`,
    lastModified: new Date(p.updatedAt),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));
  
  // Comparison pages
  const comparisons = await getComparisons();
  const comparisonPages = comparisons.map(c => ({
    url: `${baseUrl}/compare/${c.slug}`,
    lastModified: new Date(c.generatedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));
  
  // Category pages
  const categoryPages = categories.map(cat => ({
    url: `${baseUrl}/category/${cat.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));
  
  return [...staticPages, ...pluginPages, ...comparisonPages, ...categoryPages];
}
```

### 6. Internal Linking Strategy

**Plugin Detail Page Additions:**
```tsx
// Add to app/plugins/[slug]/page.tsx

// Similar plugins section
<SimilarPlugins category={plugin.category} currentSlug={plugin.slug} />

// Comparison CTAs
<ComparisonLinks pluginSlug={plugin.slug} category={plugin.category} />

// Manufacturer link
<Link href={`/manufacturers/${plugin.manufacturerSlug}`}>
  More from {plugin.manufacturer}
</Link>

// Category link  
<Link href={`/category/${plugin.category}`}>
  All {plugin.category} plugins
</Link>
```

---

## Implementation Timeline

### Week 1: Foundation
- [x] Merge repos ✓
- [ ] Add schema.org component
- [ ] Implement sitemap.ts
- [ ] Add internal linking to plugin pages

### Week 2: Parameters
- [ ] Add schema tables to Convex
- [ ] Create parameter extraction script
- [ ] Manual curation for top 10 plugins
- [ ] Add parameter display to plugin pages

### Week 3: Wiki System
- [ ] Add wiki schema tables
- [ ] Build wiki edit UI component
- [ ] Add voting system
- [ ] Create moderation queue

### Week 4: SEO & Polish
- [ ] Create /free landing page
- [ ] Create glossary pages (20 terms)
- [ ] Add FAQ schema to comparison pages
- [ ] Submit sitemap to Google Search Console

---

## File Structure After Implementation

```
plugin-radar-ui/
├── app/
│   ├── admin/
│   │   ├── moderation/
│   │   └── parameters/
│   ├── category/[slug]/
│   ├── compare/
│   │   ├── [slug]/
│   │   └── page.tsx
│   ├── free/
│   ├── glossary/[term]/
│   ├── plugins/[slug]/
│   └── sitemap.ts
├── components/
│   ├── SchemaMarkup.tsx
│   ├── PluginWiki.tsx
│   ├── SimilarPlugins.tsx
│   └── ComparisonLinks.tsx
└── IMPLEMENTATION.md

plugin-radar/
├── convex/
│   ├── schema.ts (updated)
│   ├── pluginParameters.ts
│   ├── wiki.ts
│   └── comparisons.ts
├── scripts/
│   ├── extract-parameters.ts
│   └── generate-comparisons.ts
└── data/
    ├── comparisons/
    └── glossary/
```

---

## Quick Start Commands

```bash
# Start frontend dev server
cd ~/clawd/projects/plugin-radar-ui
bun dev

# Deploy Convex schema changes
cd ~/clawd/projects/plugin-radar
npx convex deploy

# Run parameter extraction (when built)
cd ~/clawd/projects/plugin-radar
bun run scripts/extract-parameters.ts

# Generate new comparisons
cd ~/clawd/projects/plugin-radar
bun run scripts/generate-comparisons.ts
```

---

*Last updated: February 5, 2026*
