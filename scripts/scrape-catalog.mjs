#!/usr/bin/env node

/**
 * Plugin Catalog Scraper - Main Orchestrator
 * 
 * Scrapes plugin catalogs from multiple manufacturers and updates Convex database.
 * 
 * Usage:
 *   node scripts/scrape-catalog.mjs                    # Run all scrapers
 *   node scripts/scrape-catalog.mjs --manufacturer fabfilter  # Run specific manufacturer
 *   node scripts/scrape-catalog.mjs --list             # List available scrapers
 */

import { scrapeFabFilter } from './scrapers/fabfilter.mjs';
import { scrapeValhalla } from './scrapers/valhalla.mjs';
import { scrapeOeksound } from './scrapers/oeksound.mjs';
import { scrapeSoundtoys } from './scrapers/soundtoys.mjs';
import { scrapeIzotope } from './scrapers/izotope.mjs';
import { scrapeWaves } from './scrapers/waves.mjs';
import { scrapeNativeInstruments } from './scrapers/native-instruments.mjs';
import { scrapeSlateDigital } from './scrapers/slate-digital.mjs';
import { scrapePluginAlliance } from './scrapers/plugin-alliance.mjs';

// Simple fetch wrapper for web_fetch compatibility
async function fetchPage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    
    if (!response.ok) {
      return { error: `HTTP ${response.status}`, text: null };
    }
    
    const text = await response.text();
    return { text, status: response.status };
  } catch (err) {
    return { error: err.message, text: null };
  }
}

// Registry of all available scrapers
const SCRAPERS = {
  'fabfilter': {
    name: 'FabFilter',
    fn: scrapeFabFilter,
    priority: 1,
  },
  'valhalla-dsp': {
    name: 'Valhalla DSP',
    fn: scrapeValhalla,
    priority: 1,
  },
  'oeksound': {
    name: 'oeksound',
    fn: scrapeOeksound,
    priority: 1,
  },
  'soundtoys': {
    name: 'Soundtoys',
    fn: scrapeSoundtoys,
    priority: 1,
  },
  'izotope': {
    name: 'iZotope',
    fn: scrapeIzotope,
    priority: 1,
  },
  'waves': {
    name: 'Waves',
    fn: scrapeWaves,
    priority: 2,
  },
  'native-instruments': {
    name: 'Native Instruments',
    fn: scrapeNativeInstruments,
    priority: 2,
  },
  'slate-digital': {
    name: 'Slate Digital',
    fn: scrapeSlateDigital,
    priority: 2,
  },
  'plugin-alliance': {
    name: 'Plugin Alliance',
    fn: scrapePluginAlliance,
    priority: 2,
  },
};

function printUsage() {
  console.log(`
Plugin Catalog Scraper
======================

Usage:
  node scripts/scrape-catalog.mjs                           Run all scrapers
  node scripts/scrape-catalog.mjs --manufacturer <slug>     Run specific manufacturer
  node scripts/scrape-catalog.mjs --list                    List available scrapers
  node scripts/scrape-catalog.mjs --help                    Show this help

Available manufacturers:
${Object.entries(SCRAPERS).map(([slug, s]) => `  ${slug.padEnd(20)} ${s.name}`).join('\n')}
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }
  
  if (args.includes('--list')) {
    console.log('\nAvailable scrapers:\n');
    for (const [slug, scraper] of Object.entries(SCRAPERS)) {
      console.log(`  ${slug.padEnd(20)} ${scraper.name}`);
    }
    console.log('');
    return;
  }
  
  const mfrIndex = args.indexOf('--manufacturer');
  const specificMfr = mfrIndex !== -1 ? args[mfrIndex + 1] : null;
  
  console.log('🔍 Plugin Catalog Scraper');
  console.log('='.repeat(50));
  console.log(`Started at: ${new Date().toISOString()}\n`);
  
  const results = {};
  let totalPlugins = 0;
  let totalErrors = 0;
  
  // Run scrapers
  const scrapersToRun = specificMfr 
    ? (SCRAPERS[specificMfr] ? [[specificMfr, SCRAPERS[specificMfr]]] : [])
    : Object.entries(SCRAPERS).sort((a, b) => a[1].priority - b[1].priority);
  
  if (specificMfr && !SCRAPERS[specificMfr]) {
    console.error(`❌ Unknown manufacturer: ${specificMfr}`);
    console.log('\nAvailable manufacturers:');
    Object.keys(SCRAPERS).forEach(slug => console.log(`  - ${slug}`));
    process.exit(1);
  }
  
  for (const [slug, scraper] of scrapersToRun) {
    try {
      const result = await scraper.fn(fetchPage);
      results[slug] = result;
      totalPlugins += result.plugins || 0;
      totalErrors += result.errors || 0;
    } catch (err) {
      console.error(`\n❌ Error running ${scraper.name} scraper: ${err.message}`);
      results[slug] = { plugins: 0, errors: 1, errorMessage: err.message };
      totalErrors++;
    }
    
    // Small delay between manufacturers
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  
  for (const [slug, result] of Object.entries(results)) {
    const scraper = SCRAPERS[slug];
    const status = result.errors > 0 ? '⚠️' : '✅';
    console.log(`${status} ${scraper.name.padEnd(20)} ${result.plugins} plugins, ${result.errors} errors`);
  }
  
  console.log('-'.repeat(50));
  console.log(`Total: ${totalPlugins} plugins, ${totalErrors} errors`);
  console.log(`Completed at: ${new Date().toISOString()}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
