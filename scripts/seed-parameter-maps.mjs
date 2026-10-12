#!/usr/bin/env node

/**
 * Seed parameter mappings for well-known EQ and compressor plugins.
 *
 * Usage:
 *   node scripts/seed-parameter-maps.mjs
 *
 * Requires CONVEX_URL env or defaults to next-frog-231.convex.cloud
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const CONVEX_URL = process.env.CONVEX_URL || "https://next-frog-231.convex.cloud";
const client = new ConvexHttpClient(CONVEX_URL);

// ============================================
// Helper: Generate EQ band parameters for N bands
// ============================================
function generateEqBandParams(
  bandCount,
  {
    freqRange = [10, 30000],
    gainRange = [-30, 30],
    qRange = [0.025, 40],
    freqParamPattern = "Band {N} Frequency",
    gainParamPattern = "Band {N} Gain",
    qParamPattern = "Band {N} Q",
    typeParamPattern = "Band {N} Shape",
    filterSteps = [
      { normalizedValue: 0.0, physicalValue: "bell" },
      { normalizedValue: 0.143, physicalValue: "low_shelf" },
      { normalizedValue: 0.286, physicalValue: "high_shelf" },
      { normalizedValue: 0.429, physicalValue: "hpf" },
      { normalizedValue: 0.571, physicalValue: "lpf" },
      { normalizedValue: 0.714, physicalValue: "notch" },
      { normalizedValue: 0.857, physicalValue: "bandpass" },
    ],
    hasType = true,
    freqDefault = 1000,
    gainDefault = 0,
    qDefault = 1.0,
  } = {}
) {
  const params = [];
  for (let i = 1; i <= bandCount; i++) {
    params.push({
      juceParamId: freqParamPattern.replace("{N}", String(i)),
      semantic: `eq_band_${i}_freq`,
      physicalUnit: "hz",
      mappingCurve: "logarithmic",
      minValue: freqRange[0],
      maxValue: freqRange[1],
      defaultValue: freqDefault,
    });
    params.push({
      juceParamId: gainParamPattern.replace("{N}", String(i)),
      semantic: `eq_band_${i}_gain`,
      physicalUnit: "db",
      mappingCurve: "linear",
      minValue: gainRange[0],
      maxValue: gainRange[1],
      defaultValue: gainDefault,
    });
    params.push({
      juceParamId: qParamPattern.replace("{N}", String(i)),
      semantic: `eq_band_${i}_q`,
      physicalUnit: "ratio",
      mappingCurve: "logarithmic",
      minValue: qRange[0],
      maxValue: qRange[1],
      defaultValue: qDefault,
    });
    if (hasType) {
      params.push({
        juceParamId: typeParamPattern.replace("{N}", String(i)),
        semantic: `eq_band_${i}_type`,
        physicalUnit: "stepped",
        mappingCurve: "stepped",
        minValue: 0,
        maxValue: 1,
        steps: filterSteps,
      });
    }
  }
  return params;
}

// ============================================
// EQ Plugin Definitions
// ============================================
const eqPlugins = [
  {
    pluginName: "FabFilter Pro-Q 3",
    category: "eq",
    eqBandCount: 24,
    eqBandParameterPattern: "Band {N} Frequency",
    confidence: 75,
    source: "manual",
    parameters: generateEqBandParams(24, {
      freqRange: [10, 30000],
      gainRange: [-30, 30],
      qRange: [0.025, 40],
      freqParamPattern: "Band {N} Frequency",
      gainParamPattern: "Band {N} Gain",
      qParamPattern: "Band {N} Q",
      typeParamPattern: "Band {N} Shape",
      filterSteps: [
        { normalizedValue: 0.0, physicalValue: "bell" },
        { normalizedValue: 0.083, physicalValue: "low_shelf" },
        { normalizedValue: 0.167, physicalValue: "low_shelf_x" },
        { normalizedValue: 0.25, physicalValue: "high_shelf" },
        { normalizedValue: 0.333, physicalValue: "high_shelf_x" },
        { normalizedValue: 0.417, physicalValue: "hpf" },
        { normalizedValue: 0.5, physicalValue: "hpf_x" },
        { normalizedValue: 0.583, physicalValue: "lpf" },
        { normalizedValue: 0.667, physicalValue: "lpf_x" },
        { normalizedValue: 0.75, physicalValue: "notch" },
        { normalizedValue: 0.833, physicalValue: "bandpass" },
        { normalizedValue: 0.917, physicalValue: "tilt" },
      ],
    }),
  },
  {
    pluginName: "FabFilter Pro-Q 4",
    category: "eq",
    eqBandCount: 24,
    eqBandParameterPattern: "Band {N} Frequency",
    confidence: 75,
    source: "manual",
    parameters: generateEqBandParams(24, {
      freqRange: [10, 30000],
      gainRange: [-30, 30],
      qRange: [0.025, 40],
      freqParamPattern: "Band {N} Frequency",
      gainParamPattern: "Band {N} Gain",
      qParamPattern: "Band {N} Q",
      typeParamPattern: "Band {N} Shape",
      filterSteps: [
        { normalizedValue: 0.0, physicalValue: "bell" },
        { normalizedValue: 0.083, physicalValue: "low_shelf" },
        { normalizedValue: 0.167, physicalValue: "low_shelf_x" },
        { normalizedValue: 0.25, physicalValue: "high_shelf" },
        { normalizedValue: 0.333, physicalValue: "high_shelf_x" },
        { normalizedValue: 0.417, physicalValue: "hpf" },
        { normalizedValue: 0.5, physicalValue: "hpf_x" },
        { normalizedValue: 0.583, physicalValue: "lpf" },
        { normalizedValue: 0.667, physicalValue: "lpf_x" },
        { normalizedValue: 0.75, physicalValue: "notch" },
        { normalizedValue: 0.833, physicalValue: "bandpass" },
        { normalizedValue: 0.917, physicalValue: "tilt" },
      ],
    }),
  },
  {
    pluginName: "TDR Nova",
    category: "eq",
    eqBandCount: 4,
    eqBandParameterPattern: "Band {N} Freq",
    confidence: 70,
    source: "manual",
    parameters: [
      // High-pass filter
      {
        juceParamId: "HP Frequency",
        semantic: "eq_hp_freq",
        physicalUnit: "hz",
        mappingCurve: "logarithmic",
        minValue: 10,
        maxValue: 2000,
        defaultValue: 20,
      },
      // Low-pass filter
      {
        juceParamId: "LP Frequency",
        semantic: "eq_lp_freq",
        physicalUnit: "hz",
        mappingCurve: "logarithmic",
        minValue: 2000,
        maxValue: 20000,
        defaultValue: 20000,
      },
      // 4 parametric bands
      ...generateEqBandParams(4, {
        freqRange: [20, 20000],
        gainRange: [-24, 24],
        qRange: [0.1, 20],
        freqParamPattern: "Band {N} Freq",
        gainParamPattern: "Band {N} Gain",
        qParamPattern: "Band {N} BW",
        typeParamPattern: "Band {N} Type",
        filterSteps: [
          { normalizedValue: 0.0, physicalValue: "bell" },
          { normalizedValue: 0.25, physicalValue: "low_shelf" },
          { normalizedValue: 0.5, physicalValue: "high_shelf" },
          { normalizedValue: 0.75, physicalValue: "notch" },
        ],
      }),
    ],
  },
  {
    pluginName: "Waves SSL E-Channel",
    category: "eq",
    eqBandCount: 4,
    eqBandParameterPattern: "EQ {N} Freq",
    confidence: 65,
    source: "manual",
    parameters: [
      // SSL E-Channel has 4 fixed EQ bands: LF, LMF, HMF, HF
      // LF (low frequency)
      { juceParamId: "LF Freq", semantic: "eq_band_1_freq", physicalUnit: "hz", mappingCurve: "logarithmic", minValue: 30, maxValue: 450, defaultValue: 200 },
      { juceParamId: "LF Gain", semantic: "eq_band_1_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -15, maxValue: 15, defaultValue: 0 },
      { juceParamId: "LF Bell", semantic: "eq_band_1_type", physicalUnit: "stepped", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [{ normalizedValue: 0.0, physicalValue: "low_shelf" }, { normalizedValue: 1.0, physicalValue: "bell" }] },
      // LMF (low-mid frequency)
      { juceParamId: "LMF Freq", semantic: "eq_band_2_freq", physicalUnit: "hz", mappingCurve: "logarithmic", minValue: 200, maxValue: 2500, defaultValue: 600 },
      { juceParamId: "LMF Gain", semantic: "eq_band_2_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -15, maxValue: 15, defaultValue: 0 },
      { juceParamId: "LMF Q", semantic: "eq_band_2_q", physicalUnit: "ratio", mappingCurve: "logarithmic", minValue: 0.5, maxValue: 5, defaultValue: 1.5 },
      // HMF (high-mid frequency)
      { juceParamId: "HMF Freq", semantic: "eq_band_3_freq", physicalUnit: "hz", mappingCurve: "logarithmic", minValue: 600, maxValue: 7000, defaultValue: 2500 },
      { juceParamId: "HMF Gain", semantic: "eq_band_3_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -15, maxValue: 15, defaultValue: 0 },
      { juceParamId: "HMF Q", semantic: "eq_band_3_q", physicalUnit: "ratio", mappingCurve: "logarithmic", minValue: 0.5, maxValue: 5, defaultValue: 1.5 },
      // HF (high frequency)
      { juceParamId: "HF Freq", semantic: "eq_band_4_freq", physicalUnit: "hz", mappingCurve: "logarithmic", minValue: 1500, maxValue: 16000, defaultValue: 8000 },
      { juceParamId: "HF Gain", semantic: "eq_band_4_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -15, maxValue: 15, defaultValue: 0 },
      { juceParamId: "HF Bell", semantic: "eq_band_4_type", physicalUnit: "stepped", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [{ normalizedValue: 0.0, physicalValue: "high_shelf" }, { normalizedValue: 1.0, physicalValue: "bell" }] },
      // Filters
      { juceParamId: "HPF Freq", semantic: "eq_hp_freq", physicalUnit: "hz", mappingCurve: "logarithmic", minValue: 16, maxValue: 350, defaultValue: 16 },
    ],
  },
  {
    pluginName: "Waves Q10",
    category: "eq",
    eqBandCount: 10,
    eqBandParameterPattern: "Band{N}_Freq",
    confidence: 60,
    source: "manual",
    parameters: generateEqBandParams(10, {
      freqRange: [16, 21357],
      gainRange: [-18, 18],
      qRange: [0.5, 100],
      freqParamPattern: "Band{N}_Freq",
      gainParamPattern: "Band{N}_Gain",
      qParamPattern: "Band{N}_Range",
      typeParamPattern: "Band{N}_Type",
      filterSteps: [
        { normalizedValue: 0.0, physicalValue: "bell" },
        { normalizedValue: 0.2, physicalValue: "low_shelf" },
        { normalizedValue: 0.4, physicalValue: "high_shelf" },
        { normalizedValue: 0.6, physicalValue: "hpf" },
        { normalizedValue: 0.8, physicalValue: "lpf" },
      ],
    }),
  },
  {
    pluginName: "Waves H-EQ",
    category: "eq",
    eqBandCount: 7,
    eqBandParameterPattern: "Band {N} Freq",
    confidence: 60,
    source: "manual",
    parameters: [
      // H-EQ has 7 bands: HP, Band 1-5, LP
      { juceParamId: "HP Freq", semantic: "eq_hp_freq", physicalUnit: "hz", mappingCurve: "logarithmic", minValue: 16, maxValue: 500, defaultValue: 20 },
      { juceParamId: "LP Freq", semantic: "eq_lp_freq", physicalUnit: "hz", mappingCurve: "logarithmic", minValue: 2000, maxValue: 22000, defaultValue: 20000 },
      ...generateEqBandParams(5, {
        freqRange: [16, 22000],
        gainRange: [-18, 18],
        qRange: [0.1, 20],
        freqParamPattern: "Band {N} Freq",
        gainParamPattern: "Band {N} Gain",
        qParamPattern: "Band {N} Q",
        typeParamPattern: "Band {N} Type",
        filterSteps: [
          { normalizedValue: 0.0, physicalValue: "bell" },
          { normalizedValue: 0.2, physicalValue: "low_shelf" },
          { normalizedValue: 0.4, physicalValue: "high_shelf" },
          { normalizedValue: 0.6, physicalValue: "hpf" },
          { normalizedValue: 0.8, physicalValue: "lpf" },
        ],
      }),
    ],
  },
  {
    pluginName: "Kirchhoff-EQ",
    category: "eq",
    eqBandCount: 32,
    eqBandParameterPattern: "Band {N} Frequency",
    confidence: 65,
    source: "manual",
    parameters: generateEqBandParams(32, {
      freqRange: [10, 40000],
      gainRange: [-30, 30],
      qRange: [0.02, 50],
      freqParamPattern: "Band {N} Frequency",
      gainParamPattern: "Band {N} Gain",
      qParamPattern: "Band {N} Q",
      typeParamPattern: "Band {N} Shape",
      filterSteps: [
        { normalizedValue: 0.0, physicalValue: "bell" },
        { normalizedValue: 0.1, physicalValue: "low_shelf" },
        { normalizedValue: 0.2, physicalValue: "high_shelf" },
        { normalizedValue: 0.3, physicalValue: "hpf" },
        { normalizedValue: 0.4, physicalValue: "lpf" },
        { normalizedValue: 0.5, physicalValue: "notch" },
        { normalizedValue: 0.6, physicalValue: "bandpass" },
        { normalizedValue: 0.7, physicalValue: "tilt" },
      ],
    }),
  },
  {
    pluginName: "Maag Audio EQ4",
    category: "eq",
    eqBandCount: 6,
    eqBandParameterPattern: "Band {N}",
    confidence: 60,
    source: "manual",
    parameters: [
      // Maag EQ4 has fixed-frequency bands: Sub (10Hz), 40Hz, 160Hz, 650Hz, 2.5kHz, Air Band
      { juceParamId: "Sub", semantic: "eq_band_1_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -6, maxValue: 6, defaultValue: 0 },
      { juceParamId: "40Hz", semantic: "eq_band_2_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -6, maxValue: 6, defaultValue: 0 },
      { juceParamId: "160Hz", semantic: "eq_band_3_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -6, maxValue: 6, defaultValue: 0 },
      { juceParamId: "650Hz", semantic: "eq_band_4_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -6, maxValue: 6, defaultValue: 0 },
      { juceParamId: "2.5kHz", semantic: "eq_band_5_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -6, maxValue: 6, defaultValue: 0 },
      // Air band has selectable frequency
      { juceParamId: "Air Band", semantic: "eq_band_6_gain", physicalUnit: "db", mappingCurve: "linear", minValue: 0, maxValue: 10, defaultValue: 0 },
      { juceParamId: "Air Freq", semantic: "eq_band_6_freq", physicalUnit: "hz", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "2.5kHz" },
        { normalizedValue: 0.25, physicalValue: "5kHz" },
        { normalizedValue: 0.5, physicalValue: "10kHz" },
        { normalizedValue: 0.75, physicalValue: "20kHz" },
        { normalizedValue: 1.0, physicalValue: "40kHz" },
      ]},
    ],
  },
  {
    pluginName: "Pultec EQP-1A",
    category: "eq",
    eqBandCount: 3,
    eqBandParameterPattern: "Band {N}",
    confidence: 55,
    source: "manual",
    parameters: [
      // Low Frequency section
      { juceParamId: "Low Freq", semantic: "eq_band_1_freq", physicalUnit: "hz", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "20" },
        { normalizedValue: 0.25, physicalValue: "30" },
        { normalizedValue: 0.5, physicalValue: "60" },
        { normalizedValue: 0.75, physicalValue: "100" },
      ]},
      { juceParamId: "Low Boost", semantic: "eq_band_1_gain", physicalUnit: "db", mappingCurve: "linear", minValue: 0, maxValue: 10, defaultValue: 0 },
      { juceParamId: "Low Atten", semantic: "eq_band_1_cut", physicalUnit: "db", mappingCurve: "linear", minValue: 0, maxValue: 10, defaultValue: 0 },
      // High Frequency boost section
      { juceParamId: "High Freq Boost", semantic: "eq_band_2_freq", physicalUnit: "hz", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "3000" },
        { normalizedValue: 0.167, physicalValue: "4000" },
        { normalizedValue: 0.333, physicalValue: "5000" },
        { normalizedValue: 0.5, physicalValue: "8000" },
        { normalizedValue: 0.667, physicalValue: "10000" },
        { normalizedValue: 0.833, physicalValue: "12000" },
        { normalizedValue: 1.0, physicalValue: "16000" },
      ]},
      { juceParamId: "High Boost", semantic: "eq_band_2_gain", physicalUnit: "db", mappingCurve: "linear", minValue: 0, maxValue: 10, defaultValue: 0 },
      { juceParamId: "Bandwidth", semantic: "eq_band_2_q", physicalUnit: "ratio", mappingCurve: "linear", minValue: 0, maxValue: 10, defaultValue: 5 },
      // High Frequency atten section
      { juceParamId: "High Atten Freq", semantic: "eq_band_3_freq", physicalUnit: "hz", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "5000" },
        { normalizedValue: 0.5, physicalValue: "10000" },
        { normalizedValue: 1.0, physicalValue: "20000" },
      ]},
      { juceParamId: "High Atten", semantic: "eq_band_3_gain", physicalUnit: "db", mappingCurve: "linear", minValue: 0, maxValue: 10, defaultValue: 0 },
    ],
  },
  {
    pluginName: "SSL G-Equalizer",
    category: "eq",
    eqBandCount: 4,
    eqBandParameterPattern: "Band {N} Freq",
    confidence: 60,
    source: "manual",
    parameters: [
      // SSL G-EQ: LF, LMF, HMF, HF
      { juceParamId: "LF Freq", semantic: "eq_band_1_freq", physicalUnit: "hz", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "40" },
        { normalizedValue: 0.2, physicalValue: "70" },
        { normalizedValue: 0.4, physicalValue: "100" },
        { normalizedValue: 0.6, physicalValue: "150" },
        { normalizedValue: 0.8, physicalValue: "220" },
        { normalizedValue: 1.0, physicalValue: "300" },
      ]},
      { juceParamId: "LF Gain", semantic: "eq_band_1_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -15, maxValue: 15, defaultValue: 0 },
      { juceParamId: "LF x3", semantic: "eq_band_1_type", physicalUnit: "stepped", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [{ normalizedValue: 0.0, physicalValue: "low_shelf" }, { normalizedValue: 1.0, physicalValue: "bell" }] },
      // LMF
      { juceParamId: "LMF Freq", semantic: "eq_band_2_freq", physicalUnit: "hz", mappingCurve: "logarithmic", minValue: 200, maxValue: 2500, defaultValue: 600 },
      { juceParamId: "LMF Gain", semantic: "eq_band_2_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -15, maxValue: 15, defaultValue: 0 },
      { juceParamId: "LMF Q", semantic: "eq_band_2_q", physicalUnit: "ratio", mappingCurve: "logarithmic", minValue: 0.4, maxValue: 5, defaultValue: 1 },
      // HMF
      { juceParamId: "HMF Freq", semantic: "eq_band_3_freq", physicalUnit: "hz", mappingCurve: "logarithmic", minValue: 600, maxValue: 7000, defaultValue: 3000 },
      { juceParamId: "HMF Gain", semantic: "eq_band_3_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -15, maxValue: 15, defaultValue: 0 },
      { juceParamId: "HMF Q", semantic: "eq_band_3_q", physicalUnit: "ratio", mappingCurve: "logarithmic", minValue: 0.4, maxValue: 5, defaultValue: 1 },
      // HF
      { juceParamId: "HF Freq", semantic: "eq_band_4_freq", physicalUnit: "hz", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "1500" },
        { normalizedValue: 0.17, physicalValue: "2200" },
        { normalizedValue: 0.33, physicalValue: "3300" },
        { normalizedValue: 0.5, physicalValue: "4700" },
        { normalizedValue: 0.67, physicalValue: "6800" },
        { normalizedValue: 0.83, physicalValue: "10000" },
        { normalizedValue: 1.0, physicalValue: "15000" },
      ]},
      { juceParamId: "HF Gain", semantic: "eq_band_4_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -15, maxValue: 15, defaultValue: 0 },
      { juceParamId: "HF x3", semantic: "eq_band_4_type", physicalUnit: "stepped", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [{ normalizedValue: 0.0, physicalValue: "high_shelf" }, { normalizedValue: 1.0, physicalValue: "bell" }] },
    ],
  },
  {
    pluginName: "Neve 1073",
    category: "eq",
    eqBandCount: 3,
    eqBandParameterPattern: "EQ {N}",
    confidence: 55,
    source: "manual",
    parameters: [
      // Low Shelf
      { juceParamId: "Low Freq", semantic: "eq_band_1_freq", physicalUnit: "hz", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "35" },
        { normalizedValue: 0.25, physicalValue: "60" },
        { normalizedValue: 0.5, physicalValue: "110" },
        { normalizedValue: 0.75, physicalValue: "220" },
        { normalizedValue: 1.0, physicalValue: "360" },
      ]},
      { juceParamId: "Low Gain", semantic: "eq_band_1_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -12, maxValue: 16, defaultValue: 0 },
      // Mid Bell
      { juceParamId: "Mid Freq", semantic: "eq_band_2_freq", physicalUnit: "hz", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "360" },
        { normalizedValue: 0.143, physicalValue: "700" },
        { normalizedValue: 0.286, physicalValue: "1600" },
        { normalizedValue: 0.429, physicalValue: "3200" },
        { normalizedValue: 0.571, physicalValue: "4800" },
        { normalizedValue: 0.714, physicalValue: "7200" },
      ]},
      { juceParamId: "Mid Gain", semantic: "eq_band_2_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -12, maxValue: 16, defaultValue: 0 },
      // High Shelf
      { juceParamId: "High Freq", semantic: "eq_band_3_freq", physicalUnit: "hz", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "12000" },
      ]},
      { juceParamId: "High Gain", semantic: "eq_band_3_gain", physicalUnit: "db", mappingCurve: "linear", minValue: -12, maxValue: 16, defaultValue: 0 },
      // HPF
      { juceParamId: "HPF Freq", semantic: "eq_hp_freq", physicalUnit: "hz", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "off" },
        { normalizedValue: 0.2, physicalValue: "50" },
        { normalizedValue: 0.4, physicalValue: "80" },
        { normalizedValue: 0.6, physicalValue: "160" },
        { normalizedValue: 0.8, physicalValue: "300" },
      ]},
    ],
  },
];

// ============================================
// Compressor Plugin Definitions
// ============================================
const compressorPlugins = [
  {
    pluginName: "FabFilter Pro-C 2",
    category: "compressor",
    compHasAutoMakeup: true,
    compHasParallelMix: true,
    compHasLookahead: true,
    confidence: 75,
    source: "manual",
    parameters: [
      { juceParamId: "Threshold", semantic: "comp_threshold", physicalUnit: "db", mappingCurve: "linear", minValue: -60, maxValue: 0, defaultValue: -20 },
      { juceParamId: "Ratio", semantic: "comp_ratio", physicalUnit: "ratio", mappingCurve: "logarithmic", minValue: 1, maxValue: 20, defaultValue: 3 },
      { juceParamId: "Attack", semantic: "comp_attack", physicalUnit: "ms", mappingCurve: "logarithmic", minValue: 0.005, maxValue: 250, defaultValue: 10 },
      { juceParamId: "Release", semantic: "comp_release", physicalUnit: "ms", mappingCurve: "logarithmic", minValue: 1, maxValue: 2500, defaultValue: 100 },
      { juceParamId: "Knee", semantic: "comp_knee", physicalUnit: "db", mappingCurve: "linear", minValue: 0, maxValue: 72, defaultValue: 18 },
      { juceParamId: "Makeup", semantic: "comp_makeup", physicalUnit: "db", mappingCurve: "linear", minValue: -24, maxValue: 24, defaultValue: 0 },
      { juceParamId: "Mix", semantic: "comp_mix", physicalUnit: "percent", mappingCurve: "linear", minValue: 0, maxValue: 100, defaultValue: 100 },
      { juceParamId: "Range", semantic: "comp_range", physicalUnit: "db", mappingCurve: "linear", minValue: -60, maxValue: 0, defaultValue: -60 },
      { juceParamId: "Lookahead", semantic: "comp_lookahead", physicalUnit: "ms", mappingCurve: "linear", minValue: 0, maxValue: 20, defaultValue: 0 },
      { juceParamId: "Style", semantic: "comp_style", physicalUnit: "stepped", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "clean" },
        { normalizedValue: 0.125, physicalValue: "classic" },
        { normalizedValue: 0.25, physicalValue: "opto" },
        { normalizedValue: 0.375, physicalValue: "vocal" },
        { normalizedValue: 0.5, physicalValue: "mastering" },
        { normalizedValue: 0.625, physicalValue: "bus" },
        { normalizedValue: 0.75, physicalValue: "punch" },
        { normalizedValue: 0.875, physicalValue: "pumping" },
      ]},
    ],
  },
  {
    pluginName: "Waves CLA-76",
    category: "compressor",
    compHasAutoMakeup: false,
    compHasParallelMix: true,
    compHasLookahead: false,
    confidence: 65,
    source: "manual",
    parameters: [
      // CLA-76 uses Input and Output (not Threshold/Makeup)
      { juceParamId: "Input", semantic: "comp_threshold", physicalUnit: "db", mappingCurve: "linear", minValue: -60, maxValue: 0, defaultValue: -20 },
      { juceParamId: "Output", semantic: "comp_makeup", physicalUnit: "db", mappingCurve: "linear", minValue: -60, maxValue: 0, defaultValue: -20 },
      { juceParamId: "Ratio", semantic: "comp_ratio", physicalUnit: "ratio", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "4" },
        { normalizedValue: 0.33, physicalValue: "8" },
        { normalizedValue: 0.67, physicalValue: "12" },
        { normalizedValue: 1.0, physicalValue: "20" },
      ]},
      { juceParamId: "Attack", semantic: "comp_attack", physicalUnit: "ms", mappingCurve: "logarithmic", minValue: 0.02, maxValue: 0.8, defaultValue: 0.4 },
      { juceParamId: "Release", semantic: "comp_release", physicalUnit: "ms", mappingCurve: "logarithmic", minValue: 15, maxValue: 1100, defaultValue: 300 },
      { juceParamId: "Mix", semantic: "comp_mix", physicalUnit: "percent", mappingCurve: "linear", minValue: 0, maxValue: 100, defaultValue: 100 },
    ],
  },
  {
    pluginName: "Waves CLA-2A",
    category: "compressor",
    compHasAutoMakeup: false,
    compHasParallelMix: true,
    compHasLookahead: false,
    confidence: 60,
    source: "manual",
    parameters: [
      // CLA-2A is optical, simple controls
      { juceParamId: "Peak Reduction", semantic: "comp_threshold", physicalUnit: "db", mappingCurve: "linear", minValue: 0, maxValue: 100, defaultValue: 50 },
      { juceParamId: "Gain", semantic: "comp_makeup", physicalUnit: "db", mappingCurve: "linear", minValue: 0, maxValue: 60, defaultValue: 30 },
      { juceParamId: "Mix", semantic: "comp_mix", physicalUnit: "percent", mappingCurve: "linear", minValue: 0, maxValue: 100, defaultValue: 100 },
      { juceParamId: "Mode", semantic: "comp_style", physicalUnit: "stepped", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "compress" },
        { normalizedValue: 1.0, physicalValue: "limit" },
      ]},
    ],
  },
  {
    pluginName: "Waves SSL G-Master Buss Compressor",
    category: "compressor",
    compHasAutoMakeup: true,
    compHasParallelMix: true,
    compHasLookahead: false,
    confidence: 65,
    source: "manual",
    parameters: [
      { juceParamId: "Threshold", semantic: "comp_threshold", physicalUnit: "db", mappingCurve: "linear", minValue: -15, maxValue: 10, defaultValue: 0 },
      { juceParamId: "Ratio", semantic: "comp_ratio", physicalUnit: "ratio", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "2" },
        { normalizedValue: 0.5, physicalValue: "4" },
        { normalizedValue: 1.0, physicalValue: "10" },
      ]},
      { juceParamId: "Attack", semantic: "comp_attack", physicalUnit: "ms", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "0.1" },
        { normalizedValue: 0.167, physicalValue: "0.3" },
        { normalizedValue: 0.333, physicalValue: "1" },
        { normalizedValue: 0.5, physicalValue: "3" },
        { normalizedValue: 0.667, physicalValue: "10" },
        { normalizedValue: 0.833, physicalValue: "30" },
      ]},
      { juceParamId: "Release", semantic: "comp_release", physicalUnit: "ms", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "100" },
        { normalizedValue: 0.25, physicalValue: "300" },
        { normalizedValue: 0.5, physicalValue: "600" },
        { normalizedValue: 0.75, physicalValue: "1200" },
        { normalizedValue: 1.0, physicalValue: "auto" },
      ]},
      { juceParamId: "Makeup", semantic: "comp_makeup", physicalUnit: "db", mappingCurve: "linear", minValue: -5, maxValue: 15, defaultValue: 0 },
      { juceParamId: "Mix", semantic: "comp_mix", physicalUnit: "percent", mappingCurve: "linear", minValue: 0, maxValue: 100, defaultValue: 100 },
    ],
  },
  {
    pluginName: "Waves H-Comp",
    category: "compressor",
    compHasAutoMakeup: false,
    compHasParallelMix: true,
    compHasLookahead: false,
    confidence: 65,
    source: "manual",
    parameters: [
      { juceParamId: "Threshold", semantic: "comp_threshold", physicalUnit: "db", mappingCurve: "linear", minValue: -60, maxValue: 0, defaultValue: -20 },
      { juceParamId: "Ratio", semantic: "comp_ratio", physicalUnit: "ratio", mappingCurve: "logarithmic", minValue: 1, maxValue: 100, defaultValue: 4 },
      { juceParamId: "Attack", semantic: "comp_attack", physicalUnit: "ms", mappingCurve: "logarithmic", minValue: 0.5, maxValue: 100, defaultValue: 15 },
      { juceParamId: "Release", semantic: "comp_release", physicalUnit: "ms", mappingCurve: "logarithmic", minValue: 5, maxValue: 3000, defaultValue: 200 },
      { juceParamId: "Mix", semantic: "comp_mix", physicalUnit: "percent", mappingCurve: "linear", minValue: 0, maxValue: 100, defaultValue: 100 },
      { juceParamId: "Output", semantic: "comp_makeup", physicalUnit: "db", mappingCurve: "linear", minValue: -24, maxValue: 24, defaultValue: 0 },
      { juceParamId: "Punch", semantic: "comp_punch", physicalUnit: "percent", mappingCurve: "linear", minValue: 0, maxValue: 100, defaultValue: 0 },
    ],
  },
  {
    pluginName: "Waves Renaissance Compressor",
    category: "compressor",
    compHasAutoMakeup: false,
    compHasParallelMix: false,
    compHasLookahead: false,
    confidence: 60,
    source: "manual",
    parameters: [
      { juceParamId: "Threshold", semantic: "comp_threshold", physicalUnit: "db", mappingCurve: "linear", minValue: -60, maxValue: 0, defaultValue: -20 },
      { juceParamId: "Ratio", semantic: "comp_ratio", physicalUnit: "ratio", mappingCurve: "logarithmic", minValue: 1, maxValue: 50, defaultValue: 4 },
      { juceParamId: "Attack", semantic: "comp_attack", physicalUnit: "ms", mappingCurve: "logarithmic", minValue: 0.5, maxValue: 500, defaultValue: 10 },
      { juceParamId: "Release", semantic: "comp_release", physicalUnit: "ms", mappingCurve: "logarithmic", minValue: 5, maxValue: 5000, defaultValue: 200 },
      { juceParamId: "Gain", semantic: "comp_makeup", physicalUnit: "db", mappingCurve: "linear", minValue: -24, maxValue: 24, defaultValue: 0 },
      { juceParamId: "Character", semantic: "comp_style", physicalUnit: "stepped", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "opto" },
        { normalizedValue: 0.5, physicalValue: "electro" },
        { normalizedValue: 1.0, physicalValue: "warm" },
      ]},
    ],
  },
  {
    pluginName: "TDR Kotelnikov",
    category: "compressor",
    compHasAutoMakeup: true,
    compHasParallelMix: true,
    compHasLookahead: true,
    confidence: 70,
    source: "manual",
    parameters: [
      { juceParamId: "Threshold", semantic: "comp_threshold", physicalUnit: "db", mappingCurve: "linear", minValue: -60, maxValue: 0, defaultValue: -20 },
      { juceParamId: "Ratio", semantic: "comp_ratio", physicalUnit: "ratio", mappingCurve: "logarithmic", minValue: 1, maxValue: 20, defaultValue: 4 },
      { juceParamId: "Attack", semantic: "comp_attack", physicalUnit: "ms", mappingCurve: "logarithmic", minValue: 0.01, maxValue: 100, defaultValue: 10 },
      { juceParamId: "Release", semantic: "comp_release", physicalUnit: "ms", mappingCurve: "logarithmic", minValue: 1, maxValue: 2000, defaultValue: 200 },
      { juceParamId: "Knee", semantic: "comp_knee", physicalUnit: "db", mappingCurve: "linear", minValue: 0, maxValue: 40, defaultValue: 6 },
      { juceParamId: "Makeup", semantic: "comp_makeup", physicalUnit: "db", mappingCurve: "linear", minValue: 0, maxValue: 24, defaultValue: 0 },
      { juceParamId: "Mix", semantic: "comp_mix", physicalUnit: "percent", mappingCurve: "linear", minValue: 0, maxValue: 100, defaultValue: 100 },
      { juceParamId: "Stereo Link", semantic: "comp_stereo_link", physicalUnit: "percent", mappingCurve: "linear", minValue: 0, maxValue: 100, defaultValue: 100 },
    ],
  },
  {
    pluginName: "Empirical Labs Distressor",
    category: "compressor",
    compHasAutoMakeup: false,
    compHasParallelMix: true,
    compHasLookahead: false,
    confidence: 55,
    source: "manual",
    parameters: [
      { juceParamId: "Input", semantic: "comp_threshold", physicalUnit: "db", mappingCurve: "linear", minValue: -60, maxValue: 0, defaultValue: -20 },
      { juceParamId: "Output", semantic: "comp_makeup", physicalUnit: "db", mappingCurve: "linear", minValue: -60, maxValue: 0, defaultValue: -20 },
      { juceParamId: "Ratio", semantic: "comp_ratio", physicalUnit: "ratio", mappingCurve: "stepped", minValue: 0, maxValue: 1, steps: [
        { normalizedValue: 0.0, physicalValue: "1" },
        { normalizedValue: 0.167, physicalValue: "2" },
        { normalizedValue: 0.333, physicalValue: "3" },
        { normalizedValue: 0.5, physicalValue: "4" },
        { normalizedValue: 0.667, physicalValue: "6" },
        { normalizedValue: 0.833, physicalValue: "10" },
        { normalizedValue: 1.0, physicalValue: "20" },
      ]},
      { juceParamId: "Attack", semantic: "comp_attack", physicalUnit: "ms", mappingCurve: "logarithmic", minValue: 0.05, maxValue: 50, defaultValue: 5 },
      { juceParamId: "Release", semantic: "comp_release", physicalUnit: "ms", mappingCurve: "logarithmic", minValue: 10, maxValue: 2000, defaultValue: 200 },
      { juceParamId: "Mix", semantic: "comp_mix", physicalUnit: "percent", mappingCurve: "linear", minValue: 0, maxValue: 100, defaultValue: 100 },
    ],
  },
];

// ============================================
// Semantic parameter taxonomy definitions
// ============================================
const semanticDefinitions = [
  // EQ semantics
  { category: "eq", semanticId: "eq_band_freq", displayName: "Frequency", physicalUnit: "hz", typicalMin: 20, typicalMax: 20000, typicalDefault: 1000, typicalCurve: "logarithmic", priority: 1 },
  { category: "eq", semanticId: "eq_band_gain", displayName: "Gain", physicalUnit: "db", typicalMin: -24, typicalMax: 24, typicalDefault: 0, typicalCurve: "linear", priority: 1 },
  { category: "eq", semanticId: "eq_band_q", displayName: "Q / Bandwidth", physicalUnit: "ratio", typicalMin: 0.1, typicalMax: 30, typicalDefault: 1, typicalCurve: "logarithmic", priority: 2 },
  { category: "eq", semanticId: "eq_band_type", displayName: "Filter Type", physicalUnit: "stepped", typicalMin: 0, typicalMax: 1, typicalDefault: 0, typicalCurve: "stepped", priority: 2 },
  { category: "eq", semanticId: "eq_hp_freq", displayName: "High-Pass Frequency", physicalUnit: "hz", typicalMin: 10, typicalMax: 500, typicalDefault: 20, typicalCurve: "logarithmic", priority: 2 },
  { category: "eq", semanticId: "eq_lp_freq", displayName: "Low-Pass Frequency", physicalUnit: "hz", typicalMin: 2000, typicalMax: 22000, typicalDefault: 20000, typicalCurve: "logarithmic", priority: 2 },
  { category: "eq", semanticId: "eq_output_gain", displayName: "Output Gain", physicalUnit: "db", typicalMin: -24, typicalMax: 24, typicalDefault: 0, typicalCurve: "linear", priority: 3 },

  // Compressor semantics
  { category: "compressor", semanticId: "comp_threshold", displayName: "Threshold", physicalUnit: "db", typicalMin: -60, typicalMax: 0, typicalDefault: -20, typicalCurve: "linear", priority: 1 },
  { category: "compressor", semanticId: "comp_ratio", displayName: "Ratio", physicalUnit: "ratio", typicalMin: 1, typicalMax: 20, typicalDefault: 4, typicalCurve: "logarithmic", priority: 1 },
  { category: "compressor", semanticId: "comp_attack", displayName: "Attack", physicalUnit: "ms", typicalMin: 0.01, typicalMax: 250, typicalDefault: 10, typicalCurve: "logarithmic", priority: 1 },
  { category: "compressor", semanticId: "comp_release", displayName: "Release", physicalUnit: "ms", typicalMin: 1, typicalMax: 2500, typicalDefault: 200, typicalCurve: "logarithmic", priority: 1 },
  { category: "compressor", semanticId: "comp_knee", displayName: "Knee", physicalUnit: "db", typicalMin: 0, typicalMax: 40, typicalDefault: 6, typicalCurve: "linear", priority: 2 },
  { category: "compressor", semanticId: "comp_makeup", displayName: "Makeup Gain", physicalUnit: "db", typicalMin: -24, typicalMax: 24, typicalDefault: 0, typicalCurve: "linear", priority: 1 },
  { category: "compressor", semanticId: "comp_mix", displayName: "Mix / Blend", physicalUnit: "percent", typicalMin: 0, typicalMax: 100, typicalDefault: 100, typicalCurve: "linear", priority: 2 },
  { category: "compressor", semanticId: "comp_range", displayName: "Range", physicalUnit: "db", typicalMin: -60, typicalMax: 0, typicalDefault: -60, typicalCurve: "linear", priority: 3 },
  { category: "compressor", semanticId: "comp_lookahead", displayName: "Lookahead", physicalUnit: "ms", typicalMin: 0, typicalMax: 20, typicalDefault: 0, typicalCurve: "linear", priority: 3 },
  { category: "compressor", semanticId: "comp_style", displayName: "Style / Character", physicalUnit: "stepped", typicalMin: 0, typicalMax: 1, typicalDefault: 0, typicalCurve: "stepped", priority: 3 },
  { category: "compressor", semanticId: "comp_stereo_link", displayName: "Stereo Link", physicalUnit: "percent", typicalMin: 0, typicalMax: 100, typicalDefault: 100, typicalCurve: "linear", priority: 3 },
  { category: "compressor", semanticId: "comp_punch", displayName: "Punch", physicalUnit: "percent", typicalMin: 0, typicalMax: 100, typicalDefault: 0, typicalCurve: "linear", priority: 3 },
];

// ============================================
// Main seed function
// ============================================
async function main() {
  console.log("🔧 Seeding parameter translation maps...");
  console.log(`   Target: ${CONVEX_URL}\n`);

  // Step 1: Seed semantic definitions
  console.log("📚 Seeding semantic parameter definitions...");
  for (const def of semanticDefinitions) {
    try {
      await client.mutation(api.parameterTranslation.upsertParameterSemantic, def);
      console.log(`   ✅ ${def.category}/${def.semanticId}`);
    } catch (err) {
      console.error(`   ❌ ${def.category}/${def.semanticId}: ${err.message}`);
    }
  }
  console.log("");

  // Step 2: Find plugin IDs by searching the catalog
  console.log("🔍 Looking up plugin IDs in catalog...");
  const allPlugins = [...eqPlugins, ...compressorPlugins];
  let seeded = 0;
  let skipped = 0;

  for (const pluginDef of allPlugins) {
    try {
      // Search for the plugin in the catalog by name
      const results = await client.query(api.plugins.search, {
        query: pluginDef.pluginName,
      });

      // Try to find an exact or close match
      let matchedPlugin = results.find(
        (p) => p.name.toLowerCase() === pluginDef.pluginName.toLowerCase()
      );
      if (!matchedPlugin) {
        // Try partial match
        matchedPlugin = results.find(
          (p) => p.name.toLowerCase().includes(pluginDef.pluginName.toLowerCase()) ||
                 pluginDef.pluginName.toLowerCase().includes(p.name.toLowerCase())
        );
      }

      if (!matchedPlugin) {
        console.log(`   ⏭️  ${pluginDef.pluginName} — not in catalog, skipping`);
        skipped++;
        continue;
      }

      // Upsert the parameter map
      await client.mutation(api.parameterTranslation.upsertParameterMap, {
        plugin: matchedPlugin._id,
        pluginName: pluginDef.pluginName,
        category: pluginDef.category,
        parameters: pluginDef.parameters,
        eqBandCount: pluginDef.eqBandCount,
        eqBandParameterPattern: pluginDef.eqBandParameterPattern,
        compHasAutoMakeup: pluginDef.compHasAutoMakeup,
        compHasParallelMix: pluginDef.compHasParallelMix,
        compHasLookahead: pluginDef.compHasLookahead,
        confidence: pluginDef.confidence,
        source: pluginDef.source,
      });

      console.log(`   ✅ ${pluginDef.pluginName} → ${matchedPlugin._id} (${pluginDef.parameters.length} params, ${pluginDef.confidence}% conf)`);
      seeded++;
    } catch (err) {
      console.error(`   ❌ ${pluginDef.pluginName}: ${err.message}`);
    }
  }

  console.log(`\n📊 Results: ${seeded} seeded, ${skipped} skipped (not in catalog)`);
  console.log("✅ Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
