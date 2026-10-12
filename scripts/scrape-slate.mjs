#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const MANUFACTURER_ID = 'jh72b567razrxzna9nqkrrcyb180hg18';
const IMAGE_DIR = '/home/clawdbot/clawd/projects/plugin-radar/public/images/plugins/slate-digital';

// Slate Digital plugins data - manually curated from their website
const SLATE_PLUGINS = [
  { name: 'Infinity Horizon', handle: 'infinity-horizon', category: 'effect', desc: 'Tame harsh highs, calm boomy lows, and shave brittle edges in real time so your mix stays musical.' },
  { name: 'SD-3A Compressor', handle: 'sd-3a-compressor-plugin', category: 'compressor', desc: 'A modern optical compressor that blends vintage smoothness with fast, mix-ready punch.' },
  { name: 'Chorus D Bundle', handle: 'chorus-d-bundle-plugin', category: 'effect', desc: 'Two meticulously modeled chorus modules capturing the magic of a 1979 classic.' },
  { name: 'Virtual Microphone System', handle: 'virtual-microphone-system', category: 'utility', desc: 'Recreate the sound of iconic microphones and preamps inside your DAW.' },
  { name: 'VMR 3.0', handle: 'vmr-3', category: 'effect', desc: 'The award-winning Virtual Mix Rack channel strip plugin.' },
  { name: 'Stellar Echo SD-201', handle: 'stellar-echo-sd-201', category: 'delay', desc: 'A vintage tape delay reimagined for modern music production.' },
  { name: 'Infinity EQ 2', handle: 'infinity-eq', category: 'eq', desc: 'The ultimate flexible, transparent equalizer with dynamic filters and three new filter types.' },
  { name: 'Submerge', handle: 'submerge-sidechain-compressor-plugin', category: 'compressor', desc: 'Advanced automatic sidechain plugin for ducking and pumping effects.' },
  { name: 'SD-PE1', handle: 'sd-pe1-passive-eq-plugin', category: 'eq', desc: 'Realistic reproduction of a classic passive EQ with unique digital features.' },
  { name: 'FG-X Mastering Processor', handle: 'fg-x-mastering-processor', category: 'limiter', desc: 'Industry-leading mastering limiter and dynamics processor.' },
  { name: 'FG-116 Blue Series', handle: 'fg-116-blue-series', category: 'compressor', desc: 'Modeled after the classic blue stripe FET compressor.' },
  { name: 'FG-MU', handle: 'fg-mu', category: 'compressor', desc: 'Vintage tube compressor with rich harmonic saturation.' },
  { name: 'FG-401', handle: 'fg-401', category: 'compressor', desc: 'Classic VCA compressor emulation.' },
  { name: 'FG-S', handle: 'fg-s', category: 'compressor', desc: 'Smooth optical compressor.' },
  { name: 'FG-N', handle: 'fg-n', category: 'eq', desc: 'Classic British console EQ.' },
  { name: 'FG-A', handle: 'fg-a', category: 'eq', desc: 'American console EQ with punchy character.' },
  { name: 'FG-76', handle: 'fg-76', category: 'compressor', desc: 'Classic FET compressor with ultra-fast attack.' },
  { name: 'Fresh Air', handle: 'fresh-air', category: 'eq', desc: 'FREE high frequency exciter that adds air and sparkle to your mixes.' },
  { name: 'VerbSuite Classics', handle: 'verbsuite-classics', category: 'reverb', desc: 'Collection of classic hardware reverb emulations.' },
  { name: 'Eiosis AirEQ', handle: 'eiosis-air-eq', category: 'eq', desc: 'Premium parametric EQ with musical character.' },
  { name: 'Eiosis De-Esser', handle: 'eiosis-e2deesser', category: 'effect', desc: 'Intelligent de-esser with advanced detection.' },
  { name: 'Revival', handle: 'revival', category: 'effect', desc: 'Two-button sonic enhancer that adds life to any mix.' },
  { name: 'Custom Series EQ', handle: 'custom-series-eq', category: 'eq', desc: 'Flexible mixing EQ with surgical precision.' },
  { name: 'Monster Extreme Drums', handle: 'monster-extreme-drums', category: 'effect', desc: 'Drum processing plugin for powerful, punchy drums.' },
  { name: 'Repeater', handle: 'repeater-delay-plugin', category: 'delay', desc: 'Modern delay plugin with creative sound design features.' },
  { name: 'MetaTune', handle: 'metatune', category: 'effect', desc: 'Natural sounding vocal tuning and correction.' },
  { name: 'Lustrous Plates', handle: 'lustrous-plates', category: 'reverb', desc: 'Vintage plate reverb collection.' },
  { name: 'Ana 2', handle: 'ana-2', category: 'synth', desc: 'Powerful wavetable synthesizer.' },
];

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function escapeForShell(str) {
  return str.replace(/'/g, "'\"'\"'");
}

async function createPlugin(plugin) {
  const convexData = {
    slug: slugify(plugin.name),
    name: plugin.name,
    manufacturer: MANUFACTURER_ID,
    category: plugin.category,
    productUrl: `https://slatedigital.com/${plugin.handle}/`,
    description: plugin.desc,
    formats: ['VST3', 'AU', 'AAX'],
    platforms: ['windows', 'mac'],
    isFree: plugin.name === 'Fresh Air',
    hasDemo: true,
    hasTrial: true,
    currency: 'USD',
  };
  
  const jsonArg = JSON.stringify(convexData);
  const cmd = `cd /home/clawdbot/clawd/projects/plugin-radar && npx convex run plugins:upsertBySlug '${escapeForShell(jsonArg)}'`;
  
  try {
    execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
    console.log(`  ✓ Created: ${plugin.name}`);
    return true;
  } catch (e) {
    console.error(`  ✗ Failed: ${plugin.name} - ${e.stderr || e.message}`);
    return false;
  }
}

async function main() {
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }
  
  console.log('Creating Slate Digital plugins...');
  console.log(`Total plugins: ${SLATE_PLUGINS.length}`);
  
  let created = 0;
  let failed = 0;
  
  for (const plugin of SLATE_PLUGINS) {
    console.log(`\nProcessing: ${plugin.name}`);
    if (await createPlugin(plugin)) {
      created++;
    } else {
      failed++;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\n=== Slate Digital Summary ===`);
  console.log(`Created: ${created}`);
  console.log(`Failed: ${failed}`);
}

main();
