#!/usr/bin/env node

/**
 * Waves Scraper
 * Website: https://www.waves.com
 */

import { getOrCreateManufacturer, upsertPlugin, convex } from '../lib/scraper-utils.mjs';
import { api } from '../../convex/_generated/api.js';

const MANUFACTURER_SLUG = 'waves';

// Waves top products (they have 200+ plugins, this is the essential collection)
const PRODUCTS = [
  // Bundles
  {
    name: 'Waves Diamond',
    slug: 'waves-diamond',
    description: 'Comprehensive collection of 80+ plugins for mixing, mastering, and sound design.',
    category: 'bundle',
    msrp: 299900,
    productUrl: 'https://www.waves.com/bundles/diamond',
  },
  {
    name: 'Waves Platinum',
    slug: 'waves-platinum',
    description: '50+ essential plugins covering every aspect of mixing and mastering.',
    category: 'bundle',
    msrp: 199900,
    productUrl: 'https://www.waves.com/bundles/platinum',
  },
  {
    name: 'Waves Gold',
    slug: 'waves-gold',
    description: '42 legendary plugins for music production, mixing and mastering.',
    category: 'bundle',
    msrp: 59900,
    productUrl: 'https://www.waves.com/bundles/gold',
  },
  // EQ
  {
    name: 'F6 Floating-Band Dynamic EQ',
    slug: 'waves-f6',
    description: 'Real-time dynamic EQ with 6 floating bands and external sidechain.',
    category: 'eq',
    msrp: 19900,
    productUrl: 'https://www.waves.com/plugins/f6-floating-band-dynamic-eq',
  },
  {
    name: 'SSL E-Channel',
    slug: 'waves-ssl-e-channel',
    description: 'SSL 4000 E Series console channel strip emulation.',
    category: 'eq',
    msrp: 19900,
    productUrl: 'https://www.waves.com/plugins/ssl-e-channel',
  },
  {
    name: 'SSL G-Channel',
    slug: 'waves-ssl-g-channel',
    description: 'SSL 4000 G Series console channel strip emulation.',
    category: 'eq',
    msrp: 19900,
    productUrl: 'https://www.waves.com/plugins/ssl-g-channel',
  },
  {
    name: 'PuigTec EQs',
    slug: 'waves-puigtec-eqs',
    description: 'Pultec EQP-1A and MEQ-5 emulations by Jack Joseph Puig.',
    category: 'eq',
    msrp: 19900,
    productUrl: 'https://www.waves.com/plugins/puigtec-eqs',
  },
  {
    name: 'Renaissance EQ',
    slug: 'waves-renaissance-eq',
    description: 'Classic digital parametric EQ with analog warmth.',
    category: 'eq',
    msrp: 7900,
    productUrl: 'https://www.waves.com/plugins/renaissance-equalizer',
  },
  // Compressors
  {
    name: 'CLA-2A',
    slug: 'waves-cla-2a',
    description: 'LA-2A optical compressor emulation by Chris Lord-Alge.',
    category: 'compressor',
    msrp: 19900,
    productUrl: 'https://www.waves.com/plugins/cla-2a-compressor-limiter',
  },
  {
    name: 'CLA-3A',
    slug: 'waves-cla-3a',
    description: 'LA-3A optical compressor emulation by Chris Lord-Alge.',
    category: 'compressor',
    msrp: 19900,
    productUrl: 'https://www.waves.com/plugins/cla-3a-compressor-limiter',
  },
  {
    name: 'CLA-76',
    slug: 'waves-cla-76',
    description: '1176 FET compressor emulation by Chris Lord-Alge.',
    category: 'compressor',
    msrp: 19900,
    productUrl: 'https://www.waves.com/plugins/cla-76-compressor-limiter',
  },
  {
    name: 'Renaissance Compressor',
    slug: 'waves-renaissance-compressor',
    description: 'Classic warm compression with vintage character.',
    category: 'compressor',
    msrp: 7900,
    productUrl: 'https://www.waves.com/plugins/renaissance-compressor',
  },
  {
    name: 'SSL G-Master Buss Compressor',
    slug: 'waves-ssl-g-master-buss',
    description: 'SSL 4000 G Series buss compressor emulation.',
    category: 'compressor',
    msrp: 19900,
    productUrl: 'https://www.waves.com/plugins/ssl-g-master-buss-compressor',
  },
  {
    name: 'API 2500',
    slug: 'waves-api-2500',
    description: 'API 2500 stereo bus compressor emulation.',
    category: 'compressor',
    msrp: 19900,
    productUrl: 'https://www.waves.com/plugins/api-2500',
  },
  {
    name: 'dbx 160',
    slug: 'waves-dbx-160',
    description: 'dbx 160 VCA compressor emulation for punchy drums.',
    category: 'compressor',
    msrp: 14900,
    productUrl: 'https://www.waves.com/plugins/dbx-160-compressor-limiter',
  },
  // Limiters
  {
    name: 'L2 Ultramaximizer',
    slug: 'waves-l2-ultramaximizer',
    description: 'Industry standard peak limiter and loudness maximizer.',
    category: 'compressor',
    msrp: 19900,
    productUrl: 'https://www.waves.com/plugins/l2-ultramaximizer',
  },
  {
    name: 'L3 Multimaximizer',
    slug: 'waves-l3-multimaximizer',
    description: 'Multiband peak limiter for transparent loudness.',
    category: 'compressor',
    msrp: 29900,
    productUrl: 'https://www.waves.com/plugins/l3-multimaximizer',
  },
  // Reverb
  {
    name: 'H-Reverb',
    slug: 'waves-h-reverb',
    description: 'Hybrid reverb combining algorithmic and convolution technologies.',
    category: 'reverb',
    msrp: 29900,
    productUrl: 'https://www.waves.com/plugins/h-reverb-hybrid-reverb',
  },
  {
    name: 'Abbey Road Chambers',
    slug: 'waves-abbey-road-chambers',
    description: 'Recreation of Abbey Road Studios chamber reverb.',
    category: 'reverb',
    msrp: 19900,
    productUrl: 'https://www.waves.com/plugins/abbey-road-chambers',
  },
  {
    name: 'Abbey Road Plates',
    slug: 'waves-abbey-road-plates',
    description: 'EMT 140 plate reverbs from Abbey Road Studios.',
    category: 'reverb',
    msrp: 19900,
    productUrl: 'https://www.waves.com/plugins/abbey-road-plates',
  },
  // Delay
  {
    name: 'H-Delay',
    slug: 'waves-h-delay',
    description: 'Hybrid delay with analog modeling and modern features.',
    category: 'delay',
    msrp: 14900,
    productUrl: 'https://www.waves.com/plugins/h-delay-hybrid-delay',
  },
  // Vocal
  {
    name: 'Waves Tune Real-Time',
    slug: 'waves-tune-real-time',
    description: 'Real-time pitch correction for vocals.',
    category: 'effect',
    msrp: 19900,
    productUrl: 'https://www.waves.com/plugins/waves-tune-real-time',
    tags: ['vocal', 'pitch-correction'],
  },
  {
    name: 'Vocal Rider',
    slug: 'waves-vocal-rider',
    description: 'Automatic vocal level control.',
    category: 'utility',
    msrp: 14900,
    productUrl: 'https://www.waves.com/plugins/vocal-rider',
    tags: ['vocal', 'automation'],
  },
  // Saturation
  {
    name: 'J37 Tape',
    slug: 'waves-j37-tape',
    description: 'Abbey Road J37 tape machine emulation.',
    category: 'effect',
    msrp: 19900,
    productUrl: 'https://www.waves.com/plugins/j37-tape',
    tags: ['tape', 'saturation'],
  },
  {
    name: 'Kramer Master Tape',
    slug: 'waves-kramer-master-tape',
    description: 'Vintage 1/4-inch tape machine emulation.',
    category: 'effect',
    msrp: 19900,
    productUrl: 'https://www.waves.com/plugins/kramer-master-tape',
    tags: ['tape', 'saturation'],
  },
  // Utility
  {
    name: 'WLM Plus Loudness Meter',
    slug: 'waves-wlm-plus',
    description: 'Professional loudness metering for broadcast standards.',
    category: 'utility',
    msrp: 14900,
    productUrl: 'https://www.waves.com/plugins/wlm-plus-loudness-meter',
    tags: ['metering', 'loudness'],
  },
];

export async function scrapeWaves(fetchFn) {
  console.log('\n🌊 Scraping Waves...');
  
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

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeWaves(() => ({})).then(console.log).catch(console.error);
}
