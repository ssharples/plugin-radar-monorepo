#!/usr/bin/env node

/**
 * Plugin Image Downloader
 * 
 * Downloads product images from manufacturer websites and stores them locally.
 * 
 * Usage:
 *   node scripts/download-images.mjs                    # Download all missing images
 *   node scripts/download-images.mjs --manufacturer fabfilter  # Specific manufacturer
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(PROJECT_ROOT, 'public', 'images', 'plugins');

const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const convex = new ConvexHttpClient(CONVEX_URL);

// Known product image URLs by manufacturer
const IMAGE_SOURCES = {
  'fabfilter': {
    baseUrl: 'https://www.fabfilter.com/img/products/',
    imagePattern: (slug) => {
      const productName = slug.replace('fabfilter-', '');
      return `${productName}/large/${productName}-screenshot.png`;
    },
  },
  'valhalla-dsp': {
    baseUrl: 'https://valhalladsp.com/wp-content/uploads/',
    // Valhalla uses specific URLs - would need to fetch from product pages
  },
  'soundtoys': {
    baseUrl: 'https://www.soundtoys.com/wp-content/uploads/',
    // Soundtoys uses specific URLs
  },
};

/**
 * Download image from URL
 */
function downloadImage(imageUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Skip if already exists
    if (fs.existsSync(outputPath)) {
      resolve({ path: outputPath, status: 'exists' });
      return;
    }
    
    const file = fs.createWriteStream(outputPath);
    const protocol = imageUrl.startsWith('https') ? https : http;
    
    const request = protocol.get(imageUrl, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
      },
      timeout: 30000,
    }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadImage(response.headers.location, outputPath).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        fs.unlink(outputPath, () => {});
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve({ path: outputPath, status: 'downloaded' });
      });
    });
    
    request.on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
    
    request.on('timeout', () => {
      request.destroy();
      fs.unlink(outputPath, () => {});
      reject(new Error('Timeout'));
    });
  });
}

/**
 * Slugify text
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generate placeholder image path
 */
function getLocalImagePath(manufacturerSlug, pluginSlug) {
  return path.join(IMAGES_DIR, manufacturerSlug, `${pluginSlug}.png`);
}

/**
 * Generate placeholder SVG
 */
function generatePlaceholder(pluginName, outputPath) {
  const svg = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="18" fill="#e94560" text-anchor="middle" dy=".3em">${pluginName}</text>
</svg>`;
  
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Convert SVG to PNG would require additional deps, so save as SVG
  const svgPath = outputPath.replace('.png', '.svg');
  fs.writeFileSync(svgPath, svg);
  return svgPath;
}

async function main() {
  console.log('📷 Plugin Image Downloader');
  console.log('='.repeat(50));
  
  // Get all manufacturers
  const manufacturers = await convex.query(api.manufacturers.list, { limit: 100 });
  console.log(`Found ${manufacturers.length} manufacturers\n`);
  
  let totalDownloaded = 0;
  let totalExisting = 0;
  let totalFailed = 0;
  let totalPlaceholders = 0;
  
  for (const mfr of manufacturers) {
    const plugins = await convex.query(api.plugins.list, { 
      manufacturer: mfr._id, 
      limit: 100 
    });
    
    if (!plugins.items?.length) continue;
    
    console.log(`\n📦 ${mfr.name} (${plugins.items.length} plugins)`);
    
    const mfrDir = path.join(IMAGES_DIR, mfr.slug);
    if (!fs.existsSync(mfrDir)) {
      fs.mkdirSync(mfrDir, { recursive: true });
    }
    
    for (const plugin of plugins.items) {
      const localPath = getLocalImagePath(mfr.slug, plugin.slug);
      
      // Check if image already exists
      if (fs.existsSync(localPath) || fs.existsSync(localPath.replace('.png', '.svg'))) {
        totalExisting++;
        continue;
      }
      
      // Try to download from imageUrl if set
      if (plugin.imageUrl && plugin.imageUrl.startsWith('http')) {
        try {
          const result = await downloadImage(plugin.imageUrl, localPath);
          console.log(`  ✓ ${plugin.name}: ${result.status}`);
          totalDownloaded++;
          continue;
        } catch (err) {
          // Fall through to placeholder
        }
      }
      
      // Generate placeholder
      const placeholderPath = generatePlaceholder(plugin.name, localPath);
      console.log(`  ◐ ${plugin.name}: placeholder created`);
      totalPlaceholders++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`Downloaded: ${totalDownloaded}`);
  console.log(`Already existed: ${totalExisting}`);
  console.log(`Placeholders created: ${totalPlaceholders}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`\nImages stored in: ${IMAGES_DIR}`);
}

main().catch(console.error);
