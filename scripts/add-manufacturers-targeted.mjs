#!/usr/bin/env node
/**
 * Targeted Manufacturer + Plugin Addition
 * 
 * Adds well-known audio effect plugin companies and discovers their plugins via Exa.
 */

import Exa from 'exa-js';
import { ConvexHttpClient } from 'convex/browser';
import fs from 'fs';
import path from 'path';

const credPath = path.join(process.env.HOME, '.credentials/exa/credentials.json');
const { apiKey } = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
const exa = new Exa(apiKey);

const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const client = new ConvexHttpClient(CONVEX_URL);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function slugify(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

const INSTRUMENT_KEYWORDS = ['synthesizer', 'synth', 'sampler', 'drum machine', 'rompler', 'virtual instrument', 'sample library', 'kontakt', 'wavetable', 'amp sim', 'amp modeler', 'guitar amp', 'cabinet sim'];
function isInstrument(text) { return INSTRUMENT_KEYWORDS.some(kw => text.toLowerCase().includes(kw)); }

function detectCategory(text) {
  const catMap = {
    'eq': /\beq\b|equaliz/i, 'compressor': /compressor|compression/i, 'limiter': /limiter|limiting/i,
    'reverb': /reverb/i, 'delay': /delay|echo/i, 'saturation': /saturat|distort|overdrive|tape.*warmth|harmonic.*excit|clipper/i,
    'modulation': /modulation|chorus|flang|phas|tremolo|vibrato|rotary/i, 'stereo-imaging': /stereo.*imag|mid.side|widen/i,
    'gate-expander': /gate|expander|transient/i, 'de-esser': /de.?ess/i, 'filter': /\bfilter\b/i,
    'channel-strip': /channel.?strip|console.*strip/i, 'metering': /meter|analyz|spectrum|loudness|lufs/i,
    'noise-reduction': /noise.?reduc|denois|restor/i, 'multiband': /multiband/i,
  };
  for (const [cat, regex] of Object.entries(catMap)) { if (regex.test(text)) return cat; }
  return 'utility';
}

// Known manufacturers to add - these are well-established effect plugin companies
const MANUFACTURERS_TO_ADD = [
  { name: 'Brainworx', website: 'https://www.brainworx.audio', desc: 'Brainworx Audio is a German audio software company known for precision mastering and mixing plugins. Founded by Dirk Ulrich, they create acclaimed EQ, compressor, and channel strip plugins, many modeled after classic analog hardware. Part of the Plugin Alliance ecosystem.' },
  { name: 'MeldaProduction', website: 'https://www.meldaproduction.com', desc: 'MeldaProduction is a Czech audio plugin company offering one of the largest collections of mixing and mastering effects. Known for their comprehensive free bundle and professional-grade analyzers, EQs, compressors, and creative effects with deep parameter control.' },
  { name: 'Acustica Audio', website: 'https://www.acustica-audio.com', desc: 'Acustica Audio is an Italian company specializing in hyper-realistic analog hardware emulations using their proprietary Acqua sampling technology. Known for premium EQ, compressor, and channel strip plugins that faithfully capture the sound of vintage studio gear.' },
  { name: 'Kilohearts', website: 'https://kilohearts.com', desc: 'Kilohearts is a Swedish audio plugin company known for their innovative modular effects ecosystem. Their Snap Heap and Multipass hosts allow stacking small effect modules (snapins) for creative sound design, plus standalone effects like disperser and phase distortion.' },
  { name: 'Goodhertz', website: 'https://goodhertz.com', desc: 'Goodhertz is a boutique audio plugin company making elegant, great-sounding mixing and mastering effects. Known for Vulf Compressor, Tonal Balance, and CanOpener — plugins with clean interfaces and musical character that are favorites among independent musicians and engineers.' },
  { name: 'Klanghelm', website: 'https://klanghelm.com', desc: 'Klanghelm is an indie German audio plugin developer known for affordable, characterful dynamics processors. Their compressors MJUC and DC8C, and saturation plugin SDRR, are beloved by mixing engineers for their analog-inspired tone and intuitive interfaces.' },
  { name: 'AudioThing', website: 'https://www.audiothing.net', desc: 'AudioThing is an audio plugin company creating unique vintage and creative effects. Known for faithful recreations of rare hardware like the Valve Exciter and Spring reverbs, plus innovative creative tools like Fog Convolver and Speakers.' },
  { name: 'Acon Digital', website: 'https://acondigital.com', desc: 'Acon Digital is a Norwegian audio software company known for high-quality, affordable mixing plugins. Their Verberate reverb, Equalize parametric EQ, and DeNoise restoration tools offer professional-grade processing at accessible prices.' },
  { name: 'TBProAudio', website: 'https://www.tbproaudio.de', desc: 'TBProAudio is a German audio plugin developer specializing in metering, loudness, and dynamics tools. Known for dpMeter, ISOL8, and CS-5501 channel strip — professional mixing and mastering tools used in broadcast and music production.' },
  { name: 'Letimix', website: 'https://letimix.com', desc: 'Letimix is an audio plugin developer known for GainMatch, a utility plugin that matches loudness levels for unbiased A/B comparisons during mixing. Essential for fair plugin comparison and avoiding volume-based bias.' },
  { name: 'Unfiltered Audio', website: 'https://www.unfilteredaudio.com', desc: 'Unfiltered Audio is a creative audio plugin company making experimental, boundary-pushing effects. Known for SpecOps spectral processor, Indent 2 dynamics, and BYOME build-your-own modular effects — part of the Plugin Alliance family.' },
  { name: 'D16 Group', website: 'https://d16.pl', desc: 'D16 Group is a Polish audio plugin company known for high-quality effects and vintage drum machine emulations. Their Frontier limiter, Devastor saturation, and Repeater delay are popular mixing tools with distinctive analog character.' },
  { name: 'Tone Empire', website: 'https://tone-empire.com', desc: 'Tone Empire makes characterful analog-modeled audio effects focusing on saturation, EQ, and dynamics. Known for the Reelight Pro, Goliath mkII, and APD-MasterVerb — plugins designed to add warmth and vintage mojo to modern mixes.' },
  { name: 'Wavesfactory', website: 'https://www.wavesfactory.com', desc: 'Wavesfactory is a boutique audio plugin company creating innovative mixing tools. Known for Trackspacer (spectral ducking), Spectre (spectral processor), and SK10 (sub kick generator) — creative solutions for modern mixing challenges.' },
  { name: 'Polyverse Music', website: 'https://polyversemusic.com', desc: 'Polyverse Music creates cutting-edge creative audio effects. Co-founded with electronic artist Infected Mushroom, they make Wider (free stereo widener), Manipulator (pitch/frequency effects), and Gatekeeper (volume-shaping gate).' },
  { name: 'SoundRadix', website: 'https://www.soundradix.com', desc: 'SoundRadix is an audio plugin company creating innovative tools that solve real mixing problems. Known for Auto-Align (phase alignment), Pi (phase interaction mixer), and SurferEQ (pitch-tracking EQ) — unique utilities no other company makes.' },
  { name: 'Boz Digital Labs', website: 'https://www.bozdigitallabs.com', desc: 'Boz Digital Labs creates practical, great-sounding mixing plugins with fun interfaces. Known for the +10db Equalizer, The Wall limiter, and Panipulator — affordable tools that punch above their weight in professional mixing contexts.' },
  { name: 'Denise Audio', website: 'https://www.denise.io', desc: 'Denise Audio creates innovative audio effects with unique approaches to common processing tasks. Known for the Perfect Room reverb, Master compressor, and God Mode epic reverb — plugins with fresh takes on traditional effect categories.' },
];

async function discoverPlugins(name, website) {
  const query = `List all audio EFFECT plugins made by ${name}. For each, give: plugin name, type (EQ/compressor/limiter/reverb/delay/saturation/modulation/stereo-imaging/gate-expander/de-esser/filter/channel-strip/metering/noise-reduction/multiband/utility), and one-line description. Effects ONLY — no synths or instruments.`;
  
  try {
    const result = await exa.answer(query, { text: true });
    if (!result.answer) return [];
    
    const plugins = [];
    const lines = result.answer.split('\n');
    
    for (const line of lines) {
      if (line.trim().length < 10) continue;
      if (isInstrument(line)) continue;
      
      const namePatterns = [
        /^\s*\d+[\.\)]\s*\*?\*?([A-Za-z][A-Za-z0-9\s&.'()\/+:-]+?)\*?\*?\s*[-–—:]/,
        /^\s*[-•*]\s*\*?\*?([A-Za-z][A-Za-z0-9\s&.'()\/+:-]+?)\*?\*?\s*[-–—:]/,
        /\*\*([A-Za-z][A-Za-z0-9\s&.'()\/+:-]+?)\*\*/,
      ];
      
      let pluginName = null;
      for (const p of namePatterns) {
        const m = line.match(p);
        if (m) { pluginName = m[1].trim().replace(/\*+/g, ''); break; }
      }
      if (!pluginName || pluginName.length < 2 || pluginName.length > 60) continue;
      
      const category = detectCategory(line);
      
      let description = line.replace(/^\s*[\d\.\)\-•*]+\s*/, '').replace(/\*\*/g, '');
      const cutIdx = Math.min(
        description.indexOf(':') > 0 ? description.indexOf(':') : 999,
        description.indexOf('–') > 0 ? description.indexOf('–') : 999,
        description.indexOf('—') > 0 ? description.indexOf('—') : 999
      );
      if (cutIdx < 999) description = description.slice(cutIdx + 1).trim();
      if (description.length > 250) description = description.slice(0, 247) + '...';
      
      const priceMatch = line.match(/\$(\d+(?:\.\d{2})?)/);
      const msrp = priceMatch ? Math.round(parseFloat(priceMatch[1]) * 100) : undefined;
      const isFree = /\bfree\b/i.test(line);
      
      const tags = [];
      if (/analog|vintage/i.test(line)) tags.push('analog-modeling');
      if (/mastering/i.test(line)) tags.push('mastering');
      if (/mixing/i.test(line)) tags.push('mixing');
      if (isFree) tags.push('free');
      if (/creative/i.test(line)) tags.push('creative');
      
      plugins.push({ name: pluginName, category, description, shortDescription: (description || '').split('.')[0] + '.', msrp, isFree: isFree || false, formats: [], platforms: [], tags, productUrl: website || '' });
    }
    
    return plugins;
  } catch (err) {
    console.error(`   ❌ Plugin discovery error: ${err.message}`);
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('═══════════════════════════════════════════════');
  console.log('  Targeted Manufacturer + Plugin Discovery');
  console.log('═══════════════════════════════════════════════');
  console.log(`Mode: ${dryRun ? '🏃 DRY RUN' : '⚡ LIVE'}`);
  console.log(`Manufacturers to add: ${MANUFACTURERS_TO_ADD.length}\n`);

  // Get existing
  const existingMfrs = await client.query('manufacturers:list', { limit: 200 });
  const existingNames = new Set(existingMfrs.map(m => m.name.toLowerCase()));
  const existingPlugins = await client.query('agentEnrich:listEnrichedPlugins', { limit: 5000 });
  const existingPluginSlugs = new Set(existingPlugins.map(p => p.slug));
  
  console.log(`📋 Existing: ${existingMfrs.length} manufacturers, ${existingPluginSlugs.size} plugins\n`);

  const stats = { newMfrs: 0, newPlugins: 0, skippedMfrs: 0, errors: 0 };

  for (const mfr of MANUFACTURERS_TO_ADD) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`🏢 ${mfr.name} (${mfr.website})`);
    
    if (existingNames.has(mfr.name.toLowerCase())) {
      console.log(`   ⏭️  Already exists`);
      stats.skippedMfrs++;
      continue;
    }

    // Save manufacturer
    if (!dryRun) {
      try {
        await client.mutation('manufacturers:upsertBySlug', {
          slug: slugify(mfr.name),
          name: mfr.name,
          website: mfr.website,
          description: mfr.desc,
        });
        console.log(`   💾 Manufacturer created`);
        stats.newMfrs++;
      } catch (err) {
        console.log(`   ❌ Error: ${err.message?.slice(0, 80)}`);
        stats.errors++;
        continue;
      }
    } else {
      console.log(`   🏃 [DRY RUN]`);
      stats.newMfrs++;
    }

    // Discover plugins via Exa
    console.log(`   🔍 Discovering plugins...`);
    const plugins = await discoverPlugins(mfr.name, mfr.website);
    await sleep(1000);
    
    console.log(`   📦 Found ${plugins.length} effect plugins`);

    for (const plugin of plugins) {
      const slug = slugify(`${mfr.name}-${plugin.name}`);
      if (existingPluginSlugs.has(slug)) {
        console.log(`      ⏭️  ${plugin.name} — exists`);
        continue;
      }

      if (!dryRun) {
        try {
          await client.mutation('agentEnrich:upsertPluginEnrichment', {
            slug,
            name: plugin.name,
            manufacturer: mfr.name,
            category: plugin.category,
            description: plugin.description,
            shortDescription: plugin.shortDescription,
            formats: plugin.formats,
            platforms: plugin.platforms,
            msrp: plugin.msrp,
            isFree: plugin.isFree,
            tags: plugin.tags,
            productUrl: plugin.productUrl,
          });
          console.log(`      ✅ ${plugin.name} (${plugin.category})`);
          existingPluginSlugs.add(slug);
          stats.newPlugins++;
        } catch (err) {
          console.log(`      ❌ ${plugin.name}: ${err.message?.slice(0, 60)}`);
          stats.errors++;
        }
      } else {
        console.log(`      🏃 ${plugin.name} (${plugin.category})`);
        stats.newPlugins++;
      }
      await sleep(200);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📋 SUMMARY');
  console.log('═'.repeat(50));
  console.log(`🏢 New manufacturers: ${stats.newMfrs}`);
  console.log(`📦 New plugins: ${stats.newPlugins}`);
  console.log(`⏭️  Skipped (existing): ${stats.skippedMfrs}`);
  console.log(`❌ Errors: ${stats.errors}`);
  if (dryRun) console.log('\n⚠️  DRY RUN — no changes made.');
  
  return stats;
}

main().catch(err => { console.error('💥', err.message); process.exit(1); });
