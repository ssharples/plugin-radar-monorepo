#!/usr/bin/env node

/**
 * iZotope Scraper
 * Website: https://www.izotope.com
 * Note: iZotope blocks simple web fetches, so we use known product data
 */

import { slugify, getOrCreateManufacturer, upsertPlugin, convex } from '../lib/scraper-utils.mjs';
import { api } from '../../convex/_generated/api.js';

const MANUFACTURER_SLUG = 'izotope';
const BASE_URL = 'https://www.izotope.com';

// iZotope products
const PRODUCTS = [
  // Mixing & Mastering
  {
    name: 'Ozone 11',
    slug: 'ozone-11',
    description: 'The industry standard for mastering. AI-powered mastering tools including EQ, dynamics, imager, and more.',
    category: 'utility',
    msrp: 49900,
    productUrl: 'https://www.izotope.com/en/products/ozone.html',
    tags: ['mastering', 'ai', 'eq', 'limiter'],
  },
  {
    name: 'Ozone 11 Elements',
    slug: 'ozone-11-elements',
    description: 'Essential mastering tools with AI-powered assistance. Entry point to the Ozone family.',
    category: 'utility',
    msrp: 12900,
    productUrl: 'https://www.izotope.com/en/products/ozone.html',
    tags: ['mastering', 'ai'],
  },
  {
    name: 'Neutron 4',
    slug: 'neutron-4',
    description: 'AI-powered mixing assistant with channel strip tools. Intelligent track analysis and processing.',
    category: 'utility',
    msrp: 39900,
    productUrl: 'https://www.izotope.com/en/products/neutron.html',
    tags: ['mixing', 'ai', 'channel-strip'],
  },
  {
    name: 'Neutron 4 Elements',
    slug: 'neutron-4-elements',
    description: 'Essential mixing tools with intelligent processing. Streamlined version of Neutron.',
    category: 'utility',
    msrp: 12900,
    productUrl: 'https://www.izotope.com/en/products/neutron.html',
    tags: ['mixing', 'ai'],
  },
  {
    name: 'Nectar 4',
    slug: 'nectar-4',
    description: 'Complete vocal production suite with AI-powered processing for professional vocal sound.',
    category: 'effect',
    msrp: 39900,
    productUrl: 'https://www.izotope.com/en/products/nectar.html',
    tags: ['vocal', 'ai', 'pitch-correction'],
  },
  {
    name: 'Nectar 4 Elements',
    slug: 'nectar-4-elements',
    description: 'Essential vocal processing with intelligent analysis. Quick professional vocal sound.',
    category: 'effect',
    msrp: 12900,
    productUrl: 'https://www.izotope.com/en/products/nectar.html',
    tags: ['vocal', 'ai'],
  },
  // Repair & Restoration
  {
    name: 'RX 11',
    slug: 'rx-11',
    description: 'The industry standard for audio repair. Complete toolkit for noise reduction, restoration, and cleanup.',
    category: 'utility',
    msrp: 79900,
    productUrl: 'https://www.izotope.com/en/products/rx.html',
    tags: ['restoration', 'noise-reduction', 'repair'],
  },
  {
    name: 'RX 11 Elements',
    slug: 'rx-11-elements',
    description: 'Essential audio repair tools for common problems. Entry point to RX.',
    category: 'utility',
    msrp: 12900,
    productUrl: 'https://www.izotope.com/en/products/rx.html',
    tags: ['restoration', 'noise-reduction'],
  },
  // Creative Effects
  {
    name: 'Trash',
    slug: 'trash',
    description: 'Distortion, dynamics, and filter effects for creative sound design. New version of the classic plugin.',
    category: 'effect',
    msrp: 9900,
    productUrl: 'https://www.izotope.com/en/products/trash.html',
    tags: ['distortion', 'creative', 'filter'],
  },
  {
    name: 'Stutter Edit 2',
    slug: 'stutter-edit-2',
    description: 'Real-time audio manipulation for glitch, stutter, and beat-slicing effects.',
    category: 'effect',
    msrp: 19900,
    productUrl: 'https://www.izotope.com/en/products/stutter-edit.html',
    tags: ['glitch', 'creative', 'beat'],
  },
  {
    name: 'BreakTweaker',
    slug: 'breaktweaker',
    description: 'Drum machine and beat sequencer designed by BT. Micro-edit and glitch capabilities.',
    category: 'instrument',
    msrp: 19900,
    productUrl: 'https://www.izotope.com/en/products/breaktweaker.html',
    tags: ['drums', 'glitch', 'sequencer'],
  },
  {
    name: 'Iris 2',
    slug: 'iris-2',
    description: 'Spectral synthesis instrument for creating sounds from any audio source.',
    category: 'synth',
    msrp: 19900,
    productUrl: 'https://www.izotope.com/en/products/iris.html',
    tags: ['spectral', 'sampling', 'creative'],
  },
  // EQ & Dynamics
  {
    name: 'Insight 2',
    slug: 'insight-2',
    description: 'Professional metering suite for mixing and mastering with loudness analysis.',
    category: 'utility',
    msrp: 19900,
    productUrl: 'https://www.izotope.com/en/products/insight.html',
    tags: ['metering', 'loudness', 'analysis'],
  },
  {
    name: 'Tonal Balance Control 2',
    slug: 'tonal-balance-control-2',
    description: 'Visual analysis tool to ensure mixes translate well across systems.',
    category: 'utility',
    msrp: 9900,
    productUrl: 'https://www.izotope.com/en/products/tonal-balance-control.html',
    tags: ['metering', 'analysis'],
  },
  {
    name: 'Relay',
    slug: 'relay',
    description: 'Gain staging and monitoring utility. Free with any iZotope purchase.',
    category: 'utility',
    msrp: 0,
    productUrl: 'https://www.izotope.com/en/products/relay.html',
    tags: ['utility', 'gain'],
    isFree: true,
  },
  {
    name: 'Vinyl',
    slug: 'vinyl',
    description: 'Lo-fi vinyl simulation effect. Classic free plugin for vintage character.',
    category: 'effect',
    msrp: 0,
    productUrl: 'https://www.izotope.com/en/products/vinyl.html',
    tags: ['lofi', 'vintage', 'free'],
    isFree: true,
  },
  {
    name: 'Vocal Doubler',
    slug: 'vocal-doubler',
    description: 'Free vocal doubling effect for width and depth.',
    category: 'effect',
    msrp: 0,
    productUrl: 'https://www.izotope.com/en/products/vocal-doubler.html',
    tags: ['vocal', 'doubler', 'free'],
    isFree: true,
  },
  // Bundles
  {
    name: 'Music Production Suite Pro',
    slug: 'music-production-suite-pro',
    description: 'Complete collection of iZotope plugins including Ozone, Neutron, Nectar, RX, and more.',
    category: 'bundle',
    msrp: 99900,
    productUrl: 'https://www.izotope.com/en/products/music-production-suite.html',
    tags: ['bundle', 'complete'],
  },
  {
    name: 'Mix & Master Bundle',
    slug: 'mix-master-bundle',
    description: 'Essential mixing and mastering tools including Ozone, Neutron, and Nectar.',
    category: 'bundle',
    msrp: 59900,
    productUrl: 'https://www.izotope.com/en/products/mix-master-bundle.html',
    tags: ['bundle', 'mixing', 'mastering'],
  },
];

export async function scrapeIzotope(fetchFn) {
  console.log('\n🔬 Scraping iZotope...');
  
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

// For standalone testing
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeIzotope(() => ({})).then(console.log).catch(console.error);
}
