#!/usr/bin/env node
/**
 * Exa Plugin Discovery Script
 * 
 * Discovers newly released/announced audio EFFECT plugins using Exa search.
 * Filters out instruments/synths, deduplicates against existing DB, enriches new finds.
 * 
 * Usage:
 *   node scripts/exa-discover.mjs --dry-run
 *   node scripts/exa-discover.mjs --limit=10 --days-back=30
 *   node scripts/exa-discover.mjs --dry-run --limit=5 --days-back=7
 */

import Exa from 'exa-js';
import { ConvexHttpClient } from 'convex/browser';
import fs from 'fs';
import path from 'path';

// =============================================================================
// Configuration
// =============================================================================

const credPath = path.join(process.env.HOME, '.credentials/exa/credentials.json');
const { apiKey } = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
const exa = new Exa(apiKey);

const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const client = new ConvexHttpClient(CONVEX_URL);

// Valid effect categories
const VALID_CATEGORIES = [
  'eq', 'compressor', 'limiter', 'reverb', 'delay', 'saturation',
  'modulation', 'stereo-imaging', 'gate-expander', 'de-esser',
  'filter', 'channel-strip', 'metering', 'noise-reduction',
  'multiband', 'utility'
];

// Instrument keywords to filter out
const INSTRUMENT_KEYWORDS = [
  'synthesizer', 'synth', 'sampler', 'drum machine', 'rompler',
  'virtual instrument', 'piano plugin', 'organ plugin', 'strings plugin',
  'sample library', 'kontakt library', 'wavetable synth'
];

// =============================================================================
// Helpers
// =============================================================================

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getMonthYear() {
  const now = new Date();
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return { month: months[now.getMonth()], year: now.getFullYear() };
}

function isInstrument(text) {
  const lower = text.toLowerCase();
  return INSTRUMENT_KEYWORDS.some(kw => lower.includes(kw));
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// =============================================================================
// Discovery: Search for new plugins
// =============================================================================

async function searchForNewPlugins(daysBack) {
  const { month, year } = getMonthYear();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - daysBack);
  const startDate = dateFrom.toISOString().split('T')[0];

  const queries = [
    `new audio effect plugin release ${month} ${year}`,
    `new mixing plugin ${month} ${year}`,
    `new mastering plugin ${month} ${year}`,
    `new EQ plugin release ${year}`,
    `new compressor plugin release ${year}`,
    `new reverb plugin release ${year}`,
    `new delay plugin release ${year}`,
    `new saturation distortion plugin ${year}`,
    `new modulation plugin chorus flanger phaser ${year}`,
    `new audio plugin announcement ${month} ${year} VST AU AAX`,
  ];

  // Focus on known audio plugin sites
  const siteFocusedQueries = [
    { query: `new audio effect plugin ${month} ${year}`, domains: ['kvraudio.com'] },
    { query: `new audio effect plugin ${month} ${year}`, domains: ['pluginboutique.com'] },
    { query: `new plugin release ${month} ${year}`, domains: ['bedroomproducersblog.com'] },
    { query: `new audio plugin ${month} ${year}`, domains: ['audioplugindeals.com'] },
  ];

  const allResults = [];
  const seenUrls = new Set();

  // General searches
  for (const q of queries) {
    console.log(`🔍 Searching: "${q}"`);
    try {
      const results = await exa.searchAndContents(q, {
        type: 'auto',
        numResults: 10,
        startPublishedDate: startDate,
        text: { maxCharacters: 1500 },
      });
      
      for (const r of results.results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
      console.log(`   📄 ${results.results.length} results`);
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
    await sleep(500);
  }

  // Site-focused searches
  for (const { query: q, domains } of siteFocusedQueries) {
    console.log(`🔍 Searching ${domains[0]}: "${q}"`);
    try {
      const results = await exa.searchAndContents(q, {
        type: 'auto',
        numResults: 10,
        startPublishedDate: startDate,
        includeDomains: domains,
        text: { maxCharacters: 1500 },
      });
      
      for (const r of results.results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
      console.log(`   📄 ${results.results.length} results`);
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
    await sleep(500);
  }

  return allResults;
}

// =============================================================================
// Extract plugin names from search results
// =============================================================================

function extractPluginCandidates(results) {
  const candidates = [];
  const seen = new Set();

  for (const result of results) {
    const text = [result.title || '', result.text || ''].join(' ');
    
    // Skip if clearly about instruments
    if (isInstrument(text)) continue;

    // Try to extract plugin names from titles like "FabFilter Pro-Q 4 Review"
    // or "New: Soundtoys Decapitator 2.0"
    const title = result.title || '';
    
    // Common patterns: "Brand PluginName" or "PluginName by Brand"
    // We'll use the title as a hint and enrich later
    if (title.length > 5 && title.length < 200) {
      const key = title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          title: title,
          url: result.url,
          text: (result.text || '').slice(0, 500),
          publishedDate: result.publishedDate,
        });
      }
    }
  }

  return candidates;
}

// =============================================================================
// Enrich a candidate using Exa Answer API
// =============================================================================

async function enrichCandidate(candidate) {
  const query = `What audio effect plugin is discussed in this article: "${candidate.title}"? 
Provide: 
1. Plugin name
2. Manufacturer/developer name  
3. Is it an audio EFFECT or an instrument/synth?
4. Effect category (EQ, compressor, limiter, reverb, delay, saturation, modulation, stereo-imaging, gate/expander, de-esser, filter, channel-strip, metering, noise-reduction, multiband, utility)
5. Effect subtype (e.g., parametric EQ, FET compressor, convolution reverb, tape delay, etc.)
6. Does it emulate specific hardware? Which?
7. Tonal character (warm, transparent, aggressive, smooth, colored, clean)
8. Plugin formats (VST3, AU, AAX, CLAP)
9. Platforms (Windows, Mac, Linux)
10. Price (USD)
11. Brief description (2-3 sentences)
12. Product URL`;

  try {
    const result = await exa.answer(query, { text: true });
    if (!result.answer) return null;

    const answer = result.answer;

    // Check if it's an instrument
    if (isInstrument(answer)) {
      return { rejected: true, reason: 'Detected as instrument/synth' };
    }

    // Check for explicit "instrument" or "synth" classification
    if (/\b(it is|this is|it's) (an?|the) (instrument|synth|synthesizer|sampler)\b/i.test(answer)) {
      return { rejected: true, reason: 'Classified as instrument/synth' };
    }

    // Extract structured data
    const data = {};

    // Plugin name — try to get from first line or "Plugin name:" pattern
    const nameMatch = answer.match(/(?:plugin name|name)[:\s]+([^\n,]+)/i) ||
                      answer.match(/^([A-Z][^\n]{2,50})/);
    if (nameMatch) data.name = nameMatch[1].trim();

    // Manufacturer
    const mfrMatch = answer.match(/(?:manufacturer|developer|brand|by)[:\s]+([^\n,]+)/i);
    if (mfrMatch) data.manufacturer = mfrMatch[1].trim();

    // Category detection
    const catMap = {
      'eq': /\beq\b|equaliz/i,
      'compressor': /compressor/i,
      'limiter': /limiter/i,
      'reverb': /reverb/i,
      'delay': /delay/i,
      'saturation': /saturat|distort/i,
      'modulation': /modulation|chorus|flang|phas/i,
      'stereo-imaging': /stereo.*imag|mid.side|widen/i,
      'gate-expander': /gate|expander|transient/i,
      'de-esser': /de.?ess/i,
      'filter': /\bfilter\b/i,
      'channel-strip': /channel.?strip/i,
      'metering': /meter|analyz/i,
      'noise-reduction': /noise.?reduc|denois/i,
      'multiband': /multiband/i,
    };

    for (const [cat, regex] of Object.entries(catMap)) {
      if (regex.test(answer)) {
        data.category = cat;
        break;
      }
    }

    // Effect subtype
    const subtypeMatch = answer.match(/(?:subtype|type|kind)[:\s]+([^\n,]+)/i);
    if (subtypeMatch) data.effectType = subtypeMatch[1].trim().toLowerCase();

    // Circuit emulation
    const circuitPatterns = [
      /neve\s*\d+/i, /ssl\s*[\w-]+/i, /la-?2a/i, /1176/i, /pultec/i,
      /fairchild\s*\d*/i, /api\s*\d+/i, /distressor/i, /teletronix/i
    ];
    for (const p of circuitPatterns) {
      const match = answer.match(p);
      if (match) { data.circuitEmulation = match[0]; break; }
    }

    // Tonal character
    const tonalWords = ['warm', 'transparent', 'aggressive', 'smooth', 'colored', 'clean', 'punchy', 'dark', 'bright', 'airy'];
    const tonal = tonalWords.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(answer));
    if (tonal.length) data.tonalCharacter = tonal;

    // Formats
    const fmtMatches = answer.match(/\b(VST3?|AU|AAX|CLAP|Standalone)\b/gi);
    if (fmtMatches) data.formats = [...new Set(fmtMatches.map(f => f.toUpperCase()))];

    // Platforms
    const platforms = [];
    if (/windows|win|pc/i.test(answer)) platforms.push('windows');
    if (/mac|macos/i.test(answer)) platforms.push('mac');
    if (/linux/i.test(answer)) platforms.push('linux');
    if (platforms.length) data.platforms = platforms;

    // Price
    const priceMatch = answer.match(/\$(\d+(?:\.\d{2})?)/);
    if (priceMatch) data.msrp = Math.round(parseFloat(priceMatch[1]) * 100);
    if (/\bfree\b/i.test(answer)) data.isFree = true;

    // Description
    const descSentences = answer.split(/[.!]/).filter(s => s.trim().length > 30).slice(0, 3);
    if (descSentences.length) {
      data.description = descSentences.join('. ').trim() + '.';
      data.shortDescription = descSentences[0].trim() + '.';
    }

    // Product URL
    const urlMatch = answer.match(/https?:\/\/[^\s"<>]+/);
    if (urlMatch) data.productUrl = urlMatch[0];

    // Tags
    const tags = [];
    if (/analog|vintage/i.test(answer)) tags.push('analog-modeling');
    if (/mastering/i.test(answer)) tags.push('mastering');
    if (/mixing/i.test(answer)) tags.push('mixing');
    if (/free/i.test(answer)) tags.push('free');
    if (/creative/i.test(answer)) tags.push('creative');
    if (/ai|machine learning/i.test(answer)) tags.push('ai-powered');
    if (tags.length) data.tags = tags;

    return data;
  } catch (err) {
    console.log(`   ❌ Enrichment error: ${err.message}`);
    return null;
  }
}

// =============================================================================
// Save to Convex
// =============================================================================

async function saveToConvex(pluginData) {
  const slug = slugify(`${pluginData.manufacturer || 'unknown'}-${pluginData.name}`);
  
  const payload = {
    slug,
    name: pluginData.name,
    manufacturer: pluginData.manufacturer || 'Unknown',
    category: pluginData.category || 'utility',
    effectType: pluginData.effectType,
    circuitEmulation: pluginData.circuitEmulation,
    tonalCharacter: pluginData.tonalCharacter,
    description: pluginData.description,
    shortDescription: pluginData.shortDescription,
    formats: pluginData.formats,
    platforms: pluginData.platforms,
    msrp: pluginData.msrp,
    isFree: pluginData.isFree,
    tags: pluginData.tags,
    productUrl: pluginData.productUrl,
  };

  // Call via HTTP
  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'agentEnrich:upsertPluginEnrichment',
      args: payload,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Convex mutation failed: ${error}`);
  }

  return await response.json();
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 20;
  const daysBack = parseInt(args.find(a => a.startsWith('--days-back='))?.split('=')[1]) || 30;

  console.log('🔎 PluginRadar: Exa Plugin Discovery');
  console.log('═'.repeat(50));
  console.log(`📅 Looking back: ${daysBack} days`);
  console.log(`📊 Limit: ${limit} plugins`);
  console.log(`Mode: ${dryRun ? '🏃 DRY RUN' : '⚡ LIVE'}`);
  console.log('');

  // 1. Get existing plugin slugs
  console.log('📡 Fetching existing plugins from Convex...');
  let existingSlugs;
  try {
    const plugins = await client.query('agentEnrich:listEnrichedPlugins', { limit: 5000 });
    existingSlugs = new Set(plugins.map(p => p.slug));
    console.log(`   Found ${existingSlugs.size} existing plugins\n`);
  } catch (err) {
    console.log(`   ⚠️ Could not fetch existing plugins: ${err.message}`);
    existingSlugs = new Set();
  }

  // 2. Search for new plugins
  console.log('🌐 Searching for new audio effect plugins...\n');
  const searchResults = await searchForNewPlugins(daysBack);
  console.log(`\n📄 Total unique search results: ${searchResults.length}\n`);

  // 3. Extract candidates
  const candidates = extractPluginCandidates(searchResults);
  console.log(`🎯 Plugin candidates extracted: ${candidates.length}\n`);

  // 4. Enrich and save
  const stats = { discovered: 0, enriched: 0, saved: 0, skipped: 0, rejected: 0, errors: 0 };
  let processed = 0;

  for (const candidate of candidates) {
    if (processed >= limit) break;

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`📦 Processing: ${candidate.title}`);
    console.log(`   URL: ${candidate.url}`);

    // Enrich with Exa Answer API
    const data = await enrichCandidate(candidate);
    await sleep(1000); // Rate limiting

    if (!data) {
      console.log('   ⚠️ Could not enrich, skipping');
      stats.errors++;
      processed++;
      continue;
    }

    if (data.rejected) {
      console.log(`   ⛔ REJECTED: ${data.reason}`);
      stats.rejected++;
      processed++;
      continue;
    }

    if (!data.name) {
      console.log('   ⚠️ No plugin name extracted, skipping');
      stats.skipped++;
      processed++;
      continue;
    }

    stats.discovered++;
    const slug = slugify(`${data.manufacturer || 'unknown'}-${data.name}`);
    console.log(`   🏷️  ${data.name} by ${data.manufacturer || '?'} (${data.category || '?'})`);
    console.log(`   🔗 Slug: ${slug}`);

    // Check if already exists
    if (existingSlugs.has(slug)) {
      console.log('   📋 Already in database, skipping');
      stats.skipped++;
      processed++;
      continue;
    }

    stats.enriched++;

    if (data.effectType) console.log(`   🎚️  Effect type: ${data.effectType}`);
    if (data.circuitEmulation) console.log(`   🔌 Circuit: ${data.circuitEmulation}`);
    if (data.tonalCharacter) console.log(`   🎨 Tonal: ${data.tonalCharacter.join(', ')}`);
    if (data.formats) console.log(`   📦 Formats: ${data.formats.join(', ')}`);
    if (data.msrp) console.log(`   💰 Price: $${(data.msrp / 100).toFixed(2)}`);
    if (data.isFree) console.log('   🆓 FREE');

    // Save to Convex
    if (dryRun) {
      console.log('   🏃 [DRY RUN] Would save to Convex');
      stats.saved++;
    } else {
      try {
        const result = await saveToConvex(data);
        const status = result?.value?.isNew ? 'Created' : 'Updated';
        console.log(`   ✅ ${status} in Convex`);
        stats.saved++;
        existingSlugs.add(slug); // Prevent duplicate processing
      } catch (err) {
        console.log(`   ❌ Save error: ${err.message}`);
        stats.errors++;
      }
    }

    processed++;
  }

  // 5. Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📋 DISCOVERY SUMMARY');
  console.log('═'.repeat(50));
  console.log(`🔍 Search results: ${searchResults.length}`);
  console.log(`🎯 Candidates: ${candidates.length}`);
  console.log(`🆕 Discovered: ${stats.discovered}`);
  console.log(`📝 Enriched: ${stats.enriched}`);
  console.log(`💾 Saved: ${stats.saved}`);
  console.log(`⏭️  Skipped (existing): ${stats.skipped}`);
  console.log(`⛔ Rejected (instruments): ${stats.rejected}`);
  console.log(`❌ Errors: ${stats.errors}`);
  
  if (dryRun) {
    console.log('\n⚠️  This was a DRY RUN. No changes were made.');
  }
}

main().catch(err => {
  console.error('💥 Fatal error:', err.message);
  process.exit(1);
});
