#!/usr/bin/env node
/**
 * PluginRadar Research Agent - Built with Claude Agent SDK
 * 
 * An autonomous agent for researching, enriching, and comparing DSP plugins.
 * Saves directly to Convex database with deduplication.
 * 
 * Usage:
 *   node plugin-agent.mjs "Research FabFilter Pro-Q 4"
 *   node plugin-agent.mjs --compare "Pro-Q 4" "Kirchhoff-EQ"
 *   node plugin-agent.mjs --trending
 */

import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import path from 'path';

// =============================================================================
// Configuration
// =============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Convex configuration
const CONVEX_URL = process.env.CONVEX_URL || 'https://next-frog-231.convex.cloud';

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
// Custom MCP Server with Convex Integration
// =============================================================================

const pluginMcpServer = createSdkMcpServer({
  name: 'plugin-radar-convex',
  version: '1.0.0',
  tools: [
    // Save Plugin Enrichment directly to Convex
    tool(
      'save_plugin_enrichment',
      'Save enriched plugin data to the PluginRadar Convex database. Automatically de-duplicates by slug and creates manufacturer if needed.',
      {
        slug: z.string().describe('Plugin slug (lowercase, hyphens, e.g., "fabfilter-pro-q-4")'),
        name: z.string().describe('Full plugin name'),
        manufacturer: z.string().describe('Manufacturer name'),
        category: z.enum(['eq', 'compressor', 'limiter', 'reverb', 'delay', 'saturation', 'modulation', 'stereo-imaging', 'gate-expander', 'de-esser', 'filter', 'channel-strip', 'metering', 'noise-reduction', 'multiband', 'utility']).optional().describe('Effect category (effects only — NO instruments/synths/samplers)'),
        effectType: z.string().optional().describe('Granular effect subtype: parametric, VCA, FET, optical, brickwall, algorithmic, convolution, plate, tube, tape, chorus, flanger, etc.'),
        circuitEmulation: z.string().optional().describe('Hardware circuit emulation (e.g. "Neve 1073", "SSL G-Bus", "LA-2A", "1176")'),
        tonalCharacter: z.array(z.string()).optional().describe('Tonal character descriptors: warm, transparent, aggressive, smooth, colored, clean'),
        description: z.string().optional().describe('Full description'),
        shortDescription: z.string().optional().describe('Brief one-line description'),
        formats: z.array(z.string()).optional().describe('Plugin formats (VST3, AU, AAX, etc.)'),
        platforms: z.array(z.string()).optional().describe('Platforms (windows, mac, linux)'),
        systemRequirements: z.string().optional().describe('System requirements'),
        msrp: z.number().optional().describe('Price in cents (e.g., 17900 for $179)'),
        isFree: z.boolean().optional().describe('Is the plugin free?'),
        tags: z.array(z.string()).optional().describe('Tags (mastering, vintage, ai-powered, etc.)'),
        features: z.array(z.string()).optional().describe('Key features'),
        pros: z.array(z.string()).optional().describe('Advantages/strengths'),
        cons: z.array(z.string()).optional().describe('Disadvantages/weaknesses'),
        useCases: z.array(z.string()).optional().describe('Ideal use cases'),
        productUrl: z.string().optional().describe('Manufacturer product page URL'),
        imageUrl: z.string().optional().describe('Plugin image URL'),
      },
      async (data) => {
        // Reject instruments/synths
        const REJECTED_CATEGORIES = ['synth', 'sampler', 'instrument', 'bundle'];
        if (data.category && REJECTED_CATEGORIES.includes(data.category)) {
          return {
            content: [{ type: 'text', text: `⛔ REJECTED: "${data.name}" is categorized as "${data.category}". PluginRadar only tracks audio effects, not instruments/synths.` }],
            isError: true,
          };
        }
        
        try {
          const result = await convexMutation('agentEnrich:upsertPluginEnrichment', data);
          const status = result.isNew ? 'Created new' : 'Updated existing';
          return {
            content: [{ 
              type: 'text', 
              text: `✅ ${status} plugin "${data.name}" (${data.slug}) in Convex database` 
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

    // Save Plugin Comparison to Convex
    tool(
      'save_plugin_comparison',
      'Save a plugin comparison to the Convex database. Both plugins must already exist (by slug).',
      {
        slug: z.string().describe('Comparison slug (e.g., "pro-q-4-vs-kirchhoff-eq")'),
        pluginASlug: z.string().describe('First plugin slug'),
        pluginBSlug: z.string().describe('Second plugin slug'),
        category: z.string().describe('Comparison category (EQ, Compressor, etc.)'),
        title: z.string().optional().describe('Comparison title'),
        summary: z.string().optional().describe('Comparison summary/verdict'),
        verdict: z.string().optional().describe('Overall winner verdict'),
        prosA: z.array(z.string()).optional().describe('Plugin A pros'),
        prosB: z.array(z.string()).optional().describe('Plugin B pros'),
        consA: z.array(z.string()).optional().describe('Plugin A cons'),
        consB: z.array(z.string()).optional().describe('Plugin B cons'),
        bestForA: z.array(z.string()).optional().describe('Plugin A best use cases'),
        bestForB: z.array(z.string()).optional().describe('Plugin B best use cases'),
        faqs: z.array(z.object({
          question: z.string(),
          answer: z.string(),
        })).optional().describe('FAQ pairs for SEO'),
      },
      async (data) => {
        try {
          const result = await convexMutation('agentEnrich:upsertComparison', data);
          if (!result.success) {
            return {
              content: [{ type: 'text', text: `❌ ${result.error}` }],
              isError: true,
            };
          }
          const status = result.isNew ? 'Created new' : 'Updated existing';
          return {
            content: [{ 
              type: 'text', 
              text: `✅ ${status} comparison "${data.slug}" in Convex database` 
            }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `❌ Failed to save comparison: ${err.message}` }],
            isError: true,
          };
        }
      }
    ),

    // Query existing plugins
    tool(
      'search_plugins',
      'Search for existing plugins in the database by name.',
      {
        query: z.string().describe('Search query'),
        limit: z.number().optional().default(10).describe('Max results'),
      },
      async ({ query, limit }) => {
        try {
          const results = await convexQuery('agentEnrich:searchPlugins', { query, limit });
          if (!results.length) {
            return {
              content: [{ type: 'text', text: `No plugins found matching "${query}"` }],
            };
          }
          const list = results.map(p => `- ${p.name} (${p.slug})`).join('\n');
          return {
            content: [{ type: 'text', text: `Found ${results.length} plugins:\n${list}` }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `❌ Search failed: ${err.message}` }],
            isError: true,
          };
        }
      }
    ),

    // Get plugin by slug
    tool(
      'get_plugin',
      'Get a specific plugin from the database by slug.',
      {
        slug: z.string().describe('Plugin slug'),
      },
      async ({ slug }) => {
        try {
          const plugin = await convexQuery('agentEnrich:getPluginBySlug', { slug });
          if (!plugin) {
            return {
              content: [{ type: 'text', text: `Plugin "${slug}" not found in database` }],
            };
          }
          return {
            content: [{ 
              type: 'text', 
              text: `Plugin: ${plugin.name}\nCategory: ${plugin.category}\nDescription: ${plugin.description || 'N/A'}\nFormats: ${plugin.formats?.join(', ') || 'N/A'}` 
            }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `❌ Query failed: ${err.message}` }],
            isError: true,
          };
        }
      }
    ),

    // List enriched plugins
    tool(
      'list_enriched_plugins',
      'List recently enriched plugins in the database.',
      {
        limit: z.number().optional().default(20).describe('Max results'),
      },
      async ({ limit }) => {
        try {
          const plugins = await convexQuery('agentEnrich:listEnrichedPlugins', { limit });
          if (!plugins.length) {
            return {
              content: [{ type: 'text', text: 'No plugins in database yet' }],
            };
          }
          const list = plugins.map(p => `- ${p.name} by ${p.manufacturer} (${p.category})`).join('\n');
          return {
            content: [{ type: 'text', text: `${plugins.length} plugins in database:\n${list}` }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `❌ Query failed: ${err.message}` }],
            isError: true,
          };
        }
      }
    ),

    // List comparisons
    tool(
      'list_comparisons',
      'List existing plugin comparisons in the database.',
      {
        limit: z.number().optional().default(20).describe('Max results'),
      },
      async ({ limit }) => {
        try {
          const comparisons = await convexQuery('agentEnrich:listComparisons', { limit });
          if (!comparisons.length) {
            return {
              content: [{ type: 'text', text: 'No comparisons in database yet' }],
            };
          }
          const list = comparisons.map(c => `- ${c.pluginA} vs ${c.pluginB} (${c.category})`).join('\n');
          return {
            content: [{ type: 'text', text: `${comparisons.length} comparisons:\n${list}` }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `❌ Query failed: ${err.message}` }],
            isError: true,
          };
        }
      }
    ),
  ],
});

// =============================================================================
// System Prompts
// =============================================================================

const RESEARCH_PROMPT = `You are a DSP plugin research agent for PluginRadar, a platform that tracks **audio EFFECT plugins** for music producers.

⚠️ CRITICAL: PluginRadar ONLY tracks audio EFFECTS (EQ, compressor, limiter, reverb, delay, saturation, modulation, stereo imaging, gate/expander, de-esser, filter, channel strip, metering, noise reduction, multiband, utility). Do NOT save instruments, synths, samplers, or bundles.

Your job is to research audio effect plugins (VST, AU, AAX) and save comprehensive information to our Convex database.

**Available Tools:**
- WebSearch: Search for plugin information, reviews, tutorials
- WebFetch: Read full content from manufacturer pages and review sites
- save_plugin_enrichment: Save research directly to Convex database (auto-deduplicates)
- search_plugins: Check if a plugin already exists
- get_plugin: Get existing plugin data
- list_enriched_plugins: See what's in the database

**Workflow:**
1. Use search_plugins to check if the plugin already exists
2. Use WebSearch to find official manufacturer info and professional reviews
3. Use WebFetch to read detailed content from key sources
4. Classify the effect:
   - **category**: eq, compressor, limiter, reverb, delay, saturation, modulation, stereo-imaging, gate-expander, de-esser, filter, channel-strip, metering, noise-reduction, multiband, utility
   - **effectType**: Granular subtype (e.g., "parametric" for EQ, "FET" for compressor, "convolution" for reverb, "tube" for saturation)
   - **circuitEmulation**: If it emulates hardware (e.g., "Neve 1073", "LA-2A", "SSL G-Bus")
   - **tonalCharacter**: Array of descriptors (e.g., ["warm", "smooth"], ["transparent", "clean"])
5. Extract: name, manufacturer, category, effectType, circuitEmulation, tonalCharacter, description, features, formats, price, pros/cons, use cases
6. Save using save_plugin_enrichment with all the data

**Important:**
- REJECT any instruments, synths, or samplers — do not save them
- Always provide a proper slug (lowercase, hyphens, e.g., "fabfilter-pro-q-4")
- Convert price to cents (e.g., $179 → 17900)
- Be thorough but factual - only include verified information
- The database handles deduplication, so saving updates existing records`;

const COMPARISON_PROMPT = `You are a plugin comparison specialist for PluginRadar.

Your job is to create detailed, fair comparisons between audio plugins and save them to our Convex database.

**Available Tools:**
- WebSearch: Search for plugin comparisons and reviews
- WebFetch: Read detailed content from sources
- save_plugin_comparison: Save comparison to database
- search_plugins / get_plugin: Get existing plugin data
- list_comparisons: See existing comparisons

**Workflow:**
1. First, ensure BOTH plugins exist in the database (search_plugins)
2. If not, research and save them first using the research workflow
3. Research the comparison thoroughly (WebSearch, WebFetch)
4. Compare: sound quality, features, workflow/UI, CPU usage, price/value
5. Save using save_plugin_comparison with structured data

**Comparison slug format:** "plugina-slug-vs-pluginb-slug" (e.g., "pro-q-4-vs-kirchhoff-eq")

Include FAQs for SEO (3-5 questions like "Which is better for mastering?")`;

const TRENDING_PROMPT = `You are a trends analyst for PluginRadar.

Your job is to identify trending and newsworthy audio plugins.

**Available Tools:**
- WebSearch: Search for recent plugin news and discussions
- WebFetch: Read articles and forum posts

**Focus on:**
1. Recent plugin releases and major updates (last 30 days)
2. Plugins generating buzz on forums and social media
3. Notable sales and deals
4. Plugins featured in recent tutorials

Report plugins with sources. For any interesting finds, I may ask you to enrich them in a follow-up.`;

// =============================================================================
// Agent Runner
// =============================================================================

async function runAgent(prompt, systemPrompt) {
  console.log('\n🎛️  PluginRadar Agent');
  console.log('─'.repeat(60));
  console.log('📝 Task:', prompt);
  console.log('─'.repeat(60));
  console.log('');
  
  const fullPrompt = `${systemPrompt}\n\n---\n\nUser request: ${prompt}`;
  
  const q = query({
    prompt: fullPrompt,
    options: {
      mcpServers: [pluginMcpServer],
      allowedTools: [
        'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
        'WebSearch', 'WebFetch', 'Task',
        'mcp__0__save_plugin_enrichment',
        'mcp__0__save_plugin_comparison',
        'mcp__0__search_plugins',
        'mcp__0__get_plugin',
        'mcp__0__list_enriched_plugins',
        'mcp__0__list_comparisons',
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
        if (content) {
          const blocks = Array.isArray(content) ? content : [content];
          for (const block of blocks) {
            if (block.type === 'text' && block.text) {
              process.stdout.write(block.text);
              result += block.text;
            } else if (block.type === 'tool_use') {
              console.log(`\n  ⟳ ${block.name}`);
            }
          }
        }
        break;
        
      case 'user':
        const userContent = message.content;
        if (userContent) {
          const blocks = Array.isArray(userContent) ? userContent : [userContent];
          for (const block of blocks) {
            if (block.type === 'tool_result') {
              const status = block.is_error ? '✗' : '✓';
              const preview = typeof block.content === 'string' 
                ? block.content.slice(0, 80) 
                : '';
              if (preview) console.log(`    ${status} ${preview}`);
            }
          }
        }
        break;
        
      case 'result':
        if (message.subtype === 'success') {
          console.log('\n\n' + '─'.repeat(60));
          console.log('✅ Task completed');
          if (message.usage) {
            console.log(`📊 Tokens: ${message.usage.input_tokens} in / ${message.usage.output_tokens} out`);
          }
          if (message.total_cost_usd) {
            console.log(`💰 Cost: $${message.total_cost_usd.toFixed(4)}`);
          }
          if (message.result && !result) {
            result = message.result;
          }
        } else if (message.subtype === 'error') {
          console.error('\n❌ Error:', message.error);
        }
        break;
      
      case 'text':
        if (message.content) {
          process.stdout.write(message.content);
          result += message.content;
        }
        break;
    }
  }
  
  return result;
}

// =============================================================================
// CLI
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
🎛️  PluginRadar Research Agent
Built with Claude Agent SDK + Convex Database

USAGE:
  node plugin-agent.mjs <query>              Research a plugin or topic
  node plugin-agent.mjs --compare <A> <B>    Compare two plugins
  node plugin-agent.mjs --trending           Find trending plugins
  node plugin-agent.mjs --enrich <slug>      Enrich a specific plugin

EXAMPLES:
  node plugin-agent.mjs "Research FabFilter Pro-Q 4"
  node plugin-agent.mjs --compare "Pro-Q 4" "Kirchhoff-EQ"
  node plugin-agent.mjs --trending
  node plugin-agent.mjs --enrich fabfilter-pro-q-4

DATA:
  All research is saved directly to Convex database (next-frog-231)
  with automatic deduplication by slug.

CRON:
  # Daily trending scan at 7am UK
  0 7 * * * cd ~/projects/plugin-radar && node scripts/plugin-agent.mjs --trending

  # Weekly comparison generation
  0 9 * * 1 node scripts/plugin-agent.mjs --compare "Serum" "Vital"
`);
    process.exit(0);
  }
  
  let prompt;
  let systemPrompt = RESEARCH_PROMPT;
  
  if (args.includes('--compare')) {
    const idx = args.indexOf('--compare');
    const pluginA = args[idx + 1];
    const pluginB = args[idx + 2];
    
    if (!pluginA || !pluginB) {
      console.error('Error: --compare requires two plugin names');
      process.exit(1);
    }
    
    prompt = `Compare "${pluginA}" vs "${pluginB}" as audio plugins. First ensure both exist in the database (enrich if needed), then research and save a detailed comparison.`;
    systemPrompt = COMPARISON_PROMPT;
    
  } else if (args.includes('--trending')) {
    prompt = 'Find trending DSP plugins from the last 30 days. Focus on new releases, major updates, and plugins generating buzz. Include sources.';
    systemPrompt = TRENDING_PROMPT;
    
  } else if (args.includes('--enrich')) {
    const idx = args.indexOf('--enrich');
    const slug = args[idx + 1];
    
    if (!slug) {
      console.error('Error: --enrich requires a plugin slug');
      process.exit(1);
    }
    
    prompt = `Research and enrich the plugin: ${slug}. Gather comprehensive information and save to the database using save_plugin_enrichment.`;
    
  } else {
    prompt = args.filter(a => !a.startsWith('--')).join(' ');
    
    if (!prompt) {
      console.error('Error: No query provided');
      process.exit(1);
    }
  }
  
  try {
    await runAgent(prompt, systemPrompt);
  } catch (err) {
    console.error('\n❌ Agent error:', err.message);
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
