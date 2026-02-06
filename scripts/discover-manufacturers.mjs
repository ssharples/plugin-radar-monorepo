#!/usr/bin/env node

/**
 * Weekly manufacturer discovery script
 * Searches multiple sources for plugin manufacturers not yet in our database
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const convex = new ConvexHttpClient(CONVEX_URL);

// Sources to check for new manufacturers
const DISCOVERY_SOURCES = [
  {
    name: 'KVR Audio',
    url: 'https://www.kvraudio.com/plugins/newest',
    description: 'Check "newest" section for new plugin releases from unknown devs'
  },
  {
    name: 'Reddit r/AudioProductionDeals',
    url: 'https://www.reddit.com/r/AudioProductionDeals/new/',
    description: 'New posts often feature smaller/indie developers'
  },
  {
    name: 'Plugin Boutique New',
    url: 'https://www.pluginboutique.com/categories/702-New-Releases',
    description: 'New arrivals section'
  },
  {
    name: 'Gearspace Plugin Forum',
    url: 'https://gearspace.com/board/music-computers/gear-plug-ins/',
    description: 'Discussion forum for new plugins'
  },
  {
    name: 'Bedroom Producers Blog',
    url: 'https://bedroomproducersblog.com/',
    description: 'Great for free/budget plugins from indie devs'
  },
  {
    name: 'Plugin News',
    url: 'https://www.pluginnews.com/',
    description: 'Plugin industry news'
  }
];

// Known manufacturers to exclude (already tracked)
const KNOWN_MANUFACTURERS = [
  'fabfilter', 'waves', 'izotope', 'universal audio', 'uad', 'soundtoys',
  'native instruments', 'arturia', 'plugin alliance', 'slate digital',
  'softube', 'eventide', 'valhalla', 'xfer', 'spectrasonics', 'oeksound',
  'sonnox', 'antares', 'cableguys', 'ik multimedia', 'korg', 'roland',
  'output', 'tokyo dawn', 'brainworx', 'ssl', 'mcdsp', 'celemony',
  'lexicon', 'tc electronic', 'overloud'
];

async function getExistingManufacturers() {
  try {
    const manufacturers = await convex.query(api.manufacturers.list, { limit: 500 });
    return manufacturers.map(m => m.slug);
  } catch (err) {
    console.error('Error fetching manufacturers:', err.message);
    return KNOWN_MANUFACTURERS;
  }
}

function generateSearchQueries() {
  const currentMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  
  return [
    `new audio plugin developer ${currentMonth}`,
    `new vst plugin release ${currentMonth}`,
    `indie plugin developer 2026`,
    `new mixing plugin company`,
    `emerging audio software developer`,
    `new dsp plugin manufacturer`,
    `best new plugin companies`,
  ];
}

async function main() {
  console.log('🔍 PluginRadar - Weekly Manufacturer Discovery\n');
  console.log('='.repeat(50));
  
  // Get existing manufacturers
  const existing = await getExistingManufacturers();
  console.log(`\n📊 Currently tracking ${existing.length} manufacturers\n`);
  
  // Output discovery sources
  console.log('📌 Sources to check manually:\n');
  for (const source of DISCOVERY_SOURCES) {
    console.log(`  ${source.name}`);
    console.log(`  └─ ${source.url}`);
    console.log(`     ${source.description}\n`);
  }
  
  // Output search queries
  console.log('🔎 Suggested search queries:\n');
  const queries = generateSearchQueries();
  for (const query of queries) {
    console.log(`  • "${query}"`);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📋 DISCOVERY REPORT TEMPLATE:\n');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log('New manufacturers found:');
  console.log('  1. [Company Name] - [Website] - [Notable plugins]');
  console.log('  2. ...');
  console.log('\nAction items:');
  console.log('  - [ ] Add to database');
  console.log('  - [ ] Subscribe to newsletter');
  console.log('  - [ ] Scrape plugin catalog');
  
  return {
    existingCount: existing.length,
    sources: DISCOVERY_SOURCES,
    searchQueries: queries
  };
}

main().catch(console.error);
