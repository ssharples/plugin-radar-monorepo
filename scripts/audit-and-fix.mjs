#!/usr/bin/env node
/**
 * Plugin Database Audit & Fix Script
 *
 * Audits the Convex plugin and manufacturer tables for:
 * 1. Category misclassifications
 * 2. Stale manufacturer plugin counts
 * 3. Missing manufacturer data
 * 4. Orphaned/unlinked data
 * 5. Enrichment coverage gaps
 *
 * Usage:
 *   node scripts/audit-and-fix.mjs --dry-run     # Audit only, no changes
 *   node scripts/audit-and-fix.mjs --fix          # Apply fixes
 *   node scripts/audit-and-fix.mjs --fix --verbose # Verbose output
 */

const CONVEX_URL = process.env.CONVEX_URL || 'https://next-frog-231.convex.cloud';
const DEPLOY_KEY = process.env.CONVEX_DEPLOY_KEY || 'eyJ2MiI6IjM4MjlhODk4ZTViMTQ2OGNiZjRjMGEyNTE5NTQ0YTQ5In0=';

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--fix');
const VERBOSE = args.includes('--verbose');

// =============================================================================
// Convex HTTP Client
// =============================================================================

async function convexQuery(path, queryArgs = {}) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Convex ${DEPLOY_KEY}`,
    },
    body: JSON.stringify({ path, args: queryArgs }),
  });
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.errorMessage);
  return data.value;
}

async function convexMutation(path, mutArgs = {}) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Convex ${DEPLOY_KEY}`,
    },
    body: JSON.stringify({ path, args: mutArgs }),
  });
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.errorMessage);
  return data.value;
}

// =============================================================================
// Category Fix Rules
// =============================================================================

/**
 * Known category corrections based on what the plugin actually does.
 * Format: { pluginNamePattern: correctCategory }
 */
const CATEGORY_FIXES = {
  // Metering plugins miscategorized as EQ
  'PAZ Analyzer': 'metering',
  'VU Meter': 'metering',

  // Spatial/monitoring plugins miscategorized as EQ
  'Abbey Road Studio 3': 'utility',
  'Nx – Virtual Mix Room over Headphones': 'utility',
  'Nx Ocean Way Nashville': 'utility',
  'Nx Germano Studios New York': 'utility',

  // Limiters miscategorized as compressor
  'L1 Ultramaximizer': 'limiter',
  'L2 Ultramaximizer': 'limiter',
  'L3 Multimaximizer': 'limiter',
  'L3-16 Multimaximizer': 'limiter',

  // Phase tools miscategorized as saturation
  'InPhase': 'utility',

  // Vocal pitch tools miscategorized
  'Waves Tune': 'utility',
  'Waves Tune Real-Time': 'utility',

  // De-breath tools miscategorized as EQ
  'DeBreath': 'utility',

  // Rider/automation tools miscategorized as compressor
  'Bass Rider': 'utility',
  'Vocal Rider': 'utility',

  // Click/noise removal tools
  'X-Click': 'noise-reduction',
  'X-Hum': 'noise-reduction',
  'X-Noise': 'noise-reduction',
  'X-Crackle': 'noise-reduction',
  'NS1 Noise Suppressor': 'noise-reduction',
  'WNS Noise Suppressor': 'noise-reduction',

  // Guitar amp simulation miscategorized as reverb
  'GTR3': 'utility',

  // Surround tools
  'Dorrough Surround': 'metering',

  // Sub alignment tools miscategorized as delay
  'Sub Align': 'utility',
};

// =============================================================================
// Audit Functions
// =============================================================================

async function auditCategories(allPlugins) {
  console.log('\n📋 CATEGORY AUDIT');
  console.log('─'.repeat(60));

  const fixes = [];

  for (const plugin of allPlugins) {
    const name = plugin.name;

    // Check explicit fix rules
    if (CATEGORY_FIXES[name] && plugin.category !== CATEGORY_FIXES[name]) {
      fixes.push({
        id: plugin._id,
        name,
        oldCategory: plugin.category,
        newCategory: CATEGORY_FIXES[name],
        reason: 'explicit rule',
      });
      continue;
    }

    // Heuristic checks for common misclassifications
    const nameLower = name.toLowerCase();

    // Metering plugins in wrong category
    if ((nameLower.includes('meter') || nameLower.includes('analyzer') || nameLower.includes('loudness'))
        && plugin.category !== 'metering') {
      fixes.push({
        id: plugin._id,
        name,
        oldCategory: plugin.category,
        newCategory: 'metering',
        reason: 'name contains metering keyword',
      });
    }

    // Limiter plugins categorized as compressor
    if (nameLower.includes('limiter') && !nameLower.includes('compressor')
        && plugin.category === 'compressor') {
      fixes.push({
        id: plugin._id,
        name,
        oldCategory: plugin.category,
        newCategory: 'limiter',
        reason: 'name contains limiter',
      });
    }
  }

  if (fixes.length === 0) {
    console.log('  ✅ No category misclassifications found');
  } else {
    console.log(`  ⚠️  Found ${fixes.length} category issues:`);
    for (const fix of fixes) {
      console.log(`    ${fix.name}: ${fix.oldCategory} → ${fix.newCategory} (${fix.reason})`);
    }
  }

  return fixes;
}

async function auditManufacturerCounts(allPlugins, allManufacturers) {
  console.log('\n📋 MANUFACTURER COUNT AUDIT');
  console.log('─'.repeat(60));

  // Count actual plugins per manufacturer
  const actualCounts = {};
  for (const plugin of allPlugins) {
    const mfrId = plugin.manufacturer;
    actualCounts[mfrId] = (actualCounts[mfrId] || 0) + 1;
  }

  const fixes = [];

  for (const mfr of allManufacturers) {
    const actual = actualCounts[mfr._id] || 0;
    const stored = mfr.pluginCount || 0;

    if (actual !== stored) {
      fixes.push({
        id: mfr._id,
        name: mfr.name,
        storedCount: stored,
        actualCount: actual,
      });
      if (VERBOSE) {
        console.log(`    ${mfr.name}: stored=${stored}, actual=${actual} (diff: ${actual - stored})`);
      }
    }
  }

  // Check for manufacturers with no plugins
  const orphanedMfrs = allManufacturers.filter(m => !actualCounts[m._id]);

  if (fixes.length === 0) {
    console.log('  ✅ All manufacturer counts are accurate');
  } else {
    console.log(`  ⚠️  ${fixes.length} manufacturers have wrong plugin counts`);
    const totalDiff = fixes.reduce((sum, f) => sum + Math.abs(f.actualCount - f.storedCount), 0);
    console.log(`     Total discrepancy: ${totalDiff} entries`);
  }

  if (orphanedMfrs.length > 0) {
    console.log(`  ⚠️  ${orphanedMfrs.length} manufacturers have 0 actual plugins:`);
    for (const m of orphanedMfrs) {
      console.log(`    ${m.name} (slug: ${m.slug})`);
    }
  }

  return { countFixes: fixes, orphanedMfrs };
}

async function auditManufacturerData(allManufacturers) {
  console.log('\n📋 MANUFACTURER DATA AUDIT');
  console.log('─'.repeat(60));

  const issues = [];

  for (const mfr of allManufacturers) {
    const missing = [];
    if (!mfr.website) missing.push('website');
    if (!mfr.description) missing.push('description');
    if (!mfr.slug) missing.push('slug');

    if (missing.length > 0) {
      issues.push({ id: mfr._id, name: mfr.name, missing });
      console.log(`    ${mfr.name}: missing ${missing.join(', ')}`);
    }
  }

  if (issues.length === 0) {
    console.log('  ✅ All manufacturers have complete core data');
  } else {
    console.log(`  ⚠️  ${issues.length} manufacturers have missing data`);
  }

  return issues;
}

async function auditPluginData(allPlugins) {
  console.log('\n📋 PLUGIN DATA QUALITY AUDIT');
  console.log('─'.repeat(60));

  const issues = {
    noDescription: [],
    noCategory: [],
    noFormats: [],
    noManufacturer: [],
    noSlug: [],
  };

  for (const plugin of allPlugins) {
    if (!plugin.description) issues.noDescription.push(plugin.name);
    if (!plugin.category) issues.noCategory.push(plugin.name);
    if (!plugin.formats || plugin.formats.length === 0) issues.noFormats.push(plugin.name);
    if (!plugin.manufacturer) issues.noManufacturer.push(plugin.name);
    if (!plugin.slug) issues.noSlug.push(plugin.name);
  }

  console.log(`  Total plugins: ${allPlugins.length}`);
  console.log(`  Missing description: ${issues.noDescription.length}`);
  console.log(`  Missing category: ${issues.noCategory.length}`);
  console.log(`  Missing formats: ${issues.noFormats.length}`);
  console.log(`  Missing manufacturer: ${issues.noManufacturer.length}`);
  console.log(`  Missing slug: ${issues.noSlug.length}`);

  if (VERBOSE && issues.noDescription.length > 0) {
    console.log(`\n  Plugins missing description (first 20):`);
    for (const name of issues.noDescription.slice(0, 20)) {
      console.log(`    - ${name}`);
    }
  }

  return issues;
}

async function auditEnrichment(allPlugins) {
  console.log('\n📋 ENRICHMENT COVERAGE AUDIT');
  console.log('─'.repeat(60));

  const fields = [
    'effectType', 'circuitEmulation', 'tonalCharacter',
    'worksWellOn', 'useCases', 'genreSuitability', 'sonicCharacter',
    'comparableTo', 'skillLevel', 'learningCurve', 'cpuUsage',
    'licenseType', 'keyFeatures', 'recommendedDaws', 'isIndustryStandard'
  ];

  const coverage = {};
  for (const field of fields) {
    const count = allPlugins.filter(p => {
      const val = p[field];
      if (Array.isArray(val)) return val.length > 0;
      return val !== undefined && val !== null && val !== '';
    }).length;
    coverage[field] = count;
  }

  const total = allPlugins.length;
  console.log(`  Total plugins: ${total}`);
  console.log('');
  console.log('  Field                  Count    Pct');
  console.log('  ' + '─'.repeat(42));

  for (const field of fields) {
    const count = coverage[field];
    const pct = Math.round((count / total) * 100);
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    console.log(`  ${field.padEnd(22)} ${String(count).padStart(5)}  ${String(pct).padStart(3)}% ${bar}`);
  }

  // Fully enriched (all key fields present)
  const fullyEnriched = allPlugins.filter(p =>
    p.effectType &&
    p.worksWellOn?.length > 0 &&
    p.useCases?.length > 0 &&
    p.skillLevel &&
    p.cpuUsage
  ).length;

  console.log('');
  console.log(`  Fully enriched: ${fullyEnriched}/${total} (${Math.round((fullyEnriched/total)*100)}%)`);
  console.log(`  Need enrichment: ${total - fullyEnriched}`);

  return coverage;
}

// =============================================================================
// Fix Functions
// =============================================================================

async function fixCategories(categoryFixes) {
  if (categoryFixes.length === 0) return;

  console.log(`\n🔧 FIXING ${categoryFixes.length} CATEGORY MISCLASSIFICATIONS`);
  console.log('─'.repeat(60));

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would fix:');
    for (const fix of categoryFixes) {
      console.log(`    ${fix.name}: ${fix.oldCategory} → ${fix.newCategory}`);
    }
    return;
  }

  let success = 0, failed = 0;

  for (const fix of categoryFixes) {
    try {
      // Use the agentEnrich upsert (apiKey-based, doesn't need session token)
      // But it requires slug... Let me use direct mutation via deploy key
      await convexMutation('agentEnrich:upsertPluginEnrichment', {
        apiKey: 'pluginradar-enrich-2026',
        slug: fix.slug || fix.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: fix.name,
        manufacturer: fix.manufacturerName || 'Unknown',
        category: fix.newCategory,
      });
      console.log(`  ✅ ${fix.name}: ${fix.oldCategory} → ${fix.newCategory}`);
      success++;
    } catch (err) {
      console.log(`  ❌ ${fix.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n  Results: ${success} fixed, ${failed} failed`);
}

async function fixManufacturerCounts(countFixes) {
  if (countFixes.length === 0) return;

  console.log(`\n🔧 FIXING ${countFixes.length} MANUFACTURER COUNTS`);
  console.log('─'.repeat(60));

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would fix:');
    for (const fix of countFixes) {
      console.log(`    ${fix.name}: ${fix.storedCount} → ${fix.actualCount}`);
    }
    return;
  }

  let success = 0, failed = 0;

  for (const fix of countFixes) {
    try {
      await convexMutation('manufacturers:update', {
        id: fix.id,
        pluginCount: fix.actualCount,
      });
      console.log(`  ✅ ${fix.name}: ${fix.storedCount} → ${fix.actualCount}`);
      success++;
    } catch (err) {
      // Try alternative update path
      try {
        await convexMutation('manufacturers:upsertBySlug', {
          name: fix.name,
          slug: fix.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          pluginCount: fix.actualCount,
        });
        console.log(`  ✅ ${fix.name}: ${fix.storedCount} → ${fix.actualCount} (via upsert)`);
        success++;
      } catch (err2) {
        console.log(`  ❌ ${fix.name}: ${err2.message}`);
        failed++;
      }
    }
  }

  console.log(`\n  Results: ${success} fixed, ${failed} failed`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('🔍 Plugin Database Audit & Fix Script');
  console.log('═'.repeat(60));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (audit only)' : '🔧 FIX MODE'}`);
  console.log(`Database: ${CONVEX_URL}`);
  console.log('');

  // 1. Fetch all data
  console.log('📦 Fetching data...');

  const [allPlugins, allManufacturers, enrichStats] = await Promise.all([
    convexQuery('agentEnrich:listEnrichedPlugins', { limit: 1000 }),
    convexQuery('manufacturers:list', { limit: 500 }),
    convexQuery('enrichment:getEnrichmentStats', {}),
  ]);

  console.log(`  ${allPlugins.length} plugins, ${allManufacturers.length} manufacturers`);

  // Also get full plugin data for enrichment audit
  const unenriched = await convexQuery('enrichment:getUnenriched', { limit: 1000 });

  // 2. Run audits
  const categoryFixes = await auditCategories(allPlugins);
  const { countFixes, orphanedMfrs } = await auditManufacturerCounts(allPlugins, allManufacturers);
  const mfrDataIssues = await auditManufacturerData(allManufacturers);

  // Use unenriched for data quality since it has more fields
  console.log('\n📋 ENRICHMENT OVERVIEW');
  console.log('─'.repeat(60));
  console.log(`  Total: ${enrichStats.total}`);
  console.log(`  Fully enriched: ${enrichStats.fullyEnriched} (${enrichStats.percentages.fullyEnriched}%)`);
  console.log(`  Need enrichment: ${unenriched.length}+ plugins`);
  console.log('');
  console.log('  Field coverage:');
  for (const [key, pct] of Object.entries(enrichStats.percentages)) {
    if (key === 'fullyEnriched') continue;
    console.log(`    ${key.padEnd(22)} ${String(pct).padStart(3)}%`);
  }

  // 3. Apply fixes if not dry run
  if (!DRY_RUN) {
    // We need more plugin data for category fixes (slug, manufacturer name)
    console.log('\n📦 Fetching detailed plugin data for fixes...');

    // For category fixes, we need slug and manufacturer info
    for (const fix of categoryFixes) {
      try {
        const plugin = await convexQuery('agentEnrich:searchPlugins', { query: fix.name, limit: 1 });
        if (plugin.length > 0) {
          fix.slug = plugin[0].slug;
          fix.manufacturerName = plugin[0].manufacturer || 'Unknown';
        }
      } catch {
        // Will try to generate slug from name
      }
    }

    await fixCategories(categoryFixes);
    await fixManufacturerCounts(countFixes);
  }

  // 4. Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 AUDIT SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Total plugins: ${enrichStats.total}`);
  console.log(`  Category issues: ${categoryFixes.length}`);
  console.log(`  Manufacturer count issues: ${countFixes.length}`);
  console.log(`  Orphaned manufacturers: ${orphanedMfrs.length}`);
  console.log(`  Manufacturer data issues: ${mfrDataIssues.length}`);
  console.log(`  Plugins needing enrichment: ${unenriched.length}+`);
  console.log(`  Enrichment coverage: ${enrichStats.percentages.fullyEnriched}%`);
  console.log('');

  if (DRY_RUN) {
    console.log('💡 Run with --fix to apply corrections');
    console.log('💡 Run batch-web-enrich-exa.mjs to enrich missing data');
  }
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
