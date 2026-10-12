#!/usr/bin/env node
/**
 * Migration Script: Effects-Only Focus
 * 
 * Removes instruments/synths from the database and reclassifies
 * generic "effect" category plugins into proper categories.
 * 
 * Usage:
 *   node scripts/migrate-effects-only.mjs --dry-run
 *   node scripts/migrate-effects-only.mjs
 */

import { ConvexHttpClient } from 'convex/browser';

const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const client = new ConvexHttpClient(CONVEX_URL);

// Direct HTTP mutation for delete (bypasses missing plugins:remove)
async function deletePlugin(pluginId) {
  const resp = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'plugins:remove',
      args: { id: pluginId },
    }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

// Categories that should be removed (instruments/synths)
const INSTRUMENT_CATEGORIES = ['synth', 'sampler', 'instrument', 'bundle', 'virtual-instruments', 'instrument-bundles'];

// Valid effect categories
const VALID_CATEGORIES = [
  'eq', 'compressor', 'limiter', 'reverb', 'delay', 'saturation',
  'modulation', 'stereo-imaging', 'gate-expander', 'de-esser',
  'filter', 'channel-strip', 'metering', 'noise-reduction',
  'multiband', 'utility'
];

// Direct category mappings (existing categories that just need renaming)
const CATEGORY_REMAP = {
  'saturator': 'saturation',
  'gate': 'gate-expander',
  'mastering': 'utility',       // will get refined by enrichment later
  'mix-master': 'utility',
  'effects-bundles': 'utility',
  'complete-collection': 'utility',
  'multi-effect': 'utility',
  'spectral-analysis': 'metering',
  'music-theory-tools': 'utility',
  'amp-simulator': 'utility',   // keep amp sims for now — they process audio
};

// Keywords for reclassification of generic "effect" / unknown category plugins
// Order matters! More specific matches first, broader ones later.
const RECLASSIFICATION_RULES = [
  // --- Specific matches first ---
  { keywords: ['de-esser', 'deesser', 'sibilance', 'de esser'], category: 'de-esser' },
  { keywords: ['noise reduction', 'denoise', 'declip', 'declick', 'restoration', 'noise removal'], category: 'noise-reduction' },
  { keywords: ['channel strip', 'channel-strip', 'console emulation'], category: 'channel-strip' },
  { keywords: ['multiband dynamics', 'multiband comp', 'multiband processing'], category: 'multiband' },
  { keywords: ['stereo imaging', 'stereo widener', 'stereo width', 'mid-side', 'mid/side', 'panner', 'spatial audio'], category: 'stereo-imaging' },
  { keywords: ['meter', 'metering', 'analyzer', 'spectrum analyzer', 'loudness meter', 'lufs'], category: 'metering' },
  
  // --- Core effect types (specific keyword phrases to avoid false positives) ---
  { keywords: ['parametric eq', 'graphic eq', 'equalizer', 'equalization', 'tone shaping', 'eq plugin'], category: 'eq' },
  { keywords: ['compressor', 'compression', 'bus compressor', 'vocal compressor', 'drum compressor'], category: 'compressor' },
  { keywords: ['limiter', 'limiting', 'brickwall', 'true peak limiter', 'maximizer'], category: 'limiter' },
  { keywords: ['reverb', 'plate reverb', 'convolution reverb', 'spring reverb', 'algorithmic reverb', 'impulse response'], category: 'reverb' },
  { keywords: ['delay', 'echo', 'tape delay', 'ping pong', 'slapback', 'delay plugin'], category: 'delay' },
  { keywords: ['saturator', 'saturation', 'tape saturation', 'tube saturation', 'harmonic distortion', 'overdrive', 'distortion plugin', 'analog warmth'], category: 'saturation' },
  { keywords: ['chorus', 'flanger', 'phaser', 'tremolo', 'vibrato', 'rotary speaker', 'ensemble effect', 'modulation effect'], category: 'modulation' },
  { keywords: ['noise gate', 'gate plugin', 'expander', 'transient shaper', 'transient designer'], category: 'gate-expander' },
  { keywords: ['filter plugin', 'resonant filter', 'low-pass filter', 'high-pass filter', 'band-pass filter', 'formant filter'], category: 'filter' },
  
  // --- Broader single-word matches (lower priority, more risk of false positives) ---
  { keywords: ['console'], category: 'channel-strip' },
];

// Instrument-related keywords (for detecting misclassified instruments)
const INSTRUMENT_KEYWORDS = [
  'synthesizer', 'virtual synth', 'wavetable synth', 'subtractive synth', 'fm synth',
  'sampler', 'drum machine', 'rompler', 'sample player',
  'virtual instrument', 'virtual piano', 'virtual organ', 'virtual strings',
  'virtual brass', 'virtual woodwind', 'virtual drums',
  'orchestral library', 'sound library',
];

// Name-level patterns that indicate instruments (checked against plugin NAME only, not description)
const INSTRUMENT_NAME_PATTERNS = [
  /\bpiano\b/i,
  /\borgan\b/i,
  /\bstrings\b/i,
  /\bbrass\b/i,
  /\bwoodwind\b/i,
  /\bdrum(?:s|mer)?\b/i,
  /\bbass(?:ist)?\b/i,     // but not "bass" in context of bass EQ
  /\bguitar amp/i,
  /\bbass amp/i,
  /\b(?:amp(?:lifier)?)\s+(?:sim|model|emulat)/i,
  /\bpreamp\b/i,
];

// Exact plugin names/slugs to force-delete (instruments masquerading as effects)
const FORCE_DELETE_NAMES = [
  'bfd 3.5', 'modo bass', 'modo bass 2', 'modo drum', 'xpand!2', 'xpand',
  'dandy', 'sparkle 2', 'sampletank', 'battery 4', 'kontakt',
  'bass fingers', 'bass slapper', 'guitar rig', 'amplitube',
  'fender twin reverb', 'fender \'55 tweed', 'marshall bluesbreaker',
  'marshall jcm 800', 'marshall silver jubilee', 'marshall plexi',
  'eden wt800', '800rb', 'b-15n', 'svt-vr', 'amp room',
  'cosmos sample finder', 'melody sauce', 'scaler 3', 'scaler',
  'soundbox instruments', 'monster extreme drums',
];

function classifyPlugin(plugin) {
  const pluginName = (plugin.name || '').toLowerCase();
  const searchText = [
    plugin.name,
    plugin.description,
    plugin.shortDescription,
    ...(plugin.tags || [])
  ].filter(Boolean).join(' ').toLowerCase();

  // 0. Check force-delete list (exact name matches for known instruments)
  for (const name of FORCE_DELETE_NAMES) {
    if (pluginName.includes(name)) {
      return { action: 'delete', reason: `Force-delete list: "${name}"` };
    }
  }

  // 1. Check instrument keywords in full text (description etc.)
  for (const kw of INSTRUMENT_KEYWORDS) {
    if (searchText.includes(kw)) {
      return { action: 'delete', reason: `Contains instrument keyword: "${kw}"` };
    }
  }

  // 2. Check instrument name patterns (regex on name only — avoids false positives from descriptions)
  for (const pattern of INSTRUMENT_NAME_PATTERNS) {
    if (pattern.test(pluginName)) {
      // Exception: don't delete if it's clearly an effect (e.g., "bass compressor", "drum bus compressor")
      const effectExceptions = ['compressor', 'eq', 'reverb', 'delay', 'saturation', 'limiter', 'channel', 'strip', 'rider', 'enhancer'];
      const isEffectException = effectExceptions.some(ex => pluginName.includes(ex));
      if (!isEffectException) {
        return { action: 'delete', reason: `Name matches instrument pattern: ${pattern}` };
      }
    }
  }

  // 3. Check if existing category can be directly remapped
  if (plugin.category && CATEGORY_REMAP[plugin.category]) {
    return { action: 'reclassify', category: CATEGORY_REMAP[plugin.category], reason: `Category remap: ${plugin.category} → ${CATEGORY_REMAP[plugin.category]}` };
  }

  // 4. Try keyword-based reclassification
  for (const rule of RECLASSIFICATION_RULES) {
    for (const kw of rule.keywords) {
      if (searchText.includes(kw)) {
        return { action: 'reclassify', category: rule.category, reason: `Matched keyword: "${kw}"` };
      }
    }
  }

  // 5. Default: keep as utility
  return { action: 'reclassify', category: 'utility', reason: 'No specific match, defaulting to utility' };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('🔧 PluginRadar: Effects-Only Migration');
  console.log('═'.repeat(50));
  console.log(`Mode: ${dryRun ? '🏃 DRY RUN' : '⚡ LIVE'}`);
  console.log('');

  // 1. Query all plugins (paginate to get everything)
  console.log('📡 Fetching all plugins from Convex...');
  let plugins = [];
  let hasMore = true;
  while (hasMore) {
    const result = await client.query('plugins:list', { limit: 1000 });
    const items = result.items || result;
    plugins.push(...items);
    hasMore = false; // plugins:list doesn't support cursor pagination via HTTP client
  }
  console.log(`   Found ${plugins.length} plugins total\n`);

  // Track stats
  const stats = {
    deleted: 0,
    reclassified: 0,
    alreadyCorrect: 0,
    errors: 0,
  };
  const manufacturerChanges = {}; // manufacturerId -> delta

  // 2. Process each plugin
  for (const plugin of plugins) {
    const category = plugin.category;

    // Case A: Known instrument category -> delete
    if (INSTRUMENT_CATEGORIES.includes(category)) {
      console.log(`🗑️  DELETE: "${plugin.name}" (category: ${category})`);
      if (!dryRun) {
        try {
          await deletePlugin(plugin._id);
          stats.deleted++;
          // Track manufacturer change
          const mfrId = plugin.manufacturer;
          manufacturerChanges[mfrId] = (manufacturerChanges[mfrId] || 0) - 1;
        } catch (err) {
          console.log(`   ❌ Error deleting: ${err.message}`);
          stats.errors++;
        }
      } else {
        stats.deleted++;
        const mfrId = plugin.manufacturer;
        manufacturerChanges[mfrId] = (manufacturerChanges[mfrId] || 0) - 1;
      }
      continue;
    }

    // Case B: Already a valid effect category -> skip
    if (VALID_CATEGORIES.includes(category)) {
      stats.alreadyCorrect++;
      continue;
    }

    // Case C: Generic "effect" or unknown category -> reclassify
    const result = classifyPlugin(plugin);

    if (result.action === 'delete') {
      console.log(`🗑️  DELETE: "${plugin.name}" — ${result.reason}`);
      if (!dryRun) {
        try {
          await deletePlugin(plugin._id);
          stats.deleted++;
          const mfrId = plugin.manufacturer;
          manufacturerChanges[mfrId] = (manufacturerChanges[mfrId] || 0) - 1;
        } catch (err) {
          console.log(`   ❌ Error deleting: ${err.message}`);
          stats.errors++;
        }
      } else {
        stats.deleted++;
        const mfrId = plugin.manufacturer;
        manufacturerChanges[mfrId] = (manufacturerChanges[mfrId] || 0) - 1;
      }
    } else if (result.action === 'reclassify') {
      console.log(`🔄 RECLASSIFY: "${plugin.name}" ${category} → ${result.category} (${result.reason})`);
      if (!dryRun) {
        try {
          await client.mutation('plugins:update', {
            id: plugin._id,
            category: result.category,
          });
          stats.reclassified++;
        } catch (err) {
          console.log(`   ❌ Error updating: ${err.message}`);
          stats.errors++;
        }
      } else {
        stats.reclassified++;
      }
    }
  }

  // 3. Update manufacturer pluginCounts
  console.log('\n📊 Updating manufacturer plugin counts...');
  for (const [mfrId, delta] of Object.entries(manufacturerChanges)) {
    if (delta === 0) continue;
    console.log(`   Manufacturer ${mfrId}: ${delta > 0 ? '+' : ''}${delta}`);
    if (!dryRun) {
      try {
        // Fetch current count and update
        const mfr = await client.query('manufacturers:get', { id: mfrId });
        if (mfr) {
          const newCount = Math.max(0, (mfr.pluginCount || 0) + delta);
          await client.mutation('manufacturers:update', {
            id: mfrId,
            pluginCount: newCount,
            updatedAt: Date.now(),
          });
        }
      } catch (err) {
        console.log(`   ❌ Error updating manufacturer: ${err.message}`);
      }
    }
  }

  // 4. Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📋 MIGRATION SUMMARY');
  console.log('═'.repeat(50));
  console.log(`🗑️  Deleted (instruments/synths): ${stats.deleted}`);
  console.log(`🔄 Reclassified: ${stats.reclassified}`);
  console.log(`✅ Already correct: ${stats.alreadyCorrect}`);
  console.log(`❌ Errors: ${stats.errors}`);
  console.log(`📦 Total processed: ${plugins.length}`);
  if (dryRun) {
    console.log('\n⚠️  This was a DRY RUN. No changes were made.');
    console.log('   Run without --dry-run to apply changes.');
  }
}

main().catch(err => {
  console.error('💥 Fatal error:', err.message);
  process.exit(1);
});
