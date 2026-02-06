#!/usr/bin/env node
/**
 * Upload plugin images to Convex storage
 * Handles both local files and remote URLs
 * 
 * Usage:
 *   node scripts/upload-images-to-convex.mjs           # Upload all missing
 *   node scripts/upload-images-to-convex.mjs --limit 10
 *   node scripts/upload-images-to-convex.mjs --manufacturer fabfilter
 *   node scripts/upload-images-to-convex.mjs --scrape  # Scrape real images from product pages
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const CONVEX_URL = process.env.CONVEX_URL || "https://next-frog-231.convex.cloud";
const client = new ConvexHttpClient(CONVEX_URL);

// Parse args
const args = process.argv.slice(2);
let limit = null;
let manufacturerSlug = null;
let scrapeReal = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--limit" && args[i + 1]) {
    limit = parseInt(args[i + 1]);
    i++;
  }
  if (args[i] === "--manufacturer" && args[i + 1]) {
    manufacturerSlug = args[i + 1];
    i++;
  }
  if (args[i] === "--scrape") {
    scrapeReal = true;
  }
}

async function fetchImageFromUrl(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "image/*,*/*",
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());
    
    return { buffer, contentType };
  } catch (error) {
    return null;
  }
}

async function readLocalFile(localPath) {
  const fullPath = path.join(PROJECT_ROOT, "public", localPath);
  
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  
  const buffer = fs.readFileSync(fullPath);
  const ext = path.extname(localPath).toLowerCase();
  const mimeTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
  };
  
  return {
    buffer,
    contentType: mimeTypes[ext] || "image/png",
  };
}

async function uploadToConvexStorage(buffer, contentType) {
  // Get upload URL
  const uploadUrl = await client.mutation(api.storage.generateUploadUrl);
  
  // Upload
  const result = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
    },
    body: buffer,
  });
  
  if (!result.ok) {
    throw new Error(`Upload failed: ${result.status}`);
  }
  
  const { storageId } = await result.json();
  return storageId;
}

async function scrapeImageFromProductPage(productUrl) {
  // Try to find og:image or product image from the page
  try {
    const response = await fetch(productUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    // Try og:image first
    const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
                    html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
    
    if (ogMatch) {
      let imageUrl = ogMatch[1];
      // Make absolute if relative
      if (imageUrl.startsWith("/")) {
        const url = new URL(productUrl);
        imageUrl = `${url.origin}${imageUrl}`;
      }
      return imageUrl;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

async function main() {
  console.log("🖼️  Uploading plugin images to Convex Storage...\n");
  
  // Get all plugins
  const { items: plugins } = await client.query(api.plugins.list, { limit: 1000 });
  
  // Filter plugins that need imageStorageId
  let toProcess = plugins.filter(p => !p.imageStorageId);
  
  // Filter by manufacturer if specified
  if (manufacturerSlug) {
    const manufacturer = await client.query(api.manufacturers.getBySlug, { slug: manufacturerSlug });
    if (manufacturer) {
      toProcess = toProcess.filter(p => p.manufacturer === manufacturer._id);
      console.log(`Filtering to manufacturer: ${manufacturer.name}`);
    }
  }
  
  // Apply limit
  if (limit) {
    toProcess = toProcess.slice(0, limit);
  }
  
  console.log(`Found ${toProcess.length} plugins needing images\n`);
  
  let success = 0;
  let failed = 0;
  
  for (const plugin of toProcess) {
    console.log(`📦 ${plugin.name}`);
    
    let imageData = null;
    
    // If scraping, try to get real image from product page
    if (scrapeReal && plugin.productUrl) {
      console.log(`   🔍 Scraping ${plugin.productUrl}`);
      const imageUrl = await scrapeImageFromProductPage(plugin.productUrl);
      if (imageUrl) {
        console.log(`   📷 Found: ${imageUrl}`);
        imageData = await fetchImageFromUrl(imageUrl);
      }
    }
    
    // Try local file if we have one
    if (!imageData && plugin.imageUrl && plugin.imageUrl.startsWith("/")) {
      console.log(`   📁 Local: ${plugin.imageUrl}`);
      imageData = await readLocalFile(plugin.imageUrl);
    }
    
    // Try remote URL
    if (!imageData && plugin.imageUrl && plugin.imageUrl.startsWith("http")) {
      console.log(`   🌐 Remote: ${plugin.imageUrl}`);
      imageData = await fetchImageFromUrl(plugin.imageUrl);
    }
    
    if (!imageData) {
      console.log(`   ⏭️  No image source found\n`);
      failed++;
      continue;
    }
    
    try {
      // Upload to Convex
      const storageId = await uploadToConvexStorage(imageData.buffer, imageData.contentType);
      
      // Update plugin
      await client.mutation(api.plugins.update, {
        id: plugin._id,
        imageStorageId: storageId,
      });
      
      console.log(`   ✅ Uploaded: ${storageId}\n`);
      success++;
    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}\n`);
      failed++;
    }
    
    // Small delay
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log("\n📊 Summary:");
  console.log(`   ✅ Success: ${success}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📦 Total: ${toProcess.length}`);
}

main().catch(console.error);
