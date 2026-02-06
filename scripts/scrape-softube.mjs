#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';

const MANUFACTURER_ID = 'jh79nc638jsqcs011tw2p2yk8n80gbbz';
const IMAGE_DIR = '/home/clawdbot/clawd/projects/plugin-radar/public/images/plugins/softube';

// Softube plugins data - curated from their website
const SOFTUBE_PLUGINS = [
  { name: 'Console 1 Channel', handle: 'console-1-mk3', category: 'effect', desc: 'Hardware-integrated channel strip for mixing.' },
  { name: 'Weiss MM-1 Mastering Maximizer', handle: 'weiss-mm-1-mastering-maximizer', category: 'limiter', desc: 'Achieve loud and polished masters with algorithms from the Weiss DS1-MK3.' },
  { name: 'Tube-Tech CL 1B mk II', handle: 'tube-tech-cl1b-mk-ii', category: 'compressor', desc: 'Classic optical compressor emulation.' },
  { name: 'Tube-Tech ME 1B', handle: 'tube-tech-me-1b', category: 'eq', desc: 'Vintage mid-range equalizer.' },
  { name: 'Tube-Tech PE 1C', handle: 'tube-tech-pe-1c', category: 'eq', desc: 'Program equalizer with Pultec-style curves.' },
  { name: 'Drawmer S73', handle: 'drawmer-s73', category: 'compressor', desc: 'Intelligent master processor.' },
  { name: 'Drawmer 1973', handle: 'drawmer-1973', category: 'compressor', desc: 'Multi-band compressor with three bands.' },
  { name: 'Summit Audio Grand Channel', handle: 'summit-audio-grand-channel', category: 'effect', desc: 'Premium channel strip with tube character.' },
  { name: 'Summit Audio EQF-100', handle: 'summit-audio-eqf-100', category: 'eq', desc: 'Full-range tube equalizer.' },
  { name: 'Trident A-Range', handle: 'trident-a-range', category: 'eq', desc: 'Classic British console EQ.' },
  { name: 'American Class A', handle: 'american-class-a', category: 'effect', desc: 'Premium channel strip with Class A character.' },
  { name: 'British Class A', handle: 'british-class-a', category: 'effect', desc: 'Classic British console channel strip.' },
  { name: 'Solid State Logic SL 4000 E', handle: 'ssl-sl-4000-e', category: 'effect', desc: 'Legendary SSL E-series channel strip.' },
  { name: 'Amp Room', handle: 'amp-room', category: 'effect', desc: 'Professional guitar amp simulation platform.' },
  { name: 'Eden WT800', handle: 'eden-wt800', category: 'effect', desc: 'Rich, high-quality bass sound for any genre.' },
  { name: 'Marshall Silver Jubilee 2555', handle: 'marshall-silver-jubilee-2555', category: 'effect', desc: 'Classic Marshall amplifier.' },
  { name: 'Marshall JCM 800', handle: 'marshall-jcm-800', category: 'effect', desc: 'Iconic British rock amp.' },
  { name: 'Marshall Bluesbreaker 1962', handle: 'marshall-bluesbreaker-1962', category: 'effect', desc: 'Vintage blues tone amp.' },
  { name: 'Fender Twin Reverb', handle: 'fender-twin-reverb', category: 'effect', desc: 'Clean American tube amp.' },
  { name: 'TSAR-1 Reverb', handle: 'tsar-1', category: 'reverb', desc: 'True stereo algorithmic reverb.' },
  { name: 'TSAR-1R Reverb', handle: 'tsar-1r', category: 'reverb', desc: 'Simplified version of TSAR-1.' },
  { name: 'Spring Reverb', handle: 'spring-reverb', category: 'reverb', desc: 'Classic spring reverb emulation.' },
  { name: 'OTO Biscuit 8-bit Effects', handle: 'oto-biscuit-8-bit-effects', category: 'effect', desc: 'Lo-fi 8-bit magic for creative sound design.' },
  { name: 'Tape', handle: 'tape', category: 'saturator', desc: 'Classic tape saturation and compression.' },
  { name: 'Harmonics', handle: 'harmonics', category: 'saturator', desc: 'Analog-style harmonic saturation.' },
  { name: 'Saturation Knob', handle: 'saturation-knob', category: 'saturator', desc: 'FREE simple saturation plugin.' },
  { name: 'Statement Lead', handle: 'statement-lead', category: 'synth', desc: 'Modular-ready lead synthesizer.' },
  { name: 'Model 72 Synthesizer System', handle: 'model-72', category: 'synth', desc: 'Classic synthesizer emulation.' },
  { name: 'Modular', handle: 'modular', category: 'synth', desc: 'Full Eurorack modular synthesizer environment.' },
  { name: 'Parallels', handle: 'parallels', category: 'synth', desc: 'Organic synthesizer with dual layers.' },
  { name: 'Mutable Instruments Clouds', handle: 'mutable-instruments-clouds', category: 'effect', desc: 'Granular texture synthesizer module.' },
  { name: 'Mutable Instruments Rings', handle: 'mutable-instruments-rings', category: 'synth', desc: 'Resonator module for modular.' },
  { name: 'Doepfer A-101-2 Vactrol LPG', handle: 'doepfer-a-101-2', category: 'effect', desc: 'Low-pass gate filter module.' },
  { name: 'Heartbeat', handle: 'heartbeat', category: 'instrument', desc: 'Drum synthesizer.' },
  { name: 'Fix Flanger and Doubler', handle: 'fix-flanger-and-doubler', category: 'effect', desc: 'Classic flanger and doubler effects.' },
  { name: 'Fix Phaser', handle: 'fix-phaser', category: 'effect', desc: 'Vintage phaser effect.' },
  { name: 'Valley People Dyna-mite', handle: 'valley-people-dyna-mite', category: 'compressor', desc: 'Classic gate and expander.' },
  { name: 'Passive-Active Pack', handle: 'passive-active-pack', category: 'eq', desc: 'Collection of vintage EQ emulations.' },
  { name: 'FET Compressor', handle: 'fet-compressor', category: 'compressor', desc: 'Classic FET-style compression.' },
  { name: 'Weiss Deess', handle: 'weiss-deess', category: 'effect', desc: 'Premium de-esser from Weiss.' },
  { name: 'Weiss Compressor/Limiter', handle: 'weiss-compressor-limiter', category: 'compressor', desc: 'Mastering-grade dynamics processor.' },
  { name: 'Weiss EQ1', handle: 'weiss-eq1', category: 'eq', desc: 'Mastering-grade equalizer.' },
  { name: 'Weiss Gambit Series', handle: 'weiss-gambit', category: 'effect', desc: 'Collection of Weiss mastering tools.' },
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
    productUrl: `https://www.softube.com/plug-ins/${plugin.handle}`,
    description: plugin.desc,
    formats: ['VST3', 'AU', 'AAX'],
    platforms: ['windows', 'mac'],
    isFree: plugin.name === 'Saturation Knob',
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
  
  console.log('Creating Softube plugins...');
  console.log(`Total plugins: ${SOFTUBE_PLUGINS.length}`);
  
  let created = 0;
  let failed = 0;
  
  for (const plugin of SOFTUBE_PLUGINS) {
    console.log(`\nProcessing: ${plugin.name}`);
    if (await createPlugin(plugin)) {
      created++;
    } else {
      failed++;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\n=== Softube Summary ===`);
  console.log(`Created: ${created}`);
  console.log(`Failed: ${failed}`);
}

main();
