import { MetadataRoute } from 'next';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pluginradar.com';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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
    convex.query(api.sitemap.allPluginSlugs, {}).catch(() => []),
    convex.query(api.sitemap.allManufacturerSlugs, {}).catch(() => []),
    convex.query(api.sitemap.allComparisonSlugs, {}).catch(() => []),
    convex.query(api.sitemap.allChainSlugs, {}).catch(() => []),
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
      url: `${BASE_URL}/sales`,
      lastModified: now,
      changeFrequency: 'hourly',
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
    {
      url: `${BASE_URL}/wishlist`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/collection`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/alerts`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/account`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
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

  return [
    ...staticPages,
    ...categoryPages,
    ...pluginPages,
    ...manufacturerPages,
    ...comparisonPages,
    ...chainPages,
  ];
}
