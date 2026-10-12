#!/usr/bin/env node

/**
 * Soundtoys Scraper
 * Website: https://www.soundtoys.com/products/
 */

import { slugify, detectCategory, getOrCreateManufacturer, upsertPlugin, convex } from '../lib/scraper-utils.mjs';
import { api } from '../../convex/_generated/api.js';

const MANUFACTURER_SLUG = 'soundtoys';
const BASE_URL = 'https://www.soundtoys.com';

// Soundtoys products with pricing
const PRODUCTS = [
  {
    name: 'Soundtoys 5',
    slug: 'soundtoys-5',
    description: 'The ultimate effects collection, including all 23 Soundtoys plug-ins: SpaceBlender, SuperPlate, Decapitator, EchoBoy, Little AlterBoy, Effect Rack, and more.',
    category: 'bundle',
    msrp: 59900,
    productUrl: 'https://www.soundtoys.com/product/soundtoys-5/',
  },
  {
    name: 'SpaceBlender',
    slug: 'spaceblender',
    description: 'An experimental reverb that lets you create unreal and imaginary spaces.',
    category: 'reverb',
    msrp: 9900,
    productUrl: 'https://www.soundtoys.com/product/spaceblender/',
  },
  {
    name: 'Decapitator',
    slug: 'decapitator',
    description: 'Subtle to extreme hardware-modeled saturation. The secret weapon of top mix engineers.',
    category: 'effect',
    msrp: 19900,
    productUrl: 'https://www.soundtoys.com/product/decapitator/',
    tags: ['saturation', 'distortion', 'analog'],
  },
  {
    name: 'EchoBoy',
    slug: 'echoboy',
    description: 'Decades of echo devices in a single plug-in. The pro standard for vocal echo.',
    category: 'delay',
    msrp: 19900,
    productUrl: 'https://www.soundtoys.com/product/echoboy/',
  },
  {
    name: 'EchoBoy Jr.',
    slug: 'echoboy-jr',
    description: 'Seven iconic analog echo emulations in one easy-to-use plug-in. Same warm studio tape sound from EchoBoy.',
    category: 'delay',
    msrp: 9900,
    productUrl: 'https://www.soundtoys.com/product/echoboy-jr/',
  },
  {
    name: 'SuperPlate',
    slug: 'superplate',
    description: 'SuperPlate brings the unique tonal character of five classic electromechanical plate reverbs into your studio.',
    category: 'reverb',
    msrp: 14900,
    productUrl: 'https://www.soundtoys.com/product/superplate/',
  },
  {
    name: 'Radiator',
    slug: 'radiator',
    description: '100% of sales donated to not-for-profit organizations. Tube console emulation with character.',
    category: 'effect',
    msrp: 9900,
    productUrl: 'https://www.soundtoys.com/product/radiator/',
    tags: ['saturation', 'tube', 'charity'],
  },
  {
    name: 'FilterFreak',
    slug: 'filterfreak',
    description: 'Fat analog sweeps, pounding filter rhythms, big hardware sound – with a dual version for double the analog attitude.',
    category: 'effect',
    msrp: 14900,
    productUrl: 'https://www.soundtoys.com/product/filterfreak/',
    tags: ['filter', 'modulation'],
  },
  {
    name: 'Sie-Q',
    slug: 'sie-q',
    description: 'Spacious highs, smooth lows, and great tones fast. Hardware-modeled EQ with unique color.',
    category: 'eq',
    msrp: 9900,
    productUrl: 'https://www.soundtoys.com/product/sie-q/',
  },
  {
    name: 'PrimalTap',
    slug: 'primaltap',
    description: 'Modeled retro dual delay with "freeze" for lo-fi pitch warped loops and delays.',
    category: 'delay',
    msrp: 9900,
    productUrl: 'https://www.soundtoys.com/product/primaltap/',
    tags: ['lofi', 'pitch'],
  },
  {
    name: 'PanMan',
    slug: 'panman',
    description: 'Rhythmic auto-panning with cool classic features, new tricks, and analog color.',
    category: 'utility',
    msrp: 9900,
    productUrl: 'https://www.soundtoys.com/product/panman/',
  },
  {
    name: 'Crystallizer',
    slug: 'crystallizer',
    description: 'Granular reverse echo effect with pitch shifting for ethereal soundscapes.',
    category: 'delay',
    msrp: 14900,
    productUrl: 'https://www.soundtoys.com/product/crystallizer/',
    tags: ['granular', 'pitch', 'creative'],
  },
  {
    name: 'MicroShift',
    slug: 'microshift',
    description: 'Simple stereo widening with three classic modes for instant depth.',
    category: 'utility',
    msrp: 9900,
    productUrl: 'https://www.soundtoys.com/product/microshift/',
    tags: ['stereo', 'widening'],
  },
  {
    name: 'Tremolator',
    slug: 'tremolator',
    description: 'Rhythmic tremolo and gating effects with analog character.',
    category: 'effect',
    msrp: 9900,
    productUrl: 'https://www.soundtoys.com/product/tremolator/',
    tags: ['tremolo', 'gate', 'rhythm'],
  },
  {
    name: 'PhaseMistress',
    slug: 'phasemistress',
    description: 'Vintage and modern phaser effects with deep modulation control.',
    category: 'effect',
    msrp: 9900,
    productUrl: 'https://www.soundtoys.com/product/phasemistress/',
    tags: ['phaser', 'modulation'],
  },
  {
    name: 'Little AlterBoy',
    slug: 'little-alterboy',
    description: 'Vocal manipulation tool for pitch shifting, formant control, and robotic effects.',
    category: 'effect',
    msrp: 9900,
    productUrl: 'https://www.soundtoys.com/product/little-alterboy/',
    tags: ['vocal', 'pitch', 'formant'],
  },
  {
    name: 'Little PrimalTap',
    slug: 'little-primaltap',
    description: 'Streamlined version of PrimalTap with essential delay features.',
    category: 'delay',
    msrp: 4900,
    productUrl: 'https://www.soundtoys.com/product/little-primaltap/',
  },
  {
    name: 'Little Radiator',
    slug: 'little-radiator',
    description: 'Compact tube saturation based on Radiator.',
    category: 'effect',
    msrp: 4900,
    productUrl: 'https://www.soundtoys.com/product/little-radiator/',
    tags: ['saturation', 'tube'],
  },
  {
    name: 'Little MicroShift',
    slug: 'little-microshift',
    description: 'Essential stereo widening in a simple interface.',
    category: 'utility',
    msrp: 4900,
    productUrl: 'https://www.soundtoys.com/product/little-microshift/',
  },
  {
    name: 'Effect Rack',
    slug: 'effect-rack',
    description: 'Modular rack for chaining all Soundtoys effects with flexible routing.',
    category: 'utility',
    msrp: 0,
    productUrl: 'https://www.soundtoys.com/product/effect-rack/',
    isFree: true,
  },
  {
    name: 'Little Plate',
    slug: 'little-plate',
    description: 'Simple plate reverb with essential controls for quick results.',
    category: 'reverb',
    msrp: 0,
    productUrl: 'https://www.soundtoys.com/product/little-plate/',
    isFree: true,
  },
  {
    name: 'Devil-Loc',
    slug: 'devil-loc',
    description: 'Extreme compression and distortion for aggressive sounds.',
    category: 'compressor',
    msrp: 14900,
    productUrl: 'https://www.soundtoys.com/product/devil-loc/',
    tags: ['compression', 'distortion'],
  },
  {
    name: 'Devil-Loc Deluxe',
    slug: 'devil-loc-deluxe',
    description: 'Extended version of Devil-Loc with more control over the mayhem.',
    category: 'compressor',
    msrp: 14900,
    productUrl: 'https://www.soundtoys.com/product/devil-loc-deluxe/',
    tags: ['compression', 'distortion'],
  },
];

export async function scrapeSoundtoys(fetchFn) {
  console.log('\n🎸 Scraping Soundtoys...');
  
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
  scrapeSoundtoys(() => ({})).then(console.log).catch(console.error);
}
