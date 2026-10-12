#!/usr/bin/env node

/**
 * Single Manufacturer Scraper
 * 
 * Scrapes plugins from a specific manufacturer's website.
 * 
 * Usage:
 *   node scripts/scrape-manufacturer.mjs <manufacturer-slug>
 *   node scripts/scrape-manufacturer.mjs fabfilter
 *   node scripts/scrape-manufacturer.mjs valhalla-dsp
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

// Fetch function
async function fetchPage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
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

// Scraper registry
const SCRAPERS = {
  'fabfilter': scrapeFabFilter,
  'valhalla-dsp': scrapeValhalla,
  'oeksound': scrapeOeksound,
  'soundtoys': scrapeSoundtoys,
  'izotope': scrapeIzotope,
  'waves': scrapeWaves,
  'native-instruments': scrapeNativeInstruments,
  'slate-digital': scrapeSlateDigital,
  'plugin-alliance': scrapePluginAlliance,
};

async function main() {
  const slug = process.argv[2];
  
  if (!slug || slug === '--help' || slug === '-h') {
    console.log(`
Single Manufacturer Scraper
===========================

Usage:
  node scripts/scrape-manufacturer.mjs <manufacturer-slug>

Available manufacturers:
${Object.keys(SCRAPERS).map(s => `  - ${s}`).join('\n')}
`);
    return;
  }
  
  const scraper = SCRAPERS[slug];
  
  if (!scraper) {
    console.error(`❌ Unknown manufacturer: ${slug}`);
    console.log('\nAvailable manufacturers:');
    Object.keys(SCRAPERS).forEach(s => console.log(`  - ${s}`));
    process.exit(1);
  }
  
  console.log(`🎯 Scraping ${slug}...`);
  const startTime = Date.now();
  
  try {
    const result = await scraper(fetchPage);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`\n✅ Complete in ${elapsed}s`);
    console.log(`   Plugins: ${result.plugins}`);
    console.log(`   Errors: ${result.errors}`);
  } catch (err) {
    console.error(`\n❌ Failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
