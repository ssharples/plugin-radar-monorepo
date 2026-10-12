#!/usr/bin/env node
/**
 * Exa Manufacturer + Plugin Discovery Script v2
 * 
 * Uses a hybrid approach:
 * 1. Ask Exa for a flat list of audio effect plugin companies
 * 2. Cross-reference against existing DB
 * 3. For each new company, discover their plugins
 * 
 * Usage:
 *   node scripts/exa-discover-manufacturers-v2.mjs --dry-run
 *   node scripts/exa-discover-manufacturers-v2.mjs --limit=15
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

const INSTRUMENT_KEYWORDS = [
  'synthesizer', 'synth', 'sampler', 'drum machine', 'rompler',
  'virtual instrument', 'sample library', 'kontakt', 'wavetable',
  'amp sim', 'amp modeler', 'guitar amp', 'cabinet sim', 'amp simulator'
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
// Discover manufacturers using multiple targeted Exa queries
// ═══════════════════════════════════════════════════════════════

async function discoverManufacturerNames(existingNamesLower) {
  const queries = [
    'List 30 companies that make professional audio effect plugins for mixing and mastering. Include their website URL. Only include companies that make EFFECTS (EQ, compressor, reverb, delay, saturation, modulation, limiter, metering, noise reduction, de-esser, gate, filter). Do NOT include synth/instrument companies.',
    'List 20 indie and boutique audio plugin companies that make mixing/mastering effect plugins. Include company name and website. Focus on lesser-known companies, not the big names like Waves, FabFilter, iZotope.',
    'What are some audio plugin companies known for creative effects? Companies making delay, reverb, modulation, saturation, or filter plugins. List their names and websites.',
  ];

  const allCompanies = new Map();

  for (const query of queries) {
    console.log(`🔍 Asking Exa...`);
    try {
      const result = await exa.answer(query, { text: true });
      if (!result.answer) continue;

      // Parse: look for company names with various formats
      const answer = result.answer;
      const lines = answer.split('\n');
      
      for (const line of lines) {
        if (line.trim().length < 5) continue;
        
        // Try numbered list: "1. CompanyName - description"
        // or bullet: "- **CompanyName** — description" 
        // or just "CompanyName (website.com)"
        const patterns = [
          /^\s*\d+[\.\)]\s*\*?\*?([A-Z][A-Za-z0-9\s&.'()\/-]+?)\*?\*?\s*[-–—:\(]/,
          /^\s*[-•*]\s*\*?\*?([A-Z][A-Za-z0-9\s&.'()\/-]+?)\*?\*?\s*[-–—:\(]/,
          /\*\*([A-Z][A-Za-z0-9\s&.'()\/-]+?)\*\*/,
        ];
        
        let companyName = null;
        for (const p of patterns) {
          const m = line.match(p);
          if (m) {
            companyName = m[1].trim().replace(/\*+/g, '').replace(/\s+/g, ' ');
            break;
          }
        }
        
        if (!companyName || companyName.length < 2 || companyName.length > 50) continue;
        
        // Skip known names
        const lower = companyName.toLowerCase();
        if (existingNamesLower.has(lower)) continue;
        // Also check partial matches
        let isExisting = false;
        for (const en of existingNamesLower) {
          if (en.includes(lower) || lower.includes(en)) { isExisting = true; break; }
        }
        if (isExisting) continue;
        
        // Skip obvious non-companies
        if (lower.match(/^(the|and|or|for|with|best|top|new|free|note|here|some|these|many|other|also)/)) continue;
        
        // Extract URL from line
        const urlMatch = line.match(/https?:\/\/[^\s"<>)\]]+/);
        let website = '';
        if (urlMatch) {
          website = urlMatch[0].replace(/[).,;\]]+$/, '').replace(/\]\(.*$/, '');
          try { website = new URL(website).origin; } catch {}
        }
        
        if (!allCompanies.has(lower)) {
          allCompanies.set(lower, { name: companyName, website, context: line.trim() });
          console.log(`   📌 ${companyName}${website ? ' (' + website + ')' : ''}`);
        }
      }
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
    await sleep(1000);
  }

  return Array.from(allCompanies.values());
}

// ═══════════════════════════════════════════════════════════════
// Enrich manufacturer with description + website
// ═══════════════════════════════════════════════════════════════

async function enrichManufacturer(name, website) {
  const query = `Tell me about ${name} the audio plugin company. Give me: 1) Their official website URL. 2) A 2-3 sentence description focusing on what audio effects they make. 3) Are they primarily an effects company or instrument/synth company?`;
  
  try {
    const result = await exa.answer(query, { text: true });
    if (!result.answer) return null;
    const answer = result.answer;
    
    // Check if primarily instrument company
    if (/primarily.*(instrument|synth)|mainly.*(instrument|synth)|known for.*(synth|sampler|instrument)/i.test(answer)) {
      if (!/also.*(effect|eq|compressor|reverb|delay)/i.test(answer)) {
        return { rejected: true, reason: 'Primarily instrument company' };
      }
    }
    
    // Extract description
    const sentences = answer.split(/(?<=[.!])\s+/).filter(s => 
      s.length > 20 && s.length < 400 && 
      !s.match(/\b(their website|url|http)\b/i)
    );
    const description = sentences.slice(0, 3).join(' ').replace(/\s*https?:\/\/\S+/g, '').trim().slice(0, 500);
    
    // Extract website
    if (!website) {
      const urlMatches = answer.match(/https?:\/\/[^\s"<>)\]]+/g) || [];
      for (let url of urlMatches) {
        url = url.replace(/[).,;\]]+$/, '').replace(/\]\(.*$/, '');
        try {
          const u = new URL(url);
          if (!u.hostname.match(/twitter|facebook|instagram|youtube|linkedin|wikipedia/i)) {
            website = u.origin;
            break;
          }
        } catch {}
      }
    }
    
    return { name, website: website || '', description };
  } catch (err) {
    console.error(`   Error: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Discover effect plugins for a manufacturer
// ═══════════════════════════════════════════════════════════════

async function discoverPluginsForManufacturer(name, website) {
  const query = `List all audio EFFECT plugins made by ${name}. For each one, give: plugin name, effect category (EQ/compressor/limiter/reverb/delay/saturation/modulation/stereo-imaging/gate-expander/de-esser/filter/channel-strip/metering/noise-reduction/multiband/utility), and a one-line description. Do NOT include synths, samplers, instruments, or amp sims. Only effects.`;
  
  try {
    const result = await exa.answer(query, { text: true });
    if (!result.answer) return [];
    
    const answer = result.answer;
    const plugins = [];
    const lines = answer.split('\n');
    
    for (const line of lines) {
      if (line.trim().length < 10) continue;
      if (isInstrument(line)) continue;
      
      // Try to extract plugin name from list items
      const namePatterns = [
        /^\s*\d+[\.\)]\s*\*?\*?([A-Za-z][A-Za-z0-9\s&.'()\/+-]+?)\*?\*?\s*[-–—:]/,
        /^\s*[-•*]\s*\*?\*?([A-Za-z][A-Za-z0-9\s&.'()\/+-]+?)\*?\*?\s*[-–—:]/,
        /\*\*([A-Za-z][A-Za-z0-9\s&.'()\/+-]+?)\*\*/,
      ];
      
      let pluginName = null;
      for (const p of namePatterns) {
        const m = line.match(p);
        if (m) {
          pluginName = m[1].trim().replace(/\*+/g, '');
          break;
        }
      }
      
      if (!pluginName || pluginName.length < 2 || pluginName.length > 60) continue;
      
      const category = detectCategory(line);
      
      // Extract description — text after the name/colon
      let description = line.replace(/^\s*[\d\.\)\-•*]+\s*/, '').replace(/\*\*/g, '');
      const colonIdx = description.indexOf(':');
      const dashIdx = description.indexOf('–');
      const cutIdx = Math.min(colonIdx > 0 ? colonIdx : 999, dashIdx > 0 ? dashIdx : 999);
      if (cutIdx < 999) {
        description = description.slice(cutIdx + 1).trim();
      }
      if (description.length > 200) description = description.slice(0, 197) + '...';
      
      // Extract price
      const priceMatch = line.match(/\$(\d+(?:\.\d{2})?)/);
      const msrp = priceMatch ? Math.round(parseFloat(priceMatch[1]) * 100) : undefined;
      const isFree = /\bfree\b/i.test(line);
      
      // Tags
      const tags = [];
      if (/analog|vintage/i.test(line)) tags.push('analog-modeling');
      if (/mastering/i.test(line)) tags.push('mastering');
      if (/mixing/i.test(line)) tags.push('mixing');
      if (isFree) tags.push('free');
      if (/creative/i.test(line)) tags.push('creative');
      
      plugins.push({
        name: pluginName,
        category,
        description: description || `${pluginName} by ${name}`,
        shortDescription: description ? description.split('.')[0] + '.' : `${pluginName} by ${name}.`,
        msrp,
        isFree: isFree || false,
        formats: [],
        platforms: [],
        tags,
        productUrl: website || '',
      });
    }
    
    return plugins;
  } catch (err) {
    console.error(`   Plugin discovery error: ${err.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const mfrLimit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 15;

  console.log('═══════════════════════════════════════════════');
  console.log('  Manufacturer + Plugin Discovery v2');
  console.log('═══════════════════════════════════════════════');
  console.log(`Mode: ${dryRun ? '🏃 DRY RUN' : '⚡ LIVE'}`);
  console.log(`Manufacturer limit: ${mfrLimit}\n`);

  // Get existing
  const existingMfrs = await client.query('manufacturers:list', { limit: 200 });
  const existingNamesLower = new Set(existingMfrs.map(m => m.name.toLowerCase()));
  console.log(`📋 Existing manufacturers: ${existingMfrs.length}\n`);

  const existingPlugins = await client.query('agentEnrich:listEnrichedPlugins', { limit: 5000 });
  const existingPluginSlugs = new Set(existingPlugins.map(p => p.slug));
  console.log(`📋 Existing plugins: ${existingPluginSlugs.size}\n`);

  // Discover
  console.log('🌐 Discovering new manufacturers...\n');
  const candidates = await discoverManufacturerNames(existingNamesLower);
  console.log(`\n🎯 Found ${candidates.length} new candidates\n`);

  const stats = { newMfrs: 0, newPlugins: 0, rejected: 0, errors: 0 };
  let processed = 0;

  for (const candidate of candidates) {
    if (processed >= mfrLimit) break;

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`🏢 ${candidate.name}${candidate.website ? ' (' + candidate.website + ')' : ''}`);

    // Enrich manufacturer
    const info = await enrichManufacturer(candidate.name, candidate.website);
    await sleep(800);

    if (!info) {
      console.log(`   ⚠️  Could not enrich, skipping`);
      stats.errors++;
      processed++;
      continue;
    }

    if (info.rejected) {
      console.log(`   ⛔ Rejected: ${info.reason}`);
      stats.rejected++;
      processed++;
      continue;
    }

    console.log(`   ✅ ${info.description?.slice(0, 100)}...`);
    console.log(`   🌐 Website: ${info.website}`);

    // Save manufacturer
    if (!dryRun) {
      try {
        const slug = slugify(info.name);
        await client.mutation('manufacturers:upsertBySlug', {
          slug,
          name: info.name,
          website: info.website,
          description: info.description,
        });
        console.log(`   💾 Manufacturer saved`);
        stats.newMfrs++;
      } catch (err) {
        console.log(`   ❌ Save error: ${err.message?.slice(0, 80)}`);
        stats.errors++;
        processed++;
        continue;
      }
    } else {
      console.log(`   🏃 [DRY RUN] Would create: ${info.name}`);
      stats.newMfrs++;
    }

    // Discover plugins
    console.log(`   🔍 Discovering plugins...`);
    const plugins = await discoverPluginsForManufacturer(info.name, info.website);
    await sleep(800);

    console.log(`   📦 Found ${plugins.length} effect plugins`);

    for (const plugin of plugins) {
      const slug = slugify(`${info.name}-${plugin.name}`);
      if (existingPluginSlugs.has(slug)) {
        console.log(`      ⏭️  ${plugin.name} — exists`);
        continue;
      }

      if (dryRun) {
        console.log(`      🏃 ${plugin.name} (${plugin.category})`);
      } else {
        try {
          const result = await client.mutation('agentEnrich:upsertPluginEnrichment', {
            slug,
            name: plugin.name,
            manufacturer: info.name,
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
        } catch (err) {
          console.log(`      ❌ ${plugin.name}: ${err.message?.slice(0, 60)}`);
          stats.errors++;
          continue;
        }
      }
      stats.newPlugins++;
      await sleep(200);
    }

    processed++;
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📋 DISCOVERY SUMMARY');
  console.log('═'.repeat(50));
  console.log(`🏢 New manufacturers: ${stats.newMfrs}`);
  console.log(`📦 New plugins: ${stats.newPlugins}`);
  console.log(`⛔ Rejected: ${stats.rejected}`);
  console.log(`❌ Errors: ${stats.errors}`);
  if (dryRun) console.log('\n⚠️  DRY RUN — no changes made.');

  return stats;
}

main().catch(err => {
  console.error('💥 Fatal:', err.message);
  process.exit(1);
});
