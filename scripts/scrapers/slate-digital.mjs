#!/usr/bin/env node

/**
 * Slate Digital Scraper
 * Website: https://www.slatedigital.com
 */

import { getOrCreateManufacturer, upsertPlugin } from '../lib/scraper-utils.mjs';

const MANUFACTURER_SLUG = 'slate-digital';

const PRODUCTS = [
  // Virtual Channel
  {
    name: 'Virtual Mix Rack',
    slug: 'virtual-mix-rack',
    description: 'Modular channel strip with interchangeable modules for EQ, compression, and saturation.',
    category: 'utility',
    msrp: 14900,
    productUrl: 'https://www.slatedigital.com/virtual-mix-rack/',
  },
  {
    name: 'Virtual Console Collection',
    slug: 'virtual-console-collection',
    description: 'Collection of console emulations: SSL 4000, Neve, API, and Trident.',
    category: 'effect',
    msrp: 14900,
    productUrl: 'https://www.slatedigital.com/virtual-console-collection/',
    tags: ['console', 'saturation'],
  },
  {
    name: 'Virtual Tape Machines',
    slug: 'virtual-tape-machines',
    description: 'Tape machine emulations including Studer A827 and Ampex ATR-102.',
    category: 'effect',
    msrp: 14900,
    productUrl: 'https://www.slatedigital.com/virtual-tape-machines/',
    tags: ['tape', 'saturation'],
  },
  {
    name: 'Virtual Buss Compressors',
    slug: 'virtual-buss-compressors',
    description: 'SSL, API, and Fairchild buss compressor emulations.',
    category: 'compressor',
    msrp: 14900,
    productUrl: 'https://www.slatedigital.com/virtual-buss-compressors/',
  },
  // FG-X
  {
    name: 'FG-X 2',
    slug: 'fg-x-2',
    description: 'Mastering processor with ITP (Intelligent Transient Preservation) technology.',
    category: 'utility',
    msrp: 19900,
    productUrl: 'https://www.slatedigital.com/fg-x-2/',
    tags: ['mastering', 'limiter'],
  },
  // Eiosis
  {
    name: 'AirEQ',
    slug: 'aireq',
    description: 'Musical EQ with unique "Air" band for pristine highs.',
    category: 'eq',
    msrp: 14900,
    productUrl: 'https://www.slatedigital.com/aireq/',
  },
  {
    name: 'e2deesser',
    slug: 'e2deesser',
    description: 'Intelligent de-esser with automatic detection.',
    category: 'effect',
    msrp: 9900,
    productUrl: 'https://www.slatedigital.com/e2deesser/',
    tags: ['vocal', 'de-esser'],
  },
  // ML Series
  {
    name: 'ML-1 Vintage Reverb',
    slug: 'ml-1-vintage-reverb',
    description: 'Machine learning powered vintage reverb collection.',
    category: 'reverb',
    msrp: 14900,
    productUrl: 'https://www.slatedigital.com/ml-1-vintage-reverb/',
  },
  // Fresh Air
  {
    name: 'Fresh Air',
    slug: 'fresh-air',
    description: 'High-frequency exciter for adding air and presence.',
    category: 'effect',
    msrp: 0,
    productUrl: 'https://www.slatedigital.com/fresh-air/',
    isFree: true,
    tags: ['exciter', 'free'],
  },
  // Verbsuite Classics
  {
    name: 'Verbsuite Classics',
    slug: 'verbsuite-classics',
    description: 'Collection of classic hardware reverb emulations.',
    category: 'reverb',
    msrp: 19900,
    productUrl: 'https://www.slatedigital.com/verbsuite-classics/',
  },
  // Infinity
  {
    name: 'Infinity EQ',
    slug: 'infinity-eq',
    description: 'AI-powered EQ that learns and matches target curves.',
    category: 'eq',
    msrp: 19900,
    productUrl: 'https://www.slatedigital.com/infinity-eq/',
    tags: ['ai', 'matching'],
  },
  // All Access Pass Bundle
  {
    name: 'Slate Digital All Access Pass',
    slug: 'slate-all-access-pass',
    description: 'Subscription access to all Slate Digital plugins.',
    category: 'bundle',
    msrp: 14999, // $149.99/year
    productUrl: 'https://www.slatedigital.com/all-access-pass/',
  },
];

export async function scrapeSlateDigital(fetchFn) {
  console.log('\n🎚️  Scraping Slate Digital...');
  
  const manufacturerId = await getOrCreateManufacturer(MANUFACTURER_SLUG);
  if (!manufacturerId) {
    console.error('  ❌ Could not find manufacturer');
    return { plugins: [], errors: 1 };
  }
  
  let created = 0;
  const errors = [];
  
  for (const product of PRODUCTS) {
    try {
      const isFree = product.isFree || product.msrp === 0;
      
      const result = await upsertPlugin({
        name: product.name,
        slug: product.slug,
        manufacturer: manufacturerId,
        description: product.description,
        shortDescription: product.description?.substring(0, 150),
        category: product.category,
        tags: product.tags || [],
        formats: ['VST3', 'AU', 'AAX'],
        platforms: ['windows', 'mac'],
        msrp: isFree ? undefined : product.msrp,
        isFree,
        hasDemo: true,
        hasTrial: true,
        productUrl: product.productUrl,
        currency: 'USD',
      });
      
      if (result) {
        console.log(`  ✓ ${product.name} (${product.category})${isFree ? ' [FREE]' : ''}`);
        created++;
      }
    } catch (err) {
      console.error(`  ✗ Error with ${product.name}: ${err.message}`);
      errors.push({ plugin: product.name, error: err.message });
    }
  }
  
  return { plugins: created, errors: errors.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeSlateDigital(() => ({})).then(console.log).catch(console.error);
}
