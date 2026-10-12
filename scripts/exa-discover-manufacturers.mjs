#!/usr/bin/env node
/**
 * Exa Manufacturer + Plugin Discovery Script
 * 
 * Discovers new audio effect plugin manufacturers NOT in our database,
 * creates them, and discovers their effect plugins.
 * 
 * Usage:
 *   node scripts/exa-discover-manufacturers.mjs --dry-run
 *   node scripts/exa-discover-manufacturers.mjs --limit=20
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

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Valid effect categories
const VALID_CATEGORIES = [
  'eq', 'compressor', 'limiter', 'reverb', 'delay', 'saturation',
  'modulation', 'stereo-imaging', 'gate-expander', 'de-esser',
  'filter', 'channel-strip', 'metering', 'noise-reduction',
  'multiband', 'utility'
];

// Instrument keywords to reject
const INSTRUMENT_KEYWORDS = [
  'synthesizer', 'synth', 'sampler', 'drum machine', 'rompler',
  'virtual instrument', 'piano plugin', 'organ plugin', 'strings plugin',
  'sample library', 'kontakt', 'wavetable', 'amp sim', 'amp modeler',
  'guitar amp', 'cabinet sim'
];

function isInstrument(text) {
  const lower = text.toLowerCase();
  return INSTRUMENT_KEYWORDS.some(kw => lower.includes(kw));
}

function detectCategory(text) {
  const catMap = {
    'eq': /\beq\b|equaliz/i,
    'compressor': /compressor|compression/i,
    'limiter': /limiter|limiting/i,
    'reverb': /reverb/i,
    'delay': /delay|echo/i,
    'saturation': /saturat|distort|overdrive|tape.*warmth|tube.*warmth|harmonic.*excit|clipper/i,
    'modulation': /modulation|chorus|flang|phas|tremolo|vibrato|rotary/i,
    'stereo-imaging': /stereo.*imag|mid.side|widen/i,
    'gate-expander': /gate|expander|transient/i,
    'de-esser': /de.?ess/i,
    'filter': /\bfilter\b/i,
    'channel-strip': /channel.?strip|console.*strip/i,
    'metering': /meter|analyz|spectrum|loudness|lufs/i,
    'noise-reduction': /noise.?reduc|denois|restor/i,
    'multiband': /multiband/i,
  };
  
  for (const [cat, regex] of Object.entries(catMap)) {
    if (regex.test(text)) return cat;
  }
  return 'utility';
}

// ═══════════════════════════════════════════════════════════════
// Step 1: Discover new manufacturers via Exa
// ═══════════════════════════════════════════════════════════════

async function discoverManufacturers(existingNames) {
  const queries = [
    'audio plugin manufacturers mixing mastering effects VST',
    'VST plugin companies audio effects processing',
    'best audio effect plugin developers 2024 2025',
    'indie audio plugin companies effects mixing',
    'top mixing mastering plugin brands',
    'audio plugin companies EQ compressor reverb delay',
    'boutique audio plugin developers effects',
    'new audio plugin companies 2024 2025',
    'best free audio effect plugin developers',
    'professional mixing plugin companies',
  ];

  const candidateMap = new Map(); // name -> info

  for (const query of queries) {
    console.log(`🔍 Searching: "${query}"`);
    try {
      const result = await exa.answer(
        `${query}. List the company names, their websites, and what effects they make. Focus on companies that make audio EFFECT plugins (EQ, compressor, reverb, delay, saturation, modulation, etc.) NOT instrument/synth companies.`,
        { text: true }
      );
      
      if (result.answer) {
        // Parse the answer for company names
        // Look for patterns like "CompanyName (website.com)" or "**CompanyName**"
        const lines = result.answer.split('\n');
        for (const line of lines) {
          // Try to extract company name + website
          const nameMatch = line.match(/\*?\*?([A-Z][A-Za-z\s&.'()-]+?)\*?\*?\s*[-–—:]|\d+\.\s*\*?\*?([A-Z][A-Za-z\s&.'()-]+?)\*?\*?\s*[-–—:]/);
          const urlMatch = line.match(/https?:\/\/[^\s"<>)]+/);
          
          if (nameMatch) {
            const name = (nameMatch[1] || nameMatch[2]).trim()
              .replace(/\*+/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            
            // Skip very short or very long names, or instrument-related
            if (name.length < 3 || name.length > 40) continue;
            if (isInstrument(line)) continue;
            if (name.match(/^(the|and|or|for|with|best|top|new|free|note)/i)) continue;
            
            const normalizedName = name.toLowerCase();
            const isExisting = existingNames.some(en => 
              en.toLowerCase() === normalizedName ||
              en.toLowerCase().includes(normalizedName) ||
              normalizedName.includes(en.toLowerCase())
            );
            
            if (!isExisting && !candidateMap.has(name)) {
              candidateMap.set(name, {
                name,
                website: urlMatch ? urlMatch[0].replace(/[).,;]+$/, '') : '',
                context: line.trim(),
              });
            }
          }
        }
      }
      
      console.log(`   Found ${candidateMap.size} unique candidates so far`);
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
    await sleep(1000);
  }

  return Array.from(candidateMap.values());
}

// ═══════════════════════════════════════════════════════════════
// Step 2: Validate and enrich each new manufacturer
// ═══════════════════════════════════════════════════════════════

async function enrichNewManufacturer(candidate) {
  const query = `Tell me about ${candidate.name} audio plugin company. What effect plugins do they make? What is their website? Give a 2-3 sentence company description. List their most popular effect plugins (NOT synths/instruments) with the effect category for each (EQ, compressor, reverb, delay, saturation, modulation, limiter, etc.).`;
  
  try {
    const result = await exa.answer(query, { text: true });
    if (!result.answer) return null;
    
    const answer = result.answer;
    
    // Check if it's primarily an instrument company
    const effectWords = (answer.match(/\b(effect|eq|compressor|reverb|delay|saturat|limiter|filter|modulation|metering|noise.?reduc|channel.?strip|de.?esser)\b/gi) || []).length;
    const instrumentWords = (answer.match(/\b(synth|sampler|instrument|drum machine|piano|organ)\b/gi) || []).length;
    
    if (instrumentWords > effectWords && effectWords < 2) {
      return { rejected: true, reason: 'Primarily instrument company' };
    }
    
    // Extract description
    const sentences = answer.split(/(?<=[.!])\s+/).filter(s => 
      s.length > 20 && s.length < 300 && 
      !s.match(/\b(list|here are|following)\b/i)
    );
    const description = sentences.slice(0, 3).join(' ').trim()
      .replace(/\s*https?:\/\/\S+/g, '')
      .slice(0, 500);
    
    // Extract website
    const urlMatches = answer.match(/https?:\/\/[^\s"<>)]+/g) || [];
    let website = candidate.website;
    for (const url of urlMatches) {
      try {
        const u = new URL(url);
        if (!u.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/i) &&
            !u.hostname.match(/twitter|facebook|instagram|youtube|linkedin|wikipedia/i)) {
          website = `${u.protocol}//${u.hostname}`;
          break;
        }
      } catch {}
    }
    
    // Extract plugins from the answer
    const plugins = [];
    const lines = answer.split('\n');
    for (const line of lines) {
      // Look for plugin names in bullet points or numbered lists
      const pluginMatch = line.match(/[-•*]\s*\*?\*?([A-Z][A-Za-z0-9\s&.'()-]+?)\*?\*?\s*[-–—:]/);
      const numberedMatch = line.match(/\d+\.\s*\*?\*?([A-Z][A-Za-z0-9\s&.'()-]+?)\*?\*?\s*[-–—:]/);
      
      const match = pluginMatch || numberedMatch;
      if (match) {
        const pluginName = match[1].trim().replace(/\*+/g, '');
        if (pluginName.length >= 3 && pluginName.length <= 60 && !isInstrument(line)) {
          const category = detectCategory(line);
          plugins.push({
            name: pluginName,
            category,
            context: line.trim(),
          });
        }
      }
    }
    
    return {
      name: candidate.name,
      website: website || '',
      description,
      plugins,
    };
  } catch (err) {
    console.error(`   Enrich error: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Step 3: Discover plugins for a manufacturer
// ═══════════════════════════════════════════════════════════════

async function discoverPlugins(manufacturerName, website) {
  const query = `List all audio EFFECT plugins made by ${manufacturerName}. For each plugin, specify: name, effect type (EQ, compressor, limiter, reverb, delay, saturation, modulation, stereo-imaging, gate/expander, de-esser, filter, channel-strip, metering, noise-reduction), a one-sentence description, price (USD), and available formats (VST3, AU, AAX, CLAP). Do NOT include synths, samplers, instruments, or amp sims.`;
  
  try {
    const result = await exa.answer(query, { text: true });
    if (!result.answer) return [];
    
    const answer = result.answer;
    const plugins = [];
    
    // Parse structured data from the answer
    const sections = answer.split(/\n(?=\d+\.|[-•*]\s*\*?\*?[A-Z])/);
    
    for (const section of sections) {
      if (section.trim().length < 10) continue;
      if (isInstrument(section)) continue;
      
      // Try to extract plugin name
      const nameMatch = section.match(/(?:\d+\.\s*)?(?:\*\*)?([A-Za-z][A-Za-z0-9\s&.'()/-]+?)(?:\*\*)?\s*[-–—:]/);
      if (!nameMatch) continue;
      
      const name = nameMatch[1].trim().replace(/\*+/g, '');
      if (name.length < 2 || name.length > 60) continue;
      
      // Detect category
      const category = detectCategory(section);
      
      // Extract description
      const descSentences = section.split(/[.!]/).filter(s => 
        s.trim().length > 20 && s.trim().length < 200 &&
        !s.match(/\b(price|format|available|platform)\b/i)
      );
      const description = descSentences.length > 0 
        ? descSentences[0].trim() + '.'
        : '';
      
      // Extract price
      const priceMatch = section.match(/\$(\d+(?:\.\d{2})?)/);
      const msrp = priceMatch ? Math.round(parseFloat(priceMatch[1]) * 100) : undefined;
      const isFree = /\bfree\b/i.test(section);
      
      // Extract formats
      const fmtMatches = section.match(/\b(VST3?|AU|AAX|CLAP|Standalone)\b/gi);
      const formats = fmtMatches ? [...new Set(fmtMatches.map(f => f.toUpperCase()))] : [];
      
      // Extract platforms
      const platforms = [];
      if (/windows|win|pc/i.test(section)) platforms.push('windows');
      if (/mac|macos/i.test(section)) platforms.push('mac');
      if (/linux/i.test(section)) platforms.push('linux');
      
      // Build tags
      const tags = [];
      if (/analog|vintage/i.test(section)) tags.push('analog-modeling');
      if (/mastering/i.test(section)) tags.push('mastering');
      if (/mixing/i.test(section)) tags.push('mixing');
      if (isFree) tags.push('free');
      if (/creative/i.test(section)) tags.push('creative');
      
      plugins.push({
        name,
        category,
        description,
        shortDescription: description,
        msrp,
        isFree: isFree || false,
        formats,
        platforms,
        tags,
        productUrl: website ? `${website}` : '',
      });
    }
    
    return plugins;
  } catch (err) {
    console.error(`   Plugin discovery error: ${err.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// Save to Convex
// ═══════════════════════════════════════════════════════════════

async function saveManufacturer(data) {
  const slug = slugify(data.name);
  
  try {
    const id = await client.mutation('manufacturers:upsertBySlug', {
      slug,
      name: data.name,
      website: data.website || '',
      description: data.description,
    });
    return id;
  } catch (err) {
    console.error(`   Save manufacturer error: ${err.message}`);
    return null;
  }
}

async function savePlugin(pluginData, manufacturerName) {
  const slug = slugify(`${manufacturerName}-${pluginData.name}`);
  
  try {
    const result = await client.mutation('agentEnrich:upsertPluginEnrichment', {
      slug,
      name: pluginData.name,
      manufacturer: manufacturerName,
      category: pluginData.category || 'utility',
      description: pluginData.description,
      shortDescription: pluginData.shortDescription,
      formats: pluginData.formats || [],
      platforms: pluginData.platforms || [],
      msrp: pluginData.msrp,
      isFree: pluginData.isFree || false,
      tags: pluginData.tags || [],
      productUrl: pluginData.productUrl || '',
    });
    return result;
  } catch (err) {
    // Might fail if it's detected as instrument etc.
    console.error(`   Save plugin error: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const mfrLimit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 20;
  const pluginLimit = parseInt(args.find(a => a.startsWith('--plugin-limit='))?.split('=')[1]) || 80;

  console.log('═══════════════════════════════════════════════');
  console.log('  Exa Manufacturer + Plugin Discovery');
  console.log('═══════════════════════════════════════════════');
  console.log(`Manufacturer limit: ${mfrLimit} | Plugin limit: ${pluginLimit}`);
  console.log(`Mode: ${dryRun ? '🏃 DRY RUN' : '⚡ LIVE'}`);
  console.log('');

  // 1. Get existing manufacturers
  console.log('📡 Fetching existing manufacturers...');
  const existingMfrs = await client.query('manufacturers:list', { limit: 200 });
  const existingNames = existingMfrs.map(m => m.name);
  console.log(`   Found ${existingMfrs.length} existing manufacturers`);
  console.log(`   Names: ${existingNames.join(', ')}\n`);

  // 2. Get existing plugin slugs to avoid duplicates
  const existingPlugins = await client.query('agentEnrich:listEnrichedPlugins', { limit: 5000 });
  const existingPluginSlugs = new Set(existingPlugins.map(p => p.slug));
  console.log(`   Found ${existingPluginSlugs.size} existing plugins\n`);

  // 3. Discover new manufacturers
  console.log('🌐 Discovering new manufacturers...\n');
  const candidates = await discoverManufacturers(existingNames);
  console.log(`\n🎯 Found ${candidates.length} new manufacturer candidates\n`);

  const stats = {
    newManufacturers: 0,
    newPlugins: 0,
    rejected: 0,
    errors: 0,
    duplicatePlugins: 0,
  };

  let totalPlugins = 0;
  let processedMfrs = 0;

  for (const candidate of candidates) {
    if (processedMfrs >= mfrLimit) break;
    if (totalPlugins >= pluginLimit) {
      console.log(`\n⚠️  Plugin limit (${pluginLimit}) reached, stopping.`);
      break;
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`🏢 Validating: ${candidate.name}`);
    if (candidate.website) console.log(`   🌐 ${candidate.website}`);

    // Validate and enrich
    const enriched = await enrichNewManufacturer(candidate);
    await sleep(1000);

    if (!enriched) {
      console.log(`   ⚠️  Could not validate, skipping`);
      stats.errors++;
      processedMfrs++;
      continue;
    }

    if (enriched.rejected) {
      console.log(`   ⛔ Rejected: ${enriched.reason}`);
      stats.rejected++;
      processedMfrs++;
      continue;
    }

    if (!enriched.website) {
      console.log(`   ⚠️  No website found, skipping`);
      stats.errors++;
      processedMfrs++;
      continue;
    }

    console.log(`   ✅ Validated: ${enriched.name}`);
    console.log(`   📝 ${enriched.description?.slice(0, 100)}...`);
    console.log(`   📦 ${enriched.plugins.length} plugins found in initial search`);

    // Save manufacturer
    if (!dryRun) {
      const mfrId = await saveManufacturer(enriched);
      if (mfrId) {
        console.log(`   💾 Manufacturer saved`);
        stats.newManufacturers++;
      } else {
        stats.errors++;
        processedMfrs++;
        continue;
      }
    } else {
      console.log(`   🏃 [DRY RUN] Would create manufacturer: ${enriched.name}`);
      stats.newManufacturers++;
    }

    // Discover more plugins via dedicated search
    console.log(`   🔍 Discovering plugins for ${enriched.name}...`);
    const discoveredPlugins = await discoverPlugins(enriched.name, enriched.website);
    await sleep(1000);

    // Merge with initial plugins (dedup by name)
    const allPlugins = [...enriched.plugins];
    const seenNames = new Set(allPlugins.map(p => p.name.toLowerCase()));
    for (const dp of discoveredPlugins) {
      if (!seenNames.has(dp.name.toLowerCase())) {
        seenNames.add(dp.name.toLowerCase());
        allPlugins.push(dp);
      }
    }

    console.log(`   📦 Total unique plugins: ${allPlugins.length}`);

    // Save plugins
    for (const plugin of allPlugins) {
      if (totalPlugins >= pluginLimit) break;

      const slug = slugify(`${enriched.name}-${plugin.name}`);
      
      if (existingPluginSlugs.has(slug)) {
        console.log(`      ⏭️  ${plugin.name} — already exists`);
        stats.duplicatePlugins++;
        continue;
      }

      if (dryRun) {
        console.log(`      🏃 [DRY RUN] ${plugin.name} (${plugin.category})`);
        stats.newPlugins++;
      } else {
        const result = await savePlugin(plugin, enriched.name);
        if (result) {
          console.log(`      ✅ ${plugin.name} (${plugin.category}) — ${result.isNew ? 'created' : 'updated'}`);
          stats.newPlugins++;
          existingPluginSlugs.add(slug);
        } else {
          console.log(`      ❌ ${plugin.name} — save failed`);
          stats.errors++;
        }
      }

      totalPlugins++;
      await sleep(300);
    }

    processedMfrs++;
  }

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📋 DISCOVERY SUMMARY');
  console.log('═'.repeat(50));
  console.log(`🏢 New manufacturers: ${stats.newManufacturers}`);
  console.log(`📦 New plugins: ${stats.newPlugins}`);
  console.log(`⏭️  Duplicate plugins: ${stats.duplicatePlugins}`);
  console.log(`⛔ Rejected (instrument companies): ${stats.rejected}`);
  console.log(`❌ Errors: ${stats.errors}`);

  if (dryRun) {
    console.log('\n⚠️  This was a DRY RUN. No changes were made.');
  }

  return stats;
}

main().catch(err => {
  console.error('💥 Fatal error:', err.message);
  process.exit(1);
});
