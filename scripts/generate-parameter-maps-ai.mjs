#!/usr/bin/env node
/**
 * AI Parameter Map Generator - Built with Claude Agent SDK
 *
 * Uses Claude to generate parameter maps for plugins that don't have them yet.
 * Auto-authenticates with your Claude Max subscription.
 *
 * Usage:
 *   node scripts/generate-parameter-maps-ai.mjs                # Generate for all unmapped plugins
 *   node scripts/generate-parameter-maps-ai.mjs --category eq  # Generate only for EQs
 *   node scripts/generate-parameter-maps-ai.mjs --limit 10     # Generate for first 10 plugins
 *   node scripts/generate-parameter-maps-ai.mjs --plugin "FabFilter Pro-Q 4"  # Generate for specific plugin
 */

import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// =============================================================================
// Configuration
// =============================================================================

const CONVEX_URL = process.env.CONVEX_URL || 'https://next-frog-231.convex.cloud';

// Parse CLI arguments
const args = process.argv.slice(2);
const categoryFilter = args.includes('--category') ? args[args.indexOf('--category') + 1] : null;
const limitCount = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;
const specificPlugin = args.includes('--plugin') ? args[args.indexOf('--plugin') + 1] : null;

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
// Custom MCP Server for Parameter Map Generation
// =============================================================================

const parameterMapServer = createSdkMcpServer({
  name: 'parameter-map-generator',
  version: '1.0.0',
  tools: [
    // Search plugins without parameter maps
    tool(
      'find_unmapped_plugins',
      'Find plugins in the catalog that don\'t have parameter maps yet. Useful to see what needs to be mapped.',
      {
        category: z.enum(['eq', 'compressor', 'limiter', 'reverb', 'delay', 'saturation', 'all']).optional().describe('Filter by category (default: all)'),
        limit: z.number().optional().describe('Maximum number of plugins to return (default: 50)'),
      },
      async (data) => {
        try {
          // Query all plugins
          const allPlugins = await convexQuery('plugins:listAll', {});

          // Filter to only effect categories we care about for parameter mapping
          const effectCategories = ['eq', 'compressor', 'limiter'];
          let plugins = allPlugins.filter(p =>
            effectCategories.includes(p.category) &&
            (data.category === 'all' || !data.category || p.category === data.category)
          );

          // Check which ones have parameter maps
          const unmapped = [];
          for (const plugin of plugins) {
            const hasMap = await convexQuery('parameterTranslation:getParameterMap', {
              pluginId: plugin._id,
            });
            if (!hasMap) {
              unmapped.push({
                id: plugin._id,
                name: plugin.name,
                manufacturer: plugin.manufacturer,
                category: plugin.category,
              });
            }
            if (unmapped.length >= (data.limit || 50)) break;
          }

          return {
            content: [{
              type: 'text',
              text: `Found ${unmapped.length} unmapped plugins:\n\n${unmapped.map((p, i) =>
                `${i + 1}. ${p.name} (${p.manufacturer}) - ${p.category}\n   ID: ${p.id}`
              ).join('\n')}`
            }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `❌ Error: ${err.message}` }],
            isError: true,
          };
        }
      }
    ),

    // Get plugin details for parameter map generation
    tool(
      'get_plugin_details',
      'Get detailed information about a plugin to help generate accurate parameter maps.',
      {
        pluginId: z.string().describe('The Convex plugin ID'),
      },
      async (data) => {
        try {
          const plugin = await convexQuery('plugins:get', { id: data.pluginId });
          if (!plugin) {
            return {
              content: [{ type: 'text', text: `❌ Plugin not found: ${data.pluginId}` }],
              isError: true,
            };
          }

          return {
            content: [{
              type: 'text',
              text: `Plugin Details:\n\n` +
                `Name: ${plugin.name}\n` +
                `Manufacturer: ${plugin.manufacturer}\n` +
                `Category: ${plugin.category}\n` +
                `Description: ${plugin.description || 'N/A'}\n` +
                `Effect Type: ${plugin.effectType || 'N/A'}\n` +
                `Key Features: ${plugin.keyFeatures?.join(', ') || 'N/A'}\n` +
                `Circuit Emulation: ${plugin.circuitEmulation || 'N/A'}\n` +
                `Tags: ${plugin.tags?.join(', ') || 'N/A'}`
            }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `❌ Error: ${err.message}` }],
            isError: true,
          };
        }
      }
    ),

    // Save generated parameter map
    tool(
      'save_parameter_map',
      'Save a generated parameter map to Convex. Use this after analyzing a plugin and determining its semantic parameters.',
      {
        pluginId: z.string().describe('The Convex plugin ID'),
        pluginName: z.string().describe('Full plugin name'),
        category: z.enum(['eq', 'compressor', 'limiter', 'reverb', 'delay', 'saturation', 'modulation', 'stereo-imaging', 'gate-expander', 'de-esser', 'filter', 'channel-strip', 'metering', 'noise-reduction', 'multiband', 'utility']).describe('Effect category'),
        parameters: z.array(z.object({
          juceParamId: z.string().describe('Expected JUCE parameter name (e.g., "Band 1 Frequency")'),
          semantic: z.string().describe('Semantic ID (e.g., "eq_band_1_freq", "comp_threshold")'),
          physicalUnit: z.string().describe('Physical unit: hz, db, ms, ratio, percent, stepped, boolean'),
          mappingCurve: z.string().describe('Mapping curve: linear, logarithmic, exponential, stepped'),
          minValue: z.number().describe('Physical minimum value'),
          maxValue: z.number().describe('Physical maximum value'),
          defaultValue: z.number().optional().describe('Physical default value'),
        })).describe('Array of parameter mappings'),
        eqBandCount: z.number().optional().describe('Number of EQ bands (for EQ plugins)'),
        eqBandParameterPattern: z.string().optional().describe('Band parameter pattern (e.g., "Band {N} Frequency")'),
        compHasAutoMakeup: z.boolean().optional().describe('Does compressor have auto makeup gain?'),
        compHasParallelMix: z.boolean().optional().describe('Does compressor have parallel mix/blend?'),
        compHasLookahead: z.boolean().optional().describe('Does compressor have lookahead?'),
        confidence: z.number().describe('Confidence score 0-100 (use 60-70 for AI-generated maps)'),
      },
      async (data) => {
        try {
          await convexMutation('parameterTranslation:upsertParameterMap', {
            plugin: data.pluginId,
            pluginName: data.pluginName,
            category: data.category,
            parameters: data.parameters,
            eqBandCount: data.eqBandCount,
            eqBandParameterPattern: data.eqBandParameterPattern,
            compHasAutoMakeup: data.compHasAutoMakeup,
            compHasParallelMix: data.compHasParallelMix,
            compHasLookahead: data.compHasLookahead,
            confidence: data.confidence,
            source: 'ai-generated',
          });

          return {
            content: [{
              type: 'text',
              text: `✅ Saved parameter map for "${data.pluginName}" with ${data.parameters.length} parameters (${data.confidence}% confidence)`
            }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `❌ Failed to save: ${err.message}` }],
            isError: true,
          };
        }
      }
    ),
  ],
});

// =============================================================================
// Main Agent Prompt
// =============================================================================

const systemPrompt = `You are a DSP plugin parameter mapping specialist. Your job is to generate semantic parameter maps for audio plugins.

## Your Task
Generate parameter maps for EQs, compressors, and limiters that don't have maps yet. A parameter map defines:
1. The expected JUCE parameter names (e.g., "Band 1 Frequency", "Threshold")
2. The semantic ID (e.g., "eq_band_1_freq", "comp_threshold")
3. The physical unit (hz, db, ms, ratio, percent)
4. The mapping curve (linear, logarithmic, exponential, stepped)
5. The expected min/max range

## Semantic Parameter Taxonomy

### EQ Parameters:
- eq_band_N_freq (hz, logarithmic, 20-20000)
- eq_band_N_gain (db, linear, -24 to +24)
- eq_band_N_q (ratio, logarithmic, 0.1-30)
- eq_band_N_type (stepped: bell, low_shelf, high_shelf, hpf, lpf, notch, bandpass)
- eq_hp_freq (hz, logarithmic, 10-500)
- eq_lp_freq (hz, logarithmic, 2000-22000)
- eq_output_gain (db, linear, -24 to +24)

### Compressor Parameters:
- comp_threshold (db, linear, -60 to 0)
- comp_ratio (ratio, logarithmic, 1-20)
- comp_attack (ms, logarithmic, 0.01-250)
- comp_release (ms, logarithmic, 1-2500)
- comp_knee (db, linear, 0-40)
- comp_makeup (db, linear, -24 to +24)
- comp_mix (percent, linear, 0-100)
- comp_range (db, linear, -60 to 0)
- comp_lookahead (ms, linear, 0-20)
- comp_style (stepped: clean, classic, opto, vocal, mastering, bus, punch, pumping)

### General Parameters:
- input_gain (db, linear, -24 to +24)
- output_gain (db, linear, -24 to +24)
- dry_wet_mix (percent, linear, 0-100)

## How to Generate Maps

1. Use find_unmapped_plugins to see what needs mapping
2. Use get_plugin_details to understand the plugin
3. Based on the plugin name, manufacturer, and category, infer likely parameters:
   - FabFilter Pro-Q → 24-band parametric EQ
   - SSL E-Channel → 4-band fixed EQ (LF, LMF, HMF, HF)
   - Waves CLA-76 → FET compressor (Input, Output, Ratio, Attack, Release)
   - Universal Audio 1176 → Classic FET compressor
4. Generate juceParamId based on common naming patterns:
   - FabFilter: "Band {N} Frequency", "Band {N} Gain", "Band {N} Q", "Band {N} Shape"
   - Waves: "Band{N}_Freq", "Band{N}_Gain", "Band{N}_Range"
   - SSL/Neve: "LF Freq", "LMF Freq", "HMF Freq", "HF Freq"
   - Compressors: "Threshold", "Ratio", "Attack", "Release", "Makeup"
5. Use confidence 60-70 for AI-generated maps (not as reliable as manual or JUCE-scanned)
6. Save the map using save_parameter_map

## Important Notes
- Only generate maps for plugins you have reasonable confidence about
- Use manufacturer conventions (e.g., Waves uses "Band{N}_Freq" not "Band {N} Frequency")
- SSL/Neve plugins often have fixed frequency bands, not adjustable
- FET compressors (1176, CLA-76) typically use Input/Output instead of Threshold/Makeup
- Optical compressors (LA-2A, CLA-2A) have simplified controls

Start by finding unmapped plugins, then work through them one by one.`;

// =============================================================================
// Main Execution
// =============================================================================

async function main() {
  console.log('🤖 AI Parameter Map Generator\n');
  console.log(`Target: ${CONVEX_URL}`);
  if (categoryFilter) console.log(`Category filter: ${categoryFilter}`);
  if (limitCount) console.log(`Limit: ${limitCount} plugins`);
  if (specificPlugin) console.log(`Specific plugin: ${specificPlugin}`);
  console.log('');

  let userPrompt = '';

  if (specificPlugin) {
    // Generate for specific plugin
    userPrompt = `Generate a parameter map for the plugin "${specificPlugin}". ` +
      `First search for it, get its details, then generate and save the map.`;
  } else {
    // Generate for unmapped plugins
    userPrompt = `Find unmapped plugins${categoryFilter ? ` in category "${categoryFilter}"` : ''}` +
      `${limitCount ? ` (limit ${limitCount})` : ''} and generate parameter maps for them. ` +
      `Work through them one by one, starting with well-known plugins you're confident about.`;
  }

  try {
    const q = query({
      prompt: `${systemPrompt}\n\n---\n\nUser request: ${userPrompt}`,
      options: {
        mcpServers: [parameterMapServer],
        allowedTools: [
          'mcp__0__find_unmapped_plugins',
          'mcp__0__get_plugin_details',
          'mcp__0__save_parameter_map',
        ],
      },
    });

    let result = '';

    for await (const message of q) {
      switch (message.type) {
        case 'system':
          if (message.subtype === 'init') {
            console.log(`🤖 Model: ${message.model}`);
            console.log(`🔧 Tools: ${message.tools?.length || 0} available`);
            console.log('📦 Database: Convex (next-frog-231)');
            console.log('');
          }
          break;

        case 'assistant':
          const content = message.message?.content || message.content;
          if (content && typeof content === 'string') {
            process.stdout.write(content);
            result += content;
          }
          break;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('AGENT COMPLETED');
    console.log('='.repeat(80));
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
