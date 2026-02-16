#!/usr/bin/env node
/**
 * Plugin Database Data Quality Fix Script
 *
 * Fixes:
 * 1. Category misclassifications (via enrichment:fixPluginCategory)
 * 2. Manufacturer plugin counts (via enrichment:recalculateManufacturerCounts)
 *
 * Usage:
 *   node scripts/fix-data-quality.mjs
 */

const CONVEX_URL = process.env.CONVEX_URL || 'https://next-frog-231.convex.cloud';
const API_KEY = 'pluginradar-enrich-2026';

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

// =============================================================================
// Category Fix Map: pluginName → { slug, correctCategory }
// =============================================================================

const CATEGORY_FIXES = [
  // Metering plugins miscategorized
  { name: 'PAZ Analyzer', slug: 'paz-analyzer', correctCategory: 'metering' },
  { name: 'VU Meter', slug: 'vu-meter', correctCategory: 'metering' },
  { name: 'Dorrough Surround', slug: 'dorrough-surround', correctCategory: 'metering' },
  { name: 'WLM Plus Loudness Meter', slug: 'wlm-plus-loudness-meter', correctCategory: 'metering' },
  { name: 'Meter', slug: 'meter', correctCategory: 'metering' },

  // Spatial/monitoring/headphone plugins miscategorized as EQ
  { name: 'Abbey Road Studio 3', slug: 'abbey-road-studio-3', correctCategory: 'utility' },
  { name: 'Nx – Virtual Mix Room over Headphones', slug: 'nx-virtual-mix-room-over-headphones', correctCategory: 'utility' },
  { name: 'Nx Ocean Way Nashville', slug: 'nx-ocean-way-nashville', correctCategory: 'utility' },
  { name: 'Nx Germano Studios New York', slug: 'nx-germano-studios-new-york', correctCategory: 'utility' },

  // Limiters miscategorized as compressor
  { name: 'L1 Ultramaximizer', slug: 'l1-ultramaximizer', correctCategory: 'limiter' },
  { name: 'L2 Ultramaximizer', slug: 'l2-ultramaximizer', correctCategory: 'limiter' },
  { name: 'L3 Multimaximizer', slug: 'l3-multimaximizer', correctCategory: 'limiter' },
  { name: 'L3-16 Multimaximizer', slug: 'l3-16-multimaximizer', correctCategory: 'limiter' },
  { name: 'bx_limiter True Peak', slug: 'bx-limiter-true-peak', correctCategory: 'limiter' },
  { name: 'Fairchild Tube Limiter Collection', slug: 'fairchild-tube-limiter-collection', correctCategory: 'limiter' },
  { name: 'Sonnox Oxford Limiter v2', slug: 'sonnox-oxford-limiter-v2', correctCategory: 'limiter' },
  { name: 'Precision Limiter', slug: 'precision-limiter', correctCategory: 'limiter' },
  { name: '1176 Classic Limiter Collection', slug: '1176-classic-limiter-collection', correctCategory: 'limiter' },

  // Phase/utility tools miscategorized
  { name: 'InPhase', slug: 'inphase', correctCategory: 'utility' },
  { name: 'Sub Align', slug: 'sub-align', correctCategory: 'utility' },

  // Rider/automation tools miscategorized as compressor
  { name: 'Bass Rider', slug: 'bass-rider', correctCategory: 'utility' },
  { name: 'Vocal Rider', slug: 'vocal-rider', correctCategory: 'utility' },

  // Breath removal miscategorized as EQ
  { name: 'DeBreath', slug: 'debreath', correctCategory: 'utility' },

  // Noise reduction tools miscategorized
  { name: 'X-Click', slug: 'x-click', correctCategory: 'noise-reduction' },
  { name: 'X-Hum', slug: 'x-hum', correctCategory: 'noise-reduction' },
  { name: 'X-Noise', slug: 'x-noise', correctCategory: 'noise-reduction' },
  { name: 'X-Crackle', slug: 'x-crackle', correctCategory: 'noise-reduction' },
  { name: 'NS1 Noise Suppressor', slug: 'ns1-noise-suppressor', correctCategory: 'noise-reduction' },
  { name: 'WNS Noise Suppressor', slug: 'wns-noise-suppressor', correctCategory: 'noise-reduction' },

  // Guitar amp sim miscategorized as reverb
  { name: 'GTR3', slug: 'gtr3', correctCategory: 'utility' },
];

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('🔧 Plugin Database Data Quality Fix');
  console.log('═'.repeat(60));
  console.log('');

  // ── Step 1: Fix category misclassifications ──
  console.log('📋 Step 1: Fixing category misclassifications...');
  console.log('─'.repeat(60));

  let catSuccess = 0, catFailed = 0, catSkipped = 0;

  for (const fix of CATEGORY_FIXES) {
    try {
      const result = await convexMutation('enrichment:fixPluginCategory', {
        apiKey: API_KEY,
        slug: fix.slug,
        category: fix.correctCategory,
      });

      if (result.success) {
        console.log(`  ✅ ${result.name}: ${result.oldCategory} → ${result.newCategory}`);
        catSuccess++;
      } else {
        console.log(`  ⚠️  ${fix.name}: ${result.error}`);
        catSkipped++;
      }
    } catch (err) {
      console.log(`  ❌ ${fix.name} (${fix.slug}): ${err.message.slice(0, 100)}`);
      catFailed++;
    }
  }

  console.log(`\n  Results: ${catSuccess} fixed, ${catSkipped} skipped, ${catFailed} failed\n`);

  // ── Step 2: Recalculate manufacturer plugin counts ──
  console.log('📋 Step 2: Recalculating manufacturer plugin counts...');
  console.log('─'.repeat(60));

  try {
    const result = await convexMutation('enrichment:recalculateManufacturerCounts', {
      apiKey: API_KEY,
    });

    console.log(`  ✅ Updated ${result.updated} manufacturers`);
    if (result.fixes.length > 0) {
      for (const fix of result.fixes) {
        console.log(`    ${fix.name}: ${fix.old} → ${fix.new}`);
      }
    }
  } catch (err) {
    console.log(`  ❌ Failed: ${err.message}`);
  }

  // ── Step 3: Verify final stats ──
  console.log('\n📊 Final enrichment stats:');
  console.log('─'.repeat(60));

  const stats = await convexQuery('enrichment:getEnrichmentStats', {});
  console.log(`  Total plugins: ${stats.total}`);
  console.log(`  Fully enriched: ${stats.fullyEnriched} (${stats.percentages.fullyEnriched}%)`);
  console.log('');
  for (const [key, pct] of Object.entries(stats.percentages)) {
    if (key === 'fullyEnriched') continue;
    console.log(`    ${key.padEnd(22)} ${String(pct).padStart(3)}%`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('✅ Data quality fixes complete!');
  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
