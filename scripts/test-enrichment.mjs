#!/usr/bin/env node
/**
 * Test Enrichment Script (No API Required)
 *
 * Demonstrates the enrichment pipeline without requiring Exa API.
 * Uses simulated search results for testing.
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const CONVEX_URL = process.env.CONVEX_URL || 'https://next-frog-231.convex.cloud';
const convex = new ConvexHttpClient(CONVEX_URL);

const args = process.argv.slice(2);
const options = {
  limit: parseInt(args.find((a, i) => args[i - 1] === '--limit')) || 5,
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose'),
  category: args.find((a, i) => args[i - 1] === '--category'),
};

console.log('🧪 Test Enrichment Script (Simulated Web Search)\n');
console.log('Options:', options);
console.log('');

/**
 * Simulate web search results for a plugin
 */
function simulateWebSearch(plugin, manufacturer) {
  // Simulate realistic search results based on category
  const categoryDescriptions = {
    eq: `The ${plugin.name} is a parametric equalizer featuring surgical precision and transparent sound.
         Works exceptionally well on vocals, drums, and mix bus. Industry professionals praise its clean,
         uncolored tone and intuitive workflow. CPU usage is light to moderate.`,

    compressor: `${plugin.name} by ${manufacturer.name} is a VCA-style compressor modeled after the legendary
         SSL G-Bus. Features warm, punchy compression perfect for mix bus and drum processing.
         Considered an industry standard with moderate CPU usage. Professional-grade tool.`,

    reverb: `This algorithmic reverb plugin offers lush, smooth reverb tails ideal for vocals,
         strings, and ambient sound design. Features modern DSP with moderate to heavy CPU usage.
         Suitable for mixing and mastering applications.`,

    delay: `${plugin.name} is a tape delay emulation with warm, vintage character.
         Perfect for vocals, guitars, and creative sound design. Features analog-modeled
         saturation and wow/flutter. Beginner-friendly with light CPU usage.`,

    saturation: `A tube saturation plugin offering warm harmonic enhancement.
         Works well on mix bus, vocals, and bass. Features analog warmth with
         transparent to colored tonal options. Moderate CPU usage.`,

    limiter: `Transparent brickwall limiter designed for mastering applications.
         Features lookahead processing and true peak detection. Professional-grade
         with heavy CPU usage due to oversampling.`,
  };

  const description = categoryDescriptions[plugin.category] ||
    `${plugin.name} is a ${plugin.category} plugin by ${manufacturer.name}.`;

  return [{
    title: `${plugin.name} Review - Sound on Sound`,
    url: `https://example.com/reviews/${plugin.slug}`,
    text: description,
    highlights: [description.slice(0, 200)],
  }];
}

/**
 * Extract enrichment from simulated results
 */
function extractEnrichment(results, plugin) {
  const text = results.map(r => r.text).join('\n').toLowerCase();
  const enrichment = {};

  // Effect type detection
  const effectTypes = {
    'Parametric': /parametric/i,
    'VCA': /vca|voltage controlled/i,
    'FET': /fet|field effect/i,
    'Algorithmic': /algorithmic/i,
    'Tape': /tape (delay|echo)/i,
    'Tube': /tube/i,
    'Brickwall': /brickwall/i,
  };

  for (const [type, pattern] of Object.entries(effectTypes)) {
    if (pattern.test(text)) {
      enrichment.effectType = type;
      break;
    }
  }

  // Circuit emulation
  if (/ssl g-bus|ssl bus/i.test(text)) enrichment.circuitEmulation = 'SSL G-Bus';
  if (/neve 1073/i.test(text)) enrichment.circuitEmulation = 'Neve 1073';
  if (/la-2a/i.test(text)) enrichment.circuitEmulation = 'LA-2A';
  if (/1176/i.test(text)) enrichment.circuitEmulation = '1176';

  // Tonal character
  const tonalChars = [];
  if (/warm/i.test(text)) tonalChars.push('warm');
  if (/transparent|clean|surgical/i.test(text)) tonalChars.push('transparent');
  if (/punchy/i.test(text)) tonalChars.push('punchy');
  if (/smooth/i.test(text)) tonalChars.push('smooth');
  if (/vintage/i.test(text)) tonalChars.push('vintage');
  if (/colored/i.test(text)) tonalChars.push('colored');
  if (tonalChars.length > 0) enrichment.tonalCharacter = tonalChars.slice(0, 3);

  // Works well on
  const worksWellOn = [];
  if (/vocals?/i.test(text)) worksWellOn.push('vocals');
  if (/drums?/i.test(text)) worksWellOn.push('drums');
  if (/bass/i.test(text)) worksWellOn.push('bass');
  if (/guitars?/i.test(text)) worksWellOn.push('guitars');
  if (/mix bus|stereo bus/i.test(text)) worksWellOn.push('mix-bus');
  if (/master|mastering/i.test(text)) worksWellOn.push('master');
  if (worksWellOn.length > 0) enrichment.worksWellOn = worksWellOn;

  // Use cases
  const useCases = [];
  if (/mixing/i.test(text)) useCases.push('mixing');
  if (/mastering/i.test(text)) useCases.push('mastering');
  if (/sound design/i.test(text)) useCases.push('sound-design');
  if (useCases.length > 0) enrichment.useCases = useCases;

  // Skill level
  if (/beginner|easy|simple/i.test(text)) {
    enrichment.skillLevel = 'beginner';
  } else if (/professional|expert|advanced/i.test(text)) {
    enrichment.skillLevel = 'professional';
  } else {
    enrichment.skillLevel = 'intermediate';
  }

  // CPU usage
  if (/light cpu|cpu efficient/i.test(text)) {
    enrichment.cpuUsage = 'light';
  } else if (/heavy cpu|cpu heavy|demanding/i.test(text)) {
    enrichment.cpuUsage = 'heavy';
  } else {
    enrichment.cpuUsage = 'moderate';
  }

  // License type
  if (/subscription/i.test(text)) enrichment.licenseType = 'subscription';
  else if (/perpetual/i.test(text)) enrichment.licenseType = 'perpetual';

  // Industry standard
  if (/industry standard|de facto/i.test(text)) {
    enrichment.isIndustryStandard = true;
  }

  return enrichment;
}

async function main() {
  try {
    console.log('📊 Fetching enrichment stats...\n');
    const stats = await convex.query(api.enrichment.getEnrichmentStats, {});

    console.log('Current Coverage:');
    console.log(`  Total plugins: ${stats.total}`);
    console.log(`  Fully enriched: ${stats.fullyEnriched} (${stats.percentages.fullyEnriched}%)`);
    console.log(`  With effectType: ${stats.withEffectType} (${stats.percentages.effectType}%)`);
    console.log(`  With skillLevel: ${stats.withSkillLevel} (${stats.percentages.skillLevel}%)`);
    console.log('');

    console.log(`🔍 Fetching ${options.limit} unenriched plugins...\n`);
    let plugins = await convex.query(api.enrichment.getUnenriched, {
      limit: options.limit,
    });

    if (plugins.length === 0) {
      console.log('✅ All plugins are enriched!');
      return;
    }

    console.log(`Found ${plugins.length} plugins needing enrichment\n`);

    // Fetch manufacturers
    const allManufacturers = await convex.query(api.manufacturers.list, { limit: 1000 });
    const manufacturers = new Map(
      allManufacturers.map(m => [m._id.toString(), m])
    );

    // Filter by category
    if (options.category) {
      plugins = plugins.filter(p => p.category === options.category);
      console.log(`Filtered to ${plugins.length} ${options.category} plugins\n`);
    }

    // Process each plugin
    const enrichments = [];

    for (let i = 0; i < plugins.length; i++) {
      const plugin = plugins[i];
      const manufacturer = manufacturers.get(plugin.manufacturer.toString());

      if (!manufacturer) {
        console.log(`⚠️  [${i + 1}/${plugins.length}] Skipping ${plugin.name} - manufacturer not found\n`);
        continue;
      }

      console.log(`📦 [${i + 1}/${plugins.length}] ${plugin.name}`);
      console.log(`   Manufacturer: ${manufacturer.name}`);
      console.log(`   Category: ${plugin.category}`);

      if (options.verbose) {
        console.log(`   🔎 Simulating web search...`);
      }

      // Simulate web search
      const results = simulateWebSearch(plugin, manufacturer);

      if (options.verbose) {
        console.log(`   📄 Retrieved ${results.length} results`);
      }

      // Extract enrichment
      const enrichment = extractEnrichment(results, plugin);

      if (Object.keys(enrichment).length > 0) {
        enrichments.push({
          id: plugin._id,
          manufacturerName: manufacturer.name,
          pluginName: plugin.name,
          ...enrichment,
        });

        console.log(`   ✅ Extracted ${Object.keys(enrichment).length} fields:`);
        for (const [key, value] of Object.entries(enrichment)) {
          const displayValue = Array.isArray(value)
            ? `[${value.join(', ')}]`
            : value;
          console.log(`      • ${key}: ${displayValue}`);
        }
      } else {
        console.log(`   ⚠️  No enrichment data extracted`);
      }

      console.log('');
    }

    // Show results
    if (options.dryRun) {
      console.log('\n' + '='.repeat(60));
      console.log('🔍 DRY RUN - Summary of Enrichments');
      console.log('='.repeat(60));
      console.log(`\nWould enrich ${enrichments.length} plugins:\n`);

      enrichments.forEach((e, idx) => {
        console.log(`${idx + 1}. ${e.pluginName} (${e.manufacturerName})`);
        console.log(`   Fields: ${Object.keys(e).filter(k => !['id', 'manufacturerName', 'pluginName'].includes(k)).join(', ')}`);
      });

      console.log(`\n✅ Dry run complete - no changes made to database`);
    } else {
      console.log('\n💾 Saving enrichments to Convex...');

      const toSave = enrichments.map(({ manufacturerName, pluginName, ...rest }) => rest);
      const results = await convex.mutation(api.enrichment.batchEnrich, {
        plugins: toSave,
      });

      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      console.log(`✅ Saved: ${succeeded} succeeded${failed ? `, ${failed} failed` : ''}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test Complete!');
    console.log('='.repeat(60));

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (options.verbose) {
      console.error(err);
    }
    process.exit(1);
  }
}

main().catch(console.error);
