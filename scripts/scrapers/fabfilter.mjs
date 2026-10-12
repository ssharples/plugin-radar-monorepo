#!/usr/bin/env node

/**
 * FabFilter Scraper
 * Website: https://www.fabfilter.com/products
 */

import { slugify, detectCategory, downloadImage, getOrCreateManufacturer, upsertPlugin, DEFAULT_FORMATS, DEFAULT_PLATFORMS, convex } from '../lib/scraper-utils.mjs';
import { api } from '../../convex/_generated/api.js';

const MANUFACTURER_SLUG = 'fabfilter';
const BASE_URL = 'https://www.fabfilter.com';

// FabFilter products (hardcoded since page structure is complex)
const PRODUCTS = [
  {
    name: 'FabFilter Pro-Q 4',
    slug: 'fabfilter-pro-q-4',
    description: 'Top-quality EQ plug-in with perfect analog modeling, dynamic and spectral EQ, linear phase processing, and a gorgeous interface.',
    category: 'eq',
    msrp: 18900,
    productUrl: 'https://www.fabfilter.com/products/pro-q-4-equalizer-plug-in',
  },
  {
    name: 'FabFilter Pro-C 3',
    slug: 'fabfilter-pro-c-3',
    description: 'Professional compressor plug-in with versatile side chain and routing options, high-quality sound and an innovative interface.',
    category: 'compressor',
    msrp: 17900,
    productUrl: 'https://www.fabfilter.com/products/pro-c-3-compressor-plug-in',
  },
  {
    name: 'FabFilter Pro-L 2',
    slug: 'fabfilter-pro-l-2',
    description: 'Feature-packed true peak limiter plug-in, with multiple advanced limiting algorithms and extensive level and loudness metering.',
    category: 'compressor',
    msrp: 19900,
    productUrl: 'https://www.fabfilter.com/products/pro-l-2-limiter-plug-in',
  },
  {
    name: 'FabFilter Pro-R 2',
    slug: 'fabfilter-pro-r-2',
    description: 'High-end reverb plug-in with both vintage and natural sound, musical controls, and the unique Decay Rate EQ.',
    category: 'reverb',
    msrp: 19900,
    productUrl: 'https://www.fabfilter.com/products/pro-r-2-reverb-plug-in',
  },
  {
    name: 'FabFilter Pro-MB',
    slug: 'fabfilter-pro-mb',
    description: 'Powerful multiband compressor/expander plug-in with all the expert features you need, combining exceptional sound quality with great workflow.',
    category: 'compressor',
    msrp: 17900,
    productUrl: 'https://www.fabfilter.com/products/pro-mb-multiband-compressor-plug-in',
  },
  {
    name: 'FabFilter Pro-DS',
    slug: 'fabfilter-pro-ds',
    description: 'Highly intelligent and transparent de-essing plug-in, perfect for processing single vocal tracks as well as entire mixes.',
    category: 'effect',
    msrp: 16900,
    productUrl: 'https://www.fabfilter.com/products/pro-ds-de-esser-plug-in',
  },
  {
    name: 'FabFilter Pro-G',
    slug: 'fabfilter-pro-g',
    description: 'Highly flexible gate/expander plug-in with advanced side chain options and precise metering.',
    category: 'utility',
    msrp: 16900,
    productUrl: 'https://www.fabfilter.com/products/pro-g-gate-expander-plug-in',
  },
  {
    name: 'FabFilter Saturn 2',
    slug: 'fabfilter-saturn-2',
    description: 'Multiband distortion, saturation and amp modeling plug-in, with lots of modulation options.',
    category: 'effect',
    msrp: 15400,
    productUrl: 'https://www.fabfilter.com/products/saturn-2-multiband-distortion-saturation-plug-in',
  },
  {
    name: 'FabFilter Timeless 3',
    slug: 'fabfilter-timeless-3',
    description: 'Ultra-flexible tape delay plug-in with time stretching, top quality filters and drag-and-drop modulation.',
    category: 'delay',
    msrp: 15400,
    productUrl: 'https://www.fabfilter.com/products/timeless-3-delay-plug-in',
  },
  {
    name: 'FabFilter Volcano 3',
    slug: 'fabfilter-volcano-3',
    description: 'Filter effect plug-in with smooth, vintage-sounding filters and endless modulation possibilities.',
    category: 'effect',
    msrp: 15400,
    productUrl: 'https://www.fabfilter.com/products/volcano-3-filter-plug-in',
  },
  {
    name: 'FabFilter Twin 3',
    slug: 'fabfilter-twin-3',
    description: 'Powerful synthesizer plug-in with the best possible sound quality, a high quality effect section and an ultra-flexible modulation system.',
    category: 'synth',
    msrp: 16900,
    productUrl: 'https://www.fabfilter.com/products/twin-3-synthesizer-plug-in',
  },
  {
    name: 'FabFilter One',
    slug: 'fabfilter-one',
    description: 'Basic synthesizer plug-in with just one oscillator, but with perfectly fine-tuned controls and the best possible sound and filter quality.',
    category: 'synth',
    msrp: 0,
    productUrl: 'https://www.fabfilter.com/products/one-basic-synthesizer-plug-in',
    isFree: true,
  },
  {
    name: 'FabFilter Simplon',
    slug: 'fabfilter-simplon',
    description: 'Basic and easy to use filter plug-in with two high-quality multi-mode filters and an interactive filter display.',
    category: 'effect',
    msrp: 0,
    productUrl: 'https://www.fabfilter.com/products/simplon-basic-filter-plug-in',
    isFree: true,
  },
  {
    name: 'FabFilter Micro',
    slug: 'fabfilter-micro',
    description: 'Ultimate lightweight filter plug-in with a single high-quality filter including envelope follower modulation.',
    category: 'effect',
    msrp: 0,
    productUrl: 'https://www.fabfilter.com/products/micro-mini-filter-plug-in',
    isFree: true,
  },
  {
    name: 'FabFilter Total Bundle',
    slug: 'fabfilter-total-bundle',
    description: 'All FabFilter plug-ins in one bundle. Get all professional mixing, mastering, synthesis and creative tools.',
    category: 'bundle',
    msrp: 89900,
    productUrl: 'https://www.fabfilter.com/shop/total-bundle',
  },
  {
    name: 'FabFilter Mastering Bundle',
    slug: 'fabfilter-mastering-bundle',
    description: 'The essential mastering collection including Pro-Q 4, Pro-L 2, Pro-MB and Pro-R 2.',
    category: 'bundle',
    msrp: 59900,
    productUrl: 'https://www.fabfilter.com/shop/mastering-bundle',
  },
  {
    name: 'FabFilter Mixing Bundle',
    slug: 'fabfilter-mixing-bundle',
    description: 'Everything you need for professional mixing: Pro-Q 4, Pro-C 3, Pro-DS, Pro-G and Pro-R 2.',
    category: 'bundle',
    msrp: 59900,
    productUrl: 'https://www.fabfilter.com/shop/mixing-bundle',
  },
];

export async function scrapeFabFilter(fetchFn) {
  console.log('\n🎛️  Scraping FabFilter...');
  
  const manufacturerId = await getOrCreateManufacturer(MANUFACTURER_SLUG);
  if (!manufacturerId) {
    console.error('  ❌ Could not find manufacturer');
    return { plugins: [], errors: 1 };
  }
  
  const plugins = PRODUCTS;
  const errors = [];
  
  console.log(`  Found ${plugins.length} products`);
  
  // Process each plugin
  let created = 0;
  
  for (const plugin of plugins) {
    try {
      const isFree = plugin.isFree || plugin.msrp === 0;
      
      const result = await upsertPlugin({
        name: plugin.name,
        slug: plugin.slug,
        manufacturer: manufacturerId,
        description: plugin.description,
        shortDescription: plugin.description?.substring(0, 150),
        category: plugin.category,
        tags: plugin.tags || [],
        formats: ['VST3', 'AU', 'AAX'],
        platforms: ['windows', 'mac'],
        msrp: isFree ? undefined : plugin.msrp,
        isFree,
        hasDemo: true,
        hasTrial: true,
        productUrl: plugin.productUrl,
        currency: 'USD',
      });
      
      if (result) {
        console.log(`  ✓ ${plugin.name} (${plugin.category})${isFree ? ' [FREE]' : ''}`);
        created++;
      }
    } catch (err) {
      console.error(`  ✗ Error with ${plugin.name}: ${err.message}`);
      errors.push({ plugin: plugin.name, error: err.message });
    }
  }
  
  return { plugins: created, errors: errors.length };
}

// For standalone testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const { default: fetch } = await import('node-fetch');
  
  async function fetchPage(url) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
    });
    return { text: await res.text() };
  }
  
  scrapeFabFilter(fetchPage).then(console.log).catch(console.error);
}
