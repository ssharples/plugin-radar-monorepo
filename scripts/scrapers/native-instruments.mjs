#!/usr/bin/env node

/**
 * Native Instruments Scraper
 * Website: https://www.native-instruments.com
 */

import { getOrCreateManufacturer, upsertPlugin, convex } from '../lib/scraper-utils.mjs';
import { api } from '../../convex/_generated/api.js';

const MANUFACTURER_SLUG = 'native-instruments';

// Native Instruments key products
const PRODUCTS = [
  // Komplete
  {
    name: 'Komplete 15 Ultimate',
    slug: 'komplete-15-ultimate',
    description: 'The definitive production suite with over 150 instruments, effects, and Expansions.',
    category: 'bundle',
    msrp: 159900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/bundles/komplete-15-ultimate/',
  },
  {
    name: 'Komplete 15',
    slug: 'komplete-15',
    description: 'Industry-standard production suite with essential instruments and effects.',
    category: 'bundle',
    msrp: 59900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/bundles/komplete-15/',
  },
  {
    name: 'Komplete 15 Select',
    slug: 'komplete-15-select',
    description: 'Entry-level collection of NI instruments and effects.',
    category: 'bundle',
    msrp: 19900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/bundles/komplete-15-select/',
  },
  // Synths
  {
    name: 'Massive X',
    slug: 'massive-x',
    description: 'Next-generation wavetable synthesizer. Complex oscillators, exceptional sound quality.',
    category: 'synth',
    msrp: 19900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/synths/massive-x/',
  },
  {
    name: 'Massive',
    slug: 'massive',
    description: 'The legendary bass synth that defined modern electronic music production.',
    category: 'synth',
    msrp: 9900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/synths/massive/',
  },
  {
    name: 'FM8',
    slug: 'fm8',
    description: 'Advanced FM synthesis with intuitive interface and preset morphing.',
    category: 'synth',
    msrp: 9900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/synths/fm8/',
  },
  {
    name: 'Reaktor 6',
    slug: 'reaktor-6',
    description: 'Modular synthesis playground for sound design and instrument building.',
    category: 'synth',
    msrp: 19900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/synths/reaktor-6/',
  },
  {
    name: 'Absynth 5',
    slug: 'absynth-5',
    description: 'Semi-modular synthesizer for evolving ambient and cinematic sounds.',
    category: 'synth',
    msrp: 9900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/synths/absynth-5/',
  },
  {
    name: 'Monark',
    slug: 'monark',
    description: 'Legendary analog monosynth emulation built in Reaktor.',
    category: 'synth',
    msrp: 9900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/synths/monark/',
  },
  // Samplers
  {
    name: 'Kontakt 8',
    slug: 'kontakt-8',
    description: 'The industry-standard sampler and sample library player.',
    category: 'sampler',
    msrp: 39900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/samplers/kontakt-8/',
  },
  {
    name: 'Battery 4',
    slug: 'battery-4',
    description: 'Drum sampler with deep sound design capabilities.',
    category: 'sampler',
    msrp: 19900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/drums/battery-4/',
  },
  // Piano
  {
    name: 'Piano Colors',
    slug: 'piano-colors',
    description: 'Creative piano instrument with unique sound design capabilities.',
    category: 'instrument',
    msrp: 9900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/keys/piano-colors/',
  },
  {
    name: 'The Gentleman',
    slug: 'the-gentleman',
    description: 'Upright piano captured in stunning detail.',
    category: 'instrument',
    msrp: 9900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/keys/the-gentleman/',
  },
  // Effects
  {
    name: 'Guitar Rig 7 Pro',
    slug: 'guitar-rig-7-pro',
    description: 'Complete guitar and bass effects studio with amps, cabinets, and effects.',
    category: 'effect',
    msrp: 19900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/guitar/guitar-rig-7-pro/',
  },
  {
    name: 'Replika XT',
    slug: 'replika-xt',
    description: 'Creative delay with modulation, diffusion, and unique algorithms.',
    category: 'delay',
    msrp: 9900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/effects/replika-xt/',
  },
  {
    name: 'Raum',
    slug: 'raum',
    description: 'Creative reverb with three distinct algorithms and freeze function.',
    category: 'reverb',
    msrp: 4900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/effects/raum/',
  },
  {
    name: 'Crush Pack',
    slug: 'crush-pack',
    description: 'Three creative distortion effects: Bite, Freak, and Dirt.',
    category: 'effect',
    msrp: 4900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/effects/crush-pack/',
  },
  {
    name: 'Supercharger GT',
    slug: 'supercharger-gt',
    description: 'Tube compressor with character control.',
    category: 'compressor',
    msrp: 4900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/effects/supercharger-gt/',
  },
  {
    name: 'Transient Master',
    slug: 'transient-master',
    description: 'Simple and effective transient shaping for drums and more.',
    category: 'effect',
    msrp: 4900,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/effects/transient-master/',
  },
  // Free
  {
    name: 'Kontakt 8 Player',
    slug: 'kontakt-8-player',
    description: 'Free player for Kontakt libraries and instruments.',
    category: 'sampler',
    msrp: 0,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/samplers/kontakt-8-player/',
    isFree: true,
  },
  {
    name: 'Reaktor 6 Player',
    slug: 'reaktor-6-player',
    description: 'Free player for Reaktor instruments and effects.',
    category: 'synth',
    msrp: 0,
    productUrl: 'https://www.native-instruments.com/en/products/komplete/synths/reaktor-6-player/',
    isFree: true,
  },
];

export async function scrapeNativeInstruments(fetchFn) {
  console.log('\n🎹 Scraping Native Instruments...');
  
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
        hasTrial: !isFree,
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
  scrapeNativeInstruments(() => ({})).then(console.log).catch(console.error);
}
