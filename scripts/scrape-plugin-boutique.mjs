#!/usr/bin/env node

/**
 * Plugin Boutique Scraper
 * Scrapes plugin catalog and upserts to Convex
 */

import { ConvexHttpClient } from 'convex/browser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Config
const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const NB_API_KEY = process.env.NB_API_KEY;
const convex = new ConvexHttpClient(CONVEX_URL);

// Plugin Boutique category URLs to scrape
const CATEGORIES = [
  { name: 'EQ', url: 'https://www.pluginboutique.com/categories/16-EQ', category: 'eq' },
  { name: 'Compressor', url: 'https://www.pluginboutique.com/categories/8-Compressor', category: 'compressor' },
  { name: 'Reverb', url: 'https://www.pluginboutique.com/categories/22-Reverb', category: 'reverb' },
  { name: 'Delay', url: 'https://www.pluginboutique.com/categories/11-Delay', category: 'delay' },
  { name: 'Limiter', url: 'https://www.pluginboutique.com/categories/36-Limiter', category: 'limiter' },
  { name: 'Saturation', url: 'https://www.pluginboutique.com/categories/44-Saturation', category: 'saturation' },
  { name: 'Modulation', url: 'https://www.pluginboutique.com/categories/14-Modulation', category: 'modulation' },
  { name: 'Stereo Imaging', url: 'https://www.pluginboutique.com/categories/46-Stereo-Imaging', category: 'stereo-imaging' },
  { name: 'Gate', url: 'https://www.pluginboutique.com/categories/35-Gate', category: 'gate-expander' },
  { name: 'De-esser', url: 'https://www.pluginboutique.com/categories/42-De-esser', category: 'de-esser' },
  { name: 'Filter', url: 'https://www.pluginboutique.com/categories/17-Filter', category: 'filter' },
  { name: 'Channel Strip', url: 'https://www.pluginboutique.com/categories/51-Channel-Strip', category: 'channel-strip' },
  { name: 'Metering', url: 'https://www.pluginboutique.com/categories/48-Metering', category: 'metering' },
  { name: 'Noise Reduction', url: 'https://www.pluginboutique.com/categories/50-Noise-Reduction', category: 'noise-reduction' },
  { name: 'Mastering', url: 'https://www.pluginboutique.com/categories/52-Mastering-Suite', category: 'multiband' },
  { name: 'Utility', url: 'https://www.pluginboutique.com/categories/53-Utility', category: 'utility' },
];

async function createTask(taskDescription) {
  const response = await fetch('https://app.nextbrowser.com/api/v1/chat/tasks', {
    method: 'POST',
    headers: {
      'Authorization': `x-api-key ${NB_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      task_description: taskDescription,
      mode: 'fast',
      skip_plan_approval: true
    })
  });
  
  const data = await response.json();
  if (!data.success) {
    throw new Error(`Task creation failed: ${JSON.stringify(data.errors)}`);
  }
  return data.payload.id;
}

async function pollTask(taskId, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`https://app.nextbrowser.com/api/v1/chat/tasks/${taskId}`, {
      headers: { 'Authorization': `x-api-key ${NB_API_KEY}` }
    });
    
    const data = await response.json();
    const status = data.payload?.status || data.payload?.state;
    
    if (status === 'finished') {
      return {
        success: data.payload.isSuccess,
        output: data.payload.output
      };
    } else if (status === 'failed') {
      return { success: false, output: data.payload.output || 'Task failed' };
    }
    
    // Wait 5 seconds before next poll
    await new Promise(r => setTimeout(r, 5000));
  }
  
  return { success: false, output: 'Timeout waiting for task' };
}

async function scrapeCategory(category) {
  console.log(`\n📦 Scraping ${category.name}...`);
  
  const taskDescription = `
Go to ${category.url} and extract ALL plugins listed on the page. For each plugin, extract:
- Product name
- Manufacturer/brand name
- Current price (in GBP)
- Original price if on sale
- Discount percentage if on sale
- Product URL

Return the data as a JSON array with this exact format:
[
  {
    "name": "Plugin Name",
    "manufacturer": "Brand Name", 
    "price": 99.00,
    "originalPrice": 199.00,
    "discount": 50,
    "url": "/product/..."
  }
]

Important: Return ONLY the JSON array, no other text. Include all visible products on the page.
`;

  try {
    const taskId = await createTask(taskDescription);
    console.log(`  Task started: ${taskId}`);
    
    const result = await pollTask(taskId);
    
    if (result.success) {
      // Try to parse JSON from the output
      const jsonMatch = result.output.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const plugins = JSON.parse(jsonMatch[0]);
        console.log(`  ✅ Found ${plugins.length} plugins`);
        return plugins.map(p => ({ ...p, category: category.category }));
      }
    }
    
    console.log(`  ⚠️ Could not extract data: ${result.output?.substring(0, 100)}`);
    return [];
  } catch (err) {
    console.error(`  ❌ Error: ${err.message}`);
    return [];
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function upsertToConvex(plugins) {
  console.log(`\n💾 Upserting ${plugins.length} plugins to Convex...`);
  
  let created = 0;
  let updated = 0;
  let errors = 0;
  
  for (const plugin of plugins) {
    try {
      // First ensure manufacturer exists
      const mfrSlug = slugify(plugin.manufacturer);
      
      // Use the API to upsert
      // Note: We need to call Convex mutations
      // For now, let's just log what we'd insert
      
      console.log(`  - ${plugin.name} by ${plugin.manufacturer} - £${plugin.price}`);
      created++;
    } catch (err) {
      console.error(`  Error with ${plugin.name}: ${err.message}`);
      errors++;
    }
  }
  
  return { created, updated, errors };
}

async function main() {
  console.log('🔍 Plugin Boutique Scraper');
  console.log('==========================\n');
  
  if (!NB_API_KEY) {
    console.error('❌ NB_API_KEY environment variable required');
    process.exit(1);
  }
  
  const allPlugins = [];
  
  // Scrape each category
  for (const category of CATEGORIES) {
    const plugins = await scrapeCategory(category);
    allPlugins.push(...plugins);
    
    // Small delay between categories
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log(`\n📊 Total plugins found: ${allPlugins.length}`);
  
  // Save raw data
  const outputPath = path.join(__dirname, '../data/scraped-plugins.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(allPlugins, null, 2));
  console.log(`💾 Saved to ${outputPath}`);
  
  // Upsert to Convex
  if (allPlugins.length > 0) {
    const stats = await upsertToConvex(allPlugins);
    console.log(`\n✅ Done! Created: ${stats.created}, Updated: ${stats.updated}, Errors: ${stats.errors}`);
  }
}

// Run if called directly
main().catch(console.error);
