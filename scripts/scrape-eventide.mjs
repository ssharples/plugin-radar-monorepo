#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';

const MANUFACTURER_ID = 'jh74fshw5e8qmbd305sh97rye980gr5m';
const IMAGE_DIR = '/home/clawdbot/clawd/projects/plugin-radar/public/images/plugins/eventide';

// Eventide plugins data - curated from their website
const EVENTIDE_PLUGINS = [
  { name: 'H9 Harmonizer', handle: 'h9-harmonizer-plug-in-bundle', category: 'effect', desc: 'The legendary Harmonizer in plugin form with pitch shifting, delay, and modulation.' },
  { name: 'Blackhole', handle: 'blackhole', category: 'reverb', desc: 'Massive reverbs from intimate spaces to cosmic infinity.' },
  { name: 'MangledVerb', handle: 'mangledverb', category: 'reverb', desc: 'Reverb with distortion for aggressive ambient textures.' },
  { name: 'UltraReverb', handle: 'ultrareverb', category: 'reverb', desc: 'Professional algorithmic reverb with flexible routing.' },
  { name: 'SP2016 Reverb', handle: 'sp2016-reverb', category: 'reverb', desc: 'Classic digital reverb from the legendary SP2016.' },
  { name: 'Tverb', handle: 'tverb', category: 'reverb', desc: 'Room sound inspired by the Heroes sessions.' },
  { name: 'Spring', handle: 'spring', category: 'reverb', desc: 'Authentic spring reverb emulation.' },
  { name: '2016 Stereo Room', handle: '2016-stereo-room', category: 'reverb', desc: 'Classic room algorithm from the SP2016.' },
  { name: 'Instant Phaser Mk II', handle: 'instant-phaser-mk-ii', category: 'effect', desc: 'The original studio phaser, updated.' },
  { name: 'Instant Flanger Mk II', handle: 'instant-flanger-mk-ii', category: 'effect', desc: 'Classic studio flanger with modern features.' },
  { name: 'TriceraChorus', handle: 'tricerachorus', category: 'effect', desc: 'Multi-voice chorus for lush width and movement.' },
  { name: 'MicroPitch', handle: 'micropitch', category: 'effect', desc: 'Subtle pitch shifting for stereo widening and thickening.' },
  { name: 'H910 Harmonizer', handle: 'h910-harmonizer', category: 'effect', desc: 'Emulation of the original digital effects processor.' },
  { name: 'H949 Harmonizer', handle: 'h949-harmonizer', category: 'effect', desc: 'Classic Harmonizer with pitch shift and delay.' },
  { name: 'H3000 Factory', handle: 'h3000-factory', category: 'effect', desc: 'Legendary H3000 Ultra-Harmonizer algorithms.' },
  { name: 'H3000 Band Delays', handle: 'h3000-band-delays', category: 'delay', desc: 'Multi-tap delay from the H3000.' },
  { name: 'Quadravox', handle: 'quadravox', category: 'effect', desc: 'Four-voice diatonic pitch shifter.' },
  { name: 'Octavox', handle: 'octavox', category: 'effect', desc: 'Eight-voice diatonic pitch shifter.' },
  { name: 'Fission', handle: 'fission', category: 'effect', desc: 'Structural effects that separate transients from tonal content.' },
  { name: 'Physion', handle: 'physion', category: 'effect', desc: 'Transient/tonal split processing for creative manipulation.' },
  { name: 'Physion Mk II', handle: 'physion-mk-ii', category: 'effect', desc: 'Updated transient designer with new features.' },
  { name: 'SplitEQ', handle: 'spliteq', category: 'eq', desc: 'Structural EQ that separates transients from tonal content.' },
  { name: 'EQuivocate', handle: 'equivocate', category: 'eq', desc: 'Graphic EQ with match EQ capabilities.' },
  { name: 'Elevate Mastering Bundle', handle: 'elevate-bundle', category: 'limiter', desc: 'Mastering limiter with intelligent limiting.' },
  { name: 'Omnipressor', handle: 'omnipressor', category: 'compressor', desc: 'Classic dynamics processor from Eventide hardware.' },
  { name: 'UltraChannel', handle: 'ultrachannel', category: 'effect', desc: 'Comprehensive channel strip with vintage character.' },
  { name: 'UltraTap', handle: 'ultratap', category: 'delay', desc: 'Multi-tap delay with modulation and reverb.' },
  { name: 'TimeFactor', handle: 'timefactor', category: 'delay', desc: 'Delay workstation with multiple algorithms.' },
  { name: 'ModFactor', handle: 'modfactor', category: 'effect', desc: 'Modulation workstation with chorus, flanger, phaser, and more.' },
  { name: 'PitchFactor', handle: 'pitchfactor', category: 'effect', desc: 'Pitch shifting and harmony workstation.' },
  { name: 'Space', handle: 'space', category: 'reverb', desc: 'Reverb workstation with classic and experimental algorithms.' },
  { name: 'Rotary Mod', handle: 'rotary-mod', category: 'effect', desc: 'Leslie speaker simulation.' },
  { name: 'Generate', handle: 'generate', category: 'synth', desc: 'Polysynth with unique sound design capabilities.' },
  { name: 'ShimmerVerb', handle: 'shimmerverb', category: 'reverb', desc: 'Reverb with pitch-shifting for ethereal sounds.' },
  { name: 'CrushStation', handle: 'crushstation', category: 'saturator', desc: 'Overdrive and distortion with unique character.' },
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
    productUrl: `https://www.eventideaudio.com/plug-ins/${plugin.handle}`,
    description: plugin.desc,
    formats: ['VST3', 'AU', 'AAX'],
    platforms: ['windows', 'mac'],
    isFree: false,
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
  
  console.log('Creating Eventide plugins...');
  console.log(`Total plugins: ${EVENTIDE_PLUGINS.length}`);
  
  let created = 0;
  let failed = 0;
  
  for (const plugin of EVENTIDE_PLUGINS) {
    console.log(`\nProcessing: ${plugin.name}`);
    if (await createPlugin(plugin)) {
      created++;
    } else {
      failed++;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\n=== Eventide Summary ===`);
  console.log(`Created: ${created}`);
  console.log(`Failed: ${failed}`);
}

main();
