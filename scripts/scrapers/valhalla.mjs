#!/usr/bin/env node

/**
 * Valhalla DSP Scraper
 * Website: https://valhalladsp.com
 */

import { slugify, detectCategory, downloadImage, getOrCreateManufacturer, upsertPlugin, convex } from '../lib/scraper-utils.mjs';
import { api } from '../../convex/_generated/api.js';

const MANUFACTURER_SLUG = 'valhalla-dsp';
const BASE_URL = 'https://valhalladsp.com';

// Valhalla products with known info
const PRODUCTS = [
  {
    name: 'Valhalla VintageVerb',
    slug: 'valhalla-vintageverb',
    description: 'Best for old school digital hardware reverbs. Legendary reverb plugin recreating classic digital reverbs from the 1970s and 1980s.',
    category: 'reverb',
    msrp: 5000, // $50
    productUrl: 'https://valhalladsp.com/shop/reverb/valhalla-vintage-verb/',
    isFree: false,
  },
  {
    name: 'Valhalla FutureVerb',
    slug: 'valhalla-futureverb',
    description: 'The latest reverb plugin from Valhalla DSP featuring 8 natural reverb modes with transparent, artifact-free sound.',
    category: 'reverb',
    msrp: 5000,
    productUrl: 'https://valhalladsp.com/shop/reverb/valhallafutureverb/',
    isFree: false,
  },
  {
    name: 'Valhalla Delay',
    slug: 'valhalla-delay',
    description: 'Best for echoes, looping, and all things delay. A versatile delay plugin with tape, analog, and digital modes.',
    category: 'delay',
    msrp: 5000,
    productUrl: 'https://valhalladsp.com/shop/delay/valhalladelay/',
    isFree: false,
  },
  {
    name: 'Valhalla Room',
    slug: 'valhalla-room',
    description: 'An algorithmic vision of perfection and precision. Versatile reverb for natural room sounds.',
    category: 'reverb',
    msrp: 5000,
    productUrl: 'https://valhalladsp.com/shop/reverb/valhalla-room/',
    isFree: false,
  },
  {
    name: 'Valhalla Plate',
    slug: 'valhalla-plate',
    description: 'Warm and dense reverbs from the 1960s and 1970s. Classic plate reverb emulation.',
    category: 'reverb',
    msrp: 5000,
    productUrl: 'https://valhalladsp.com/shop/reverb/valhalla-plate/',
    isFree: false,
  },
  {
    name: 'Valhalla Shimmer',
    slug: 'valhalla-shimmer',
    description: 'Ethereal decay and pitch shifting soundscapes. Perfect for ambient and cinematic productions.',
    category: 'reverb',
    msrp: 5000,
    productUrl: 'https://valhalladsp.com/shop/reverb/valhalla-shimmer/',
    isFree: false,
  },
  {
    name: 'Valhalla UberMod',
    slug: 'valhalla-ubermod',
    description: 'Dissolving into chorus, flanging, multitap, reverb weirdness. Creative modulation effects.',
    category: 'effect',
    msrp: 5000,
    productUrl: 'https://valhalladsp.com/shop/delay/valhalla-uber-mod/',
    isFree: false,
  },
  {
    name: 'Valhalla FreqEcho',
    slug: 'valhalla-freqecho',
    description: 'Psychedelic skull-melting chaos. Free frequency shifter and analog echo plugin.',
    category: 'delay',
    msrp: 0,
    productUrl: 'https://valhalladsp.com/shop/delay/valhalla-freq-echo/',
    isFree: true,
  },
  {
    name: 'Valhalla Space Modulator',
    slug: 'valhalla-space-modulator',
    description: 'Infinite flanging and doubling. Free modulation effect plugin.',
    category: 'effect',
    msrp: 0,
    productUrl: 'https://valhalladsp.com/shop/modulation/valhalla-space-modulator/',
    isFree: true,
  },
  {
    name: 'Valhalla Supermassive',
    slug: 'valhalla-supermassive',
    description: 'Massive reverbs, harmonic echoes, and space sounds. Free and incredibly versatile.',
    category: 'reverb',
    msrp: 0,
    productUrl: 'https://valhalladsp.com/shop/reverb/valhalla-supermassive/',
    isFree: true,
  },
];

export async function scrapeValhalla(fetchFn) {
  console.log('\n🌌 Scraping Valhalla DSP...');
  
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
        tags: product.isFree ? ['free'] : [],
        formats: ['VST', 'VST3', 'AU', 'AAX'],
        platforms: ['windows', 'mac', 'linux'],
        msrp: product.isFree ? undefined : product.msrp,
        isFree: product.isFree,
        hasDemo: true,
        hasTrial: !product.isFree,
        productUrl: product.productUrl,
        currency: 'USD',
      });
      
      if (result) {
        console.log(`  ✓ ${product.name} (${product.category})${product.isFree ? ' [FREE]' : ''}`);
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
  scrapeValhalla(() => ({})).then(console.log).catch(console.error);
}
