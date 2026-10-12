#!/usr/bin/env bun
/**
 * Parameter Extraction Script for PluginRadar
 * 
 * Uses Exa API to fetch plugin documentation and Claude to extract
 * structured parameters for comparison features.
 * 
 * Usage:
 *   bun run scripts/extract-parameters.ts --plugin <slug>
 *   bun run scripts/extract-parameters.ts --top 20
 *   bun run scripts/extract-parameters.ts --category compressor
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Configuration
const CONVEX_URL = process.env.CONVEX_URL || "https://next-frog-231.convex.cloud";
const EXA_API_KEY = process.env.EXA_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const convex = new ConvexHttpClient(CONVEX_URL);

interface PluginData {
  _id: string;
  name: string;
  slug: string;
  manufacturer: string;
  productUrl: string;
  manualUrl?: string;
  category: string;
}

interface ExtractedParameters {
  // Core specs
  channels?: string;
  latency?: number;
  oversampling?: string[];
  sampleRates?: number[];
  
  // I/O
  hasSidechain?: boolean;
  sidechainFilters?: string[];
  hasMidSide?: boolean;
  hasExternalInput?: boolean;
  
  // UI
  hasResizableUI?: boolean;
  uiSizes?: string[];
  hasPresetBrowser?: boolean;
  presetCount?: number;
  
  // Processing
  processingModes?: string[];
  hasAutoGain?: boolean;
  hasDryWetMix?: boolean;
  
  // Category-specific...
  [key: string]: unknown;
  
  // Meta
  confidence: number;
}

// Extraction prompt template
function getExtractionPrompt(plugin: PluginData, content: string): string {
  const categorySpecificFields = getCategoryFields(plugin.category);
  
  return `Extract technical parameters from this plugin documentation.

Plugin: ${plugin.name} by ${plugin.manufacturer}
Category: ${plugin.category}

Documentation content:
${content.slice(0, 30000)}

Extract a JSON object with these fields (only include fields you're confident about):

CORE SPECS:
- channels: "mono" | "stereo" | "mono-to-stereo" | "surround"
- latency: number (in samples, 0 if zero-latency)
- oversampling: array of strings like ["Off", "2x", "4x", "8x"]
- sampleRates: array of numbers like [44100, 48000, 96000, 192000]

INPUTS/OUTPUTS:
- hasSidechain: boolean
- sidechainFilters: array like ["HPF", "LPF", "BPF"]
- hasMidSide: boolean (M/S processing)
- hasExternalInput: boolean

UI/UX:
- hasResizableUI: boolean
- uiSizes: array like ["50%", "100%", "150%", "200%"]
- hasPresetBrowser: boolean
- presetCount: number (factory presets)

PROCESSING:
- processingModes: array like ["Digital", "Vintage", "Modern"]
- hasAutoGain: boolean
- hasDryWetMix: boolean (mix/blend control)

${categorySpecificFields}

IMPORTANT:
- Only include fields you can verify from the documentation
- Set confidence: 0-100 based on how clear the information was
- Use null for uncertain values

Respond with valid JSON only, no markdown.`;
}

function getCategoryFields(category: string): string {
  switch (category.toLowerCase()) {
    case 'eq':
      return `
EQ-SPECIFIC:
- bandCount: number
- filterTypes: array like ["Bell", "Shelf", "HPF", "LPF", "Notch"]
- hasLinearPhase: boolean
- hasDynamicEQ: boolean`;

    case 'compressor':
      return `
COMPRESSOR-SPECIFIC:
- compressionTypes: array like ["VCA", "FET", "Opto", "Variable-Mu"]
- hasParallelMix: boolean
- hasLookahead: boolean
- attackRange: { min: number, max: number } in ms
- releaseRange: { min: number, max: number } in ms
- ratioRange: { min: number, max: number }`;

    case 'reverb':
      return `
REVERB-SPECIFIC:
- reverbTypes: array like ["Hall", "Plate", "Room", "Chamber", "Spring", "Convolution"]
- hasModulation: boolean
- hasPreDelay: boolean
- hasEarlyReflections: boolean
- irCount: number (for convolution reverbs)`;

    case 'delay':
      return `
DELAY-SPECIFIC:
- delayModes: array like ["Mono", "Stereo", "Ping-Pong", "Dual"]
- hasTapTempo: boolean
- hasSyncToHost: boolean
- maxDelayTime: number in ms`;

    case 'synth':
    case 'instrument':
      return `
SYNTH-SPECIFIC:
- oscillatorCount: number
- oscillatorTypes: array like ["Saw", "Square", "Sine", "Noise", "Wavetable"]
- filterCount: number
- voiceCount: number (polyphony)
- hasArpeggiator: boolean
- hasSequencer: boolean`;

    default:
      return '';
  }
}

async function fetchWithExa(url: string): Promise<string> {
  if (!EXA_API_KEY) {
    throw new Error("EXA_API_KEY not set");
  }

  const response = await fetch("https://api.exa.ai/contents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${EXA_API_KEY}`,
    },
    body: JSON.stringify({
      ids: [url],
      text: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Exa API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.results?.[0]?.text || "";
}

async function extractWithClaude(prompt: string): Promise<ExtractedParameters> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || "{}";
  
  try {
    return JSON.parse(text);
  } catch {
    console.error("Failed to parse Claude response:", text);
    return { confidence: 0 };
  }
}

async function extractPluginParameters(plugin: PluginData): Promise<void> {
  console.log(`\n📦 Extracting parameters for: ${plugin.name}`);
  
  try {
    // 1. Fetch product page
    console.log(`  → Fetching: ${plugin.productUrl}`);
    const content = await fetchWithExa(plugin.productUrl);
    
    if (!content || content.length < 100) {
      console.log(`  ⚠️ Not enough content fetched (${content.length} chars)`);
      return;
    }
    console.log(`  ✓ Fetched ${content.length} characters`);
    
    // 2. Extract with Claude
    console.log(`  → Extracting with Claude...`);
    const prompt = getExtractionPrompt(plugin, content);
    const params = await extractWithClaude(prompt);
    
    console.log(`  ✓ Confidence: ${params.confidence}%`);
    
    // 3. Store in Convex
    // Note: You'll need to create the mutation in convex/pluginParameters.ts
    // await convex.mutation(api.pluginParameters.upsert, {
    //   plugin: plugin._id,
    //   ...params,
    //   extractedAt: Date.now(),
    //   extractionSource: "ai-docs",
    // });
    
    console.log(`  ✓ Parameters extracted:`, JSON.stringify(params, null, 2));
    
  } catch (error) {
    console.error(`  ✗ Error: ${error}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  console.log("🔍 PluginRadar Parameter Extraction");
  console.log("====================================\n");
  
  if (!EXA_API_KEY || !ANTHROPIC_API_KEY) {
    console.log("Required environment variables:");
    console.log("  - EXA_API_KEY: " + (EXA_API_KEY ? "✓" : "✗ missing"));
    console.log("  - ANTHROPIC_API_KEY: " + (ANTHROPIC_API_KEY ? "✓" : "✗ missing"));
    console.log("\nSet these before running extraction.");
    
    // Demo mode without API keys
    console.log("\n📋 Demo: Showing what would be extracted...\n");
    
    const demoPlugin: PluginData = {
      _id: "demo-id",
      name: "Pro-Q 4",
      slug: "pro-q-4",
      manufacturer: "FabFilter",
      productUrl: "https://www.fabfilter.com/products/pro-q-4-equalizer-plug-in",
      category: "eq",
    };
    
    console.log("Plugin:", demoPlugin.name);
    console.log("Category:", demoPlugin.category);
    console.log("\nExpected fields for EQ plugins:");
    console.log(getCategoryFields("eq"));
    return;
  }
  
  // Parse arguments
  if (args.includes("--plugin")) {
    const slugIndex = args.indexOf("--plugin") + 1;
    const slug = args[slugIndex];
    
    if (!slug) {
      console.error("Please provide a plugin slug: --plugin <slug>");
      return;
    }
    
    // Fetch plugin from Convex
    // const plugin = await convex.query(api.plugins.getBySlug, { slug });
    // if (!plugin) {
    //   console.error(`Plugin not found: ${slug}`);
    //   return;
    // }
    // await extractPluginParameters(plugin);
    
    console.log(`Would extract parameters for plugin: ${slug}`);
  } else if (args.includes("--top")) {
    const countIndex = args.indexOf("--top") + 1;
    const count = parseInt(args[countIndex]) || 20;
    
    console.log(`Would extract parameters for top ${count} plugins by popularity`);
  } else if (args.includes("--category")) {
    const categoryIndex = args.indexOf("--category") + 1;
    const category = args[categoryIndex];
    
    if (!category) {
      console.error("Please provide a category: --category <category>");
      return;
    }
    
    console.log(`Would extract parameters for all ${category} plugins`);
  } else {
    console.log("Usage:");
    console.log("  bun run scripts/extract-parameters.ts --plugin <slug>");
    console.log("  bun run scripts/extract-parameters.ts --top 20");
    console.log("  bun run scripts/extract-parameters.ts --category compressor");
  }
}

main().catch(console.error);
