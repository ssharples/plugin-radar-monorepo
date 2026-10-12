import { MetadataRoute } from 'next';
import { api } from '@/convex/_generated/api';
import { convexServer } from '@/lib/convex-server';
import { getAllArticles } from '@/lib/articles';
import { CURATED_CATEGORIES } from './chains/best/curated-categories';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pluginradar.com';

// Categories with dedicated pages
const categories = [
  'compressor',
  'eq',
  'reverb',
  'delay',
  'synth',
  'sampler',
  'saturator',
  'limiter',
  'utility',
  'instrument',
  'effect',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Fetch dynamic data from Convex
  const [pluginSlugs, manufacturerSlugs, comparisonSlugs, chainSlugs] = await Promise.all([
    convexServer.query(api.sitemap.allPluginSlugs, {}).catch(() => []),
    convexServer.query(api.sitemap.allManufacturerSlugs, {}).catch(() => []),
    convexServer.query(api.sitemap.allComparisonSlugs, {}).catch(() => []),
    convexServer.query(api.sitemap.allChainSlugs, {}).catch(() => []),
  ]);

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${BASE_URL}/plugins`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/manufacturers`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/compare`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/free`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/chains`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    // Note: /account is a private user page excluded from sitemap
    // /sales, /wishlist, /collection, /alerts removed for open beta
  ];

  // Category pages
  const categoryPages: MetadataRoute.Sitemap = categories.map(category => ({
    url: `${BASE_URL}/category/${category}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // Individual plugin pages
  const pluginPages: MetadataRoute.Sitemap = pluginSlugs.map(p => ({
    url: `${BASE_URL}/plugins/${p.slug}`,
    lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  // Manufacturer pages
  const manufacturerPages: MetadataRoute.Sitemap = manufacturerSlugs.map(m => ({
    url: `${BASE_URL}/manufacturers/${m.slug}`,
    lastModified: m.updatedAt ? new Date(m.updatedAt) : now,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  // Comparison pages
  const comparisonPages: MetadataRoute.Sitemap = comparisonSlugs.map(c => ({
    url: `${BASE_URL}/compare/${c.slug}`,
    lastModified: c.updatedAt ? new Date(c.updatedAt) : now,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  // Chain pages
  const chainPages: MetadataRoute.Sitemap = chainSlugs.map(c => ({
    url: `${BASE_URL}/chains/${c.slug}`,
    lastModified: c.updatedAt ? new Date(c.updatedAt) : now,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  // Learn articles
  const learnArticles = getAllArticles();
  const learnPages: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/learn`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    ...learnArticles.map(article => ({
      url: `${BASE_URL}/learn/${article.slug}`,
      lastModified: new Date(article.date),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];

  // Curated "best of" chain pages
  const curatedChainPages: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/chains/best`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...CURATED_CATEGORIES.map(cat => ({
      url: `${BASE_URL}/chains/best/${cat.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];

  return [
    ...staticPages,
    ...categoryPages,
    ...pluginPages,
    ...manufacturerPages,
    ...comparisonPages,
    ...chainPages,
    ...learnPages,
    ...curatedChainPages,
  ];
}
