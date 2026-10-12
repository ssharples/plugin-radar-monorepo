#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const MANUFACTURER_ID = 'jh7dqvfmsrmbkw303hda878f7d80gxpy';
const IMAGE_DIR = '/home/clawdbot/clawd/projects/plugin-radar/public/images/plugins/plugin-alliance';

// Infer category from name/description
function inferCategory(name, description = '') {
  const text = (name + ' ' + description).toLowerCase();
  if (text.includes('compressor') || text.includes('limiter')) return 'compressor';
  if (text.includes('equalizer') || text.includes('eq')) return 'eq';
  if (text.includes('reverb')) return 'reverb';
  if (text.includes('delay')) return 'delay';
  if (text.includes('saturat') || text.includes('tape') || text.includes('tube')) return 'saturator';
  if (text.includes('synth') || text.includes('instrument')) return 'instrument';
  if (text.includes('gate')) return 'gate';
  if (text.includes('meter') || text.includes('analyz')) return 'utility';
  if (text.includes('multiband')) return 'multiband';
  if (text.includes('master')) return 'limiter';
  return 'effect';
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function fetchAllProducts() {
  let allProducts = [];
  let page = 1;
  
  while (true) {
    const url = `https://www.plugin-alliance.com/collections/all-products/products.json?limit=250&page=${page}`;
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

async function downloadImage(imageUrl, slug) {
  if (!imageUrl) return null;
  
  const urlObj = new URL(imageUrl);
  const ext = path.extname(urlObj.pathname).split('?')[0] || '.jpg';
  const filename = `${slug}${ext}`;
  const filepath = path.join(IMAGE_DIR, filename);
  
  if (fs.existsSync(filepath)) {
    console.log(`  Image exists: ${filename}`);
    return `/images/plugins/plugin-alliance/${filename}`;
  }
  
  try {
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    console.log(`  Downloaded: ${filename}`);
    return `/images/plugins/plugin-alliance/${filename}`;
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
    formats: ['VST3', 'AU', 'AAX'],
    platforms: ['windows', 'mac'],
    isFree: plugin.price === 0,
    hasDemo: true,
    hasTrial: true,
    currency: 'USD',
  };
  
  if (plugin.imageUrl) {
    convexData.imageUrl = plugin.imageUrl;
  }
  
  if (plugin.price > 0) {
    convexData.currentPrice = plugin.price;
    convexData.msrp = plugin.msrp || plugin.price;
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
  
  console.log('Fetching Plugin Alliance plugins...');
  const products = await fetchAllProducts();
  console.log(`\nTotal products: ${products.length}`);
  
  // Filter only plugins (not bundles or subscriptions)
  const plugins = products.filter(p => 
    p.tags?.includes('Plugin') && 
    !p.title.toLowerCase().includes('bundle') &&
    !p.title.toLowerCase().includes('subscription')
  );
  
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
    const msrp = product.variants?.[0]?.compare_at_price 
      ? parseFloat(product.variants[0].compare_at_price) 
      : price;
    
    const description = product.body_html
      ?.replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500) || '';
    
    const pluginData = {
      name: product.title,
      slug,
      description,
      category: inferCategory(product.title, description),
      productUrl: `https://www.plugin-alliance.com/products/${product.handle}`,
      imageUrl: localImage,
      price,
      msrp,
    };
    
    if (await createPlugin(pluginData)) {
      created++;
    } else {
      failed++;
    }
    
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\n=== Plugin Alliance Summary ===`);
  console.log(`Created: ${created}`);
  console.log(`Failed: ${failed}`);
}

main();
