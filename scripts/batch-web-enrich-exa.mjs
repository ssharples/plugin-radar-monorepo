#!/usr/bin/env node
/**
 * Batch Web Enrichment Script with Exa Integration
 *
 * Iterates over unenriched plugins in Convex and enriches them using Exa web search.
 * This version uses direct Exa API calls with structured output.
 *
 * Usage:
 *   node scripts/batch-web-enrich-exa.mjs [options]
 *
 * Options:
 *   --limit N          Process N plugins (default: 20)
 *   --batch-size N     Batch size for Convex updates (default: 5)
 *   --delay N          Delay between plugins in ms (default: 3000)
 *   --dry-run          Preview without saving
 *   --category CAT     Only enrich specific category (e.g., "compressor")
 *   --verbose          Show detailed logs
 *
 * Requires: EXA_API_KEY environment variable or ~/.credentials/exa/credentials.json
 */

import Exa from 'exa-js';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import fs from 'fs';
import path from 'path';

// =============================================================================
// Configuration
// =============================================================================

const CONVEX_URL = process.env.CONVEX_URL || 'https://next-frog-231.convex.cloud';
const convex = new ConvexHttpClient(CONVEX_URL);

// Get Exa API key
let exaApiKey = process.env.EXA_API_KEY;
if (!exaApiKey) {
  try {
    const credPath = path.join(process.env.HOME, '.credentials/exa/credentials.json');
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
    exaApiKey = creds.apiKey;
  } catch {
    console.error('❌ EXA_API_KEY not found. Set environment variable or create ~/.credentials/exa/credentials.json');
    process.exit(1);
  }
}

const exa = new Exa(exaApiKey);

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  limit: parseInt(args.find((a, i) => args[i - 1] === '--limit')) || 20,
  batchSize: parseInt(args.find((a, i) => args[i - 1] === '--batch-size')) || 5,
  delay: parseInt(args.find((a, i) => args[i - 1] === '--delay')) || 3000,
  dryRun: args.includes('--dry-run'),
  category: args.find((a, i) => args[i - 1] === '--category'),
  verbose: args.includes('--verbose'),
};

console.log('🔍 Batch Web Enrichment Script (Exa-powered)');
console.log('Configuration:', options);
console.log('');

// =============================================================================
// Exa Research with Structured Output
// =============================================================================

const ENRICHMENT_SCHEMA = {
  type: "object",
  properties: {
    effectType: {
      type: "string",
      description: "Granular effect subtype: parametric/VCA/FET/optical/brickwall/algorithmic/convolution/tube/tape/chorus, etc."
    },
    circuitEmulation: {
      type: "string",
      description: "Specific hardware circuit emulated (e.g. 'Neve 1073', 'SSL G-Bus', 'LA-2A', '1176')"
    },
    tonalCharacter: {
      type: "array",
      items: { type: "string" },
      description: "Tonal descriptors: warm, transparent, aggressive, smooth, colored, clean, punchy, vintage, modern"
    },
    worksWellOn: {
      type: "array",
      items: { type: "string" },
      description: "Sources it works well on: vocals, drums, bass, guitars, keys, synths, mix-bus, master"
    },
    useCases: {
      type: "array",
      items: { type: "string" },
      description: "Ideal use cases: mixing, mastering, sound-design, post-production, recording"
    },
    sonicCharacter: {
      type: "array",
      items: { type: "string" },
      description: "Sonic characteristics: transparent, warm, aggressive, vintage, modern, colored, surgical, creative"
    },
    skillLevel: {
      type: "string",
      enum: ["beginner", "intermediate", "advanced", "professional"],
      description: "Skill level required"
    },
    cpuUsage: {
      type: "string",
      enum: ["light", "moderate", "heavy", "very-heavy"],
      description: "CPU usage level"
    },
    licenseType: {
      type: "string",
      enum: ["perpetual", "subscription", "rent-to-own", "free", "freemium"],
      description: "License model"
    },
    keyFeatures: {
      type: "array",
      items: { type: "string" },
      description: "Key features (max 5): sidechain, multiband, mid-side, linear-phase, analog-modeling, etc."
    },
    isIndustryStandard: {
      type: "boolean",
      description: "Is this considered an industry standard plugin?"
    },
  },
  required: ["effectType", "worksWellOn", "useCases", "skillLevel", "cpuUsage"]
};

/**
 * Enrich a single plugin using Exa structured research
 */
async function enrichPluginWithExa(plugin, manufacturer) {
  try {
    const query = `${plugin.name} by ${manufacturer.name} audio plugin: What type of ${plugin.category} is it? What's the specific subtype (e.g. parametric EQ, FET compressor)? Does it emulate hardware? What's its tonal character? What sources works well on? What are ideal use cases? Skill level? CPU usage? Key features? Is it an industry standard?`;

    if (options.verbose) {
      console.log(`  🔎 Query: "${query}"`);
    } else {
      console.log(`  🔎 Searching web...`);
    }

    // Use Exa search with content extraction
    const results = await exa.searchAndContents(query, {
      type: 'auto',
      numResults: 5,
      text: { maxCharacters: 3000 },
      highlights: {
        numSentences: 5,
        highlightsPerUrl: 3,
      },
    });

    if (!results.results || results.results.length === 0) {
      console.log(`  ⚠️  No web results found`);
      return null;
    }

    // Extract enrichment data from search results
    const enrichment = extractEnrichmentFromResults(results.results, plugin);

    if (options.verbose) {
      console.log(`  📝 Extracted fields:`, Object.keys(enrichment).filter(k => k !== 'id'));
    }

    return enrichment;

  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    return null;
  }
}

/**
 * Extract enrichment data using pattern matching on search results
 */
function extractEnrichmentFromResults(results, plugin) {
  const allText = results
    .map(r => [r.text || '', ...(r.highlights || [])].join('\n'))
    .join('\n')
    .toLowerCase();

  const enrichment = {};

  // Effect Type Detection
  const effectTypePatterns = {
    // EQ
    'Parametric': /\b(parametric|semi-parametric)\s+(eq|equalizer)/i,
    'Graphic': /\bgraphic\s+eq/i,
    'Dynamic': /\bdynamic\s+eq/i,
    'Linear Phase': /\blinear\s+phase/i,
    'Passive': /\bpassive\s+eq/i,

    // Compressor
    'VCA': /\b(vca|voltage\s*controlled)/i,
    'FET': /\b(fet|field\s*effect)/i,
    'Opto': /\b(opto|optical|photo)/i,
    'Variable-Mu': /\b(variable-mu|vari-mu|tube|valve)\s+(comp|limiter)/i,
    'Digital': /\bdigital\s+(comp|transparent)/i,
    'Multiband': /\bmultiband\s+comp/i,

    // Reverb
    'Algorithmic': /\balgorithmic\s+reverb/i,
    'Convolution': /\b(convolution|impulse|ir)\s+reverb/i,
    'Plate': /\bplate\s+reverb/i,
    'Spring': /\bspring\s+reverb/i,
    'Hall': /\bhall\s+reverb/i,
    'Room': /\broom\s+reverb/i,

    // Delay
    'Tape': /\btape\s+(delay|echo)/i,
    'Analog': /\banalog\s+(delay|echo)/i,
    'Digital': /\bdigital\s+(delay|echo)/i,
    'Ping-Pong': /\bping-pong/i,

    // Saturation
    'Tube': /\btube\s+(sat|warmth|distortion)/i,
    'Tape': /\btape\s+(sat|warmth)/i,
    'Transformer': /\btransformer\s+(sat|color)/i,
    'Harmonic': /\bharmonic\s+(exciter|enhancer)/i,

    // Modulation
    'Chorus': /\bchorus\b/i,
    'Flanger': /\bflanger\b/i,
    'Phaser': /\bphaser\b/i,
    'Tremolo': /\btremolo\b/i,
    'Vibrato': /\bvibrato\b/i,
    'Rotary': /\b(rotary|leslie)/i,
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
    vintage: /\b(vintage|classic|retro|analog)/i,
    modern: /\b(modern|contemporary|digital)/i,
    punchy: /\b(punchy|impact|thump|punch)/i,
    crisp: /\b(crisp|bright|airy|sparkle)/i,
    clean: /\b(clean|pristine|clear)/i,
  };

  for (const [char, pattern] of Object.entries(tonalPatterns)) {
    if (pattern.test(allText)) {
      tonalChars.push(char);
    }
  }
  if (tonalChars.length > 0) {
    enrichment.tonalCharacter = tonalChars.slice(0, 4);
  }

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
    dialogue: /\b(dialogue|dialog|voice\s*over)/i,
  };

  for (const [source, pattern] of Object.entries(sourcePatterns)) {
    if (pattern.test(allText)) {
      worksWellOn.push(source);
    }
  }
  if (worksWellOn.length > 0) {
    enrichment.worksWellOn = worksWellOn;
  }

  // Use Cases
  const useCases = [];
  const useCasePatterns = {
    mixing: /\b(mixing|mix)/i,
    mastering: /\b(mastering)/i,
    'sound-design': /\b(sound\s*design|creative|experimental)/i,
    'post-production': /\b(post\s*production|post|film|tv)/i,
    recording: /\b(recording|tracking)/i,
    'beat-making': /\b(beat\s*making|production|producing)/i,
    podcast: /\b(podcast|broadcast|radio)/i,
  };

  for (const [useCase, pattern] of Object.entries(useCasePatterns)) {
    if (pattern.test(allText)) {
      useCases.push(useCase);
    }
  }
  if (useCases.length > 0) {
    enrichment.useCases = useCases;
  }

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
    if (pattern.test(allText)) {
      sonicChars.push(char);
    }
  }
  if (sonicChars.length > 0) {
    enrichment.sonicCharacter = sonicChars.slice(0, 3);
  }

  // Skill Level
  if (/\b(beginner|easy|simple|straightforward|intuitive)/i.test(allText)) {
    enrichment.skillLevel = 'beginner';
  } else if (/\b(professional|expert|complex|deep|advanced)/i.test(allText)) {
    enrichment.skillLevel = 'professional';
  } else if (/\b(intermediate|moderate)/i.test(allText)) {
    enrichment.skillLevel = 'intermediate';
  } else {
    enrichment.skillLevel = 'intermediate'; // Default
  }

  // CPU Usage
  if (/\b(cpu\s+efficient|light|lightweight|low\s+cpu|fast)/i.test(allText)) {
    enrichment.cpuUsage = 'light';
  } else if (/\b(cpu\s+heavy|intensive|demanding|hungry|slow)/i.test(allText)) {
    enrichment.cpuUsage = 'heavy';
  } else if (/\b(very\s+heavy|extremely\s+heavy)/i.test(allText)) {
    enrichment.cpuUsage = 'very-heavy';
  } else {
    enrichment.cpuUsage = 'moderate'; // Default
  }

  // License Type
  if (/\b(subscription|monthly|yearly)/i.test(allText)) {
    enrichment.licenseType = 'subscription';
  } else if (/\b(perpetual|one-time|buy\s+once)/i.test(allText)) {
    enrichment.licenseType = 'perpetual';
  } else if (/\b(rent\s*to\s*own|splice)/i.test(allText)) {
    enrichment.licenseType = 'rent-to-own';
  } else if (plugin.isFree || /\bfree\b/i.test(allText)) {
    enrichment.licenseType = 'free';
  }

  // Key Features
  const keyFeatures = [];
  const featurePatterns = {
    'sidechain': /\bsidechain/i,
    'multiband': /\bmultiband/i,
    'mid-side': /\bmid-side|m-s\s+mode/i,
    'linear-phase': /\blinear\s+phase/i,
    'analog-modeling': /\banalog\s+model/i,
    'oversampling': /\boversampling/i,
    'zero-latency': /\bzero\s+latency/i,
    'true-stereo': /\btrue\s+stereo/i,
  };

  for (const [feature, pattern] of Object.entries(featurePatterns)) {
    if (pattern.test(allText)) {
      keyFeatures.push(feature);
    }
  }
  if (keyFeatures.length > 0) {
    enrichment.keyFeatures = keyFeatures.slice(0, 5);
  }

  // Industry Standard
  if (/\b(industry\s+standard|de\s+facto|ubiquitous|everywhere|gold\s+standard)/i.test(allText)) {
    enrichment.isIndustryStandard = true;
  }

  return enrichment;
}

/**
 * Save enrichments to Convex
 */
async function saveEnrichments(enrichments) {
  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - Would save:');
    enrichments.forEach(e => {
      console.log(`\n  ${e.manufacturerName} - Plugin ID: ${e.id}`);
      console.log(`    Fields: ${Object.keys(e).filter(k => k !== 'id' && k !== 'manufacturerName').join(', ')}`);
    });
    return { success: true, count: enrichments.length };
  }

  try {
    const results = await convex.mutation(api.enrichment.batchEnrich, {
      plugins: enrichments.map(({ manufacturerName, ...rest }) => rest), // Remove manufacturerName before sending
    });

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return { success: true, succeeded, failed };
  } catch (err) {
    console.error('❌ Failed to save batch:', err.message);
    return { success: false, error: err.message };
  }
}

// =============================================================================
// Main Execution
// =============================================================================

async function main() {
  try {
    // 1. Get current stats
    console.log('📊 Fetching enrichment stats...\n');
    const stats = await convex.query(api.enrichment.getEnrichmentStats, {});

    console.log('Current enrichment coverage:');
    console.log(`  Total plugins: ${stats.total}`);
    console.log(`  Fully enriched: ${stats.fullyEnriched} (${stats.percentages.fullyEnriched}%)`);
    console.log(`  With effectType: ${stats.withEffectType} (${stats.percentages.effectType}%)`);
    console.log(`  With worksWellOn: ${stats.withWorksWellOn} (${stats.percentages.worksWellOn}%)`);
    console.log(`  With skillLevel: ${stats.withSkillLevel} (${stats.percentages.skillLevel}%)`);
    console.log('');

    // 2. Fetch unenriched plugins
    console.log(`🔍 Fetching up to ${options.limit} unenriched plugins...\n`);
    let plugins = await convex.query(api.enrichment.getUnenriched, {
      limit: options.limit,
    });

    if (plugins.length === 0) {
      console.log('✅ All plugins are enriched!');
      return;
    }

    // 3. Fetch manufacturers
    console.log('📦 Fetching manufacturers...\n');
    const allManufacturers = await convex.query(api.manufacturers.list, { limit: 1000 });
    const manufacturers = new Map(
      allManufacturers.map(m => [m._id.toString(), m])
    );

    // 4. Filter by category if specified
    if (options.category) {
      plugins = plugins.filter(p => p.category === options.category);
      console.log(`Filtered to ${plugins.length} ${options.category} plugins\n`);
    }

    if (plugins.length === 0) {
      console.log('No plugins match the filters');
      return;
    }

    // 5. Process plugins
    let processedCount = 0;
    let enrichedCount = 0;
    const enrichments = [];

    for (let i = 0; i < plugins.length; i++) {
      const plugin = plugins[i];
      const manufacturer = manufacturers.get(plugin.manufacturer.toString());

      if (!manufacturer) {
        console.log(`\n⚠️  [${i + 1}/${plugins.length}] Skipping ${plugin.name} - manufacturer not found`);
        continue;
      }

      console.log(`\n📦 [${i + 1}/${plugins.length}] ${plugin.name} (${manufacturer.name})`);
      console.log(`   Category: ${plugin.category}`);

      const enrichment = await enrichPluginWithExa(plugin, manufacturer);

      if (enrichment && Object.keys(enrichment).length > 0) {
        enrichments.push({
          id: plugin._id,
          manufacturerName: manufacturer.name,
          ...enrichment,
        });
        enrichedCount++;
        console.log(`   ✅ Extracted ${Object.keys(enrichment).length} fields`);
      } else {
        console.log(`   ⚠️  No enrichment data found`);
      }

      processedCount++;

      // Save in batches
      if (enrichments.length >= options.batchSize || i === plugins.length - 1) {
        if (enrichments.length > 0) {
          console.log(`\n💾 Saving batch of ${enrichments.length} enrichments...`);
          const result = await saveEnrichments(enrichments);

          if (result.success && !options.dryRun) {
            console.log(`✅ Saved: ${result.succeeded} succeeded${result.failed ? `, ${result.failed} failed` : ''}`);
          }
          enrichments.length = 0; // Clear batch
        }
      }

      // Rate limiting delay
      if (i < plugins.length - 1) {
        await new Promise(resolve => setTimeout(resolve, options.delay));
      }
    }

    // 6. Final stats
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ Enrichment Complete!');
    console.log(`${'='.repeat(60)}`);
    console.log(`Total processed: ${processedCount}`);
    console.log(`Total enriched: ${enrichedCount}`);
    console.log(`Success rate: ${Math.round((enrichedCount / processedCount) * 100)}%`);

    if (!options.dryRun) {
      console.log('\n📊 Updated coverage:\n');
      const finalStats = await convex.query(api.enrichment.getEnrichmentStats, {});
      console.log(`  Fully enriched: ${finalStats.fullyEnriched} (${finalStats.percentages.fullyEnriched}%)`);
      console.log(`  Improvement: +${finalStats.fullyEnriched - stats.fullyEnriched} plugins`);
    }

  } catch (err) {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  }
}

// Run
main().catch(console.error);
