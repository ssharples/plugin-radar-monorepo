#!/usr/bin/env node
/**
 * Remove bundles/collections from plugin database — keep only singular plugins.
 * Also recalculates manufacturer counts after deletion.
 *
 * Usage:
 *   node scripts/cleanup-bundles.mjs              # dry run
 *   node scripts/cleanup-bundles.mjs --confirm    # actually delete
 */

const CONVEX_URL = process.env.CONVEX_URL || 'https://next-frog-231.convex.cloud';
const API_KEY = 'pluginradar-enrich-2026';
const DRY_RUN = !process.argv.includes('--confirm');

async function convexMutation(path, args = {}) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.errorMessage);
  return data.value;
}

async function convexQuery(path, args = {}) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.errorMessage);
  return data.value;
}

// Bundles/collections to remove (identified by slug)
const BUNDLE_SLUGS = [
  '1176-classic-limiter-collection',
  'api-500-series-eq-collection',
  'api-vision-channel-strip-collection',
  'brainworx-bx-digital-v3-eq-collection',
  'chorus-d-bundle',
  'crush-pack',
  'dangerous-bax-eq-collection',
  'de-esser-collection',
  'elevate-mastering-bundle',
  'excite-audio-bundle',
  'fairchild-tube-limiter-collection',
  'friedman-amplifiers-collection',
  'helios-type-69-preamp-and-eq-collection',
  'moog-multimode-filter-collection',
  'neve-1073-preamp-eq-collection',
  'neve-88rs-channel-strip-collection',
  'platinum-bundle',
  'pultec-passive-eq-collection',
  'sphere-mic-collection',
  'teletronix-la-2a-leveler-collection',
  'topline-vocal-suite',
  'ua-175b-176-tube-compressor-collection',
  'ua-610-tube-preamp-eq-collection',
  'uad-build-your-own-bundle-winter-mix-tape',
  'uad-essentials-edition',
  'uad-studio-classics-bundle',
  'verbsuite-classics',
  'virtual-console-collection',
];

async function main() {
  console.log(DRY_RUN
    ? '--- DRY RUN (pass --confirm to delete) ---'
    : '--- LIVE MODE: will delete bundles ---');
  console.log('');

  // Get current count
  const before = await convexQuery('plugins:list', { limit: 1000 });
  console.log(`Total plugins before: ${before.items.length}`);
  console.log(`Bundles to remove: ${BUNDLE_SLUGS.length}`);
  console.log('');

  // List what will be deleted
  for (const slug of BUNDLE_SLUGS) {
    const match = before.items.find(p => p.slug === slug);
    if (match) {
      console.log(`  [-] ${match.name} (${slug})`);
    } else {
      console.log(`  [?] Not found: ${slug}`);
    }
  }

  if (DRY_RUN) {
    console.log('\nDry run complete. Use --confirm to delete.');
    return;
  }

  // Delete in batches of 10
  console.log('\nDeleting...');
  const batchSize = 10;
  let totalDeleted = 0;

  for (let i = 0; i < BUNDLE_SLUGS.length; i += batchSize) {
    const batch = BUNDLE_SLUGS.slice(i, i + batchSize);
    const result = await convexMutation('enrichment:deletePluginsBySlugs', {
      apiKey: API_KEY,
      slugs: batch,
    });

    for (const r of result.results) {
      if (r.success) {
        console.log(`  Deleted: ${r.name}`);
        totalDeleted++;
      } else {
        console.log(`  Skip: ${r.slug} (${r.error})`);
      }
    }
  }

  console.log(`\nDeleted ${totalDeleted} bundles/collections.`);

  // Recalculate manufacturer counts
  console.log('\nRecalculating manufacturer plugin counts...');
  const countResult = await convexMutation('enrichment:recalculateManufacturerCounts', {
    apiKey: API_KEY,
  });
  console.log(`Updated ${countResult.updated} manufacturers.`);
  if (countResult.fixes.length > 0) {
    for (const fix of countResult.fixes) {
      console.log(`  ${fix.name}: ${fix.old} -> ${fix.new}`);
    }
  }

  // Final count
  const after = await convexQuery('plugins:list', { limit: 1000 });
  console.log(`\nTotal plugins after: ${after.items.length}`);
  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
