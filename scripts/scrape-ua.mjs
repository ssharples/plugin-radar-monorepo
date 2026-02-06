#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const MANUFACTURER_ID = 'jh73h773hd34naz9qanh47x3nh80h1e4';
const IMAGE_DIR = '/home/clawdbot/clawd/projects/plugin-radar/public/images/plugins/universal-audio';

// Category mapping from UA tags to our categories
const categoryMap = {
  'Compressors & Limiters': 'compressor',
  'Equalizers': 'eq',
  'Reverb & Room': 'reverb',
  'Delay & Modulation': 'delay',
  'Preamps & Channel Strips': 'effect',
  'Tape & Saturation': 'saturator',
  'Guitar & Bass': 'effect',
  'Instruments': 'instrument',
  'Mic Modeling': 'utility',
  'Vocals & Pitch Correction': 'effect',
  'Special Processing': 'effect',
  'Mastering': 'limiter',
  'LUNA Extensions': 'utility',
  'Bundles': 'bundle',
};

async function fetchAllProducts() {
  let allProducts = [];
  let page = 1;
  
  while (true) {
    const url = `https://www.uaudio.com/collections/uad-plugins/products.json?limit=250&page=${page}`;
    console.log(`Fetching page ${page}...`);
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (!data.products || data.products.length === 0) break;
      
      allProducts = allProducts.concat(data.products);
      console.log(`  Got ${data.products.length} products (total: ${allProducts.length})`);
      
      if (data.products.length < 250) break;
      page++;
    } catch (e) {
      console.error('Fetch error:', e);
      break;
    }
  }
  
  return allProducts;
}

function getCategoryFromTags(tags) {
  for (const tag of tags) {
    if (tag.startsWith('category plugins:')) {
      const cat = tag.replace('category plugins:', '');
      if (categoryMap[cat]) return categoryMap[cat];
    }
  }
  return 'effect';
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function downloadImage(imageUrl, slug) {
  if (!imageUrl) return null;
  
  const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
  const filename = `${slug}${ext.replace('?', '')}`;
  const filepath = path.join(IMAGE_DIR, filename);
  
  if (fs.existsSync(filepath)) {
    console.log(`  Image exists: ${filename}`);
    return `/images/plugins/universal-audio/${filename}`;
  }
  
  try {
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    console.log(`  Downloaded: ${filename}`);
    return `/images/plugins/universal-audio/${filename}`;
  } catch (e) {
    console.error(`  Failed to download image: ${e.message}`);
    return null;
  }
}

function escapeForShell(str) {
  return str.replace(/'/g, "'\"'\"'");
}

async function createPlugin(plugin) {
  const convexData = {
    slug: plugin.slug,
    name: plugin.name,
    manufacturer: MANUFACTURER_ID,
    category: plugin.category,
    productUrl: plugin.productUrl,
    description: plugin.description || undefined,
    tags: plugin.tags?.length ? plugin.tags : undefined,
    formats: ['VST3', 'AU', 'AAX'],
    platforms: ['windows', 'mac'],
    isFree: plugin.price === 0,
    hasDemo: true,
    hasTrial: false,
    currency: 'USD',
  };
  
  if (plugin.imageUrl) {
    convexData.imageUrl = plugin.imageUrl;
  }
  
  if (plugin.price > 0) {
    convexData.currentPrice = plugin.price;
    convexData.msrp = plugin.price;
  }
  
  const jsonArg = JSON.stringify(convexData);
  const cmd = `cd /home/clawdbot/clawd/projects/plugin-radar && npx convex run plugins:upsertBySlug '${escapeForShell(jsonArg)}'`;
  
  try {
    execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
    console.log(`  ✓ Created: ${plugin.name}`);
    return true;
  } catch (e) {
    console.error(`  ✗ Failed: ${plugin.name} - ${e.stderr || e.message}`);
    return false;
  }
}

async function main() {
  // Ensure image directory exists
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }
  
  console.log('Fetching Universal Audio plugins...');
  const products = await fetchAllProducts();
  console.log(`\nTotal products: ${products.length}`);
  
  // Filter out bundles and subscription products
  const plugins = products.filter(p => {
    const title = p.title.toLowerCase();
    return (
      p.product_type !== 'Pick Any Bundles' && 
      !title.includes('bundle') &&
      !title.includes('custom') &&
      !title.includes('select') &&
      !title.includes('spark') &&
      !title.includes('luna pro')
    );
  });
  
  console.log(`Individual plugins: ${plugins.length}`);
  
  let created = 0;
  let failed = 0;
  
  for (const product of plugins) {
    console.log(`\nProcessing: ${product.title}`);
    
    const slug = slugify(product.title);
    const imageUrl = product.images?.[0]?.src;
    const localImage = await downloadImage(imageUrl, slug);
    
    const price = product.variants?.[0]?.price 
      ? parseFloat(product.variants[0].price) 
      : 0;
    
    const description = product.body_html
      ?.replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500) || '';
    
    const pluginData = {
      name: product.title,
      slug,
      description,
      category: getCategoryFromTags(product.tags || []),
      productUrl: `https://www.uaudio.com/products/${product.handle}`,
      imageUrl: localImage,
      price,
      tags: (product.tags || [])
        .filter(t => t.startsWith('use case plugins:'))
        .map(t => t.replace('use case plugins:', '').toLowerCase()),
    };
    
    if (await createPlugin(pluginData)) {
      created++;
    } else {
      failed++;
    }
    
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\n=== Universal Audio Summary ===`);
  console.log(`Created: ${created}`);
  console.log(`Failed: ${failed}`);
}

main();
