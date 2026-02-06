#!/usr/bin/env node
/**
 * Batch find and update plugin images from Plugin Boutique
 */

import { ConvexHttpClient } from 'convex/browser';
import https from 'https';

const convex = new ConvexHttpClient('https://next-frog-231.convex.cloud');

// Plugin Boutique product IDs for known plugins
const PLUGIN_BOUTIQUE_IDS = {
  'Loopmix': 9878,
  'Chordjam': 7752,
  'Playbeat 4': 14265,
  'Riffer': 5778,
  'SampleTank 4': 7086,
  'T-RackS 5': 6940,
  'The Riser': 3175,
  'Velvet': 3191,
  'Vacuum Pro': 3194,
  'Hybrid 3': 3177,
  'Kickstart 2': 13033,
  'Ana 2': 7940,
  'Repeater': 9765,
  'Komplete 15': 15776,
  'Vocal Rider': 1367,
  'Waves Tune Real-Time': 5135,
  'H-Delay': 1358,
  'Abbey Road Plates': 4056,
  'Abbey Road Chambers': 4055,
  'H-Reverb': 3810,
  'L3 Multimaximizer': 1325,
  'L2 Ultramaximizer': 1324,
  'dbx 160': 1333,
  'API 2500': 1298,
  'SSL G-Master Buss Compressor': 1340,
  'Renaissance Compressor': 1305,
  'CLA-76': 1312,
  'CLA-3A': 1311,
  'CLA-2A': 1310,
  'Renaissance EQ': 1306,
  'PuigTec EQs': 1361,
  'SSL G-Channel': 1342,
  'SSL E-Channel': 1341,
  'F6 Floating-Band Dynamic EQ': 4612,
  'Waves Gold': 1381,
  'Waves Platinum': 1383,
  'Waves Diamond': 1385,
  'FabFilter Micro': 2879,
  'FabFilter Simplon': 2881,
  'FabFilter One': 2878,
};

// Known image URLs for plugins that need manual lookup
const KNOWN_IMAGES = {
  'Camel Strip': null, // Safari Pedals - rare
  'Stylus RMX': 'https://media.spectrasonics.net/products/stylus/art/stylus-rmx-xpanded-gui.png',
  'VS ANTHOLOGY': 'https://static.roland.com/products/vs_anthology/images/vs_anthology_hero.jpg',
  'FANTOM': 'https://static.roland.com/products/fantom_software/images/fantom_soft_synth_hero.jpg',
  'Fission': 'https://www.eventideaudio.com/wp-content/uploads/2021/01/Fission-GUI.png',
  'ZENOLOGY Pro': 'https://static.roland.com/products/zenology_pro/images/zenology_pro_hero.jpg',
  'Roland Cloud Complete': null,
  'Drawmer 1973': 'https://www.softube.com/images/products/drawmer-1973-multi-band-compressor/1973_ui.jpg',
  'Tube-Tech PE 1C': 'https://www.softube.com/images/products/tube-tech-pe-1c/pe1c_ui.jpg',
  'Tube-Tech ME 1B': 'https://www.softube.com/images/products/tube-tech-me-1b/me1b_ui.jpg',
  'Monster Extreme Drums': null,
  'Custom Series EQ': null,
  'Console 1 Channel': 'https://www.softube.com/images/products/console-1/console1_channel_ui.jpg',
  'FG-76': null,
  'FG-N': null,
  'FG-401': null,
  'FG-MU': null,
  'FG-X Mastering Processor': null,
  'SPL Vitalizer MK2-T': 'https://www.plugin-alliance.com/images/products/spl_vitalizer_mk2_t.jpg',
  'ML-1 Vintage Reverb': null,
  'e2deesser': null,
  'AirEQ': null,
  'Crush Pack': null,
  'WLM Plus Loudness Meter': 'https://www.waves.com/1lib/images/products/plugins/wlm-plus-loudness-meter.png',
  'Kramer Master Tape': 'https://www.waves.com/1lib/images/products/plugins/kramer-master-tape.png',
  'J37 Tape': 'https://www.waves.com/1lib/images/products/plugins/j37-tape.png',
  'Mix & Master Bundle': null,
  'Test Plugin': null,
};

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function getImageFromPluginBoutique(productId) {
  const url = `https://www.pluginboutique.com/products/${productId}`;
  const result = await fetch(url);
  const banners = result.data.match(/https:\/\/banners\.pluginboutique\.com\/[a-z0-9]+/g);
  return banners ? banners[0] : null;
}

async function main() {
  // Get plugins without images
  const result = await convex.query('plugins:list', { limit: 1000 });
  const noImage = result.items.filter(p => !p.imageUrl && !p.imageStorageId);
  
  console.log(`Found ${noImage.length} plugins without images`);
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const plugin of noImage.slice(0, 50)) {
    const name = plugin.name;
    console.log(`Processing: ${name}...`);
    
    let imageUrl = null;
    
    // Check known images first
    if (KNOWN_IMAGES[name] !== undefined) {
      imageUrl = KNOWN_IMAGES[name];
    } else if (PLUGIN_BOUTIQUE_IDS[name]) {
      // Try Plugin Boutique
      try {
        imageUrl = await getImageFromPluginBoutique(PLUGIN_BOUTIQUE_IDS[name]);
      } catch (e) {
        console.log(`  Error fetching from Plugin Boutique: ${e.message}`);
      }
    }
    
    if (imageUrl) {
      try {
        await convex.mutation('plugins:update', { id: plugin._id, imageUrl });
        console.log(`  ✓ Updated with: ${imageUrl.substring(0, 60)}...`);
        updated++;
      } catch (e) {
        console.log(`  ✗ Failed to update: ${e.message}`);
        errors++;
      }
    } else {
      console.log(`  - No image found, skipping`);
      skipped++;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\nSummary:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

main().catch(console.error);
