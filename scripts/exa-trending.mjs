#!/usr/bin/env node
/**
 * Exa Trending Scorer
 * Calculates trending scores for plugins based on recent web mentions
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

// Calculate date strings for filtering
function getDateString(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

// Search for plugin mentions in a time window
async function searchMentions(pluginName, manufacturerName, daysBack) {
  const query = `"${pluginName}" ${manufacturerName} plugin`;
  const startDate = getDateString(daysBack);
  
  try {
    const results = await exa.search(query, {
      type: 'auto',
      numResults: 50, // Get up to 50 results
      startPublishedDate: startDate,
      excludeDomains: [
        // Exclude aggregators and our own potential site
        'pluginradar.com',
        'kvraudio.com', // Too many generic listings
      ]
    });
    
    return results.results || [];
  } catch (err) {
    if (err.message?.includes('rate limit')) {
      console.log('  Rate limited, waiting 5s...');
      await new Promise(r => setTimeout(r, 5000));
      return searchMentions(pluginName, manufacturerName, daysBack);
    }
    console.error(`  Search error: ${err.message}`);
    return [];
  }
}

// Calculate trending score
// Score = (7d mentions * 5) + (30d mentions * 1) + engagement bonus
function calculateTrendingScore(mentions7d, mentions30d, engagementBonus = 0) {
  // Weight recent mentions more heavily
  const score = (mentions7d.length * 5) + (mentions30d.length * 1) + engagementBonus;
  return Math.round(score);
}

// Analyze mention quality and extract engagement signals
function analyzeMentions(mentions) {
  let engagementBonus = 0;
  const sources = new Set();
  
  for (const mention of mentions) {
    const url = mention.url?.toLowerCase() || '';
    
    // Bonus for high-authority sources
    if (url.includes('youtube.com')) engagementBonus += 3;
    if (url.includes('reddit.com')) engagementBonus += 2;
    if (url.includes('musicradar.com')) engagementBonus += 2;
    if (url.includes('soundonsound.com')) engagementBonus += 2;
    if (url.includes('gearslutz.com') || url.includes('gearspace.com')) engagementBonus += 2;
    if (url.includes('producerhive.com')) engagementBonus += 1;
    if (url.includes('plugin-alliance.com')) engagementBonus += 1;
    if (url.includes('twitter.com') || url.includes('x.com')) engagementBonus += 1;
    
    // Track unique sources
    try {
      const domain = new URL(mention.url).hostname.replace('www.', '');
      sources.add(domain);
    } catch {}
  }
  
  // Diversity bonus - more sources = more trending
  engagementBonus += sources.size * 2;
  
  return { engagementBonus, sourceCount: sources.size };
}

// Store mentions in the database for later analysis
async function storeMentions(pluginId, mentions, platform = 'web') {
  const now = Date.now();
  
  for (const mention of mentions.slice(0, 10)) { // Store top 10
    try {
      await client.mutation('mentions:create', {
        plugin: pluginId,
        platform,
        sourceUrl: mention.url,
        sourceId: mention.id || mention.url,
        title: mention.title?.slice(0, 200),
        snippet: mention.text?.slice(0, 500),
        author: mention.author,
        publishedAt: mention.publishedDate ? new Date(mention.publishedDate).getTime() : now,
      });
    } catch (err) {
      // Ignore errors - the mutation handles duplicates
      if (err.message?.includes('rate') || err.message?.includes('limit')) {
        console.error(`  Store mention error: ${err.message}`);
      }
    }
  }
}

// Update plugin trending score
async function updatePluginTrending(pluginId, mentions7d, mentions30d, score) {
  try {
    await client.mutation('plugins:update', {
      id: pluginId,
      mentionCount7d: mentions7d.length,
      mentionCount30d: mentions30d.length,
      mentionScore: score,
      lastMentionScan: Date.now(),
    });
    return true;
  } catch (err) {
    console.error(`  Update error: ${err.message}`);
    return false;
  }
}

// Score a single plugin
async function scorePlugin(plugin, manufacturer, options = {}) {
  const { storeMentionsData = false, verbose = false } = options;
  
  console.log(`\nScoring: ${plugin.name} (${manufacturer.name})`);
  
  // Skip if recently scanned (within 24h)
  if (plugin.lastMentionScan) {
    const hoursSinceLastScan = (Date.now() - plugin.lastMentionScan) / (1000 * 60 * 60);
    if (hoursSinceLastScan < 24) {
      console.log(`  Skipped - scanned ${hoursSinceLastScan.toFixed(1)}h ago`);
      return null;
    }
  }
  
  // Search for 7-day mentions
  const mentions7d = await searchMentions(plugin.name, manufacturer.name, 7);
  await new Promise(r => setTimeout(r, 500)); // Rate limit protection
  
  // Search for 30-day mentions
  const mentions30d = await searchMentions(plugin.name, manufacturer.name, 30);
  
  // Analyze and score
  const analysis = analyzeMentions([...mentions7d, ...mentions30d]);
  const score = calculateTrendingScore(mentions7d, mentions30d, analysis.engagementBonus);
  
  if (verbose) {
    console.log(`  7d: ${mentions7d.length} | 30d: ${mentions30d.length} | sources: ${analysis.sourceCount} | score: ${score}`);
  } else {
    console.log(`  Score: ${score} (7d: ${mentions7d.length}, 30d: ${mentions30d.length})`);
  }
  
  // Store mentions if requested
  if (storeMentionsData && mentions7d.length > 0) {
    await storeMentions(plugin._id, mentions7d);
  }
  
  // Update plugin
  await updatePluginTrending(plugin._id, mentions7d, mentions30d, score);
  
  return { score, mentions7d: mentions7d.length, mentions30d: mentions30d.length };
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 20;
  const storeMentionsData = args.includes('--store-mentions');
  const verbose = args.includes('--verbose');
  const sortBy = args.find(a => a.startsWith('--sort='))?.split('=')[1] || 'oldest'; // oldest, random, popular
  const manufacturerFilter = args.find(a => a.startsWith('--manufacturer='))?.split('=')[1];
  const minScore = parseInt(args.find(a => a.startsWith('--min-score='))?.split('=')[1]) || 0;
  
  console.log('=== Exa Trending Scorer ===');
  console.log(`Limit: ${limit}`);
  console.log(`Sort: ${sortBy}`);
  console.log(`Store mentions: ${storeMentionsData}`);
  if (manufacturerFilter) console.log(`Manufacturer: ${manufacturerFilter}`);
  
  // Get all plugins
  const pluginResult = await client.query('plugins:list', { limit: 1000 });
  let plugins = pluginResult.items || pluginResult;
  
  // Get manufacturer lookup
  const manufacturers = await client.query('manufacturers:list', { limit: 100 });
  const mfrMap = Object.fromEntries(manufacturers.map(m => [m._id, m]));
  
  // Apply manufacturer filter
  if (manufacturerFilter) {
    const mfr = manufacturers.find(m => 
      m.slug === manufacturerFilter || 
      m.name.toLowerCase().includes(manufacturerFilter.toLowerCase())
    );
    if (mfr) {
      plugins = plugins.filter(p => p.manufacturer === mfr._id);
    }
  }
  
  // Sort plugins
  if (sortBy === 'oldest') {
    // Prioritize plugins never scanned or oldest scanned
    plugins.sort((a, b) => (a.lastMentionScan || 0) - (b.lastMentionScan || 0));
  } else if (sortBy === 'random') {
    plugins.sort(() => Math.random() - 0.5);
  } else if (sortBy === 'popular') {
    // Score popular plugins first (those with existing scores)
    plugins.sort((a, b) => (b.mentionScore || 0) - (a.mentionScore || 0));
  }
  
  plugins = plugins.slice(0, limit);
  
  console.log(`\nScoring ${plugins.length} plugins...\n`);
  
  const results = [];
  let scored = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const plugin of plugins) {
    const manufacturer = mfrMap[plugin.manufacturer];
    if (!manufacturer) {
      console.log(`\nSkipping ${plugin.name}: no manufacturer`);
      skipped++;
      continue;
    }
    
    try {
      const result = await scorePlugin(plugin, manufacturer, { storeMentionsData, verbose });
      
      if (result) {
        results.push({ name: plugin.name, ...result });
        scored++;
      } else {
        skipped++;
      }
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 1000));
      
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }
  
  // Summary
  console.log('\n=== Summary ===');
  console.log(`Scored: ${scored}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  
  // Top trending
  if (results.length > 0) {
    results.sort((a, b) => b.score - a.score);
    console.log('\n=== Top Trending ===');
    for (const r of results.slice(0, 10)) {
      console.log(`  ${r.score.toString().padStart(4)} | ${r.name}`);
    }
  }
}

main().catch(console.error);
