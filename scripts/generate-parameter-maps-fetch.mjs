#!/usr/bin/env node
/**
 * Ultra-Simple AI Parameter Map Generator
 *
 * Uses fetch API directly - NO dependencies needed!
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/generate-parameter-maps-fetch.mjs
 *   ANTHROPIC_API_KEY=sk-... node scripts/generate-parameter-maps-fetch.mjs --category compressor --limit 3
 */

// =============================================================================
// Configuration
// =============================================================================

const CONVEX_URL = process.env.CONVEX_URL || 'https://next-frog-231.convex.cloud';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY environment variable not set');
  console.error('Usage: ANTHROPIC_API_KEY=sk-... node scripts/generate-parameter-maps-fetch.mjs');
  process.exit(1);
}

// Parse CLI arguments
const args = process.argv.slice(2);
const categoryFilter = args.includes('--category') ? args[args.indexOf('--category') + 1] : 'eq';
const limitCount = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 5;

// =============================================================================
// Convex Client Helper
// =============================================================================

async function convexMutation(functionName, args) {
  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: functionName,
      args: args,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Convex mutation failed: ${error}`);
  }

  return response.json();
}

async function convexQuery(functionName, args = {}) {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: functionName,
      args: args,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Convex query failed: ${error}`);
  }

  return response.json();
}

// =============================================================================
// Claude API Helper
// =============================================================================

async function callClaude(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API failed: ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// =============================================================================
// Find Unmapped Plugins
// =============================================================================

async function findUnmappedPlugins(category, limit) {
  console.log(`🔍 Finding unmapped ${category} plugins...`);

  // Query all plugins
  const allPlugins = await convexQuery('plugins:listAll', {});

  // Filter to category
  const categoryPlugins = allPlugins.filter(p => p.category === category);
  console.log(`   Found ${categoryPlugins.length} total ${category} plugins in catalog`);

  // Check which ones have parameter maps
  const unmapped = [];
  for (const plugin of categoryPlugins) {
    try {
      const hasMap = await convexQuery('parameterTranslation:getParameterMap', {
        pluginId: plugin._id,
      });
      if (!hasMap) {
        unmapped.push(plugin);
      }
    } catch (err) {
      // Assume no map if query fails
      unmapped.push(plugin);
    }

    if (unmapped.length >= limit) break;
  }

  console.log(`   Found ${unmapped.length} unmapped plugins\n`);
  return unmapped;
}

// =============================================================================
// Generate Parameter Map with Claude
// =============================================================================

async function generateParameterMap(plugin) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Generating map for: ${plugin.name} (${plugin.manufacturer})`);
  console.log('='.repeat(80));

  const prompt = `Generate a parameter map for this audio plugin:

**Plugin Name:** ${plugin.name}
**Manufacturer:** ${plugin.manufacturer}
**Category:** ${plugin.category}
${plugin.description ? `**Description:** ${plugin.description}` : ''}
${plugin.effectType ? `**Effect Type:** ${plugin.effectType}` : ''}

Based on the plugin name and manufacturer, generate a JSON parameter map following this format:

\`\`\`json
{
  "parameters": [
    {
      "juceParamId": "Band 1 Frequency",
      "semantic": "eq_band_1_freq",
      "physicalUnit": "hz",
      "mappingCurve": "logarithmic",
      "minValue": 20,
      "maxValue": 20000,
      "defaultValue": 1000
    }
  ],
  "eqBandCount": 8,
  "confidence": 65
}
\`\`\`

**Semantic IDs for EQ:**
- eq_band_N_freq (hz, logarithmic, 20-20000)
- eq_band_N_gain (db, linear, -24 to +24)
- eq_band_N_q (ratio, logarithmic, 0.1-30)
- eq_band_N_type (stepped: bell, low_shelf, high_shelf, hpf, lpf, notch)

**Semantic IDs for Compressor:**
- comp_threshold (db, linear, -60 to 0)
- comp_ratio (ratio, logarithmic, 1-20)
- comp_attack (ms, logarithmic, 0.01-250)
- comp_release (ms, logarithmic, 1-2500)
- comp_knee (db, linear, 0-40)
- comp_makeup (db, linear, -24 to +24)

**Common juceParamId patterns:**
- FabFilter: "Band {N} Frequency", "Band {N} Gain", "Band {N} Q"
- Waves: "Band{N}_Freq", "Band{N}_Gain" (no spaces)
- SSL/Neve: "LF Freq", "LMF Freq", "HMF Freq", "HF Freq"

Use confidence 60-70 for AI-generated maps.

Return ONLY the JSON, no other text.`;

  try {
    const responseText = await callClaude(prompt);
    console.log('\n📝 Claude Response:');
    console.log(responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));

    // Extract JSON from response
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) ||
                      responseText.match(/```\n([\s\S]*?)\n```/) ||
                      [null, responseText];
    const jsonStr = jsonMatch[1] ? jsonMatch[1].trim() : responseText.trim();
    const paramMap = JSON.parse(jsonStr);

    return paramMap;
  } catch (err) {
    console.error(`❌ Error generating map: ${err.message}`);
    return null;
  }
}

// =============================================================================
// Save Parameter Map
// =============================================================================

async function saveParameterMap(plugin, paramMap) {
  console.log(`\n💾 Saving parameter map...`);

  try {
    await convexMutation('parameterTranslation:upsertParameterMap', {
      plugin: plugin._id,
      pluginName: plugin.name,
      category: plugin.category,
      parameters: paramMap.parameters,
      eqBandCount: paramMap.eqBandCount,
      eqBandParameterPattern: paramMap.eqBandParameterPattern,
      compHasAutoMakeup: paramMap.compHasAutoMakeup,
      compHasParallelMix: paramMap.compHasParallelMix,
      compHasLookahead: paramMap.compHasLookahead,
      confidence: paramMap.confidence || 65,
      source: 'ai-generated',
    });

    console.log(`✅ Successfully saved map with ${paramMap.parameters.length} parameters (${paramMap.confidence || 65}% confidence)`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to save: ${err.message}`);
    return false;
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('🤖 AI Parameter Map Generator (Fetch Version - No Dependencies!)\n');
  console.log(`Target: ${CONVEX_URL}`);
  console.log(`Category: ${categoryFilter}`);
  console.log(`Limit: ${limitCount} plugins\n`);

  // Find unmapped plugins
  const unmappedPlugins = await findUnmappedPlugins(categoryFilter, limitCount);

  if (unmappedPlugins.length === 0) {
    console.log('✅ No unmapped plugins found! All plugins in this category have maps.');
    return;
  }

  console.log(`\n📋 Processing ${unmappedPlugins.length} plugins:\n`);
  unmappedPlugins.forEach((p, i) => {
    console.log(`${i + 1}. ${p.name} (${p.manufacturer})`);
  });

  // Generate and save maps
  let successCount = 0;
  let failCount = 0;

  for (const plugin of unmappedPlugins) {
    const paramMap = await generateParameterMap(plugin);

    if (paramMap && paramMap.parameters && paramMap.parameters.length > 0) {
      const saved = await saveParameterMap(plugin, paramMap);
      if (saved) {
        successCount++;
      } else {
        failCount++;
      }
    } else {
      console.log(`⚠️ Skipping - invalid parameter map generated`);
      failCount++;
    }

    // Wait a bit between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Successfully generated: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📊 Total processed: ${successCount + failCount}`);
  console.log('\n✨ Done! Check the Convex dashboard to see the new parameter maps.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
