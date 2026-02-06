#!/usr/bin/env node
/**
 * Exa Plugin Enrichment Script
 * Uses Exa's Research API to enrich plugin data with structured output
 */

import Exa from 'exa-js';
import { ConvexHttpClient } from 'convex/browser';
import fs from 'fs';
import path from 'path';

// Load credentials
const credPath = path.join(process.env.HOME, '.credentials/exa/credentials.json');
const { apiKey } = JSON.parse(fs.readFileSync(credPath, 'utf-8'));

const exa = new Exa(apiKey);

const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const client = new ConvexHttpClient(CONVEX_URL);

// Enrichment schema for Exa Research
const PLUGIN_ENRICHMENT_SCHEMA = {
  type: "object",
  properties: {
    description: {
      type: "string",
      description: "A detailed description of the audio effect plugin (2-4 sentences)"
    },
    shortDescription: {
      type: "string",
      description: "A one-sentence summary of the audio effect plugin"
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Relevant tags like 'analog-modeling', 'vintage', 'mastering', 'free', 'ai-powered', 'mixing', 'creative'"
    },
    category: {
      type: "string",
      enum: ["eq", "compressor", "limiter", "reverb", "delay", "saturation", "modulation", "stereo-imaging", "gate-expander", "de-esser", "filter", "channel-strip", "metering", "noise-reduction", "multiband", "utility"],
      description: "Primary effect category (effects only — NO instruments/synths/samplers)"
    },
    effectType: {
      type: "string",
      description: "Granular effect subtype. EQ: parametric/graphic/dynamic/linear-phase/analog-modeled/tilt/passive. Compressor: VCA/FET/optical/variable-mu/digital-transparent/multiband/bus/parallel. Limiter: brickwall/transparent/coloring/multiband. Saturation: tube/tape/transistor/transformer/console/harmonic-exciter/clipper. Reverb: algorithmic/convolution/plate/spring/hall/room/shimmer/granular. Delay: digital/tape/analog-modeled/ping-pong/multi-tap/granular. Modulation: chorus/flanger/phaser/tremolo/vibrato/rotary/ensemble."
    },
    circuitEmulation: {
      type: "string",
      description: "If the plugin emulates specific hardware, name it (e.g. 'Neve 1073', 'SSL G-Bus', 'LA-2A', '1176', 'Pultec EQP-1A')"
    },
    tonalCharacter: {
      type: "array",
      items: { type: "string" },
      description: "Tonal character descriptors: warm, transparent, aggressive, smooth, colored, clean, punchy, dark, bright, airy"
    },
    subcategory: {
      type: "string",
      description: "More specific subcategory"
    },
    systemRequirements: {
      type: "string",
      description: "System requirements (OS versions, RAM, etc.)"
    },
    formats: {
      type: "array",
      items: { type: "string" },
      description: "Plugin formats like VST3, AU, AAX, CLAP, Standalone"
    },
    platforms: {
      type: "array",
      items: { type: "string" },
      description: "Supported platforms: windows, mac, linux"
    },
    releaseDate: {
      type: "string",
      description: "Original release date (YYYY-MM-DD if known)"
    },
    manualUrl: {
      type: "string",
      description: "URL to the official user manual or documentation"
    },
    hasDemo: {
      type: "boolean",
      description: "Whether a demo/trial version is available"
    },
    trialDays: {
      type: "number",
      description: "Number of trial days if applicable"
    },
    isInstrument: {
      type: "boolean",
      description: "True if this is a synth/sampler/instrument (will be REJECTED)"
    }
  },
  required: ["description", "shortDescription", "tags"]
};

// Simpler search-based enrichment for when Research API isn't needed
async function searchEnrich(pluginName, manufacturerName) {
  const query = `${pluginName} ${manufacturerName} plugin review specifications`;
  
  try {
    const results = await exa.searchAndContents(query, {
      type: 'auto',
      numResults: 5,
      text: { maxCharacters: 2000 },
      highlights: { numSentences: 3 }
    });
    
    return results.results;
  } catch (err) {
    console.error(`  Search error: ${err.message}`);
    return [];
  }
}

// Use Exa Answer API for enrichment
async function researchEnrich(pluginName, manufacturerName, productUrl) {
  const query = `What is ${pluginName} by ${manufacturerName}? Is it an audio EFFECT plugin or an instrument/synth? Give a brief description, what type of effect is it (EQ, compressor, reverb, delay, saturation, modulation, etc.), what specific subtype (e.g. parametric EQ, FET compressor, convolution reverb), does it emulate any specific hardware circuit, what is its tonal character (warm, transparent, aggressive, etc.), list the plugin formats (VST3, AU, AAX), and platforms (Windows, Mac).`;
  
  try {
    const result = await exa.answer(query, {
      text: true,
    });
    
    if (result.answer) {
      const answer = result.answer;
      
      // Check if it's an instrument — reject if so
      const instrumentIndicators = /\b(synthesizer|synth|sampler|virtual instrument|drum machine|rompler|piano|organ)\b/i;
      if (instrumentIndicators.test(answer) && !/effect|processor|dynamics|EQ|compressor|reverb|delay|filter/i.test(answer)) {
        console.log('  ⛔ SKIPPED: Detected as instrument/synth, not an effect');
        return { isInstrument: true };
      }
      
      const extracted = {
        description: answer.slice(0, 500),
        shortDescription: answer.split('.')[0] + '.',
      };
      
      // Try to extract formats
      const formatMatches = answer.match(/\b(VST3?|AU|AAX|CLAP|Standalone|RTAS)\b/gi);
      if (formatMatches) {
        extracted.formats = [...new Set(formatMatches.map(f => f.toUpperCase().replace('VST', 'VST3')))];
      }
      
      // Try to extract platforms
      const platforms = [];
      if (/windows|win|pc/i.test(answer)) platforms.push('windows');
      if (/mac|macos|osx/i.test(answer)) platforms.push('mac');
      if (/linux/i.test(answer)) platforms.push('linux');
      if (platforms.length > 0) extracted.platforms = platforms;
      
      // Extract effect category
      if (/\beq\b|equaliz/i.test(answer)) extracted.category = 'eq';
      else if (/compressor|compression/i.test(answer)) extracted.category = 'compressor';
      else if (/limiter|limiting/i.test(answer)) extracted.category = 'limiter';
      else if (/reverb/i.test(answer)) extracted.category = 'reverb';
      else if (/delay|echo/i.test(answer)) extracted.category = 'delay';
      else if (/saturat|distort|overdrive|tape.*warmth|tube/i.test(answer)) extracted.category = 'saturation';
      else if (/chorus|flang|phas|tremolo|vibrato|modulation/i.test(answer)) extracted.category = 'modulation';
      else if (/stereo.*imag|mid.side|widen/i.test(answer)) extracted.category = 'stereo-imaging';
      else if (/gate|expander|transient/i.test(answer)) extracted.category = 'gate-expander';
      else if (/de.?ess/i.test(answer)) extracted.category = 'de-esser';
      else if (/filter/i.test(answer)) extracted.category = 'filter';
      else if (/channel.?strip|console/i.test(answer)) extracted.category = 'channel-strip';
      else if (/meter|analyz|spectrum|loudness|lufs/i.test(answer)) extracted.category = 'metering';
      else if (/noise.?reduc|denois|restor/i.test(answer)) extracted.category = 'noise-reduction';
      else if (/multiband/i.test(answer)) extracted.category = 'multiband';
      
      // Extract effect subtype
      const subtypes = {
        eq: { 'parametric': /parametric/i, 'graphic': /graphic/i, 'dynamic': /dynamic.*eq/i, 'linear-phase': /linear.?phase/i, 'analog-modeled': /analog.?model/i, 'tilt': /tilt/i, 'passive': /passive/i },
        compressor: { 'VCA': /\bvca\b/i, 'FET': /\bfet\b/i, 'optical': /optical|opto/i, 'variable-mu': /variable.?mu|vari.?mu/i, 'bus': /bus\b/i, 'parallel': /parallel/i },
        limiter: { 'brickwall': /brickwall|brick.?wall/i, 'transparent': /transparent/i, 'coloring': /color/i },
        reverb: { 'algorithmic': /algorithmic/i, 'convolution': /convolution|ir\b/i, 'plate': /plate/i, 'spring': /spring/i, 'hall': /\bhall\b/i, 'room': /\broom\b/i, 'shimmer': /shimmer/i },
        delay: { 'digital': /digital.*delay/i, 'tape': /tape.*delay/i, 'analog-modeled': /analog.*delay/i, 'ping-pong': /ping.?pong/i, 'multi-tap': /multi.?tap/i },
        saturation: { 'tube': /\btube\b/i, 'tape': /\btape\b/i, 'transistor': /transistor/i, 'transformer': /transformer/i, 'console': /console/i, 'clipper': /clipper/i },
        modulation: { 'chorus': /chorus/i, 'flanger': /flanger/i, 'phaser': /phaser/i, 'tremolo': /tremolo/i, 'vibrato': /vibrato/i, 'rotary': /rotary/i },
      };
      
      if (extracted.category && subtypes[extracted.category]) {
        for (const [subtype, regex] of Object.entries(subtypes[extracted.category])) {
          if (regex.test(answer)) {
            extracted.effectType = subtype;
            break;
          }
        }
      }
      
      // Extract circuit emulation
      const circuitPatterns = [
        /neve\s*\d+/i, /ssl\s*[\w-]+/i, /la-?2a/i, /1176/i, /pultec/i,
        /fairchild\s*\d*/i, /api\s*\d+/i, /dbx\s*\d+/i, /urei/i,
        /teletronix/i, /manley/i, /tube-?tech/i, /distressor/i
      ];
      for (const pattern of circuitPatterns) {
        const match = answer.match(pattern);
        if (match) {
          extracted.circuitEmulation = match[0];
          break;
        }
      }
      
      // Extract tonal character
      const tonalKeywords = ['warm', 'transparent', 'aggressive', 'smooth', 'colored', 'clean', 'punchy', 'dark', 'bright', 'airy', 'lush', 'crisp'];
      const tonalCharacter = tonalKeywords.filter(kw => new RegExp(`\\b${kw}\\b`, 'i').test(answer));
      if (tonalCharacter.length > 0) extracted.tonalCharacter = tonalCharacter;
      
      // Build tags
      const tags = [];
      if (/analog|vintage|classic/i.test(answer)) tags.push('analog-modeling');
      if (/mastering/i.test(answer)) tags.push('mastering');
      if (/mixing|mix/i.test(answer)) tags.push('mixing');
      if (/free/i.test(answer)) tags.push('free');
      if (/creative/i.test(answer)) tags.push('creative');
      if (tags.length > 0) extracted.tags = tags;
      
      return extracted;
    }
    
    return null;
  } catch (err) {
    console.error(`  Answer error: ${err.message}`);
    return null;
  }
}

// Use Exa Contents to get page data directly
async function fetchContents(urls) {
  try {
    const result = await exa.getContents(urls, {
      text: { maxCharacters: 5000 }
    });
    return result.results;
  } catch (err) {
    console.error(`  Contents error: ${err.message}`);
    return [];
  }
}

// Find plugin mentions for trending data
async function findMentions(pluginName, manufacturerName, daysBack = 30) {
  const query = `${pluginName} ${manufacturerName} plugin`;
  
  try {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - daysBack);
    
    const results = await exa.search(query, {
      type: 'auto',
      numResults: 20,
      startPublishedDate: dateFrom.toISOString().split('T')[0]
    });
    
    return results.results;
  } catch (err) {
    console.error(`  Mentions error: ${err.message}`);
    return [];
  }
}

// Main enrichment function
async function enrichPlugin(plugin, manufacturer, options = {}) {
  const { useResearch = true, findMentionsData = false } = options;
  
  console.log(`\nEnriching: ${plugin.name} (${manufacturer.name})`);
  
  const updates = {};
  
  // Determine what needs enrichment
  const needsDescription = !plugin.description || plugin.description.length < 50;
  const needsTags = !plugin.tags || plugin.tags.length === 0;
  const needsFormats = !plugin.formats || plugin.formats.length === 0;
  const needsSystemReqs = !plugin.systemRequirements;
  
  if (!needsDescription && !needsTags && !needsFormats && !needsSystemReqs) {
    console.log('  Already enriched, skipping...');
    return null;
  }
  
  if (useResearch) {
    // Use Research API for comprehensive enrichment
    const research = await researchEnrich(plugin.name, manufacturer.name, plugin.productUrl);
    
    if (research) {
      // Skip instruments detected during enrichment
      if (research.isInstrument) {
        console.log('  ⛔ Skipping: detected as instrument/synth');
        return null;
      }
      if (needsDescription && research.description) {
        updates.description = research.description;
      }
      if (!plugin.shortDescription && research.shortDescription) {
        updates.shortDescription = research.shortDescription;
      }
      if (needsTags && research.tags?.length > 0) {
        updates.tags = research.tags;
      }
      if (research.category && research.category !== plugin.category) {
        // Only update if current is generic
        if (plugin.category === 'effect' || plugin.category === 'utility') {
          updates.category = research.category;
        }
      }
      if (!plugin.subcategory && research.subcategory) {
        updates.subcategory = research.subcategory;
      }
      if (research.effectType) {
        updates.effectType = research.effectType;
      }
      if (research.circuitEmulation) {
        updates.circuitEmulation = research.circuitEmulation;
      }
      if (research.tonalCharacter?.length > 0) {
        updates.tonalCharacter = research.tonalCharacter;
      }
      if (needsSystemReqs && research.systemRequirements) {
        updates.systemRequirements = research.systemRequirements;
      }
      if (needsFormats && research.formats?.length > 0) {
        updates.formats = research.formats;
      }
      if (research.platforms?.length > 0 && (!plugin.platforms || plugin.platforms.length === 0)) {
        updates.platforms = research.platforms;
      }
      if (!plugin.releaseDate && research.releaseDate) {
        const date = new Date(research.releaseDate);
        if (!isNaN(date.getTime())) {
          updates.releaseDate = date.getTime();
        }
      }
      if (!plugin.manualUrl && research.manualUrl) {
        updates.manualUrl = research.manualUrl;
      }
      if (research.hasDemo !== undefined) {
        updates.hasDemo = research.hasDemo;
        updates.hasTrial = research.hasDemo;
        if (research.trialDays) {
          updates.trialDays = research.trialDays;
        }
      }
    }
  } else {
    // Fallback: Use search + contents
    const searchResults = await searchEnrich(plugin.name, manufacturer.name);
    
    if (searchResults.length > 0) {
      // Extract description from highlights
      const allHighlights = searchResults
        .flatMap(r => r.highlights || [])
        .filter(h => h.length > 50)
        .slice(0, 3);
      
      if (needsDescription && allHighlights.length > 0) {
        updates.description = allHighlights.join(' ').slice(0, 500);
      }
    }
  }
  
  // Find mentions for trending data
  if (findMentionsData) {
    const mentions7d = await findMentions(plugin.name, manufacturer.name, 7);
    const mentions30d = await findMentions(plugin.name, manufacturer.name, 30);
    
    updates.mentionCount7d = mentions7d.length;
    updates.mentionCount30d = mentions30d.length;
    updates.mentionScore = mentions7d.length * 3 + mentions30d.length;
    updates.lastMentionScan = Date.now();
  }
  
  if (Object.keys(updates).length === 0) {
    console.log('  No new data found');
    return null;
  }
  
  console.log(`  Found: ${Object.keys(updates).join(', ')}`);
  return updates;
}

// Update plugin in Convex
async function updatePlugin(pluginId, updates) {
  try {
    // Remove any fields that aren't in the update mutation
    const allowedFields = [
      'name', 'description', 'shortDescription', 'category', 'subcategory',
      'tags', 'formats', 'platforms', 'systemRequirements', 'currentVersion',
      'releaseDate', 'lastUpdated', 'msrp', 'currentPrice', 'isFree',
      'hasDemo', 'hasTrial', 'trialDays', 'imageUrl', 'imageStorageId',
      'bannerStorageId', 'screenshotStorageIds', 'productUrl', 'manualUrl',
      'isActive', 'isDiscontinued', 'mentionCount7d', 'mentionCount30d',
      'mentionScore', 'lastMentionScan',
      'effectType', 'circuitEmulation', 'tonalCharacter'
    ];
    
    const filteredUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        filteredUpdates[key] = value;
      }
    }
    
    await client.mutation('plugins:update', {
      id: pluginId,
      ...filteredUpdates
    });
    return true;
  } catch (err) {
    console.error(`  Update error: ${err.message}`);
    return false;
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 10;
  const useResearch = !args.includes('--no-research');
  const findMentionsData = args.includes('--mentions');
  const dryRun = args.includes('--dry-run');
  const manufacturerFilter = args.find(a => a.startsWith('--manufacturer='))?.split('=')[1];
  
  console.log('=== Exa Plugin Enrichment ===');
  console.log(`Mode: ${useResearch ? 'Research API' : 'Search API'}`);
  console.log(`Limit: ${limit}`);
  console.log(`Dry run: ${dryRun}`);
  if (manufacturerFilter) console.log(`Manufacturer: ${manufacturerFilter}`);
  
  // Get plugins that need enrichment
  const pluginResult = await client.query('plugins:list', { limit: 1000 });
  let plugins = pluginResult.items || pluginResult;
  
  // Filter to those needing enrichment
  plugins = plugins.filter(p => 
    !p.description || 
    p.description.length < 50 || 
    !p.tags || 
    p.tags.length === 0 ||
    !p.formats ||
    p.formats.length === 0
  );
  
  // Apply manufacturer filter
  if (manufacturerFilter) {
    const manufacturers = await client.query('manufacturers:list', { limit: 100 });
    const mfr = manufacturers.find(m => 
      m.slug === manufacturerFilter || 
      m.name.toLowerCase().includes(manufacturerFilter.toLowerCase())
    );
    if (mfr) {
      plugins = plugins.filter(p => p.manufacturer === mfr._id);
    }
  }
  
  plugins = plugins.slice(0, limit);
  
  console.log(`\nFound ${plugins.length} plugins to enrich\n`);
  
  if (plugins.length === 0) {
    console.log('All plugins are already enriched!');
    return;
  }
  
  // Get manufacturer lookup
  const manufacturers = await client.query('manufacturers:list', { limit: 100 });
  const mfrMap = Object.fromEntries(manufacturers.map(m => [m._id, m]));
  
  let enriched = 0;
  let failed = 0;
  
  for (const plugin of plugins) {
    const manufacturer = mfrMap[plugin.manufacturer];
    if (!manufacturer) {
      console.log(`\nSkipping ${plugin.name}: no manufacturer found`);
      continue;
    }
    
    try {
      const updates = await enrichPlugin(plugin, manufacturer, { useResearch, findMentionsData });
      
      if (updates && Object.keys(updates).length > 0) {
        if (dryRun) {
          console.log('  [DRY RUN] Would update:', JSON.stringify(updates, null, 2));
          enriched++;
        } else {
          const success = await updatePlugin(plugin._id, updates);
          if (success) {
            enriched++;
          } else {
            failed++;
          }
        }
      }
      
      // Rate limiting - Exa has limits
      await new Promise(r => setTimeout(r, 1000));
      
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }
  
  console.log('\n=== Summary ===');
  console.log(`Enriched: ${enriched}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${plugins.length - enriched - failed}`);
}

main().catch(console.error);
