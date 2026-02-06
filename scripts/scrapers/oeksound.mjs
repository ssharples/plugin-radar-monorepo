#!/usr/bin/env node

/**
 * oeksound Scraper
 * Website: https://oeksound.com
 */

import { slugify, detectCategory, getOrCreateManufacturer, upsertPlugin, convex } from '../lib/scraper-utils.mjs';
import { api } from '../../convex/_generated/api.js';

const MANUFACTURER_SLUG = 'oeksound';
const BASE_URL = 'https://oeksound.com';

// oeksound products
const PRODUCTS = [
  {
    name: 'soothe2',
    slug: 'soothe2',
    description: 'A dynamic resonance suppressor. It identifies problematic resonances on the fly and applies matching reduction automatically. Industry standard for taming harsh frequencies.',
    category: 'eq',
    msrp: 19900, // $199
    productUrl: 'https://oeksound.com/plugins/soothe2',
    isFree: false,
    tags: ['resonance', 'dynamics', 'mixing', 'mastering'],
  },
  {
    name: 'bloom',
    slug: 'bloom',
    description: 'An adaptive tone shaper. It analyzes the character of a signal and applies corrections to the perceived tonal balance for a more even and refined sound.',
    category: 'eq',
    msrp: 14900, // $149
    productUrl: 'https://oeksound.com/plugins/bloom',
    isFree: false,
    tags: ['tone-shaping', 'adaptive', 'mixing'],
  },
  {
    name: 'spiff',
    slug: 'spiff',
    description: 'An adaptive transient processor that lets you control transients with great detail. Perfect for drums, percussion, and any transient-heavy material.',
    category: 'effect',
    msrp: 14900, // $149
    productUrl: 'https://oeksound.com/plugins/spiff',
    isFree: false,
    tags: ['transient', 'dynamics', 'drums'],
  },
  {
    name: 'soothe live',
    slug: 'soothe-live',
    description: 'A dynamic resonance suppressor for live audio. It reimagines oeksound\'s Soothe technology for the live environment. Available for Avid VENUE S6L and Fourier Audio transform.engine.',
    category: 'eq',
    msrp: 49900, // $499
    productUrl: 'https://oeksound.com/plugins/soothe-live',
    isFree: false,
    tags: ['live', 'resonance', 'dynamics'],
  },
];

export async function scrapeOeksound(fetchFn) {
  console.log('\n🎚️  Scraping oeksound...');
  
  const manufacturerId = await getOrCreateManufacturer(MANUFACTURER_SLUG);
  if (!manufacturerId) {
    console.error('  ❌ Could not find manufacturer');
    return { plugins: [], errors: 1 };
  }
  
  let created = 0;
  const errors = [];
  
  for (const product of PRODUCTS) {
    try {
      const result = await upsertPlugin({
        name: product.name,
        slug: product.slug,
        manufacturer: manufacturerId,
        description: product.description,
        shortDescription: product.description?.substring(0, 150),
        category: product.category,
        tags: product.tags || [],
        formats: product.slug === 'soothe-live' ? ['Native'] : ['VST3', 'AU', 'AAX'],
        platforms: product.slug === 'soothe-live' ? ['windows', 'mac'] : ['windows', 'mac'],
        msrp: product.msrp,
        isFree: product.isFree,
        hasDemo: true,
        hasTrial: true,
        productUrl: product.productUrl,
        currency: 'USD',
      });
      
      if (result) {
        console.log(`  ✓ ${product.name} (${product.category})`);
        created++;
      }
    } catch (err) {
      console.error(`  ✗ Error with ${product.name}: ${err.message}`);
      errors.push({ plugin: product.name, error: err.message });
    }
  }
  
  return { plugins: created, errors: errors.length };
}

// For standalone testing
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeOeksound(() => ({})).then(console.log).catch(console.error);
}
