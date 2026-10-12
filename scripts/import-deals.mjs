#!/usr/bin/env node

/**
 * Import scraped deals into Convex
 */

import { ConvexHttpClient } from 'convex/browser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVEX_URL = 'https://next-frog-231.convex.cloud';

const convex = new ConvexHttpClient(CONVEX_URL);

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function importDeals(jsonPath) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  
  console.log(`📦 Importing ${data.deals.length} deals from ${jsonPath}`);
  console.log(`   Scraped at: ${data.scrapedAt}`);
  console.log('');
  
  let imported = 0;
  let skipped = 0;
  
  for (const deal of data.deals) {
    try {
      // First ensure manufacturer exists
      const mfrSlug = slugify(deal.manufacturer);
      
      // Upsert manufacturer
      const mfrId = await convex.mutation('manufacturers:upsertBySlug', {
        slug: mfrSlug,
        name: deal.manufacturer,
        website: `https://www.google.com/search?q=${encodeURIComponent(deal.manufacturer + ' audio plugins')}`,
      });
      
      // Upsert plugin
      const pluginSlug = slugify(deal.name);
      const pluginId = await convex.mutation('plugins:upsertBySlug', {
        slug: pluginSlug,
        name: deal.name,
        manufacturer: mfrId,
        category: slugify(deal.category),
        productUrl: `https://www.pluginboutique.com${deal.url}`,
        msrp: Math.round(deal.originalPrice * 100),
        currentPrice: Math.round(deal.salePrice * 100),
        currency: 'GBP',
        isFree: deal.salePrice === 0,
        hasDemo: true,
        hasTrial: true,
      });
      
      // Create sale record
      const endDate = deal.endDate ? new Date(deal.endDate).getTime() : null;
      await convex.mutation('sales:create', {
        plugin: pluginId,
        salePrice: Math.round(deal.salePrice * 100),
        originalPrice: Math.round(deal.originalPrice * 100),
        discountPercent: deal.discount,
        currency: 'GBP',
        endsAt: endDate,
        url: `https://www.pluginboutique.com${deal.url}`,
        source: 'scrape',
        sourceUrl: data.source,
      });
      
      console.log(`✅ ${deal.name} - £${deal.salePrice} (${deal.discount}% off)`);
      imported++;
    } catch (err) {
      console.error(`❌ ${deal.name}: ${err.message}`);
      skipped++;
    }
  }
  
  console.log('');
  console.log(`Done! Imported: ${imported}, Skipped: ${skipped}`);
}

// Run
const jsonPath = process.argv[2] || path.join(__dirname, '../data/deals-2026-02-04.json');
importDeals(jsonPath).catch(console.error);
