#!/usr/bin/env node

/**
 * YouTube Mention Scanner for PluginRadar
 * 
 * Searches YouTube for videos mentioning plugins and tracks them
 * for the "trending" feature.
 * 
 * Usage:
 *   node youtube-mention-scanner.mjs                 # Scan top 100 plugins
 *   node youtube-mention-scanner.mjs --all           # Scan all plugins
 *   node youtube-mention-scanner.mjs --plugin slug   # Scan specific plugin
 *   node youtube-mention-scanner.mjs --limit 50      # Limit plugins to scan
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const convex = new ConvexHttpClient(CONVEX_URL);

// Load YouTube API key
function loadYouTubeApiKey() {
  const envPath = join(process.env.HOME, '.credentials/pluginradar/env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    const match = content.match(/YOUTUBE_API_KEY=(.+)/);
    if (match) return match[1].trim();
  }
  return process.env.YOUTUBE_API_KEY || null;
}

const YOUTUBE_API_KEY = loadYouTubeApiKey();

if (!YOUTUBE_API_KEY) {
  console.error('❌ No YouTube API key found');
  process.exit(1);
}

// Search YouTube for videos about a plugin
async function searchYouTube(query, maxResults = 25) {
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', maxResults.toString());
    url.searchParams.set('key', YOUTUBE_API_KEY);
    url.searchParams.set('relevanceLanguage', 'en');
    url.searchParams.set('order', 'relevance');
    // Only videos from last 30 days for trending
    url.searchParams.set('publishedAfter', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
    const res = await fetch(url.toString());
    
    if (!res.ok) {
      const error = await res.json();
      if (error.error?.errors?.[0]?.reason === 'quotaExceeded') {
        throw new Error('QUOTA_EXCEEDED');
      }
      throw new Error(`API error: ${res.status}`);
    }
    
    const data = await res.json();
    if (!data.items) return [];
    
    // Get video stats (views, likes)
    const videoIds = data.items.map(item => item.id.videoId).join(',');
    const statsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    statsUrl.searchParams.set('part', 'statistics');
    statsUrl.searchParams.set('id', videoIds);
    statsUrl.searchParams.set('key', YOUTUBE_API_KEY);
    
    const statsRes = await fetch(statsUrl.toString());
    const statsData = statsRes.ok ? await statsRes.json() : { items: [] };
    const statsMap = new Map(statsData.items?.map(v => [v.id, v.statistics]) || []);
    
    return data.items.map(item => {
      const stats = statsMap.get(item.id.videoId) || {};
      return {
        videoId: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        author: item.snippet.channelTitle,
        publishedAt: new Date(item.snippet.publishedAt).getTime(),
        views: parseInt(stats.viewCount) || 0,
        likes: parseInt(stats.likeCount) || 0,
        comments: parseInt(stats.commentCount) || 0,
      };
    });
  } catch (err) {
    if (err.message === 'QUOTA_EXCEEDED') throw err;
    console.log(`  ⚠️ Search failed: ${err.message}`);
    return [];
  }
}

// Check if video title/description mentions the plugin
function mentionsPlugin(video, pluginName, manufacturerName) {
  const searchTerms = [
    pluginName.toLowerCase(),
    manufacturerName?.toLowerCase(),
  ].filter(Boolean);
  
  const text = `${video.title} ${video.description}`.toLowerCase();
  
  return searchTerms.some(term => text.includes(term));
}

async function scanPlugin(plugin, manufacturer) {
  console.log(`\n🔍 ${plugin.name} (${manufacturer?.name || 'Unknown'})`);
  
  const searchQueries = [
    `"${plugin.name}"`,
    `${manufacturer?.name || ''} ${plugin.name}`.trim(),
  ];
  
  const allMentions = [];
  const seenIds = new Set();
  
  for (const query of searchQueries) {
    console.log(`  📺 Searching: ${query}`);
    const results = await searchYouTube(query, 15);
    
    for (const video of results) {
      if (!seenIds.has(video.videoId)) {
        seenIds.add(video.videoId);
        
        // Verify it actually mentions the plugin
        if (mentionsPlugin(video, plugin.name, manufacturer?.name)) {
          allMentions.push({
            plugin: plugin._id,
            platform: 'youtube',
            sourceUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
            sourceId: video.videoId,
            title: video.title,
            snippet: video.description.substring(0, 200),
            author: video.author,
            views: video.views,
            likes: video.likes,
            comments: video.comments,
            publishedAt: video.publishedAt,
          });
        }
      }
    }
    
    // Small delay between searches
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`  ✅ Found ${allMentions.length} mentions`);
  
  if (allMentions.length > 0) {
    try {
      const result = await convex.mutation(api.mentions.bulkCreate, { mentions: allMentions });
      console.log(`  💾 Saved: ${result.created} new, ${result.updated} updated`);
      return { plugin: plugin._id, mentions: allMentions.length, saved: result.created + result.updated };
    } catch (err) {
      console.log(`  ❌ Save failed: ${err.message}`);
      return { plugin: plugin._id, mentions: allMentions.length, error: err.message };
    }
  }
  
  return { plugin: plugin._id, mentions: 0 };
}

async function main() {
  const args = process.argv.slice(2);
  
  let plugins = [];
  
  if (args.includes('--plugin')) {
    const slugIndex = args.indexOf('--plugin') + 1;
    const slug = args[slugIndex];
    console.log(`🎯 Scanning mentions for: ${slug}`);
    
    const plugin = await convex.query(api.plugins.getBySlug, { slug });
    if (!plugin) {
      console.error(`Plugin not found: ${slug}`);
      process.exit(1);
    }
    plugins = [plugin];
  } else if (args.includes('--all')) {
    console.log('🌍 Scanning ALL plugins for mentions');
    const result = await convex.query(api.plugins.list, { limit: 1000 });
    plugins = result.items;
  } else {
    const limitArg = args.indexOf('--limit');
    const limit = limitArg !== -1 ? parseInt(args[limitArg + 1]) : 100;
    
    console.log(`🔥 Scanning top ${limit} plugins for mentions`);
    const result = await convex.query(api.plugins.list, { limit });
    plugins = result.items;
  }
  
  console.log(`\n📦 Processing ${plugins.length} plugins\n`);
  
  let totalMentions = 0;
  let pluginsWithMentions = 0;
  let errors = 0;
  
  for (let i = 0; i < plugins.length; i++) {
    const plugin = plugins[i];
    
    // Get manufacturer
    const manufacturer = plugin.manufacturer 
      ? await convex.query(api.manufacturers.get, { id: plugin.manufacturer })
      : null;
    
    try {
      const result = await scanPlugin(plugin, manufacturer);
      totalMentions += result.mentions || 0;
      if (result.mentions > 0) pluginsWithMentions++;
      if (result.error) errors++;
    } catch (err) {
      if (err.message === 'QUOTA_EXCEEDED') {
        console.error('\n❌ YouTube API quota exceeded! Stopping.');
        console.log(`   Processed ${i + 1} of ${plugins.length} plugins`);
        break;
      }
      console.error(`  ❌ Error: ${err.message}`);
      errors++;
    }
    
    // Rate limiting
    if (i < plugins.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  // Recalculate trending scores
  console.log('\n📊 Recalculating trending scores...');
  try {
    const scoreResult = await convex.mutation(api.mentions.recalculateScores, {});
    console.log(`   Updated ${scoreResult.updated} plugins`);
  } catch (err) {
    console.log(`   ❌ Score calculation failed: ${err.message}`);
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Done!`);
  console.log(`   Total mentions found: ${totalMentions}`);
  console.log(`   Plugins with mentions: ${pluginsWithMentions}`);
  console.log(`   Errors: ${errors}`);
}

main().catch(console.error);
