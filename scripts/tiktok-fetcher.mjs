#!/usr/bin/env node
/**
 * TikTok Fetcher using EnsembleData API
 * Fetches TikTok videos for plugins using keyword search
 * 
 * Budget: 50 units/day
 * Cost: 1 unit = 20 posts per keyword search
 */

import { ConvexHttpClient } from 'convex/browser';
import fs from 'fs';
import path from 'path';

// Load credentials
const credPath = path.join(process.env.HOME, '.credentials/ensembledata/credentials.json');
const { apiKey } = JSON.parse(fs.readFileSync(credPath, 'utf-8'));

const ENSEMBLE_API = 'https://ensembledata.com/apis';
const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const client = new ConvexHttpClient(CONVEX_URL);

// Search TikTok for a keyword
async function searchTikTok(keyword, options = {}) {
  const {
    period = '180', // 0, 1, 7, 30, 90, 180 days
    sorting = '0', // 0=relevance, 1=likes
    country = 'us',
    cursor = 0,
  } = options;
  
  const params = new URLSearchParams({
    name: keyword,
    period,
    sorting,
    country,
    cursor: cursor.toString(),
    match_exactly: 'false',
    get_author_stats: 'true',
    token: apiKey,
  });
  
  const url = `${ENSEMBLE_API}/tt/keyword/search?${params}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`  TikTok search error: ${err.message}`);
    return null;
  }
}

// Parse TikTok post data into our format
function parsePost(post, searchKeyword) {
  // EnsembleData returns nested structure
  const author = post.author || {};
  const stats = post.stats || post.statsV2 || {};
  const music = post.music || {};
  const video = post.video || {};
  
  // Get video ID - try multiple paths
  const videoId = post.id || post.aweme_id || post.video_id;
  if (!videoId) {
    console.log('  Warning: Post missing videoId, skipping');
    return null;
  }
  
  const authorHandle = author.uniqueId || author.unique_id || 'unknown';
  
  return {
    videoId: String(videoId),
    videoUrl: `https://www.tiktok.com/@${authorHandle}/video/${videoId}`,
    searchKeyword,
    caption: post.desc || post.description || '',
    coverUrl: video.cover || video.dynamicCover || video.originCover || '',
    authorId: String(author.id || author.uid || ''),
    authorUniqueId: authorHandle,
    authorNickname: author.nickname || author.name || '',
    authorAvatarUrl: author.avatarThumb || author.avatarMedium || author.avatar_thumb || undefined,
    authorFollowers: author.followerCount || author.follower_count || undefined,
    authorVerified: author.verified || false,
    playCount: Number(stats.playCount || stats.play_count || 0),
    likeCount: Number(stats.diggCount || stats.likeCount || stats.like_count || 0),
    commentCount: Number(stats.commentCount || stats.comment_count || 0),
    shareCount: Number(stats.shareCount || stats.share_count || 0),
    collectCount: stats.collectCount || stats.collect_count || undefined,
    duration: Number(video.duration || 0),
    musicId: music.id ? String(music.id) : undefined,
    musicTitle: music.title || undefined,
    musicAuthor: music.authorName || music.author || undefined,
    createTime: post.createTime ? post.createTime * 1000 : Date.now(),
  };
}

// Build search keywords for a plugin
function buildSearchKeywords(plugin, manufacturer) {
  const keywords = [];
  
  // Primary: full plugin name
  keywords.push(plugin.name);
  
  // If name has spaces, also search quoted
  if (plugin.name.includes(' ')) {
    // Just the plugin name without manufacturer
    keywords.push(`"${plugin.name}"`);
  }
  
  // Plugin name + "plugin" for disambiguation
  keywords.push(`${plugin.name} plugin`);
  
  // Manufacturer + plugin name (for well-known manufacturers)
  if (['FabFilter', 'Waves', 'iZotope', 'Native Instruments', 'Arturia', 'Soundtoys'].includes(manufacturer.name)) {
    keywords.push(`${manufacturer.name} ${plugin.name}`);
  }
  
  return keywords;
}

// Fetch TikTok videos for a plugin
async function fetchForPlugin(plugin, manufacturer, options = {}) {
  const { maxKeywords = 1, verbose = false } = options;
  
  console.log(`\nFetching: ${plugin.name} (${manufacturer.name})`);
  
  const keywords = buildSearchKeywords(plugin, manufacturer).slice(0, maxKeywords);
  const allPosts = [];
  
  for (const keyword of keywords) {
    if (verbose) console.log(`  Searching: "${keyword}"`);
    
    const result = await searchTikTok(keyword);
    
    if (!result || !result.data) {
      console.log(`  No results for "${keyword}"`);
      continue;
    }
    
    const posts = result.data.data || result.data || [];
    console.log(`  Found ${posts.length} posts for "${keyword}"`);
    
    for (const post of posts) {
      const parsed = parsePost(post, keyword);
      if (parsed) {
        parsed.plugin = plugin._id;
        allPosts.push(parsed);
      }
    }
    
    // Rate limit between keywords
    await new Promise(r => setTimeout(r, 500));
  }
  
  return allPosts;
}

// Save posts to Convex
async function savePosts(posts) {
  if (posts.length === 0) return { created: 0, updated: 0 };
  
  try {
    // Batch in groups of 20
    let created = 0;
    let updated = 0;
    
    for (let i = 0; i < posts.length; i += 20) {
      const batch = posts.slice(i, i + 20);
      const result = await client.mutation('tiktok:bulkUpsert', { posts: batch });
      created += result.created;
      updated += result.updated;
    }
    
    return { created, updated };
  } catch (err) {
    console.error(`  Save error: ${err.message}`);
    return { created: 0, updated: 0 };
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 10;
  const verbose = args.includes('--verbose');
  const dryRun = args.includes('--dry-run');
  const maxKeywords = parseInt(args.find(a => a.startsWith('--keywords='))?.split('=')[1]) || 1;
  const manufacturerFilter = args.find(a => a.startsWith('--manufacturer='))?.split('=')[1];
  const sortBy = args.find(a => a.startsWith('--sort='))?.split('=')[1] || 'trending';
  
  console.log('=== TikTok Fetcher (EnsembleData) ===');
  console.log(`Limit: ${limit} plugins`);
  console.log(`Keywords per plugin: ${maxKeywords}`);
  console.log(`API units per plugin: ~${maxKeywords}`);
  console.log(`Estimated total units: ~${limit * maxKeywords}`);
  console.log(`Dry run: ${dryRun}`);
  
  // Get plugins
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
      console.log(`Filtered to ${plugins.length} plugins from ${mfr.name}`);
    }
  }
  
  // Sort plugins
  if (sortBy === 'trending') {
    plugins.sort((a, b) => (b.mentionScore || 0) - (a.mentionScore || 0));
  } else if (sortBy === 'random') {
    plugins.sort(() => Math.random() - 0.5);
  }
  
  plugins = plugins.slice(0, limit);
  
  console.log(`\nProcessing ${plugins.length} plugins...\n`);
  
  let totalCreated = 0;
  let totalUpdated = 0;
  let pluginsWithPosts = 0;
  
  for (const plugin of plugins) {
    const manufacturer = mfrMap[plugin.manufacturer];
    if (!manufacturer) {
      console.log(`Skipping ${plugin.name}: no manufacturer`);
      continue;
    }
    
    try {
      const posts = await fetchForPlugin(plugin, manufacturer, { maxKeywords, verbose });
      
      if (posts.length > 0) {
        pluginsWithPosts++;
        
        if (dryRun) {
          console.log(`  [DRY RUN] Would save ${posts.length} posts`);
          totalCreated += posts.length;
        } else {
          const { created, updated } = await savePosts(posts);
          console.log(`  Saved: ${created} new, ${updated} updated`);
          totalCreated += created;
          totalUpdated += updated;
        }
      }
      
      // Rate limit between plugins
      await new Promise(r => setTimeout(r, 1000));
      
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }
  }
  
  console.log('\n=== Summary ===');
  console.log(`Plugins processed: ${plugins.length}`);
  console.log(`Plugins with TikToks: ${pluginsWithPosts}`);
  console.log(`Posts created: ${totalCreated}`);
  console.log(`Posts updated: ${totalUpdated}`);
  console.log(`Estimated API units used: ~${plugins.length * maxKeywords}`);
}

main().catch(console.error);
