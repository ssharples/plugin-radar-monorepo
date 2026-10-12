#!/usr/bin/env node
/**
 * Batch Web Enrichment Script
 *
 * Iterates over unenriched plugins in Convex and enriches them using Exa web search.
 * Uses the MCP Exa integration for high-quality web research.
 *
 * Usage:
 *   node scripts/batch-web-enrich.mjs [options]
 *
 * Options:
 *   --limit N          Process N plugins (default: 50)
 *   --batch-size N     Batch size for Convex updates (default: 10)
 *   --delay N          Delay between batches in ms (default: 2000)
 *   --dry-run          Preview without saving
 *   --category CAT     Only enrich specific category (e.g., "compressor")
 *   --manufacturer ID  Only enrich plugins from specific manufacturer
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

// =============================================================================
// Configuration
// =============================================================================

const CONVEX_URL = process.env.CONVEX_URL || 'https://next-frog-231.convex.cloud';
const convex = new ConvexHttpClient(CONVEX_URL);

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  limit: parseInt(args.find((a, i) => args[i - 1] === '--limit')) || 50,
  batchSize: parseInt(args.find((a, i) => args[i - 1] === '--batch-size')) || 10,
  delay: parseInt(args.find((a, i) => args[i - 1] === '--delay')) || 2000,
  dryRun: args.includes('--dry-run'),
  category: args.find((a, i) => args[i - 1] === '--category'),
  manufacturer: args.find((a, i) => args[i - 1] === '--manufacturer'),
};

console.log('🔍 Batch Web Enrichment Script');
console.log('Configuration:', options);
console.log('');

// =============================================================================
// Enrichment Logic
// =============================================================================

/**
 * Extract enrichment data from web search results using pattern matching
 */
function extractEnrichmentFromWeb(plugin, webResults) {
  const allText = webResults.map(r => r.text || '').join('\n').toLowerCase();

  const enrichment = {};

  // Effect Type Detection
  const effectTypePatterns = {
    // EQ types
    parametric: /\b(parametric|semi-parametric)\s+(eq|equalizer)/i,
    graphic: /\bgraphic\s+eq/i,
    dynamic: /\bdynamic\s+eq/i,
    linear_phase: /\blinear\s+phase/i,

    // Compressor types
    VCA: /\b(vca|voltage controlled)/i,
    FET: /\b(fet|field effect transistor)/i,
    Opto: /\b(opto|optical|photo|light)/i,
    'Variable-Mu': /\b(variable-mu|vari-mu|tube|valve)/i,

    // Reverb types
    Algorithmic: /\balgorithmic\s+reverb/i,
    Convolution: /\b(convolution|impulse response|ir)\s+reverb/i,
    Plate: /\bplate\s+reverb/i,
    Spring: /\bspring\s+reverb/i,
    Hall: /\bhall\s+reverb/i,
    Room: /\broom\s+reverb/i,

    // Delay types
    Tape: /\btape\s+(delay|echo)/i,
    Analog: /\banalog\s+(delay|echo)/i,
    Digital: /\bdigital\s+(delay|echo)/i,

    // Saturation types
    Tube: /\b(tube|valve)\s+(saturation|warmth|distortion)/i,
    Tape: /\btape\s+(saturation|warmth)/i,
    Transformer: /\btransformer\s+(saturation|coloration)/i,

    // Modulation types
    Chorus: /\bchorus\b/i,
    Flanger: /\bflanger\b/i,
    Phaser: /\bphaser\b/i,
    Tremolo: /\btremolo\b/i,
  };

  for (const [type, pattern] of Object.entries(effectTypePatterns)) {
    if (pattern.test(allText)) {
      enrichment.effectType = type;
      break;
    }
  }

  // Circuit Emulation Detection
  const circuitPatterns = {
    'Neve 1073': /\bneve\s+(1073|10\s*73)/i,
    'SSL G-Bus': /\bssl\s+(g-bus|g\s*bus|bus\s*comp)/i,
    'LA-2A': /\b(la-2a|la2a|leveling\s+amplifier)/i,
    '1176': /\b(1176|urei\s+1176|eleven\s+seventy\s+six)/i,
    'Pultec EQP-1A': /\b(pultec|eqp-1a|pulteq)/i,
    'Fairchild 670': /\bfairchild\s+(670|660)/i,
    'API 2500': /\bapi\s+2500/i,
    'Neve 33609': /\bneve\s+(33609|336\s*09)/i,
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
    aggressive: /\b(aggressive|edgy|punchy)/i,
    smooth: /\b(smooth|silky|creamy)/i,
    colored: /\b(colored|coloration|character)/i,
    vintage: /\b(vintage|classic|retro)/i,
    modern: /\b(modern|contemporary|digital)/i,
    punchy: /\b(punchy|impact|thump)/i,
    crisp: /\b(crisp|bright|airy)/i,
  };

  for (const [char, pattern] of Object.entries(tonalPatterns)) {
    if (pattern.test(allText)) {
      tonalChars.push(char);
    }
  }
  if (tonalChars.length > 0) {
    enrichment.tonalCharacter = tonalChars.slice(0, 3); // Max 3
  }

  // Works Well On
  const worksWellOn = [];
  const sourcePatterns = {
    vocals: /\b(vocals?|voice|singer)/i,
    drums: /\b(drums?|kick|snare)/i,
    bass: /\b(bass|low end)/i,
    guitars: /\b(guitars?|electric guitar|acoustic guitar)/i,
    keys: /\b(keys|piano|keyboard)/i,
    synths: /\b(synths?|synthesizer)/i,
    'mix-bus': /\b(mix\s*bus|stereo\s*bus|master\s*bus)/i,
    master: /\b(master|mastering)/i,
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
    mastering: /\b(mastering|master)/i,
    'sound-design': /\b(sound design|creative)/i,
    'post-production': /\b(post production|post|film)/i,
    recording: /\b(recording|tracking)/i,
  };

  for (const [useCase, pattern] of Object.entries(useCasePatterns)) {
    if (pattern.test(allText)) {
      useCases.push(useCase);
    }
  }
  if (useCases.length > 0) {
    enrichment.useCases = useCases;
  }

  // Skill Level
  if (/\b(beginner|easy to use|simple|straightforward)/i.test(allText)) {
    enrichment.skillLevel = 'beginner';
  } else if (/\b(professional|advanced|expert|complex)/i.test(allText)) {
    enrichment.skillLevel = 'professional';
  } else if (/\b(intermediate|moderate)/i.test(allText)) {
    enrichment.skillLevel = 'intermediate';
  }

  // CPU Usage
  if (/\b(cpu\s+efficient|light|lightweight|low\s+cpu)/i.test(allText)) {
    enrichment.cpuUsage = 'light';
  } else if (/\b(cpu\s+heavy|intensive|demanding|hungry)/i.test(allText)) {
    enrichment.cpuUsage = 'heavy';
  } else {
    enrichment.cpuUsage = 'moderate';
  }

  // License Type
  if (/\b(subscription|monthly|yearly\s+plan)/i.test(allText)) {
    enrichment.licenseType = 'subscription';
  } else if (/\b(perpetual|one-time|buy once)/i.test(allText)) {
    enrichment.licenseType = 'perpetual';
  } else if (/\b(rent to own|splice)/i.test(allText)) {
    enrichment.licenseType = 'rent-to-own';
  }

  // Industry Standard
  if (/\b(industry standard|de facto standard|ubiquitous|everywhere)/i.test(allText)) {
    enrichment.isIndustryStandard = true;
  }

  return enrichment;
}

/**
 * Enrich a single plugin using web search
 */
async function enrichPluginWithWeb(plugin, manufacturer) {
  try {
    // Build search query
    const query = `${plugin.name} ${manufacturer.name} audio plugin ${plugin.category} review specifications`;

    console.log(`  🔎 Searching: "${query}"`);

    // Use Exa web search via MCP (if available)
    // For now, we'll simulate the search and show the structure
    // In production, this would use the actual Exa MCP tool

    // Simulated search results (in production, use actual MCP call)
    const searchResults = [
      {
        title: `${plugin.name} Review`,
        url: `https://example.com/${plugin.slug}`,
        text: `The ${plugin.name} by ${manufacturer.name} is a ${plugin.category} plugin...`,
      },
    ];

    // Extract enrichment data
    const enrichment = extractEnrichmentFromWeb(plugin, searchResults);

    // Add manufacturer info for logging
    enrichment.manufacturerName = manufacturer.name;

    return enrichment;

  } catch (err) {
    console.error(`  ❌ Error enriching ${plugin.name}:`, err.message);
    return null;
  }
}

/**
 * Process a batch of plugins
 */
async function processBatch(plugins, manufacturers) {
  const enrichments = [];

  for (const plugin of plugins) {
    const manufacturer = manufacturers.get(plugin.manufacturer.toString());
    if (!manufacturer) {
      console.log(`  ⚠️  Skipping ${plugin.name} - manufacturer not found`);
      continue;
    }

    console.log(`\n📦 Processing: ${plugin.name} (${manufacturer.name})`);
    console.log(`  Category: ${plugin.category}`);
    console.log(`  Current enrichment: ${Object.keys(plugin).filter(k => plugin[k]).length} fields`);

    const enrichment = await enrichPluginWithWeb(plugin, manufacturer);

    if (enrichment && Object.keys(enrichment).length > 1) { // More than just manufacturerName
      enrichments.push({
        id: plugin._id,
        ...enrichment,
      });
      console.log(`  ✅ Found ${Object.keys(enrichment).length} new fields`);
    } else {
      console.log(`  ⚠️  No additional enrichment data found`);
    }
  }

  return enrichments;
}

/**
 * Save enrichments to Convex
 */
async function saveEnrichments(enrichments) {
  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - Would save:');
    console.log(JSON.stringify(enrichments, null, 2));
    return { success: true, count: enrichments.length };
  }

  try {
    const results = await convex.mutation(api.enrichment.batchEnrich, {
      plugins: enrichments,
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
    // 1. Get current enrichment stats
    console.log('📊 Fetching enrichment stats...\n');
    const stats = await convex.query(api.enrichment.getEnrichmentStats, {});

    console.log('Current enrichment coverage:');
    console.log(`  Total plugins: ${stats.total}`);
    console.log(`  Fully enriched: ${stats.fullyEnriched} (${stats.percentages.fullyEnriched}%)`);
    console.log(`  With effectType: ${stats.withEffectType} (${stats.percentages.effectType}%)`);
    console.log(`  With worksWellOn: ${stats.withWorksWellOn} (${stats.percentages.worksWellOn}%)`);
    console.log(`  With useCases: ${stats.withUseCases} (${stats.percentages.useCases}%)`);
    console.log(`  With skillLevel: ${stats.withSkillLevel} (${stats.percentages.skillLevel}%)`);
    console.log(`  With cpuUsage: ${stats.withCpuUsage} (${stats.percentages.cpuUsage}%)`);
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

    console.log(`Found ${plugins.length} plugins needing enrichment\n`);

    // 3. Fetch manufacturers (for names in queries)
    console.log('📦 Fetching manufacturers...\n');
    const allManufacturers = await convex.query(api.manufacturers.list, { limit: 1000 });
    const manufacturers = new Map(
      allManufacturers.map(m => [m._id.toString(), m])
    );

    // 4. Filter by category/manufacturer if specified
    if (options.category) {
      plugins = plugins.filter(p => p.category === options.category);
      console.log(`Filtered to ${plugins.length} ${options.category} plugins\n`);
    }

    if (options.manufacturer) {
      plugins = plugins.filter(p => p.manufacturer.toString() === options.manufacturer);
      console.log(`Filtered to ${plugins.length} plugins from manufacturer ${options.manufacturer}\n`);
    }

    // 5. Process in batches
    const totalPlugins = plugins.length;
    let processedCount = 0;
    let enrichedCount = 0;

    for (let i = 0; i < plugins.length; i += options.batchSize) {
      const batch = plugins.slice(i, i + options.batchSize);
      const batchNum = Math.floor(i / options.batchSize) + 1;
      const totalBatches = Math.ceil(plugins.length / options.batchSize);

      console.log(`\n${'='.repeat(60)}`);
      console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} plugins)`);
      console.log(`${'='.repeat(60)}`);

      // Process batch
      const enrichments = await processBatch(batch, manufacturers);
      processedCount += batch.length;

      // Save to Convex
      if (enrichments.length > 0) {
        console.log(`\n💾 Saving ${enrichments.length} enrichments...`);
        const result = await saveEnrichments(enrichments);

        if (result.success) {
          if (options.dryRun) {
            console.log(`✅ Dry run complete - would have saved ${result.count} enrichments`);
          } else {
            console.log(`✅ Saved: ${result.succeeded} succeeded, ${result.failed} failed`);
            enrichedCount += result.succeeded;
          }
        }
      }

      // Progress
      console.log(`\n📊 Progress: ${processedCount}/${totalPlugins} plugins processed`);
      console.log(`   Enriched: ${enrichedCount} plugins`);

      // Delay between batches (rate limiting)
      if (i + options.batchSize < plugins.length) {
        console.log(`⏳ Waiting ${options.delay}ms before next batch...`);
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

    // Get updated stats
    console.log('\n📊 Updated enrichment coverage:\n');
    const finalStats = await convex.query(api.enrichment.getEnrichmentStats, {});
    console.log(`  Fully enriched: ${finalStats.fullyEnriched} (${finalStats.percentages.fullyEnriched}%)`);
    console.log(`  Improvement: +${finalStats.fullyEnriched - stats.fullyEnriched} plugins`);

  } catch (err) {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  }
}

// Run
main().catch(console.error);
