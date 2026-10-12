#!/usr/bin/env node

/**
 * Fetch missing images for plugins
 * 
 * 1. Find plugins without images
 * 2. Web search for product images
 * 3. Download and upload to Convex storage
 * 4. Update plugin record
 */

import { ConvexHttpClient } from 'convex/browser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const convex = new ConvexHttpClient(CONVEX_URL);

const TEMP_DIR = '/tmp/plugin-images';

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function getManufacturer(id) {
  try {
    return await convex.query('manufacturers:get', { id });
  } catch {
    return null;
  }
}

async function searchForImage(pluginName, manufacturerName) {
  const query = `${manufacturerName || ''} ${pluginName} VST plugin`.trim();
  
  // Use Brave Search API via web_search equivalent
  // For now, we'll construct likely image URLs based on common patterns
  
  // Common image URL patterns for plugin manufacturers
  const patterns = [
    // Plugin Boutique
    `https://www.pluginboutique.com/product_images/${pluginName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.jpg`,
    // Direct manufacturer patterns
  ];
  
  // Try to find via web search
  try {
    const searchUrl = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=5`;
    // Note: This would need API key - we'll use alternative approach
  } catch (err) {
    console.log(`  Search failed: ${err.message}`);
  }
  
  return null;
}

async function downloadImage(url, filename) {
  const filepath = path.join(TEMP_DIR, filename);
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PluginRadar/1.0)',
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!res.ok) return null;
    
    const contentType = res.headers.get('content-type');
    if (!contentType?.startsWith('image/')) return null;
    
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    
    return filepath;
  } catch (err) {
    return null;
  }
}

async function uploadToConvex(filepath, pluginId) {
  // Read file
  const buffer = fs.readFileSync(filepath);
  const blob = new Blob([buffer], { type: 'image/jpeg' });
  
  // Get upload URL from Convex
  const uploadUrl = await convex.mutation('storage:generateUploadUrl', {});
  
  // Upload
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });
  
  if (!res.ok) throw new Error('Upload failed');
  
  const { storageId } = await res.json();
  
  // Update plugin
  await convex.mutation('plugins:update', {
    id: pluginId,
    imageStorageId: storageId,
  });
  
  return storageId;
}

async function scrapeProductPage(productUrl) {
  try {
    const res = await fetch(productUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!res.ok) return null;
    
    const html = await res.text();
    
    // Look for og:image meta tag
    const ogMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    if (ogMatch) return ogMatch[1];
    
    // Look for twitter:image
    const twitterMatch = html.match(/<meta[^>]*name="twitter:image"[^>]*content="([^"]+)"/i);
    if (twitterMatch) return twitterMatch[1];
    
    // Look for common image patterns
    const imgMatch = html.match(/<img[^>]*src="([^"]+(?:product|hero|main|featured)[^"]*\.(?:jpg|png|webp))"/i);
    if (imgMatch) return imgMatch[1];
    
    return null;
  } catch {
    return null;
  }
}

async function searchBraveImages(query) {
  // Use Brave search for images - build search URL
  const searchQuery = `${query} plugin product image`;
  
  // Try to find image via Google Images (parse results page)
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=isch`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!res.ok) return null;
    
    const html = await res.text();
    
    // Look for image URLs in the response
    // Google encodes images in data attributes
    const matches = html.match(/\["(https:\/\/[^"]+\.(?:jpg|png|webp))",\d+,\d+\]/g);
    if (matches && matches.length > 0) {
      // Parse first match
      const urlMatch = matches[0].match(/\["(https:\/\/[^"]+)"/);
      if (urlMatch) return urlMatch[1];
    }
    
    return null;
  } catch {
    return null;
  }
}

async function searchDuckDuckGo(query) {
  // DuckDuckGo image search
  try {
    const url = `https://duckduckgo.com/?q=${encodeURIComponent(query + ' plugin')}&iax=images&ia=images`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(8000),
    });
    
    if (!res.ok) return null;
    
    const html = await res.text();
    
    // Look for vqd token and image URLs
    const imageMatch = html.match(/"image":"(https?:\/\/[^"]+)"/);
    if (imageMatch) return imageMatch[1];
    
    return null;
  } catch {
    return null;
  }
}

async function findImageForPlugin(plugin, manufacturer) {
  console.log(`\n🔍 ${plugin.name} (${manufacturer?.name || 'Unknown'})`);
  
  // Strategy 1: Try the product URL's og:image
  if (plugin.productUrl) {
    console.log(`  📄 Checking product page...`);
    const ogImage = await scrapeProductPage(plugin.productUrl);
    if (ogImage) {
      console.log(`  ✅ Found og:image: ${ogImage.substring(0, 60)}...`);
      return ogImage;
    }
  }
  
  // Strategy 2: Construct likely URLs based on manufacturer
  const mfrSlug = manufacturer?.slug || '';
  const mfrName = manufacturer?.name || '';
  const pluginSlug = plugin.slug;
  
  const possibleUrls = [];
  
  // FabFilter
  if (mfrSlug.includes('fabfilter')) {
    possibleUrls.push(`https://www.fabfilter.com/img/products/${plugin.name.replace(/[^a-zA-Z0-9]/g, '')}.png`);
  }
  
  // Eventide
  if (mfrSlug.includes('eventide')) {
    possibleUrls.push(`https://www.eventideaudio.com/wp-content/uploads/${plugin.name.toLowerCase().replace(/\s+/g, '-')}.jpg`);
  }
  
  // Soundtoys
  if (mfrSlug.includes('soundtoys')) {
    possibleUrls.push(`https://www.soundtoys.com/wp-content/uploads/${pluginSlug}.jpg`);
  }
  
  // Plugin Boutique (common source)
  possibleUrls.push(`https://www.pluginboutique.com/meta-images/${pluginSlug}.jpg`);
  
  // Try each URL
  for (const url of possibleUrls) {
    console.log(`  🌐 Trying: ${url.substring(0, 60)}...`);
    const filepath = await downloadImage(url, `${pluginSlug}.jpg`);
    if (filepath) {
      console.log(`  ✅ Downloaded!`);
      return url;
    }
  }
  
  // Strategy 3: Try manufacturer website og:image
  if (manufacturer?.website) {
    console.log(`  🏭 Checking manufacturer site...`);
    try {
      // Try to find plugin page on manufacturer site
      const mfrBase = manufacturer.website.replace(/\/$/, '');
      const tryUrls = [
        `${mfrBase}/products/${pluginSlug}`,
        `${mfrBase}/plugins/${pluginSlug}`,
        `${mfrBase}/${pluginSlug}`,
      ];
      
      for (const tryUrl of tryUrls) {
        const ogImage = await scrapeProductPage(tryUrl);
        if (ogImage) {
          console.log(`  ✅ Found on mfr site: ${ogImage.substring(0, 60)}...`);
          return ogImage;
        }
      }
    } catch {}
  }
  
  // Strategy 4: Web search for image
  console.log(`  🔎 Searching web...`);
  const searchQuery = `${mfrName} ${plugin.name}`;
  
  const googleImage = await searchBraveImages(searchQuery);
  if (googleImage) {
    console.log(`  ✅ Found via search: ${googleImage.substring(0, 60)}...`);
    return googleImage;
  }
  
  console.log(`  ❌ No image found`);
  return null;
}

async function processPlugin(plugin) {
  const manufacturer = plugin.manufacturer 
    ? await getManufacturer(plugin.manufacturer)
    : null;
  
  const imageUrl = await findImageForPlugin(plugin, manufacturer);
  
  if (imageUrl) {
    // For now, just update the imageUrl field (not uploading to storage)
    try {
      await convex.mutation('plugins:update', {
        id: plugin._id,
        imageUrl: imageUrl,
      });
      console.log(`  💾 Updated plugin with image URL`);
      return true;
    } catch (err) {
      console.log(`  ❌ Failed to update: ${err.message}`);
      return false;
    }
  }
  
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') 
    ? parseInt(args[args.indexOf('--limit') + 1]) 
    : 50;
  
  console.log(`🖼️ Fetching images for plugins without images (limit: ${limit})\n`);
  
  // Get all plugins
  const result = await convex.query('plugins:list', { limit: 1000 });
  const noImage = result.items.filter(p => !p.imageUrl && !p.imageStorageId);
  
  console.log(`Found ${noImage.length} plugins without images`);
  console.log(`Processing first ${Math.min(limit, noImage.length)}...\n`);
  
  let found = 0;
  let failed = 0;
  
  for (const plugin of noImage.slice(0, limit)) {
    const success = await processPlugin(plugin);
    if (success) found++;
    else failed++;
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Done!`);
  console.log(`   Images found: ${found}`);
  console.log(`   Failed: ${failed}`);
}

main().catch(console.error);
