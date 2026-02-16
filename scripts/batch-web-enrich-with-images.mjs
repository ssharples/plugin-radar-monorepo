#!/usr/bin/env node
/**
 * Batch Web Enrichment Script with Image Upload
 *
 * Enriches plugins with metadata AND downloads/uploads official product images.
 * Uses Exa for web search and Convex storage for images.
 */

import Exa from 'exa-js';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { readFileSync } from 'fs';
import { homedir } from 'os';

// =============================================================================
// Configuration
// =============================================================================

const EXA_API_KEY = (() => {
  if (process.env.EXA_API_KEY) return process.env.EXA_API_KEY;

  try {
    const credPath = `${homedir()}/.credentials/exa/credentials.json`;
    const credentials = JSON.parse(readFileSync(credPath, 'utf8'));
    return credentials.apiKey;
  } catch (err) {
    throw new Error('❌ EXA_API_KEY not found. Set it as env var or in ~/.credentials/exa/credentials.json');
  }
})();

const CONVEX_URL = process.env.CONVEX_URL || 'https://next-frog-231.convex.cloud';
const exa = new Exa(EXA_API_KEY);
const convex = new ConvexHttpClient(CONVEX_URL);

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  limit: parseInt(args.find((a, i) => args[i - 1] === '--limit')) || 20,
  batchSize: parseInt(args.find((a, i) => args[i - 1] === '--batch-size')) || 5,
  delay: parseInt(args.find((a, i) => args[i - 1] === '--delay')) || 3000,
  dryRun: args.includes('--dry-run'),
  category: args.find((a, i) => args[i - 1] === '--category'),
  verbose: args.includes('--verbose'),
  skipImages: args.includes('--skip-images'),
};

console.log('🔍 Batch Web Enrichment Script with Images');
console.log('Configuration:', options);
console.log('');

// =============================================================================
// Enrichment Logic
// =============================================================================

/**
 * Enrich a single plugin using Exa web search
 */
async function enrichPluginWithExa(plugin, manufacturer) {
  try {
    // Build comprehensive search query
    const query = `${plugin.name} by ${manufacturer.name} audio plugin official product`;

    if (options.verbose) {
      console.log(`  🔎 Searching: "${query}"`);
    }

    // Use Exa with auto contents to get structured data
    const results = await exa.searchAndContents(query, {
      type: 'auto',
      numResults: 5,
      text: { maxCharacters: 3000 },
      highlights: { numSentences: 5, highlightsPerUrl: 3 },
    });

    if (options.verbose) {
      console.log(`  📄 Retrieved ${results.results.length} results`);
    }

    // Extract enrichment data
    const enrichment = await extractEnrichmentFromResults(results.results, plugin, manufacturer);

    // Extract image URL
    const imageUrl = extractBestImageUrl(results.results, plugin, manufacturer);
    if (imageUrl) {
      enrichment.imageUrl = imageUrl;
      if (options.verbose) {
        console.log(`  🖼️  Found image: ${imageUrl.substring(0, 60)}...`);
      }
    }

    return enrichment;

  } catch (err) {
    console.error(`  ❌ Error enriching ${plugin.name}:`, err.message);
    return null;
  }
}

/**
 * Extract best image URL from search results
 */
function extractBestImageUrl(results, plugin, manufacturer) {
  const pluginNameLower = plugin.name.toLowerCase();
  const manufacturerNameLower = manufacturer.name.toLowerCase();

  // Collect all potential image URLs from all results
  const candidateImages = [];

  for (const result of results) {
    const url = result.url.toLowerCase();
    const isOfficialSite = url.includes(manufacturerNameLower) || url.includes(manufacturer.slug);

    // Priority 1: Direct image URLs
    if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(result.url)) {
      candidateImages.push({
        url: result.url,
        priority: isOfficialSite ? 10 : 5,
      });
    }

    // Priority 2: Extract image URLs from text content
    const textToSearch = [
      result.text || '',
      ...(result.highlights || []),
      result.url,
    ].join(' ');

    // Look for common image URL patterns in content
    const imagePatterns = [
      // Direct image URLs with extensions
      /https?:\/\/[^\s"'<>()]+\.(jpg|jpeg|png|webp)(\?[^\s"'<>()]*)?/gi,
      // CDN and storage URLs (without extension but clearly images)
      /https?:\/\/[^\s"'<>()]*(?:cdn|images?|media|assets|uploads?|storage)[^\s"'<>()]*\.(jpg|jpeg|png|webp)/gi,
    ];

    for (const pattern of imagePatterns) {
      const matches = textToSearch.matchAll(pattern);
      for (const match of matches) {
        const imageUrl = match[0].replace(/[,;.!?]+$/, ''); // Clean trailing punctuation

        // Score based on URL quality indicators
        let score = isOfficialSite ? 7 : 3;

        // Boost score for product-related paths
        if (/product|plugin|software|asset/i.test(imageUrl)) score += 3;

        // Boost for manufacturer name in URL
        if (imageUrl.toLowerCase().includes(manufacturerNameLower)) score += 2;

        // Boost for plugin name in URL
        const pluginSlugVariants = [
          plugin.slug,
          plugin.name.replace(/\s+/g, '-').toLowerCase(),
          plugin.name.replace(/\s+/g, '_').toLowerCase(),
        ];
        for (const variant of pluginSlugVariants) {
          if (imageUrl.toLowerCase().includes(variant.toLowerCase())) {
            score += 4;
            break;
          }
        }

        // Penalize thumbnail/icon indicators
        if (/thumb|icon|avatar|logo-/i.test(imageUrl)) score -= 3;

        candidateImages.push({ url: imageUrl, priority: score });
      }
    }
  }

  // Sort by priority and return best match
  if (candidateImages.length > 0) {
    candidateImages.sort((a, b) => b.priority - a.priority);

    if (options.verbose) {
      console.log(`   🔍 Found ${candidateImages.length} candidate images, best score: ${candidateImages[0].priority}`);
    }

    return candidateImages[0].url;
  }

  return null;
}

/**
 * Extract enrichment data from Exa results
 */
async function extractEnrichmentFromResults(results, plugin, manufacturer) {
  const allText = results.map(r => (r.text || '') + ' ' + (r.highlights || []).join(' ')).join('\n').toLowerCase();

  const enrichment = {};

  // Effect type detection
  const effectTypePatterns = {
    'Parametric': /\b(parametric|semi-parametric)\s+(eq|equalizer)/i,
    'Graphic': /\bgraphic\s+eq/i,
    'Dynamic': /\bdynamic\s+eq/i,
    'Linear Phase': /\blinear\s+phase/i,
    'VCA': /\b(vca|voltage controlled)/i,
    'FET': /\b(fet|field effect transistor)/i,
    'Opto': /\b(opto|optical|photo)/i,
    'Variable-Mu': /\b(variable-mu|vari-mu|tube|valve)\s+(comp|limiter)/i,
    'Algorithmic': /\balgorithmic\s+reverb/i,
    'Convolution': /\b(convolution|impulse response|ir)\s+reverb/i,
    'Plate': /\bplate\s+reverb/i,
    'Tape': /\btape\s+(delay|echo|saturation)/i,
    'Tube': /\btube\s+(saturation|warmth)/i,
    'Brickwall': /\bbrickwall\s+limiter/i,
  };

  for (const [type, pattern] of Object.entries(effectTypePatterns)) {
    if (pattern.test(allText)) {
      enrichment.effectType = type;
      break;
    }
  }

  // Circuit emulation
  const circuitPatterns = {
    'Neve 1073': /\bneve\s+(1073|10\s*73)/i,
    'SSL G-Bus': /\bssl\s+(g-bus|g\s*bus|bus\s*comp)/i,
    'LA-2A': /\b(la-2a|la2a)/i,
    '1176': /\b(1176|urei)/i,
    'Pultec EQP-1A': /\b(pultec|eqp-1a)/i,
    'API 2500': /\bapi\s+2500/i,
  };

  for (const [circuit, pattern] of Object.entries(circuitPatterns)) {
    if (pattern.test(allText)) {
      enrichment.circuitEmulation = circuit;
      break;
    }
  }

  // Tonal character
  const tonalChars = [];
  const tonalPatterns = {
    'warm': /\b(warm|warmth)/i,
    'transparent': /\b(transparent|clean|surgical)/i,
    'aggressive': /\b(aggressive|edgy)/i,
    'smooth': /\b(smooth|silky)/i,
    'vintage': /\b(vintage|classic)/i,
    'punchy': /\b(punchy|impact)/i,
  };

  for (const [char, pattern] of Object.entries(tonalPatterns)) {
    if (pattern.test(allText)) tonalChars.push(char);
  }
  if (tonalChars.length > 0) enrichment.tonalCharacter = tonalChars.slice(0, 3);

  // Works well on
  const worksWellOn = [];
  if (/\bvocals?/i.test(allText)) worksWellOn.push('vocals');
  if (/\bdrums?/i.test(allText)) worksWellOn.push('drums');
  if (/\bbass/i.test(allText)) worksWellOn.push('bass');
  if (/\bguitars?/i.test(allText)) worksWellOn.push('guitars');
  if (/\bmix\s*bus/i.test(allText)) worksWellOn.push('mix-bus');
  if (/\bmaster/i.test(allText)) worksWellOn.push('master');
  if (worksWellOn.length > 0) enrichment.worksWellOn = worksWellOn;

  // Use cases
  const useCases = [];
  if (/\bmixing/i.test(allText)) useCases.push('mixing');
  if (/\bmastering/i.test(allText)) useCases.push('mastering');
  if (/\bsound design/i.test(allText)) useCases.push('sound-design');
  if (useCases.length > 0) enrichment.useCases = useCases;

  // Skill level
  if (/\b(beginner|easy|simple)/i.test(allText)) {
    enrichment.skillLevel = 'beginner';
  } else if (/\b(professional|advanced|expert)/i.test(allText)) {
    enrichment.skillLevel = 'professional';
  } else {
    enrichment.skillLevel = 'intermediate';
  }

  // CPU usage
  if (/\b(cpu\s+efficient|light|lightweight)/i.test(allText)) {
    enrichment.cpuUsage = 'light';
  } else if (/\b(cpu\s+heavy|intensive|demanding)/i.test(allText)) {
    enrichment.cpuUsage = 'heavy';
  } else {
    enrichment.cpuUsage = 'moderate';
  }

  // Industry standard
  if (/\bindustry standard/i.test(allText)) {
    enrichment.isIndustryStandard = true;
  }

  return enrichment;
}

/**
 * Process a batch of plugins
 */
async function processBatch(plugins, manufacturers) {
  const enrichments = [];
  const imageUploads = [];

  for (const plugin of plugins) {
    const manufacturer = manufacturers.get(plugin.manufacturer.toString());
    if (!manufacturer) {
      console.log(`  ⚠️  Skipping ${plugin.name} - manufacturer not found`);
      continue;
    }

    console.log(`\n📦 ${plugin.name} (${manufacturer.name})`);
    console.log(`   Category: ${plugin.category}`);

    const enrichment = await enrichPluginWithExa(plugin, manufacturer);

    if (enrichment) {
      const { imageUrl, ...textEnrichment } = enrichment;

      // Separate text enrichment from image
      if (Object.keys(textEnrichment).length > 0) {
        enrichments.push({
          id: plugin._id,
          ...textEnrichment,
        });
        console.log(`   ✅ Extracted ${Object.keys(textEnrichment).length} metadata fields`);
      }

      // Queue image upload
      if (imageUrl && !options.skipImages) {
        imageUploads.push({
          pluginId: plugin._id,
          imageUrl,
          pluginName: plugin.name,
        });
        console.log(`   🖼️  Queued image for upload`);
      }
    } else {
      console.log(`   ⚠️  No enrichment data found`);
    }

    // Rate limit delay between plugins
    await new Promise(resolve => setTimeout(resolve, options.delay));
  }

  return { enrichments, imageUploads };
}

/**
 * Save enrichments to Convex
 */
async function saveEnrichments(enrichments) {
  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - Would save metadata for:');
    enrichments.forEach(e => console.log(`   • Plugin ${e.id}`));
    return { success: true, count: enrichments.length };
  }

  if (enrichments.length === 0) return { success: true, succeeded: 0, failed: 0 };

  try {
    const results = await convex.mutation(anyApi.enrichment.batchEnrich, {
      plugins: enrichments,
    });

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return { success: true, succeeded, failed };
  } catch (err) {
    console.error('❌ Failed to save metadata:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Upload images to Convex storage
 */
async function uploadImages(imageUploads) {
  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - Would upload images for:');
    imageUploads.forEach(img => console.log(`   • ${img.pluginName}: ${img.imageUrl}`));
    return { success: true, count: imageUploads.length };
  }

  if (imageUploads.length === 0) return { success: true, succeeded: 0, failed: 0 };

  try {
    console.log(`\n🖼️  Uploading ${imageUploads.length} images to Convex storage...`);

    const results = await convex.action(anyApi.storage.batchUploadPluginImages, {
      plugins: imageUploads.map(img => ({
        pluginId: img.pluginId,
        imageUrl: img.imageUrl,
      })),
    });

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`✅ Uploaded: ${succeeded} succeeded${failed ? `, ${failed} failed` : ''}`);

    if (failed > 0 && options.verbose) {
      const failures = results.filter(r => !r.success);
      console.log('\n❌ Failed uploads:');
      failures.forEach(f => {
        const img = imageUploads.find(i => i.pluginId === f.pluginId);
        console.log(`   • ${img?.pluginName}: ${f.error}`);
      });
    }

    return { success: true, succeeded, failed };
  } catch (err) {
    console.error('❌ Failed to upload images:', err.message);
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
    const stats = await convex.query(anyApi.enrichment.getEnrichmentStats, {});

    console.log('Current Coverage:');
    console.log(`  Total plugins: ${stats.total}`);
    console.log(`  Fully enriched: ${stats.fullyEnriched} (${stats.percentages.fullyEnriched}%)`);
    console.log(`  With images: ${stats.withImages || 'N/A'}`);
    console.log('');

    // 2. Fetch unenriched plugins
    console.log(`🔍 Fetching up to ${options.limit} unenriched plugins...\n`);
    let plugins = await convex.query(anyApi.enrichment.getUnenriched, {
      limit: options.limit,
    });

    if (plugins.length === 0) {
      console.log('✅ All plugins are enriched!');
      return;
    }

    console.log(`Found ${plugins.length} plugins needing enrichment\n`);

    // 3. Fetch manufacturers
    const allManufacturers = await convex.query(anyApi.manufacturers.list, { limit: 1000 });
    const manufacturers = new Map(allManufacturers.map(m => [m._id.toString(), m]));

    // 4. Filter by category if specified
    if (options.category) {
      plugins = plugins.filter(p => p.category === options.category);
      console.log(`Filtered to ${plugins.length} ${options.category} plugins\n`);
    }

    // 5. Process in batches
    let totalEnriched = 0;
    let totalImagesUploaded = 0;
    const allImageUploads = [];

    for (let i = 0; i < plugins.length; i += options.batchSize) {
      const batch = plugins.slice(i, i + options.batchSize);
      const batchNum = Math.floor(i / options.batchSize) + 1;
      const totalBatches = Math.ceil(plugins.length / options.batchSize);

      console.log(`\n${'='.repeat(60)}`);
      console.log(`📦 Batch ${batchNum}/${totalBatches}`);
      console.log(`${'='.repeat(60)}`);

      // Process batch
      const { enrichments, imageUploads } = await processBatch(batch, manufacturers);
      allImageUploads.push(...imageUploads);

      // Save metadata
      if (enrichments.length > 0) {
        console.log(`\n💾 Saving ${enrichments.length} metadata enrichments...`);
        const result = await saveEnrichments(enrichments);
        if (result.success && !options.dryRun) {
          totalEnriched += result.succeeded;
          console.log(`✅ Saved: ${result.succeeded} succeeded${result.failed ? `, ${result.failed} failed` : ''}`);
        }
      }

      // Upload images for this batch
      if (imageUploads.length > 0 && !options.skipImages) {
        const uploadResult = await uploadImages(imageUploads);
        if (uploadResult.success && !options.dryRun) {
          totalImagesUploaded += uploadResult.succeeded;
        }
      }

      console.log(`\n📊 Progress: ${Math.min(i + options.batchSize, plugins.length)}/${plugins.length} plugins processed`);
    }

    // 6. Final stats
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ Enrichment Complete!');
    console.log(`${'='.repeat(60)}`);
    console.log(`Metadata enrichments: ${totalEnriched}`);
    console.log(`Images uploaded: ${totalImagesUploaded}`);

    if (!options.dryRun) {
      console.log('\n📊 Updated stats:\n');
      const finalStats = await convex.query(anyApi.enrichment.getEnrichmentStats, {});
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
