#!/usr/bin/env node
/**
 * Import Waves plugins from CSV export
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import fs from "fs";

const CONVEX_URL = "https://next-frog-231.convex.cloud";
const client = new ConvexHttpClient(CONVEX_URL);

const CSV_PATH = process.argv[2] || "/home/clawdbot/.openclaw/media/inbound/file_30---90fa0c45-c25e-4c70-8b4d-fc44cb03a340.csv";

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function detectCategory(name, description) {
  const text = `${name} ${description}`.toLowerCase();
  
  if (text.includes('compressor') || text.includes('compression') || text.includes('limiter')) return 'compressor';
  if (text.includes('equalizer') || text.includes(' eq ') || text.includes('eq ')) return 'eq';
  if (text.includes('reverb') || text.includes('chamber')) return 'reverb';
  if (text.includes('delay') || text.includes('echo')) return 'delay';
  if (text.includes('synth')) return 'synth';
  if (text.includes('piano') || text.includes('clavinet') || text.includes('instrument')) return 'instrument';
  if (text.includes('de-ess') || text.includes('deess') || text.includes('sibilance')) return 'utility';
  if (text.includes('noise') || text.includes('gate') || text.includes('suppressor')) return 'utility';
  if (text.includes('meter') || text.includes('analyzer') || text.includes('tuner')) return 'utility';
  if (text.includes('pitch') || text.includes('tune')) return 'utility';
  if (text.includes('saturat') || text.includes('distort') || text.includes('tape') || text.includes('tube')) return 'saturator';
  if (text.includes('vocal') || text.includes('voice')) return 'effect';
  if (text.includes('bass')) return 'effect';
  if (text.includes('guitar') || text.includes('amp')) return 'effect';
  if (text.includes('drum')) return 'effect';
  if (text.includes('stereo') || text.includes('imager') || text.includes('panner')) return 'utility';
  if (text.includes('channel strip') || text.includes('channel')) return 'effect';
  if (text.includes('filter') || text.includes('modulation') || text.includes('flanger') || text.includes('phaser')) return 'effect';
  
  return 'effect';
}

async function main() {
  console.log("📦 Importing Waves plugins from CSV...\n");
  
  // Get Waves manufacturer ID
  const waves = await client.query(api.manufacturers.getBySlug, { slug: "waves" });
  if (!waves) {
    console.error("Waves manufacturer not found!");
    process.exit(1);
  }
  console.log(`Found Waves: ${waves._id}\n`);
  
  // Read CSV
  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.trim().split('\n');
  
  // Skip header
  const dataLines = lines.slice(1);
  
  let created = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const line of dataLines) {
    const cols = parseCSVLine(line);
    
    // Column mapping:
    // 0: productUrl, 1: imageUrl, 2: name, 3: description
    // 5: rating, 6: reviews, 12-14: price parts
    
    const productUrl = cols[0];
    const imageUrl = cols[1];
    const name = cols[2];
    const description = cols[3];
    
    if (!name || !productUrl) continue;
    
    // Parse price - cols[12] is dollars, cols[13] is cents
    // But some have full price in cols[12] like "$249" or "$499"
    let priceInCents = null;
    if (cols[12]) {
      if (cols[12].startsWith('$') && cols[12].length > 1) {
        // Full price like "$249" or "$499"
        const fullPrice = parseInt(cols[12].replace('$', ''));
        if (!isNaN(fullPrice)) priceInCents = fullPrice * 100;
      } else if (cols[12] === '$' && cols[13]) {
        // Split price like "$" "39" "99"
        const dollars = parseInt(cols[13]);
        const cents = parseInt(cols[14]) || 0;
        if (!isNaN(dollars)) priceInCents = dollars * 100 + cents;
      }
    }
    
    const slug = slugify(name);
    const category = detectCategory(name, description);
    const isFree = description?.toLowerCase().includes('free') || priceInCents === 0;
    
    console.log(`📦 ${name} (${category}) - $${priceInCents ? (priceInCents/100).toFixed(2) : 'N/A'}`);
    
    try {
      await client.mutation(api.plugins.upsertBySlug, {
        slug,
        name,
        manufacturer: waves._id,
        category,
        productUrl,
        description,
        imageUrl,
        formats: ["VST3", "AU", "AAX"],
        platforms: ["windows", "mac"],
        msrp: priceInCents,
        currentPrice: priceInCents,
        currency: "USD",
        isFree,
        hasDemo: true,
        hasTrial: true,
      });
      created++;
    } catch (error) {
      if (error.message?.includes('already exists')) {
        skipped++;
      } else {
        console.error(`   ❌ Error: ${error.message}`);
        errors++;
      }
    }
  }
  
  console.log("\n📊 Summary:");
  console.log(`   ✅ Created/Updated: ${created}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`   📦 Total: ${dataLines.length}`);
}

main().catch(console.error);
