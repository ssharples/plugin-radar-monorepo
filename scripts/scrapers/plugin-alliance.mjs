#!/usr/bin/env node

/**
 * Plugin Alliance Scraper
 * Website: https://www.plugin-alliance.com
 */

import { getOrCreateManufacturer, upsertPlugin } from '../lib/scraper-utils.mjs';

const MANUFACTURER_SLUG = 'plugin-alliance';

// Top Plugin Alliance brands: Brainworx, SPL, Lindell Audio, Unfiltered Audio, etc.
const PRODUCTS = [
  // Brainworx
  {
    name: 'bx_console SSL 9000 J',
    slug: 'bx-console-ssl-9000-j',
    description: 'SSL 9000 J console channel strip emulation.',
    category: 'eq',
    msrp: 29900,
    productUrl: 'https://www.plugin-alliance.com/en/products/bx_console_ssl_9000_j.html',
    tags: ['console', 'channel-strip'],
  },
  {
    name: 'bx_console Focusrite SC',
    slug: 'bx-console-focusrite-sc',
    description: 'Focusrite Studio Console channel strip emulation.',
    category: 'eq',
    msrp: 29900,
    productUrl: 'https://www.plugin-alliance.com/en/products/bx_console_focusrite_sc.html',
    tags: ['console', 'channel-strip'],
  },
  {
    name: 'bx_digital V3',
    slug: 'bx-digital-v3',
    description: 'Mastering-grade M/S EQ and dynamics.',
    category: 'eq',
    msrp: 29900,
    productUrl: 'https://www.plugin-alliance.com/en/products/bx_digital_v3.html',
    tags: ['mastering', 'mid-side'],
  },
  {
    name: 'bx_masterdesk Pro',
    slug: 'bx-masterdesk-pro',
    description: 'All-in-one mastering plugin with M/S processing.',
    category: 'utility',
    msrp: 29900,
    productUrl: 'https://www.plugin-alliance.com/en/products/bx_masterdesk_pro.html',
    tags: ['mastering'],
  },
  {
    name: 'bx_saturator V2',
    slug: 'bx-saturator-v2',
    description: 'M/S saturation with XL mode for big bass.',
    category: 'effect',
    msrp: 14900,
    productUrl: 'https://www.plugin-alliance.com/en/products/bx_saturator_v2.html',
    tags: ['saturation'],
  },
  {
    name: 'bx_limiter True Peak',
    slug: 'bx-limiter-true-peak',
    description: 'Transparent true peak limiter for mastering.',
    category: 'compressor',
    msrp: 19900,
    productUrl: 'https://www.plugin-alliance.com/en/products/bx_limiter_true_peak.html',
    tags: ['mastering', 'limiter'],
  },
  // SPL
  {
    name: 'SPL Iron',
    slug: 'spl-iron',
    description: 'Mastering compressor with tube warmth.',
    category: 'compressor',
    msrp: 29900,
    productUrl: 'https://www.plugin-alliance.com/en/products/spl_iron.html',
    tags: ['mastering', 'tube'],
  },
  {
    name: 'SPL Transient Designer Plus',
    slug: 'spl-transient-designer-plus',
    description: 'Classic transient shaper with expanded features.',
    category: 'effect',
    msrp: 14900,
    productUrl: 'https://www.plugin-alliance.com/en/products/spl_transient_designer_plus.html',
    tags: ['transient'],
  },
  {
    name: 'SPL Vitalizer MK2-T',
    slug: 'spl-vitalizer-mk2-t',
    description: 'Psychoacoustic processor for enhancing clarity.',
    category: 'effect',
    msrp: 19900,
    productUrl: 'https://www.plugin-alliance.com/en/products/spl_vitalizer_mk2-t.html',
    tags: ['exciter', 'enhancer'],
  },
  // Lindell Audio
  {
    name: 'Lindell 80 Series',
    slug: 'lindell-80-series',
    description: 'Neve 1073/1084 channel strip emulation.',
    category: 'eq',
    msrp: 19900,
    productUrl: 'https://www.plugin-alliance.com/en/products/lindell_80_series.html',
    tags: ['console', 'neve'],
  },
  {
    name: 'Lindell 50 Series',
    slug: 'lindell-50-series',
    description: 'API channel strip emulation.',
    category: 'eq',
    msrp: 19900,
    productUrl: 'https://www.plugin-alliance.com/en/products/lindell_50_series.html',
    tags: ['console', 'api'],
  },
  {
    name: 'Lindell Audio 354E',
    slug: 'lindell-354e',
    description: 'Neve 33609 compressor emulation.',
    category: 'compressor',
    msrp: 14900,
    productUrl: 'https://www.plugin-alliance.com/en/products/lindell_354e.html',
    tags: ['neve'],
  },
  // Unfiltered Audio
  {
    name: 'BYOME',
    slug: 'byome',
    description: 'Build Your Own Multi-Effect. Modular effects processor.',
    category: 'effect',
    msrp: 14900,
    productUrl: 'https://www.plugin-alliance.com/en/products/unfiltered_audio_byome.html',
    tags: ['modular', 'creative'],
  },
  {
    name: 'TRIAD',
    slug: 'triad',
    description: 'Advanced frequency-dependent processing.',
    category: 'effect',
    msrp: 19900,
    productUrl: 'https://www.plugin-alliance.com/en/products/unfiltered_audio_triad.html',
    tags: ['multiband', 'creative'],
  },
  {
    name: 'Sandman Pro',
    slug: 'sandman-pro',
    description: 'Morphable delay and reverb with freeze capability.',
    category: 'delay',
    msrp: 14900,
    productUrl: 'https://www.plugin-alliance.com/en/products/unfiltered_audio_sandman_pro.html',
    tags: ['creative'],
  },
  // Shadow Hills
  {
    name: 'Shadow Hills Mastering Compressor',
    slug: 'shadow-hills-mastering-compressor',
    description: 'Legendary dual-stage mastering compressor.',
    category: 'compressor',
    msrp: 29900,
    productUrl: 'https://www.plugin-alliance.com/en/products/shadow_hills_mastering_compressor.html',
    tags: ['mastering'],
  },
  // Free
  {
    name: 'bx_solo',
    slug: 'bx-solo',
    description: 'Free M/S solo and mute utility.',
    category: 'utility',
    msrp: 0,
    productUrl: 'https://www.plugin-alliance.com/en/products/bx_solo.html',
    isFree: true,
    tags: ['free', 'mid-side'],
  },
  {
    name: 'bx_cleansweep V2',
    slug: 'bx-cleansweep-v2',
    description: 'Free hi-pass and lo-pass filter plugin.',
    category: 'eq',
    msrp: 0,
    productUrl: 'https://www.plugin-alliance.com/en/products/bx_cleansweep_v2.html',
    isFree: true,
    tags: ['free', 'filter'],
  },
];

export async function scrapePluginAlliance(fetchFn) {
  console.log('\n🤝 Scraping Plugin Alliance...');
  
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
  scrapePluginAlliance(() => ({})).then(console.log).catch(console.error);
}
