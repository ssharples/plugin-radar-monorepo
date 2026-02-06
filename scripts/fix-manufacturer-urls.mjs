#!/usr/bin/env node

/**
 * Fix manufacturer URLs that have Google search placeholders
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const convex = new ConvexHttpClient(CONVEX_URL);

// Correct URLs for manufacturers with Google search placeholders
const MANUFACTURER_URLS = {
  'universal-audio': 'https://www.uaudio.com',
  'waves': 'https://www.waves.com',
  'plugin-alliance': 'https://www.plugin-alliance.com',
  'arturia': 'https://www.arturia.com',
  'softube': 'https://www.softube.com',
  'ik-multimedia': 'https://www.ikmultimedia.com',
  'solid-state-logic': 'https://www.solidstatelogic.com',
  'ujam': 'https://www.ujam.com',
  'air-music-technology': 'https://www.airmusictech.com',
  'excite-audio': 'https://www.excite-audio.com',
  'scaler-music': 'https://www.scalerplugin.com',
  'baby-audio': 'https://babyaud.io',
  'audiomodern': 'https://audiomodern.com',
  'evabeat': 'https://evabeat.com',
  'reveal-sound': 'https://www.reveal-sound.com',
  'bfd': 'https://www.bfddrums.com',
};

async function main() {
  console.log('🔧 Fixing manufacturer URLs...\n');

  const manufacturers = await convex.query(api.manufacturers.list, { limit: 100 });
  
  let fixed = 0;
  for (const mfr of manufacturers) {
    if (mfr.website.includes('google.com/search') && MANUFACTURER_URLS[mfr.slug]) {
      const newUrl = MANUFACTURER_URLS[mfr.slug];
      console.log(`  ${mfr.name}: ${mfr.website} → ${newUrl}`);
      
      await convex.mutation(api.manufacturers.update, {
        id: mfr._id,
        website: newUrl,
      });
      fixed++;
    }
  }
  
  console.log(`\n✅ Fixed ${fixed} manufacturer URLs`);
}

main().catch(console.error);
