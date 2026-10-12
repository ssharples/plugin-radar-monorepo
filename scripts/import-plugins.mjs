#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const jsonFile = process.argv[2];
if (!jsonFile) {
  console.error('Usage: node import-plugins.mjs <json-file>');
  process.exit(1);
}

const data = JSON.parse(readFileSync(jsonFile, 'utf-8'));
const { manufacturer, manufacturerSlug, plugins } = data;

let successCount = 0;
let errorCount = 0;
const errors = [];

for (const plugin of plugins) {
  const record = {
    name: plugin.name,
    slug: plugin.slug,
    manufacturer: manufacturer,
    category: plugin.category,
    description: plugin.description || '',
    productUrl: plugin.productUrl || '',
    formats: plugin.formats || ['VST3', 'AU', 'AAX'],
    platforms: plugin.platforms || ['windows', 'mac'],
    isFree: plugin.isFree || false,
    hasDemo: plugin.hasDemo !== false,
    hasTrial: plugin.hasTrial || false,
    tags: plugin.tags || [],
    screenshots: plugin.screenshots || [],
    currency: plugin.currency || 'EUR',
  };

  // Map price fields correctly
  if (plugin.price !== undefined) {
    record.msrp = plugin.price * 100; // Convert to cents
  }
  if (plugin.salePrice !== undefined) {
    record.currentPrice = plugin.salePrice * 100; // Convert to cents
  } else if (plugin.price !== undefined) {
    record.currentPrice = plugin.price * 100;
  }

  if (plugin.imageUrl) {
    record.imageUrl = plugin.imageUrl;
  }

  const jsonStr = JSON.stringify(record);
  const cmd = `npx convex run plugins:create '${jsonStr.replace(/'/g, "'\\''")}'`;
  
  try {
    console.log(`Creating: ${plugin.name}...`);
    execSync(cmd, { cwd: '/home/clawdbot/clawd/projects/plugin-radar', stdio: 'pipe' });
    successCount++;
    console.log(`  ✓ ${plugin.name}`);
  } catch (err) {
    errorCount++;
    const errorMsg = err.stderr?.toString() || err.message;
    errors.push({ name: plugin.name, error: errorMsg });
    console.log(`  ✗ ${plugin.name}: ${errorMsg.slice(0, 100)}`);
  }
}

console.log(`\n=== Import Complete ===`);
console.log(`Success: ${successCount}`);
console.log(`Errors: ${errorCount}`);

if (errors.length > 0) {
  console.log('\nErrors:');
  errors.forEach(e => console.log(`  - ${e.name}: ${e.error.slice(0, 150)}`));
}
