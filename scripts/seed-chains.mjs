#!/usr/bin/env node

/**
 * Seed 15-20 quality plugin chains for testing chain load success,
 * parameter translation, and the plugin swap flow.
 *
 * Usage:
 *   node scripts/seed-chains.mjs --session <token>
 *   node scripts/seed-chains.mjs --session <token> --dry-run
 *   node scripts/seed-chains.mjs --session <token> --genre hip-hop
 *
 * Requires CONVEX_URL env or defaults to next-frog-231.convex.cloud
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const CONVEX_URL = process.env.CONVEX_URL || "https://next-frog-231.convex.cloud";
const client = new ConvexHttpClient(CONVEX_URL);

// ============================================
// CLI argument parsing
// ============================================
const args = process.argv.slice(2);
let sessionToken = null;
let dryRun = false;
let genreFilter = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--session" && args[i + 1]) {
    sessionToken = args[i + 1];
    i++;
  } else if (args[i] === "--dry-run") {
    dryRun = true;
  } else if (args[i] === "--genre" && args[i + 1]) {
    genreFilter = args[i + 1];
    i++;
  }
}

if (!sessionToken) {
  console.error("Usage: node scripts/seed-chains.mjs --session <token> [--dry-run] [--genre <genre>]");
  process.exit(1);
}

// ============================================
// Plugin definitions — well-known plugins with realistic parameters
// ============================================

function eqParams(settings = {}) {
  const {
    band1Freq = 100, band1Gain = -2, band1Q = 0.7,
    band2Freq = 800, band2Gain = 1.5, band2Q = 1.0,
    band3Freq = 3000, band3Gain = -1, band3Q = 1.5,
    band4Freq = 8000, band4Gain = 2, band4Q = 0.8,
    hpFreq, lpFreq,
  } = settings;

  const params = [];
  if (hpFreq) {
    params.push({ name: "HP Frequency", value: String(hpFreq), normalizedValue: Math.log(hpFreq / 20) / Math.log(20000 / 20), semantic: "eq_hp_freq", unit: "hz" });
  }
  params.push(
    { name: "Band 1 Frequency", value: String(band1Freq), normalizedValue: Math.log(band1Freq / 20) / Math.log(20000 / 20), semantic: "eq_band_1_freq", unit: "hz" },
    { name: "Band 1 Gain", value: String(band1Gain), normalizedValue: (band1Gain + 30) / 60, semantic: "eq_band_1_gain", unit: "db" },
    { name: "Band 1 Q", value: String(band1Q), normalizedValue: Math.log(band1Q / 0.1) / Math.log(40 / 0.1), semantic: "eq_band_1_q", unit: "ratio" },
    { name: "Band 2 Frequency", value: String(band2Freq), normalizedValue: Math.log(band2Freq / 20) / Math.log(20000 / 20), semantic: "eq_band_2_freq", unit: "hz" },
    { name: "Band 2 Gain", value: String(band2Gain), normalizedValue: (band2Gain + 30) / 60, semantic: "eq_band_2_gain", unit: "db" },
    { name: "Band 2 Q", value: String(band2Q), normalizedValue: Math.log(band2Q / 0.1) / Math.log(40 / 0.1), semantic: "eq_band_2_q", unit: "ratio" },
    { name: "Band 3 Frequency", value: String(band3Freq), normalizedValue: Math.log(band3Freq / 20) / Math.log(20000 / 20), semantic: "eq_band_3_freq", unit: "hz" },
    { name: "Band 3 Gain", value: String(band3Gain), normalizedValue: (band3Gain + 30) / 60, semantic: "eq_band_3_gain", unit: "db" },
    { name: "Band 3 Q", value: String(band3Q), normalizedValue: Math.log(band3Q / 0.1) / Math.log(40 / 0.1), semantic: "eq_band_3_q", unit: "ratio" },
  );
  if (band4Freq) {
    params.push(
      { name: "Band 4 Frequency", value: String(band4Freq), normalizedValue: Math.log(band4Freq / 20) / Math.log(20000 / 20), semantic: "eq_band_4_freq", unit: "hz" },
      { name: "Band 4 Gain", value: String(band4Gain), normalizedValue: (band4Gain + 30) / 60, semantic: "eq_band_4_gain", unit: "db" },
      { name: "Band 4 Q", value: String(band4Q), normalizedValue: Math.log(band4Q / 0.1) / Math.log(40 / 0.1), semantic: "eq_band_4_q", unit: "ratio" },
    );
  }
  if (lpFreq) {
    params.push({ name: "LP Frequency", value: String(lpFreq), normalizedValue: Math.log(lpFreq / 20) / Math.log(20000 / 20), semantic: "eq_lp_freq", unit: "hz" });
  }
  return params;
}

function compParams(settings = {}) {
  const {
    threshold = -18, ratio = 4, attack = 10, release = 100, makeup = 3, mix = 100,
  } = settings;
  return [
    { name: "Threshold", value: String(threshold), normalizedValue: (threshold + 60) / 60, semantic: "comp_threshold", unit: "db" },
    { name: "Ratio", value: String(ratio), normalizedValue: (ratio - 1) / 19, semantic: "comp_ratio", unit: "ratio" },
    { name: "Attack", value: String(attack), normalizedValue: Math.log(attack / 0.1) / Math.log(500 / 0.1), semantic: "comp_attack", unit: "ms" },
    { name: "Release", value: String(release), normalizedValue: Math.log(release / 5) / Math.log(5000 / 5), semantic: "comp_release", unit: "ms" },
    { name: "Makeup Gain", value: String(makeup), normalizedValue: (makeup + 12) / 36, semantic: "comp_makeup", unit: "db" },
    { name: "Mix", value: String(mix), normalizedValue: mix / 100, semantic: "comp_mix", unit: "percent" },
  ];
}

function limiterParams(settings = {}) {
  const { ceiling = -0.3, release = 50, lookahead = 5 } = settings;
  return [
    { name: "Output Ceiling", value: String(ceiling), normalizedValue: (ceiling + 20) / 20, semantic: "limiter_ceiling", unit: "db" },
    { name: "Release", value: String(release), normalizedValue: Math.log(release / 1) / Math.log(1000 / 1), semantic: "limiter_release", unit: "ms" },
    { name: "Lookahead", value: String(lookahead), normalizedValue: lookahead / 20, semantic: "limiter_lookahead", unit: "ms" },
  ];
}

function reverbParams(settings = {}) {
  const { decay = 2.0, predelay = 20, mix = 30, damping = 50, size = 60 } = settings;
  return [
    { name: "Decay", value: String(decay), normalizedValue: decay / 10, semantic: "reverb_decay", unit: "seconds" },
    { name: "Pre-Delay", value: String(predelay), normalizedValue: predelay / 200, semantic: "reverb_predelay", unit: "ms" },
    { name: "Mix", value: String(mix), normalizedValue: mix / 100, semantic: "reverb_mix", unit: "percent" },
    { name: "Damping", value: String(damping), normalizedValue: damping / 100, semantic: "reverb_damping", unit: "percent" },
    { name: "Size", value: String(size), normalizedValue: size / 100, semantic: "reverb_size", unit: "percent" },
  ];
}

function delayParams(settings = {}) {
  const { time = 250, feedback = 35, mix = 25, hpf = 200, lpf = 8000 } = settings;
  return [
    { name: "Delay Time", value: String(time), normalizedValue: time / 2000, semantic: "delay_time", unit: "ms" },
    { name: "Feedback", value: String(feedback), normalizedValue: feedback / 100, semantic: "delay_feedback", unit: "percent" },
    { name: "Mix", value: String(mix), normalizedValue: mix / 100, semantic: "delay_mix", unit: "percent" },
    { name: "HPF", value: String(hpf), normalizedValue: Math.log(hpf / 20) / Math.log(20000 / 20), semantic: "delay_hpf", unit: "hz" },
    { name: "LPF", value: String(lpf), normalizedValue: Math.log(lpf / 20) / Math.log(20000 / 20), semantic: "delay_lpf", unit: "hz" },
  ];
}

function saturationParams(settings = {}) {
  const { drive = 4, mix = 80, tone = 50, output = -2 } = settings;
  return [
    { name: "Drive", value: String(drive), normalizedValue: drive / 24, semantic: "sat_drive", unit: "db" },
    { name: "Mix", value: String(mix), normalizedValue: mix / 100, semantic: "sat_mix", unit: "percent" },
    { name: "Tone", value: String(tone), normalizedValue: tone / 100, semantic: "sat_tone", unit: "percent" },
    { name: "Output", value: String(output), normalizedValue: (output + 24) / 48, semantic: "sat_output", unit: "db" },
  ];
}

function deesserParams(settings = {}) {
  const { threshold = -20, frequency = 6000, range = -10 } = settings;
  return [
    { name: "Threshold", value: String(threshold), normalizedValue: (threshold + 60) / 60, semantic: "deesser_threshold", unit: "db" },
    { name: "Frequency", value: String(frequency), normalizedValue: Math.log(frequency / 2000) / Math.log(16000 / 2000), semantic: "deesser_freq", unit: "hz" },
    { name: "Range", value: String(range), normalizedValue: (range + 30) / 30, semantic: "deesser_range", unit: "db" },
  ];
}

// ============================================
// Chain template definitions
// ============================================

const CHAIN_TEMPLATES = [
  // ---- HIP-HOP VOCAL CHAINS ----
  {
    name: "Clean Hip-Hop Vocal",
    description: "Industry-standard hip-hop vocal chain. Tight EQ, smooth compression, controlled sibilance, and transparent limiting for a polished lead vocal.",
    category: "vocal",
    genre: "hip-hop",
    useCase: "lead-vocal",
    tags: ["clean", "modern", "polished", "hip-hop"],
    slots: [
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ hpFreq: 80, band1Freq: 200, band1Gain: -3, band2Freq: 2500, band2Gain: 2, band3Freq: 5000, band3Gain: 1.5 }) },
      { pluginName: "Pro-C 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: compParams({ threshold: -22, ratio: 3, attack: 15, release: 80, makeup: 4 }) },
      { pluginName: "Pro-DS", manufacturer: "FabFilter", format: "AudioUnit", parameters: deesserParams({ threshold: -25, frequency: 7000, range: -8 }) },
      { pluginName: "Pro-L 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: limiterParams({ ceiling: -0.5, release: 40 }) },
    ],
  },
  {
    name: "Trap Vocal Chain",
    description: "Aggressive trap vocal processing. Bright EQ, heavy compression, analog saturation, and space with delay and reverb for modern trap vocals.",
    category: "vocal",
    genre: "hip-hop",
    useCase: "lead-vocal",
    tags: ["aggressive", "bright", "trap", "modern"],
    slots: [
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ hpFreq: 100, band1Freq: 300, band1Gain: -4, band2Freq: 3000, band2Gain: 3, band3Freq: 10000, band3Gain: 2 }) },
      { pluginName: "Pro-C 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: compParams({ threshold: -25, ratio: 8, attack: 5, release: 50, makeup: 6 }) },
      { pluginName: "Saturn 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: saturationParams({ drive: 3, mix: 40, tone: 65 }) },
      { pluginName: "ValhallaDelay", manufacturer: "Valhalla DSP, LLC", format: "AudioUnit", parameters: delayParams({ time: 375, feedback: 25, mix: 15 }) },
      { pluginName: "ValhallaVintageVerb", manufacturer: "Valhalla DSP, LLC", format: "AudioUnit", parameters: reverbParams({ decay: 1.5, predelay: 30, mix: 20, size: 50 }) },
    ],
  },
  {
    name: "Lo-Fi Vocal",
    description: "Warm, textured lo-fi vocal sound. Saturation into EQ for warmth, gentle compression, and lush reverb for bedroom pop and lo-fi hip-hop.",
    category: "vocal",
    genre: "hip-hop",
    useCase: "lead-vocal",
    tags: ["lo-fi", "warm", "vintage", "textured"],
    slots: [
      { pluginName: "Saturn 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: saturationParams({ drive: 6, mix: 60, tone: 35, output: -3 }) },
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ hpFreq: 120, band1Freq: 400, band1Gain: 2, band2Freq: 2000, band2Gain: -2, band3Freq: 8000, band3Gain: -4, lpFreq: 12000 }) },
      { pluginName: "Pro-C 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: compParams({ threshold: -20, ratio: 3, attack: 30, release: 200, makeup: 2 }) },
      { pluginName: "ValhallaRoom", manufacturer: "Valhalla DSP, LLC", format: "AudioUnit", parameters: reverbParams({ decay: 2.5, predelay: 15, mix: 35, damping: 60, size: 70 }) },
    ],
  },
  {
    name: "Hip-Hop Ad-Lib Stack",
    description: "Processing for ad-libs and backing vocal layers. More aggressive compression, telephone EQ, and wider reverb for supporting vocals.",
    category: "vocal",
    genre: "hip-hop",
    useCase: "backing-vocal",
    tags: ["ad-lib", "backing", "wide", "aggressive"],
    slots: [
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ hpFreq: 300, band1Freq: 800, band1Gain: 3, band2Freq: 3500, band2Gain: 4, band3Freq: 6000, band3Gain: -2, lpFreq: 10000 }) },
      { pluginName: "Pro-C 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: compParams({ threshold: -30, ratio: 6, attack: 5, release: 40, makeup: 8 }) },
      { pluginName: "Timeless 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: delayParams({ time: 500, feedback: 30, mix: 20, hpf: 300, lpf: 6000 }) },
      { pluginName: "ValhallaVintageVerb", manufacturer: "Valhalla DSP, LLC", format: "AudioUnit", parameters: reverbParams({ decay: 2.0, predelay: 40, mix: 40, size: 65 }) },
    ],
  },

  // ---- EDM MASTERING CHAINS ----
  {
    name: "EDM Master Bus",
    description: "Punchy EDM mastering chain. Surgical EQ for clarity, multiband compression for energy, and transparent limiting for loudness.",
    category: "mastering",
    genre: "edm",
    useCase: "master",
    tags: ["punchy", "loud", "edm", "mastering"],
    slots: [
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ band1Freq: 40, band1Gain: 1, band2Freq: 500, band2Gain: -1, band3Freq: 3000, band3Gain: 1.5, band4Freq: 12000, band4Gain: 1 }) },
      { pluginName: "Pro-MB", manufacturer: "FabFilter", format: "AudioUnit", parameters: compParams({ threshold: -15, ratio: 2, attack: 20, release: 150, makeup: 1 }) },
      { pluginName: "Pro-L 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: limiterParams({ ceiling: -0.3, release: 30, lookahead: 4 }) },
    ],
  },
  {
    name: "Bass-Heavy Master",
    description: "Mastering chain optimized for bass-heavy genres. Sub bass boost, saturation for warmth, and aggressive limiting for maximum loudness.",
    category: "mastering",
    genre: "edm",
    useCase: "master",
    tags: ["bass", "loud", "warm", "heavy"],
    slots: [
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ band1Freq: 50, band1Gain: 2, band2Freq: 200, band2Gain: -1.5, band3Freq: 4000, band3Gain: 1, band4Freq: 10000, band4Gain: 0.5 }) },
      { pluginName: "Pro-C 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: compParams({ threshold: -16, ratio: 2, attack: 30, release: 120, makeup: 2 }) },
      { pluginName: "Saturn 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: saturationParams({ drive: 2, mix: 30, tone: 40, output: -1 }) },
      { pluginName: "Pro-L 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: limiterParams({ ceiling: -0.3, release: 25, lookahead: 5 }) },
    ],
  },
  {
    name: "Chill Electronic Master",
    description: "Gentle mastering for ambient, chillwave, and downtempo. Transparent EQ, light compression, and smooth limiting preserving dynamics.",
    category: "mastering",
    genre: "edm",
    useCase: "master",
    tags: ["chill", "transparent", "gentle", "ambient"],
    slots: [
      { pluginName: "Pro-Q 4", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ band1Freq: 60, band1Gain: 0.5, band2Freq: 600, band2Gain: -0.5, band3Freq: 5000, band3Gain: 1 }) },
      { pluginName: "Pro-C 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: compParams({ threshold: -12, ratio: 1.5, attack: 50, release: 200, makeup: 1 }) },
      { pluginName: "Pro-L 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: limiterParams({ ceiling: -0.5, release: 60, lookahead: 8 }) },
    ],
  },

  // ---- MIX BUS CHAINS ----
  {
    name: "Glue Bus",
    description: "Classic mix bus glue. SSL-style channel strip, gentle compression, surgical EQ, and transparent limiting for cohesion.",
    category: "mixing",
    genre: "rock",
    useCase: "mix-bus",
    tags: ["glue", "cohesion", "ssl", "classic"],
    slots: [
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ band1Freq: 100, band1Gain: -1, band2Freq: 1000, band2Gain: 0.5, band3Freq: 5000, band3Gain: 1 }) },
      { pluginName: "Pro-C 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: compParams({ threshold: -14, ratio: 2, attack: 30, release: 100, makeup: 2, mix: 100 }) },
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ band1Freq: 30, band1Gain: -2, band2Freq: 3000, band2Gain: 0.5, band3Freq: 12000, band3Gain: 1 }) },
      { pluginName: "Pro-L 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: limiterParams({ ceiling: -0.5 }) },
    ],
  },
  {
    name: "Drum Bus Punch",
    description: "Drum bus processing for impact. Tight compression, transient enhancement via EQ, and saturation for weight.",
    category: "mixing",
    genre: "rock",
    useCase: "drum-bus",
    tags: ["punchy", "drums", "impactful", "tight"],
    slots: [
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ band1Freq: 60, band1Gain: 2, band2Freq: 400, band2Gain: -3, band3Freq: 4000, band3Gain: 2, band4Freq: 8000, band4Gain: 1.5 }) },
      { pluginName: "Pro-C 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: compParams({ threshold: -20, ratio: 4, attack: 5, release: 60, makeup: 5 }) },
      { pluginName: "Saturn 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: saturationParams({ drive: 5, mix: 50, tone: 55, output: -2 }) },
    ],
  },
  {
    name: "Bass DI Processing",
    description: "Clean bass DI signal chain. Low-end focus EQ, smooth optical compression, and light saturation for definition.",
    category: "mixing",
    genre: "rock",
    useCase: "bass",
    tags: ["bass", "clean", "definition", "warm"],
    slots: [
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ hpFreq: 30, band1Freq: 80, band1Gain: 2, band2Freq: 300, band2Gain: -2, band3Freq: 1200, band3Gain: 1 }) },
      { pluginName: "Pro-C 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: compParams({ threshold: -18, ratio: 3, attack: 30, release: 150, makeup: 3 }) },
      { pluginName: "Saturn 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: saturationParams({ drive: 3, mix: 35, tone: 40, output: -1 }) },
    ],
  },

  // ---- GUITAR/ROCK CHAINS ----
  {
    name: "Rock Guitar Tone",
    description: "Classic rock guitar processing. EQ for presence and cut, compression for sustain, and saturation for edge.",
    category: "mixing",
    genre: "rock",
    useCase: "electric-guitar",
    tags: ["rock", "guitar", "presence", "sustain"],
    slots: [
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ hpFreq: 80, band1Freq: 250, band1Gain: -3, band2Freq: 2000, band2Gain: 2, band3Freq: 6000, band3Gain: 1.5 }) },
      { pluginName: "Pro-C 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: compParams({ threshold: -18, ratio: 3, attack: 20, release: 80, makeup: 3 }) },
      { pluginName: "Saturn 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: saturationParams({ drive: 5, mix: 60, tone: 55 }) },
    ],
  },
  {
    name: "Clean Guitar Polish",
    description: "Acoustic or clean electric guitar sweetening. Gentle EQ, transparent compression, reverb and delay for space.",
    category: "mixing",
    genre: "acoustic",
    useCase: "acoustic-guitar",
    tags: ["clean", "acoustic", "gentle", "spacious"],
    slots: [
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ hpFreq: 60, band1Freq: 200, band1Gain: -1, band2Freq: 3000, band2Gain: 1.5, band3Freq: 10000, band3Gain: 1 }) },
      { pluginName: "Pro-C 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: compParams({ threshold: -15, ratio: 2, attack: 25, release: 120, makeup: 2 }) },
      { pluginName: "ValhallaRoom", manufacturer: "Valhalla DSP, LLC", format: "AudioUnit", parameters: reverbParams({ decay: 1.8, predelay: 25, mix: 25, size: 50 }) },
      { pluginName: "ValhallaDelay", manufacturer: "Valhalla DSP, LLC", format: "AudioUnit", parameters: delayParams({ time: 333, feedback: 20, mix: 15 }) },
    ],
  },

  // ---- CREATIVE/FX CHAINS ----
  {
    name: "Ambient Wash",
    description: "Lush ambient texture generator. Long reverb, rhythmic delay, EQ sculpting, and saturation for warmth.",
    category: "creative",
    genre: "ambient",
    useCase: "fx-send",
    tags: ["ambient", "lush", "textured", "atmospheric"],
    slots: [
      { pluginName: "ValhallaVintageVerb", manufacturer: "Valhalla DSP, LLC", format: "AudioUnit", parameters: reverbParams({ decay: 6.0, predelay: 50, mix: 80, damping: 40, size: 90 }) },
      { pluginName: "ValhallaDelay", manufacturer: "Valhalla DSP, LLC", format: "AudioUnit", parameters: delayParams({ time: 750, feedback: 50, mix: 40, hpf: 300, lpf: 6000 }) },
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ hpFreq: 200, band1Freq: 500, band1Gain: -2, band2Freq: 2000, band2Gain: 1, band3Freq: 8000, band3Gain: -3, lpFreq: 10000 }) },
      { pluginName: "Saturn 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: saturationParams({ drive: 2, mix: 25, tone: 35 }) },
    ],
  },
  {
    name: "Vocal FX Send",
    description: "Creative vocal effects chain for sends. Delay, reverb, and saturation for depth and character without overwhelming the dry signal.",
    category: "creative",
    genre: "pop",
    useCase: "fx-send",
    tags: ["vocal", "creative", "send", "depth"],
    slots: [
      { pluginName: "Timeless 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: delayParams({ time: 250, feedback: 35, mix: 60, hpf: 400, lpf: 8000 }) },
      { pluginName: "ValhallaVintageVerb", manufacturer: "Valhalla DSP, LLC", format: "AudioUnit", parameters: reverbParams({ decay: 2.5, predelay: 30, mix: 70, damping: 50, size: 60 }) },
      { pluginName: "Saturn 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: saturationParams({ drive: 4, mix: 50, tone: 60, output: -3 }) },
    ],
  },
  {
    name: "Slapback Vocal",
    description: "Quick slapback effect for rockabilly and retro vocal styles. Short delay with moderate feedback and filtering.",
    category: "creative",
    genre: "rock",
    useCase: "lead-vocal",
    tags: ["slapback", "retro", "vintage", "rockabilly"],
    slots: [
      { pluginName: "Timeless 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: delayParams({ time: 120, feedback: 15, mix: 30, hpf: 200, lpf: 10000 }) },
      { pluginName: "Saturn 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: saturationParams({ drive: 3, mix: 30, tone: 50 }) },
    ],
  },

  // ---- CHAINS WITH LESS-COMMON PLUGINS (for swap testing) ----
  {
    name: "Kirchhoff Mastering EQ",
    description: "Precision mastering EQ chain using Kirchhoff-EQ. Tests parameter translation when swapping to Pro-Q or other EQs.",
    category: "mastering",
    genre: "pop",
    useCase: "master",
    tags: ["mastering", "precision", "transparent", "kirchhoff"],
    slots: [
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ band1Freq: 40, band1Gain: 1, band2Freq: 800, band2Gain: -1, band3Freq: 5000, band3Gain: 1.5, band4Freq: 15000, band4Gain: 0.5 }) },
      { pluginName: "Pro-L 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: limiterParams({ ceiling: -0.3, release: 40 }) },
    ],
  },
  {
    name: "Brainworx Saturation Master",
    description: "Colorful mastering with analog saturation. Uses bx_saturator V2 — tests swap flow with Decapitator.",
    category: "mastering",
    genre: "rock",
    useCase: "master",
    tags: ["saturation", "analog", "color", "brainworx"],
    slots: [
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ band1Freq: 50, band1Gain: 1, band2Freq: 500, band2Gain: -1, band3Freq: 4000, band3Gain: 1 }) },
      { pluginName: "Saturn 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: saturationParams({ drive: 3, mix: 50, tone: 45, output: -1 }) },
      { pluginName: "Pro-L 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: limiterParams({ ceiling: -0.3, release: 35 }) },
    ],
  },
  {
    name: "FabFilter Reverb Polish",
    description: "Reverb chain using FabFilter Pro-R 2. Tests parameter translation when swapping to Valhalla reverbs.",
    category: "creative",
    genre: "pop",
    useCase: "fx-send",
    tags: ["reverb", "fabfilter", "polished", "spatial"],
    slots: [
      { pluginName: "Pro-R 2", manufacturer: "FabFilter", format: "AudioUnit", parameters: reverbParams({ decay: 2.0, predelay: 20, mix: 50, damping: 45, size: 55 }) },
      { pluginName: "Pro-Q 3", manufacturer: "FabFilter", format: "AudioUnit", parameters: eqParams({ hpFreq: 150, band1Freq: 400, band1Gain: -2, band2Freq: 3000, band2Gain: 1 }) },
    ],
  },
];

// ============================================
// Main execution
// ============================================

async function main() {
  console.log(`\n🎛️  Chain Seeding Script`);
  console.log(`   Convex: ${CONVEX_URL}`);
  console.log(`   Dry run: ${dryRun}`);
  console.log(`   Genre filter: ${genreFilter || "all"}`);
  console.log("");

  // Filter chains by genre if specified
  let chains = CHAIN_TEMPLATES;
  if (genreFilter) {
    chains = chains.filter((c) => c.genre === genreFilter);
    if (chains.length === 0) {
      console.error(`No chains found for genre "${genreFilter}". Available: hip-hop, edm, rock, acoustic, ambient, pop`);
      process.exit(1);
    }
  }

  console.log(`   Chains to seed: ${chains.length}\n`);

  if (dryRun) {
    for (const chain of chains) {
      console.log(`  [DRY RUN] "${chain.name}" — ${chain.category}/${chain.genre}`);
      console.log(`            ${chain.slots.length} slots: ${chain.slots.map((s) => s.pluginName).join(" → ")}`);
      const paramCount = chain.slots.reduce((sum, s) => sum + (s.parameters?.length || 0), 0);
      console.log(`            ${paramCount} parameters with semantic IDs`);
      console.log("");
    }
    console.log(`✅ Dry run complete. ${chains.length} chains would be created.`);
    return;
  }

  // Verify session is valid
  try {
    await client.query(api.auth.verifySession, { sessionToken });
  } catch (e) {
    console.error("❌ Invalid session token. Log in to the desktop app and copy your session token.");
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;

  for (const template of chains) {
    try {
      // Build slots in the format saveChain expects
      const slots = template.slots.map((slot, idx) => ({
        position: idx,
        pluginName: slot.pluginName,
        manufacturer: slot.manufacturer,
        format: slot.format || "VST3",
        uid: 0,
        bypassed: false,
        parameters: slot.parameters || [],
      }));

      const result = await client.mutation(api.pluginDirectory.saveChain, {
        sessionToken,
        name: template.name,
        description: template.description,
        category: template.category,
        tags: template.tags,
        genre: template.genre,
        useCase: template.useCase,
        slots,
        isPublic: true,
      });

      console.log(`  ✅ "${template.name}" — slug: ${result.slug}, share: ${result.shareCode}`);
      created++;
    } catch (e) {
      console.error(`  ❌ "${template.name}" — ${e.message || e}`);
      skipped++;
    }

    // Delay to respect rate limit (5 per 60s = 1 every 13s, use 14s for safety)
    await new Promise((r) => setTimeout(r, 14000));
  }

  console.log(`\n🎉 Done! Created: ${created}, Skipped/Failed: ${skipped}`);
  console.log(`   View at: https://pluginradar.com/chains`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
