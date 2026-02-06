#!/usr/bin/env node

/**
 * Daily deals scraper using OpenClaw browser
 * Run via cron to keep deals database fresh
 */

import { ConvexHttpClient } from 'convex/browser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const convex = new ConvexHttpClient(CONVEX_URL);

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parsePrice(priceStr) {
  if (!priceStr) return null;
  const match = priceStr.match(/[\d,]+\.?\d*/);
  return match ? parseFloat(match[0].replace(',', '')) : null;
}

function parseDiscount(text) {
  const match = text.match(/(\d+)%\s*off/i);
  return match ? parseInt(match[1]) : null;
}

function parseEndDate(text) {
  // "Ends 15 Feb" -> 2026-02-15
  const match = text.match(/Ends\s+(\d+)\s+(\w+)/i);
  if (!match) return null;
  
  const day = match[1].padStart(2, '0');
  const monthMap = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };
  const month = monthMap[match[2].toLowerCase().substring(0, 3)];
  const year = new Date().getFullYear();
  
  return `${year}-${month}-${day}`;
}

// Parse the browser snapshot text into structured deals
function parseDealsFromSnapshot(snapshotText) {
  const deals = [];
  const lines = snapshotText.split('\n');
  
  let currentDeal = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for group markers (deal cards)
    if (line.startsWith('- group "')) {
      // Save previous deal if exists
      if (currentDeal && currentDeal.name) {
        deals.push(currentDeal);
      }
      
      // Extract name from group
      const nameMatch = line.match(/group "([^"]+)"/);
      currentDeal = {
        name: nameMatch ? nameMatch[1] : null,
        manufacturer: null,
        category: null,
        originalPrice: null,
        salePrice: null,
        discount: null,
        endDate: null,
        url: null,
        rating: null
      };
    }
    
    // Extract URL
    if (currentDeal && line.includes('/url:') && line.includes('/product/')) {
      const urlMatch = line.match(/\/url:\s*(\S+)/);
      if (urlMatch && !currentDeal.url) {
        currentDeal.url = urlMatch[1];
      }
    }
    
    // Extract manufacturer
    if (currentDeal && line.includes('text: by') && i + 1 < lines.length) {
      // Next line usually has the manufacturer link
      const nextLines = lines.slice(i, i + 5).join(' ');
      const mfrMatch = nextLines.match(/link "([^"]+)"\s*\[ref=[^\]]+\]:\s*-\s*\/url:\s*\/manufacturers/);
      if (mfrMatch) {
        currentDeal.manufacturer = mfrMatch[1];
      }
    }
    
    // Extract prices
    if (currentDeal && line.includes('£')) {
      const pricePattern = /£([\d,]+\.?\d*)/g;
      const prices = [...line.matchAll(pricePattern)].map(m => parseFloat(m[1].replace(',', '')));
      
      if (prices.length >= 2 && !currentDeal.originalPrice) {
        currentDeal.originalPrice = prices[0];
        currentDeal.salePrice = prices[1];
      }
      
      // Extract discount
      const discountMatch = line.match(/(\d+)%\s*off/i);
      if (discountMatch) {
        currentDeal.discount = parseInt(discountMatch[1]);
      }
    }
    
    // Extract end date
    if (currentDeal && line.includes('Ends')) {
      const endDate = parseEndDate(line);
      if (endDate) {
        currentDeal.endDate = endDate;
      }
    }
    
    // Extract rating
    if (currentDeal && line.match(/text:\s*"[\d.]+"/)) {
      const ratingMatch = line.match(/"([\d.]+)"/);
      if (ratingMatch) {
        currentDeal.rating = parseFloat(ratingMatch[1]);
      }
    }
    
    // Extract category from links
    if (currentDeal && line.includes('/categories/') && !currentDeal.category) {
      const catMatch = line.match(/\/categories\/[\d]+-([^"]+)/);
      if (catMatch) {
        currentDeal.category = catMatch[1].replace(/-/g, ' ');
      }
    }
  }
  
  // Don't forget last deal
  if (currentDeal && currentDeal.name) {
    deals.push(currentDeal);
  }
  
  return deals.filter(d => d.name && d.salePrice !== null);
}

async function importDeal(deal) {
  const mfrSlug = slugify(deal.manufacturer || 'unknown');
  
  // Upsert manufacturer
  const mfrId = await convex.mutation('manufacturers:upsertBySlug', {
    slug: mfrSlug,
    name: deal.manufacturer || 'Unknown',
    website: `https://www.pluginboutique.com/manufacturers`,
  });
  
  // Upsert plugin
  const pluginSlug = slugify(deal.name);
  const pluginId = await convex.mutation('plugins:upsertBySlug', {
    slug: pluginSlug,
    name: deal.name,
    manufacturer: mfrId,
    category: slugify(deal.category || 'effect'),
    productUrl: `https://www.pluginboutique.com${deal.url}`,
    msrp: Math.round((deal.originalPrice || deal.salePrice) * 100),
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
    originalPrice: Math.round((deal.originalPrice || deal.salePrice) * 100),
    discountPercent: deal.discount || 0,
    currency: 'GBP',
    endsAt: endDate,
    url: `https://www.pluginboutique.com${deal.url}`,
    source: 'scrape',
  });
  
  return pluginId;
}

// This function is called by the cron job with snapshot data
export async function processSnapshot(snapshotText) {
  console.log('🔍 Parsing deals from snapshot...');
  const deals = parseDealsFromSnapshot(snapshotText);
  console.log(`📦 Found ${deals.length} deals`);
  
  let imported = 0;
  let errors = 0;
  
  for (const deal of deals) {
    try {
      await importDeal(deal);
      console.log(`✅ ${deal.name} - £${deal.salePrice}`);
      imported++;
    } catch (err) {
      console.error(`❌ ${deal.name}: ${err.message}`);
      errors++;
    }
  }
  
  // Cleanup expired sales
  await convex.mutation('sales:cleanupExpired', {});
  
  return { imported, errors, total: deals.length };
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const snapshotFile = process.argv[2];
  if (snapshotFile) {
    const snapshot = fs.readFileSync(snapshotFile, 'utf8');
    processSnapshot(snapshot).then(console.log).catch(console.error);
  } else {
    console.log('Usage: node scrape-deals.mjs <snapshot-file>');
  }
}
