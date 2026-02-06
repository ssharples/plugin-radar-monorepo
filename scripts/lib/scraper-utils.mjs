#!/usr/bin/env node

/**
 * Shared scraper utilities
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api.js';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

// Convex client
const CONVEX_URL = 'https://next-frog-231.convex.cloud';
export const convex = new ConvexHttpClient(CONVEX_URL);

/**
 * Generate URL-safe slug from name
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parse price string to cents
 */
export function parsePrice(priceStr) {
  if (!priceStr) return null;
  
  // Handle "Free" or similar
  if (/free/i.test(priceStr)) return 0;
  
  // Extract numeric value
  const match = priceStr.match(/[\d,]+\.?\d*/);
  if (!match) return null;
  
  const value = parseFloat(match[0].replace(/,/g, ''));
  return Math.round(value * 100); // Convert to cents
}

/**
 * Detect plugin category from name/description
 */
export function detectCategory(name, description = '') {
  const text = `${name} ${description}`.toLowerCase();
  
  const patterns = [
    { pattern: /\beq\b|equaliz/i, category: 'eq' },
    { pattern: /compressor|dynamics|limiter/i, category: 'compressor' },
    { pattern: /reverb|room|hall|plate/i, category: 'reverb' },
    { pattern: /delay|echo/i, category: 'delay' },
    { pattern: /synth|synthesizer/i, category: 'synth' },
    { pattern: /sampler|sample player|rompler/i, category: 'sampler' },
    { pattern: /drum|beat|percussion/i, category: 'instrument' },
    { pattern: /piano|keys|organ/i, category: 'instrument' },
    { pattern: /guitar|bass|amp/i, category: 'effect' },
    { pattern: /vocal|pitch|autotune/i, category: 'effect' },
    { pattern: /distortion|saturati|overdrive|fuzz/i, category: 'effect' },
    { pattern: /chorus|flanger|phaser|modulation/i, category: 'effect' },
    { pattern: /master|loudness/i, category: 'utility' },
    { pattern: /meter|analyz/i, category: 'utility' },
    { pattern: /bundle|collection|suite/i, category: 'bundle' },
  ];
  
  for (const { pattern, category } of patterns) {
    if (pattern.test(text)) return category;
  }
  
  return 'effect'; // Default category
}

/**
 * Download image to local storage
 */
export async function downloadImage(imageUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const file = fs.createWriteStream(outputPath);
    const protocol = imageUrl.startsWith('https') ? https : http;
    
    protocol.get(imageUrl, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadImage(response.headers.location, outputPath).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(outputPath);
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {}); // Clean up partial file
      reject(err);
    });
  });
}

/**
 * Get or create manufacturer by slug
 */
export async function getOrCreateManufacturer(slug) {
  try {
    const existing = await convex.query(api.manufacturers.getBySlug, { slug });
    if (existing) return existing._id;
    return null;
  } catch (err) {
    console.error(`Error getting manufacturer ${slug}:`, err.message);
    return null;
  }
}

/**
 * Upsert plugin to Convex
 */
export async function upsertPlugin(plugin) {
  try {
    const result = await convex.mutation(api.plugins.upsertBySlug, plugin);
    return result;
  } catch (err) {
    console.error(`Error upserting plugin ${plugin.name}:`, err.message);
    return null;
  }
}

/**
 * Default formats and platforms
 */
export const DEFAULT_FORMATS = ['VST3', 'AU', 'AAX'];
export const DEFAULT_PLATFORMS = ['windows', 'mac'];

/**
 * Sleep utility
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Rate limit wrapper
 */
export function rateLimited(fn, delayMs = 1000) {
  let lastCall = 0;
  return async (...args) => {
    const now = Date.now();
    const wait = Math.max(0, lastCall + delayMs - now);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    return fn(...args);
  };
}
