#!/usr/bin/env node

/**
 * YouTube Video Fetcher for PluginRadar
 * 
 * Searches YouTube for tutorial videos for each plugin and stores them in Convex.
 * Uses Invidious API (no API key required) with fallback to YouTube Data API.
 * 
 * Usage:
 *   node youtube-fetcher.mjs                    # Fetch for stale plugins (no videos or >7 days old)
 *   node youtube-fetcher.mjs --plugin fabfilter-pro-q-3  # Fetch for specific plugin
 *   node youtube-fetcher.mjs --all              # Fetch for all plugins
 *   node youtube-fetcher.mjs --limit 50         # Fetch for first 50 stale plugins
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const convex = new ConvexHttpClient(CONVEX_URL);

// YouTube Data API key - load from env file
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

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

// Piped instances (public YouTube frontends - more reliable than Invidious)
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.projectsegfau.lt',
  'https://pipedapi.in.projectsegfau.lt',
];

// Invidious instances (fallback)
const INVIDIOUS_INSTANCES = [
  'https://invidious.protokolla.fi',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
];

// Priority channels for plugin tutorials (higher relevance score)
const PRIORITY_CHANNELS = [
  'plugin boutique',
  'dan worrall',
  'fabfilter',
  'soundtoys',
  'slate digital',
  'produce like a pro',
  'mixbusstv',
  'musician on a mission',
  'point blank music school',
  'audio university',
  'in the mix',
  'reid stefan',
  'white sea studio',
];

// Minimum quality thresholds
const MIN_VIEWS = 500;
const MIN_DURATION = 120; // 2 minutes
const MAX_DURATION = 3600; // 1 hour (filter out full streams)

// Search YouTube using official Data API (most reliable)
async function searchYouTubeAPI(query, maxResults = 10) {
  if (!YOUTUBE_API_KEY) return null;
  
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', maxResults.toString());
    url.searchParams.set('key', YOUTUBE_API_KEY);
    url.searchParams.set('relevanceLanguage', 'en');
    
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.log(`  ⚠️ YouTube API error: ${res.status}`);
      return null;
    }
    
    const data = await res.json();
    if (!data.items) return [];
    
    // Get video details for duration and view count
    const videoIds = data.items.map(item => item.id.videoId).join(',');
    const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    detailsUrl.searchParams.set('part', 'contentDetails,statistics');
    detailsUrl.searchParams.set('id', videoIds);
    detailsUrl.searchParams.set('key', YOUTUBE_API_KEY);
    
    const detailsRes = await fetch(detailsUrl.toString());
    const detailsData = detailsRes.ok ? await detailsRes.json() : { items: [] };
    const detailsMap = new Map(detailsData.items?.map(v => [v.id, v]) || []);
    
    return data.items.map(item => {
      const details = detailsMap.get(item.id.videoId) || {};
      const duration = details.contentDetails?.duration;
      const durationSeconds = duration ? parseDuration(duration) : null;
      
      return {
        videoId: item.id.videoId,
        title: item.snippet.title,
        author: item.snippet.channelTitle,
        authorHandle: item.snippet.channelId,
        authorUrl: `https://youtube.com/channel/${item.snippet.channelId}`,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
        duration: durationSeconds,
        views: parseInt(details.statistics?.viewCount) || null,
        publishedAt: new Date(item.snippet.publishedAt).getTime(),
      };
    });
  } catch (err) {
    console.log(`  ⚠️ YouTube API failed: ${err.message}`);
    return null;
  }
}

// Parse ISO 8601 duration (PT1H2M3S)
function parseDuration(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

// Search using Piped API (reliable public API)
async function searchPiped(query, maxResults = 10) {
  for (const instance of PIPED_INSTANCES) {
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      
      if (!res.ok) continue;
      
      const data = await res.json();
      if (!data.items) continue;
      
      return data.items.slice(0, maxResults).map(item => ({
        videoId: item.url?.replace('/watch?v=', '') || item.url,
        title: item.title,
        author: item.uploaderName,
        authorHandle: item.uploaderUrl?.split('/').pop() || item.uploaderName,
        authorUrl: item.uploaderUrl ? `https://youtube.com${item.uploaderUrl}` : null,
        thumbnail: item.thumbnail,
        duration: item.duration,
        views: item.views,
        publishedAt: item.uploaded,
      }));
    } catch (err) {
      console.log(`  ⚠️ Piped ${instance} failed: ${err.message}`);
      continue;
    }
  }
  
  return [];
}

// Search using Invidious API (fallback)
async function searchInvidious(query, maxResults = 10) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort=relevance`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      
      if (!res.ok) continue;
      
      const data = await res.json();
      return data.slice(0, maxResults).map(item => ({
        videoId: item.videoId,
        title: item.title,
        author: item.author,
        authorHandle: item.authorId || item.author,
        authorUrl: item.authorUrl || `https://youtube.com/channel/${item.authorId}`,
        thumbnail: item.videoThumbnails?.find(t => t.quality === 'medium')?.url 
          || `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,
        duration: item.lengthSeconds,
        views: item.viewCount,
        publishedAt: item.published ? item.published * 1000 : null,
      }));
    } catch (err) {
      console.log(`  ⚠️ Invidious ${instance} failed: ${err.message}`);
      continue;
    }
  }
  
  return [];
}

// Combined search - tries all sources
async function searchYouTube(query, maxResults = 10) {
  // Try YouTube Data API first (most reliable)
  let results = await searchYouTubeAPI(query, maxResults);
  if (results && results.length > 0) {
    console.log(`    (via YouTube API)`);
    return results;
  }
  
  // Try Piped
  results = await searchPiped(query, maxResults);
  if (results && results.length > 0) {
    console.log(`    (via Piped)`);
    return results;
  }
  
  // Fallback to Invidious
  results = await searchInvidious(query, maxResults);
  if (results && results.length > 0) {
    console.log(`    (via Invidious)`);
    return results;
  }
  
  return [];
}

function calculateRelevanceScore(video, pluginName, manufacturerName) {
  let score = 50; // Base score
  
  const titleLower = video.title.toLowerCase();
  const pluginLower = pluginName.toLowerCase();
  const mfrLower = manufacturerName?.toLowerCase() || '';
  
  // Title contains plugin name (strong signal)
  if (titleLower.includes(pluginLower)) score += 25;
  
  // Title contains manufacturer name
  if (mfrLower && titleLower.includes(mfrLower)) score += 10;
  
  // Tutorial-related keywords
  const tutorialKeywords = ['tutorial', 'walkthrough', 'guide', 'how to', 'review', 'demo', 'explained', 'tips'];
  for (const keyword of tutorialKeywords) {
    if (titleLower.includes(keyword)) {
      score += 5;
      break;
    }
  }
  
  // Priority channel bonus
  const authorLower = video.author.toLowerCase();
  if (PRIORITY_CHANNELS.some(ch => authorLower.includes(ch))) {
    score += 15;
  }
  
  // View count bonus (logarithmic)
  if (video.views > 100000) score += 10;
  else if (video.views > 10000) score += 5;
  else if (video.views > 1000) score += 2;
  
  // Duration bonus (prefer 5-20 min tutorials)
  if (video.duration >= 300 && video.duration <= 1200) score += 5;
  
  // Recency bonus (within last year)
  if (video.publishedAt) {
    const ageMs = Date.now() - video.publishedAt;
    const ageYears = ageMs / (365 * 24 * 60 * 60 * 1000);
    if (ageYears < 1) score += 5;
    else if (ageYears < 2) score += 2;
  }
  
  return Math.min(score, 100); // Cap at 100
}

function filterVideos(videos, pluginName) {
  return videos.filter(video => {
    // Filter by duration
    if (video.duration && (video.duration < MIN_DURATION || video.duration > MAX_DURATION)) {
      return false;
    }
    
    // Filter by views
    if (video.views && video.views < MIN_VIEWS) {
      return false;
    }
    
    // Filter out obvious non-tutorials
    const titleLower = video.title.toLowerCase();
    const badKeywords = ['livestream', 'live stream', 'unboxing only', 'asmr', 'meme'];
    if (badKeywords.some(kw => titleLower.includes(kw))) {
      return false;
    }
    
    return true;
  });
}

async function fetchVideosForPlugin(plugin, manufacturer) {
  console.log(`\n🎬 ${plugin.name} (${manufacturer?.name || 'Unknown'})`);
  
  // Generate search queries
  const queries = [
    `"${plugin.name}" tutorial`,
    `"${plugin.name}" walkthrough`,
    `${manufacturer?.name || ''} ${plugin.name} review`.trim(),
  ];
  
  const allVideos = [];
  const seenIds = new Set();
  
  for (const query of queries) {
    console.log(`  🔍 Searching: ${query}`);
    const results = await searchYouTube(query, 8);
    
    for (const video of results) {
      if (!seenIds.has(video.videoId)) {
        seenIds.add(video.videoId);
        allVideos.push(video);
      }
    }
    
    // Small delay between searches
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`  📺 Found ${allVideos.length} unique videos`);
  
  // Filter and score
  const filtered = filterVideos(allVideos, plugin.name);
  console.log(`  ✅ ${filtered.length} passed quality filters`);
  
  const scored = filtered.map(video => ({
    ...video,
    relevanceScore: calculateRelevanceScore(video, plugin.name, manufacturer?.name),
  }));
  
  // Sort by relevance and take top 8
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const top = scored.slice(0, 8);
  
  if (top.length === 0) {
    console.log(`  ⚠️ No quality videos found`);
    return { plugin: plugin._id, videos: [] };
  }
  
  // Prepare for Convex
  const videosToSave = top.map(video => ({
    plugin: plugin._id,
    platform: 'youtube',
    videoId: video.videoId,
    videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
    title: video.title,
    thumbnail: video.thumbnail,
    author: video.author,
    authorHandle: video.authorHandle,
    authorUrl: video.authorUrl,
    duration: video.duration,
    views: video.views,
    publishedAt: video.publishedAt,
    relevanceScore: video.relevanceScore,
  }));
  
  // Save to Convex
  try {
    const result = await convex.mutation(api.videos.bulkUpsert, { videos: videosToSave });
    console.log(`  💾 Saved: ${result.created} new, ${result.updated} updated`);
    return { plugin: plugin._id, videos: videosToSave, result };
  } catch (err) {
    console.error(`  ❌ Save failed: ${err.message}`);
    return { plugin: plugin._id, videos: [], error: err.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  let plugins = [];
  
  if (args.includes('--plugin')) {
    const slugIndex = args.indexOf('--plugin') + 1;
    const slug = args[slugIndex];
    console.log(`🎯 Fetching videos for plugin: ${slug}`);
    
    const plugin = await convex.query(api.plugins.getBySlug, { slug });
    if (!plugin) {
      console.error(`Plugin not found: ${slug}`);
      process.exit(1);
    }
    plugins = [plugin];
  } else if (args.includes('--all')) {
    console.log('🌍 Fetching videos for ALL plugins');
    const result = await convex.query(api.plugins.list, { limit: 1000 });
    plugins = result.items;
  } else {
    // Default: fetch for stale plugins
    const limitArg = args.indexOf('--limit');
    const limit = limitArg !== -1 ? parseInt(args[limitArg + 1]) : 50;
    
    console.log(`🔄 Fetching videos for stale plugins (limit: ${limit})`);
    plugins = await convex.query(api.videos.getStale, { olderThanDays: 7, limit });
  }
  
  console.log(`\n📦 Processing ${plugins.length} plugins\n`);
  
  let processed = 0;
  let videosFound = 0;
  let errors = 0;
  
  for (const plugin of plugins) {
    // Get manufacturer
    const manufacturer = plugin.manufacturer 
      ? await convex.query(api.manufacturers.get, { id: plugin.manufacturer })
      : null;
    
    const result = await fetchVideosForPlugin(plugin, manufacturer);
    
    processed++;
    videosFound += result.videos?.length || 0;
    if (result.error) errors++;
    
    // Rate limiting - pause between plugins
    if (processed < plugins.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Done!`);
  console.log(`   Plugins processed: ${processed}`);
  console.log(`   Videos found: ${videosFound}`);
  console.log(`   Errors: ${errors}`);
}

main().catch(console.error);
