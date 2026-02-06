#!/usr/bin/env node
/**
 * Exa Manufacturer Enrichment Script
 * Uses Exa's Company Search to enrich manufacturer data
 */

import Exa from 'exa-js';
import { ConvexHttpClient } from 'convex/browser';
import fs from 'fs';
import path from 'path';

// Load credentials
const credPath = path.join(process.env.HOME, '.credentials/exa/credentials.json');
const { apiKey } = JSON.parse(fs.readFileSync(credPath, 'utf-8'));

const exa = new Exa(apiKey);

const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const client = new ConvexHttpClient(CONVEX_URL);

// Use Exa Company Search
async function searchCompany(companyName, website) {
  try {
    const results = await exa.searchAndContents(`${companyName} audio effects plugin company`, {
      type: 'auto',
      category: 'company',
      numResults: 3,
      text: { maxCharacters: 2000 },
      includeDomains: website ? [new URL(website).hostname] : undefined
    });
    
    return results.results;
  } catch (err) {
    console.error(`  Company search error: ${err.message}`);
    return [];
  }
}

// Find company description and info
async function enrichManufacturer(manufacturer) {
  console.log(`\nEnriching: ${manufacturer.name}`);
  
  // Skip if already has good description
  if (manufacturer.description && manufacturer.description.length > 100) {
    console.log('  Already enriched, skipping...');
    return null;
  }
  
  const results = await searchCompany(manufacturer.name, manufacturer.website);
  
  if (results.length === 0) {
    console.log('  No results found');
    return null;
  }
  
  const updates = {};
  
  // Extract description from results
  const descriptions = results
    .map(r => r.text)
    .filter(t => t && t.length > 50)
    .slice(0, 2);
  
  if (descriptions.length > 0) {
    // Take first good paragraph
    const desc = descriptions[0]
      .split('\n')
      .filter(p => p.length > 50 && p.length < 500)
      .slice(0, 2)
      .join(' ')
      .slice(0, 400);
    
    if (desc.length > 50) {
      updates.description = desc;
    }
  }
  
  if (Object.keys(updates).length === 0) {
    console.log('  No new data found');
    return null;
  }
  
  console.log(`  Found description (${updates.description?.length} chars)`);
  return updates;
}

// Update manufacturer in Convex
async function updateManufacturer(id, updates) {
  try {
    await client.mutation('manufacturers:update', {
      id,
      ...updates,
      updatedAt: Date.now()
    });
    return true;
  } catch (err) {
    console.error(`  Update error: ${err.message}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 10;
  const dryRun = args.includes('--dry-run');
  
  console.log('=== Exa Manufacturer Enrichment ===');
  console.log(`Limit: ${limit}`);
  console.log(`Dry run: ${dryRun}`);
  
  // Get manufacturers needing enrichment
  let manufacturers = await client.query('manufacturers:list', { limit: 100 });
  
  // Filter to those without descriptions
  manufacturers = manufacturers.filter(m => !m.description || m.description.length < 50);
  manufacturers = manufacturers.slice(0, limit);
  
  console.log(`\nFound ${manufacturers.length} manufacturers to enrich\n`);
  
  let enriched = 0;
  let failed = 0;
  
  for (const mfr of manufacturers) {
    try {
      const updates = await enrichManufacturer(mfr);
      
      if (updates && Object.keys(updates).length > 0) {
        if (dryRun) {
          console.log('  [DRY RUN] Would update:', updates);
          enriched++;
        } else {
          const success = await updateManufacturer(mfr._id, updates);
          if (success) enriched++;
          else failed++;
        }
      }
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 500));
      
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }
  
  console.log('\n=== Summary ===');
  console.log(`Enriched: ${enriched}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
