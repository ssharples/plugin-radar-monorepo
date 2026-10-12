#!/usr/bin/env node
/**
 * Enrich unenriched plugins using Exa web search
 *
 * Queries Convex for plugins missing enrichment data,
 * uses Exa to research each plugin, and saves results back to Convex.
 *
 * Usage:
 *   node scripts/enrich-unenriched.mjs                # Enrich up to 50 plugins
 *   node scripts/enrich-unenriched.mjs --limit 100    # Custom limit
 *   node scripts/enrich-unenriched.mjs --dry-run      # Preview without saving
 *   node scripts/enrich-unenriched.mjs --verbose       # Detailed logging
 */

import Exa from 'exa-js';
import { readFileSync } from 'fs';
import { homedir } from 'os';

// =============================================================================
// Configuration
// =============================================================================

const CONVEX_URL = process.env.CONVEX_URL || 'https://next-frog-231.convex.cloud';
const API_KEY = 'pluginradar-enrich-2026';
const BATCH_SIZE = 5;
const DELAY_MS = 2500;

// Get Exa API key
let exaApiKey = process.env.EXA_API_KEY;
if (!exaApiKey) {
  try {
    const credPath = `${homedir()}/.credentials/exa/credentials.json`;
    const creds = JSON.parse(readFileSync(credPath, 'utf-8'));
    exaApiKey = creds.apiKey;
  } catch {
    console.error('EXA_API_KEY not found. Set env var or create ~/.credentials/exa/credentials.json');
    process.exit(1);
  }
}

const exa = new Exa(exaApiKey);

// CLI args
const args = process.argv.slice(2);
const LIMIT = parseInt(args.find((a, i) => args[i - 1] === '--limit')) || 50;
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

// =============================================================================
// Convex HTTP Client
// =============================================================================

async function convexQuery(path, queryArgs = {}) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args: queryArgs }),
  });
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.errorMessage);
  return data.value;
}

async function convexMutation(path, mutArgs = {}) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args: mutArgs }),
  });
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.errorMessage);
  return data.value;
}

// =============================================================================
// Exa Enrichment Logic
// =============================================================================

async function enrichPluginWithExa(plugin, manufacturerName) {
  const query = `${plugin.name} by ${manufacturerName} audio ${plugin.category} plugin review features`;

  if (VERBOSE) console.log(`    Search: "${query}"`);

  const results = await exa.searchAndContents(query, {
    type: 'auto',
    numResults: 5,
    text: { maxCharacters: 3000 },
    highlights: { numSentences: 5, highlightsPerUrl: 3 },
  });

  if (!results.results || results.results.length === 0) {
    return null;
  }

  return extractEnrichment(results.results, plugin);
}

function extractEnrichment(results, plugin) {
  const allText = results
    .map(r => [r.text || '', ...(r.highlights || [])].join('\n'))
    .join('\n')
    .toLowerCase();

  const enrichment = {};

  // Effect Type
  const effectTypePatterns = {
    'Parametric': /\b(parametric|semi-parametric)\s+(eq|equalizer)/i,
    'Graphic': /\bgraphic\s+eq/i,
    'Dynamic': /\bdynamic\s+eq/i,
    'Linear Phase': /\blinear\s+phase/i,
    'Passive': /\bpassive\s+(eq|equalizer)/i,
    'VCA': /\b(vca|voltage\s*controlled)/i,
    'FET': /\b(fet|field\s*effect)/i,
    'Opto': /\b(opto|optical|photo)/i,
    'Variable-Mu': /\b(variable-mu|vari-mu|tube|valve)\s+(comp|limiter)/i,
    'Multiband': /\bmultiband\s+(comp|process)/i,
    'Algorithmic': /\balgorithmic\s+reverb/i,
    'Convolution': /\b(convolution|impulse|ir)\s+reverb/i,
    'Plate': /\bplate\s+reverb/i,
    'Spring': /\bspring\s+reverb/i,
    'Hall': /\bhall\s+reverb/i,
    'Room': /\broom\s+reverb/i,
    'Tape Delay': /\btape\s+(delay|echo)/i,
    'Analog Delay': /\banalog\s+(delay|echo)/i,
    'Ping-Pong': /\bping-pong/i,
    'Tube Saturation': /\btube\s+(sat|warmth|distortion)/i,
    'Tape Saturation': /\btape\s+(sat|warmth)/i,
    'Harmonic Exciter': /\bharmonic\s+(exciter|enhancer)/i,
    'Chorus': /\bchorus\b/i,
    'Flanger': /\bflanger\b/i,
    'Phaser': /\bphaser\b/i,
    'Tremolo': /\btremolo\b/i,
    'Rotary': /\b(rotary|leslie)/i,
    'Brickwall': /\bbrickwall\s+limiter/i,
  };

  for (const [type, pattern] of Object.entries(effectTypePatterns)) {
    if (pattern.test(allText)) {
      enrichment.effectType = type;
      break;
    }
  }

  // Circuit Emulation
  const circuitPatterns = {
    'Neve 1073': /\bneve\s+(1073|10\s*73)/i,
    'Neve 33609': /\bneve\s+(33609|336\s*09)/i,
    'SSL G-Bus': /\bssl\s+(g-bus|g\s*bus|bus\s*comp)/i,
    'LA-2A': /\b(la-2a|la2a|leveling\s+amp)/i,
    '1176': /\b(1176|urei\s+1176)/i,
    'Pultec EQP-1A': /\b(pultec|eqp-1a)/i,
    'Fairchild 670': /\bfairchild\s+(670|660)/i,
    'API 2500': /\bapi\s+2500/i,
    'DBX 160': /\bdbx\s+160/i,
    'Distressor': /\bdistressor/i,
  };

  for (const [circuit, pattern] of Object.entries(circuitPatterns)) {
    if (pattern.test(allText)) {
      enrichment.circuitEmulation = circuit;
      break;
    }
  }

  // Tonal Character
  const tonalChars = [];
  const tonalPatterns = {
    warm: /\b(warm|warmth|analog\s+warmth)/i,
    transparent: /\b(transparent|clean|surgical|uncolored)/i,
    aggressive: /\b(aggressive|edgy|forward)/i,
    smooth: /\b(smooth|silky|creamy|gentle)/i,
    colored: /\b(colored|coloration|character|vibe)/i,
    vintage: /\b(vintage|classic|retro)/i,
    modern: /\b(modern|contemporary|digital)/i,
    punchy: /\b(punchy|impact|thump|punch)/i,
    crisp: /\b(crisp|bright|airy|sparkle)/i,
  };
  for (const [char, pattern] of Object.entries(tonalPatterns)) {
    if (pattern.test(allText)) tonalChars.push(char);
  }
  if (tonalChars.length > 0) enrichment.tonalCharacter = tonalChars.slice(0, 4);

  // Works Well On
  const worksWellOn = [];
  const sourcePatterns = {
    vocals: /\b(vocals?|voice|singing)/i,
    drums: /\b(drums?|kick|snare|percussion)/i,
    bass: /\b(bass|low\s+end|sub)/i,
    guitars: /\b(guitars?)/i,
    keys: /\b(keys|piano|keyboard)/i,
    synths: /\b(synths?|synthesizer)/i,
    'mix-bus': /\b(mix\s*bus|stereo\s*bus|2-bus)/i,
    master: /\b(master|mastering)/i,
  };
  for (const [source, pattern] of Object.entries(sourcePatterns)) {
    if (pattern.test(allText)) worksWellOn.push(source);
  }
  if (worksWellOn.length > 0) enrichment.worksWellOn = worksWellOn;

  // Use Cases
  const useCases = [];
  const useCasePatterns = {
    mixing: /\b(mixing|mix)/i,
    mastering: /\b(mastering)/i,
    'sound-design': /\b(sound\s*design|creative|experimental)/i,
    'post-production': /\b(post\s*production|film|tv)/i,
    recording: /\b(recording|tracking)/i,
    'beat-making': /\b(beat\s*making|production)/i,
    podcast: /\b(podcast|broadcast)/i,
  };
  for (const [useCase, pattern] of Object.entries(useCasePatterns)) {
    if (pattern.test(allText)) useCases.push(useCase);
  }
  if (useCases.length > 0) enrichment.useCases = useCases;

  // Sonic Character
  const sonicChars = [];
  const sonicPatterns = {
    transparent: /\b(transparent|invisible|neutral)/i,
    warm: /\b(warm|soft)/i,
    colored: /\b(colored|character)/i,
    surgical: /\b(surgical|precise|accurate)/i,
    creative: /\b(creative|wild|experimental)/i,
    punchy: /\b(punchy|aggressive)/i,
  };
  for (const [char, pattern] of Object.entries(sonicPatterns)) {
    if (pattern.test(allText)) sonicChars.push(char);
  }
  if (sonicChars.length > 0) enrichment.sonicCharacter = sonicChars.slice(0, 3);

  // Genre Suitability
  const genres = [];
  const genrePatterns = {
    'hip-hop': /\b(hip-hop|hip\s+hop|trap|rap)/i,
    'rock': /\b(rock|metal|punk|alternative)/i,
    'pop': /\b(pop|mainstream)/i,
    'edm': /\b(edm|electronic|dance|techno|house)/i,
    'jazz': /\b(jazz|blues)/i,
    'classical': /\b(classical|orchestral)/i,
    'rnb': /\b(r&b|rnb|soul)/i,
    'country': /\b(country|folk)/i,
    'ambient': /\b(ambient|atmospheric)/i,
  };
  for (const [genre, pattern] of Object.entries(genrePatterns)) {
    if (pattern.test(allText)) genres.push(genre);
  }
  if (genres.length > 0) enrichment.genreSuitability = genres;

  // Skill Level
  if (/\b(beginner|easy|simple|straightforward|intuitive)/i.test(allText)) {
    enrichment.skillLevel = 'beginner';
  } else if (/\b(professional|expert|complex|deep|advanced)/i.test(allText)) {
    enrichment.skillLevel = 'professional';
  } else if (/\b(intermediate|moderate)/i.test(allText)) {
    enrichment.skillLevel = 'intermediate';
  } else {
    enrichment.skillLevel = 'intermediate';
  }

  // CPU Usage
  if (/\b(cpu\s+efficient|light|lightweight|low\s+cpu|fast)/i.test(allText)) {
    enrichment.cpuUsage = 'low';
  } else if (/\b(very\s+heavy|extremely\s+(heavy|demanding)|cpu\s+hog)/i.test(allText)) {
    enrichment.cpuUsage = 'very-high';
  } else if (/\b(cpu\s+heavy|intensive|demanding|hungry)/i.test(allText)) {
    enrichment.cpuUsage = 'high';
  } else {
    enrichment.cpuUsage = 'moderate';
  }

  // License Type
  if (/\b(subscription|monthly|yearly|annual\s+plan)/i.test(allText)) {
    enrichment.licenseType = 'subscription';
  } else if (/\b(perpetual|one-time|buy\s+once|lifetime)/i.test(allText)) {
    enrichment.licenseType = 'perpetual';
  } else if (/\b(rent\s*to\s*own|splice)/i.test(allText)) {
    enrichment.licenseType = 'rent-to-own';
  } else if (/\bfree\b/i.test(allText)) {
    enrichment.licenseType = 'free';
  }

  // Key Features
  const keyFeatures = [];
  const featurePatterns = {
    'sidechain': /\bsidechain/i,
    'multiband': /\bmultiband/i,
    'mid-side': /\bmid[-\s]side/i,
    'linear-phase': /\blinear\s+phase/i,
    'analog-modeling': /\banalog\s+model/i,
    'oversampling': /\boversampling/i,
    'zero-latency': /\bzero\s+latency/i,
    'true-stereo': /\btrue\s+stereo/i,
    'dynamic-eq': /\bdynamic\s+eq/i,
    'auto-gain': /\bauto[-\s]gain/i,
    'spectrum-analyzer': /\bspectrum\s+analy/i,
  };
  for (const [feature, pattern] of Object.entries(featurePatterns)) {
    if (pattern.test(allText)) keyFeatures.push(feature);
  }
  if (keyFeatures.length > 0) enrichment.keyFeatures = keyFeatures.slice(0, 5);

  // Industry Standard
  if (/\b(industry\s+standard|de\s+facto|ubiquitous|gold\s+standard)/i.test(allText)) {
    enrichment.isIndustryStandard = true;
  }

  return enrichment;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('🔍 Plugin Enrichment Script (Exa-powered)');
  console.log('═'.repeat(60));
  console.log(`  Limit: ${LIMIT}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  // 1. Get current stats
  const stats = await convexQuery('enrichment:getEnrichmentStats', {});
  console.log(`📊 Before: ${stats.fullyEnriched}/${stats.total} enriched (${stats.percentages.fullyEnriched}%)`);
  console.log('');

  // 2. Fetch unenriched plugins
  const unenriched = await convexQuery('enrichment:getUnenriched', { limit: LIMIT });
  console.log(`📦 Found ${unenriched.length} plugins needing enrichment`);

  if (unenriched.length === 0) {
    console.log('✅ All plugins are enriched!');
    return;
  }

  // 3. Get manufacturer names
  const manufacturers = await convexQuery('manufacturers:list', { limit: 500 });
  const mfrMap = new Map(manufacturers.map(m => [m._id, m.name]));

  // 4. Process plugins
  let processed = 0, enriched = 0, failed = 0;
  const pendingBatch = [];

  for (let i = 0; i < unenriched.length; i++) {
    const plugin = unenriched[i];
    const mfrName = mfrMap.get(plugin.manufacturer) || 'Unknown';

    console.log(`\n[${i + 1}/${unenriched.length}] ${plugin.name} by ${mfrName} (${plugin.category})`);

    try {
      const enrichment = await enrichPluginWithExa(plugin, mfrName);
      processed++;

      if (enrichment && Object.keys(enrichment).length > 0) {
        const fieldCount = Object.keys(enrichment).length;
        console.log(`  ✅ Extracted ${fieldCount} fields: ${Object.keys(enrichment).join(', ')}`);

        pendingBatch.push({
          id: plugin._id,
          ...enrichment,
        });
        enriched++;
      } else {
        console.log('  ⚠️  No enrichment data extracted');
      }
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
      failed++;
    }

    // Save batch
    if (pendingBatch.length >= BATCH_SIZE || i === unenriched.length - 1) {
      if (pendingBatch.length > 0) {
        if (DRY_RUN) {
          console.log(`\n  [DRY RUN] Would save ${pendingBatch.length} enrichments`);
        } else {
          try {
            const results = await convexMutation('enrichment:batchEnrichByApiKey', {
              apiKey: API_KEY,
              plugins: pendingBatch,
            });
            const successes = results.filter(r => r.success).length;
            const failures = results.filter(r => !r.success).length;
            console.log(`\n  💾 Saved batch: ${successes} OK${failures ? `, ${failures} failed` : ''}`);
          } catch (err) {
            console.log(`\n  ❌ Batch save failed: ${err.message}`);
          }
        }
        pendingBatch.length = 0;
      }
    }

    // Rate limit
    if (i < unenriched.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // 5. Final stats
  console.log('\n' + '═'.repeat(60));
  console.log('📊 Results');
  console.log('─'.repeat(60));
  console.log(`  Processed: ${processed}`);
  console.log(`  Enriched: ${enriched}`);
  console.log(`  Failed: ${failed}`);

  if (!DRY_RUN) {
    const finalStats = await convexQuery('enrichment:getEnrichmentStats', {});
    console.log(`\n  Before: ${stats.fullyEnriched}/${stats.total} (${stats.percentages.fullyEnriched}%)`);
    console.log(`  After:  ${finalStats.fullyEnriched}/${finalStats.total} (${finalStats.percentages.fullyEnriched}%)`);
    console.log(`  Improvement: +${finalStats.fullyEnriched - stats.fullyEnriched} plugins`);
  }

  console.log('\n✅ Done!');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
