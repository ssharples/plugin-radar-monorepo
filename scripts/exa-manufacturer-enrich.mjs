#!/usr/bin/env node
/**
 * Exa Manufacturer Enrichment Script v2
 * 
 * Enriches manufacturer data using Exa:
 * - Description (2-3 sentences, mentioning popular plugins from our DB)
 * - Website URL
 * - Logo URL (from og:image, favicon, etc.)
 * 
 * Also uploads logos to Convex storage via the storage:uploadFromUrl action.
 * 
 * Usage:
 *   node scripts/exa-manufacturer-enrich.mjs
 *   node scripts/exa-manufacturer-enrich.mjs --limit=5 --dry-run
 *   node scripts/exa-manufacturer-enrich.mjs --logos-only
 *   node scripts/exa-manufacturer-enrich.mjs --all (include already-enriched)
 */

import Exa from 'exa-js';
import { ConvexHttpClient } from 'convex/browser';
import fs from 'fs';
import path from 'path';

// Load credentials
const credPath = path.join(process.env.HOME, '.credentials/exa/credentials.json');
const { apiKey } = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
const exa = new Exa(apiKey);

const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const client = new ConvexHttpClient(CONVEX_URL);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════
// Exa Search: Company info
// ═══════════════════════════════════════════════════════════════

async function searchCompanyInfo(name, website, popularPlugins) {
  const pluginContext = popularPlugins.length > 0
    ? ` Known for plugins like ${popularPlugins.slice(0, 5).join(', ')}.`
    : '';
  
  const query = `What is ${name}? ${name} is an audio plugin company.${pluginContext} Give me: 1) A 2-3 sentence description of the company (who they are, what they're known for, their specialty). 2) Their official website URL. 3) A URL to their company logo image.`;

  try {
    const result = await exa.answer(query, { text: true });
    if (!result.answer) return null;
    
    const answer = result.answer;
    
    const extracted = {};
    
    // Extract description — take first 2-3 sentences that describe the company
    const sentences = answer.split(/(?<=[.!])\s+/).filter(s => s.length > 20 && s.length < 300);
    if (sentences.length > 0) {
      // Find sentences about the company (not about logos or URLs)
      const descSentences = sentences.filter(s => 
        !s.match(/\b(logo|favicon|image url|http)/i) &&
        (s.match(/\b(company|founded|known|specializ|develop|create|produc|audio|plugin|effect|studio|professional|software)\b/i))
      ).slice(0, 3);
      
      if (descSentences.length > 0) {
        extracted.description = descSentences.join(' ').trim();
      } else {
        // Fallback: just take first 2-3 good sentences
        extracted.description = sentences.slice(0, 3).join(' ').trim();
      }
      
      // Clean up description — remove URL mentions, logo references
      extracted.description = extracted.description
        .replace(/\s*(?:Their|The)\s+(?:official\s+)?(?:website|logo|image|url)\s+(?:is|can be found at)\s*[:.]?\s*https?:\/\/\S+/gi, '')
        .replace(/\s*https?:\/\/\S+/g, '')
        .trim();
      
      // Cap at 500 chars
      if (extracted.description.length > 500) {
        extracted.description = extracted.description.slice(0, 497) + '...';
      }
    }
    
    // Extract website URL
    const urlMatches = answer.match(/https?:\/\/[^\s"<>)]+/g) || [];
    for (const url of urlMatches) {
      try {
        const u = new URL(url);
        // Skip image URLs and social media
        if (u.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/i)) continue;
        if (u.hostname.match(/twitter|facebook|instagram|youtube|linkedin/i)) continue;
        // Likely the company website
        if (!extracted.website) {
          extracted.website = `${u.protocol}//${u.hostname}`;
        }
      } catch {}
    }
    
    // Extract logo URL
    for (let url of urlMatches) {
      // Clean markdown artifacts like "url](url" or trailing brackets
      url = url.replace(/\]\(.*$/, '').replace(/[)\]]+$/, '');
      try {
        const u = new URL(url);
        if (u.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i) || url.includes('logo')) {
          extracted.logoUrl = url;
          break;
        }
      } catch {}
    }
    
    return extracted;
  } catch (err) {
    console.error(`  Exa Answer error: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Logo Discovery: Try multiple approaches
// ═══════════════════════════════════════════════════════════════

async function findLogoUrl(name, website) {
  // Approach 1: Search for logo directly
  try {
    const results = await exa.searchAndContents(`${name} audio plugin company logo`, {
      type: 'auto',
      numResults: 5,
      text: { maxCharacters: 500 },
    });
    
    for (const r of results.results) {
      // Check if the result URL itself is an image
      if (r.url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
        return r.url;
      }
      // Check text for image URLs
      const imgUrls = (r.text || '').match(/https?:\/\/[^\s"<>)]+\.(png|jpg|jpeg|gif|webp)[^\s"<>)]*/) || [];
      if (imgUrls[0]) return imgUrls[0];
    }
  } catch (err) {
    console.error(`  Logo search error: ${err.message}`);
  }
  
  // Approach 2: Try common logo paths on the website
  if (website) {
    const domain = new URL(website).origin;
    const commonPaths = [
      '/favicon.ico',
      '/logo.png',
      '/logo.svg',
      '/images/logo.png',
      '/img/logo.png',
      '/assets/logo.png',
      '/apple-touch-icon.png',
      '/apple-touch-icon-precomposed.png',
    ];
    
    for (const logoPath of commonPaths) {
      try {
        const logoUrl = domain + logoPath;
        const resp = await fetch(logoUrl, { method: 'HEAD', redirect: 'follow' });
        if (resp.ok) {
          const contentType = resp.headers.get('content-type') || '';
          if (contentType.includes('image') || logoPath.endsWith('.ico')) {
            return logoUrl;
          }
        }
      } catch {}
    }
  }
  
  // Approach 3: Try Clearbit logo API (free, no auth needed for most companies)
  if (website) {
    try {
      const domain = new URL(website).hostname;
      const clearbitUrl = `https://logo.clearbit.com/${domain}`;
      const resp = await fetch(clearbitUrl, { method: 'HEAD' });
      if (resp.ok) return clearbitUrl;
    } catch {}
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Logo Upload: Upload to Convex storage
// ═══════════════════════════════════════════════════════════════

async function uploadLogoToConvex(manufacturerId, logoUrl) {
  try {
    // Use the storage:uploadFromUrl action
    const result = await client.action('storage:uploadFromUrl', {
      url: logoUrl,
      manufacturerId: manufacturerId,
    });
    return result;
  } catch (err) {
    console.error(`  Logo upload error: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Get popular plugins for each manufacturer
// ═══════════════════════════════════════════════════════════════

async function getManufacturerPlugins(manufacturerId) {
  try {
    const result = await client.query('plugins:list', { limit: 1000 });
    const plugins = (result.items || result).filter(p => p.manufacturer === manufacturerId);
    
    // Sort by mention score or name
    plugins.sort((a, b) => (b.mentionScore || 0) - (a.mentionScore || 0));
    
    return plugins.map(p => p.name);
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 50;
  const dryRun = args.includes('--dry-run');
  const logosOnly = args.includes('--logos-only');
  const enrichAll = args.includes('--all');

  console.log('═══════════════════════════════════════════════');
  console.log('  Exa Manufacturer Enrichment v2');
  console.log('═══════════════════════════════════════════════');
  console.log(`Limit: ${limit} | Dry run: ${dryRun} | Logos only: ${logosOnly} | All: ${enrichAll}`);
  console.log('');

  // 1. Get all manufacturers
  const allManufacturers = await client.query('manufacturers:list', { limit: 100 });
  console.log(`📋 Total manufacturers: ${allManufacturers.length}`);

  // 2. Filter to those needing work
  let manufacturers;
  if (logosOnly) {
    manufacturers = allManufacturers.filter(m => !m.logoUrl && !m.logoStorageId);
    console.log(`🖼️  Missing logos: ${manufacturers.length}`);
  } else if (enrichAll) {
    manufacturers = allManufacturers;
    console.log(`🔄 Processing all: ${manufacturers.length}`);
  } else {
    manufacturers = allManufacturers.filter(m => 
      !m.description || m.description.length < 50 || !m.logoUrl
    );
    console.log(`⚡ Need enrichment: ${manufacturers.length}`);
  }

  manufacturers = manufacturers.slice(0, limit);
  console.log(`📊 Processing: ${manufacturers.length}\n`);

  const stats = { enriched: 0, logos: 0, uploaded: 0, failed: 0, skipped: 0 };

  for (const mfr of manufacturers) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`🏢 ${mfr.name} (${mfr.website})`);
    
    const updates = {};
    
    // === DESCRIPTION ENRICHMENT ===
    if (!logosOnly && (!mfr.description || mfr.description.length < 50 || enrichAll)) {
      // Get this manufacturer's plugins from our DB
      const plugins = await getManufacturerPlugins(mfr._id);
      console.log(`   📦 Plugins in DB: ${plugins.length} (${plugins.slice(0, 5).join(', ')}${plugins.length > 5 ? '...' : ''})`);
      
      const info = await searchCompanyInfo(mfr.name, mfr.website, plugins);
      await sleep(800);
      
      if (info) {
        if (info.description && info.description.length > 50) {
          // Include popular plugins in description if we have them
          let desc = info.description;
          if (plugins.length > 0 && !desc.includes(plugins[0])) {
            const topPlugins = plugins.slice(0, 3).join(', ');
            desc += ` Notable products include ${topPlugins}.`;
          }
          updates.description = desc;
          console.log(`   ✅ Description: ${desc.length} chars`);
        }
        if (info.website && (!mfr.website || mfr.website.length < 5)) {
          updates.website = info.website;
          console.log(`   ✅ Website: ${info.website}`);
        }
        if (info.logoUrl) {
          updates.logoUrl = info.logoUrl;
          console.log(`   ✅ Logo URL from Exa: ${info.logoUrl}`);
        }
      } else {
        console.log(`   ⚠️  No Exa results`);
      }
    }
    
    // === LOGO DISCOVERY ===
    if (!updates.logoUrl && !mfr.logoUrl && !mfr.logoStorageId) {
      console.log(`   🔍 Searching for logo...`);
      const logoUrl = await findLogoUrl(mfr.name, mfr.website);
      await sleep(500);
      
      if (logoUrl) {
        updates.logoUrl = logoUrl;
        console.log(`   ✅ Logo found: ${logoUrl}`);
      } else {
        console.log(`   ⚠️  No logo found`);
      }
    }
    
    // === APPLY UPDATES ===
    if (Object.keys(updates).length > 0) {
      if (dryRun) {
        console.log(`   🏃 [DRY RUN] Would update:`, JSON.stringify(updates, null, 2));
        stats.enriched++;
      } else {
        try {
          await client.mutation('manufacturers:update', {
            id: mfr._id,
            ...updates,
          });
          console.log(`   💾 Updated in Convex`);
          stats.enriched++;
        } catch (err) {
          console.error(`   ❌ Update error: ${err.message}`);
          stats.failed++;
        }
      }
      
      if (updates.logoUrl) stats.logos++;
      
      // === LOGO UPLOAD TO CONVEX STORAGE ===
      if (updates.logoUrl && !dryRun && !mfr.logoStorageId) {
        console.log(`   📤 Uploading logo to Convex storage...`);
        try {
          const uploadResult = await uploadLogoToConvex(mfr._id, updates.logoUrl);
          if (uploadResult) {
            console.log(`   ✅ Logo uploaded to storage`);
            stats.uploaded++;
          }
        } catch (err) {
          console.error(`   ⚠️  Logo upload failed (external URL saved): ${err.message}`);
        }
      }
    } else {
      console.log(`   ⏭️  Already enriched, skipping`);
      stats.skipped++;
    }
    
    // Rate limiting
    await sleep(500);
  }

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📋 ENRICHMENT SUMMARY');
  console.log('═'.repeat(50));
  console.log(`✅ Enriched: ${stats.enriched}`);
  console.log(`🖼️  Logos found: ${stats.logos}`);
  console.log(`📤 Logos uploaded to storage: ${stats.uploaded}`);
  console.log(`⏭️  Skipped: ${stats.skipped}`);
  console.log(`❌ Failed: ${stats.failed}`);
  
  if (dryRun) {
    console.log('\n⚠️  This was a DRY RUN. No changes were made.');
  }
  
  return stats;
}

main().catch(err => {
  console.error('💥 Fatal error:', err.message);
  process.exit(1);
});
