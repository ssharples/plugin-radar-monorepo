#!/usr/bin/env node
/**
 * Comparison Page Generator
 * Generates plugin vs plugin comparison data for SEO pages
 */

import { ConvexHttpClient } from 'convex/browser';
import fs from 'fs';
import path from 'path';

const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const client = new ConvexHttpClient(CONVEX_URL);

// Categories that make sense for comparisons
const COMPARABLE_CATEGORIES = [
  'eq', 'compressor', 'reverb', 'delay', 'limiter', 
  'saturator', 'channel-strip', 'synth', 'sampler'
];

// Generate comparison slug
function comparisonSlug(pluginA, pluginB) {
  // Alphabetically sort to ensure consistent slugs
  const slugs = [pluginA.slug, pluginB.slug].sort();
  return `${slugs[0]}-vs-${slugs[1]}`;
}

// Calculate similarity score between two plugins
function similarityScore(a, b) {
  let score = 0;
  
  // Same category is essential
  if (a.category !== b.category) return 0;
  score += 50;
  
  // Same subcategory
  if (a.subcategory && a.subcategory === b.subcategory) score += 20;
  
  // Similar price range (within 50%)
  if (a.msrp && b.msrp) {
    const ratio = Math.min(a.msrp, b.msrp) / Math.max(a.msrp, b.msrp);
    if (ratio > 0.5) score += 15;
  }
  
  // Both free or both paid
  if (a.isFree === b.isFree) score += 10;
  
  // Overlapping tags
  const aTags = new Set(a.tags || []);
  const bTags = new Set(b.tags || []);
  const overlap = [...aTags].filter(t => bTags.has(t)).length;
  score += overlap * 5;
  
  // Similar format support
  const aFormats = new Set(a.formats || []);
  const bFormats = new Set(b.formats || []);
  const formatOverlap = [...aFormats].filter(f => bFormats.has(f)).length;
  score += formatOverlap * 3;
  
  return score;
}

// Generate comparison content
function generateComparisonContent(pluginA, pluginB, mfrA, mfrB) {
  const priceA = pluginA.isFree ? 'Free' : pluginA.msrp ? `$${(pluginA.msrp / 100).toFixed(0)}` : 'N/A';
  const priceB = pluginB.isFree ? 'Free' : pluginB.msrp ? `$${(pluginB.msrp / 100).toFixed(0)}` : 'N/A';
  
  // Determine winner for different criteria
  const priceWinner = pluginA.isFree ? 'a' : pluginB.isFree ? 'b' : 
    (pluginA.msrp && pluginB.msrp) ? (pluginA.msrp < pluginB.msrp ? 'a' : 'b') : null;
  
  const trendingWinner = (pluginA.mentionScore || 0) > (pluginB.mentionScore || 0) ? 'a' : 
    (pluginB.mentionScore || 0) > (pluginA.mentionScore || 0) ? 'b' : null;
  
  // Format comparison
  const formatsA = pluginA.formats?.join(', ') || 'Not specified';
  const formatsB = pluginB.formats?.join(', ') || 'Not specified';
  
  // Platform comparison
  const platformsA = pluginA.platforms?.join(', ') || 'Not specified';
  const platformsB = pluginB.platforms?.join(', ') || 'Not specified';
  
  return {
    slug: comparisonSlug(pluginA, pluginB),
    title: `${pluginA.name} vs ${pluginB.name}`,
    metaDescription: `Compare ${pluginA.name} by ${mfrA.name} with ${pluginB.name} by ${mfrB.name}. See pricing, features, formats, and which ${pluginA.category} plugin is right for you.`,
    
    pluginA: {
      id: pluginA._id,
      name: pluginA.name,
      slug: pluginA.slug,
      manufacturer: mfrA.name,
      manufacturerSlug: mfrA.slug,
      description: pluginA.shortDescription || pluginA.description?.slice(0, 200),
      price: priceA,
      priceRaw: pluginA.msrp,
      isFree: pluginA.isFree,
      category: pluginA.category,
      formats: pluginA.formats || [],
      platforms: pluginA.platforms || [],
      tags: pluginA.tags || [],
      imageUrl: pluginA.imageUrl,
      productUrl: pluginA.productUrl,
      trendingScore: pluginA.mentionScore || 0,
      mentions7d: pluginA.mentionCount7d || 0,
    },
    
    pluginB: {
      id: pluginB._id,
      name: pluginB.name,
      slug: pluginB.slug,
      manufacturer: mfrB.name,
      manufacturerSlug: mfrB.slug,
      description: pluginB.shortDescription || pluginB.description?.slice(0, 200),
      price: priceB,
      priceRaw: pluginB.msrp,
      isFree: pluginB.isFree,
      category: pluginB.category,
      formats: pluginB.formats || [],
      platforms: pluginB.platforms || [],
      tags: pluginB.tags || [],
      imageUrl: pluginB.imageUrl,
      productUrl: pluginB.productUrl,
      trendingScore: pluginB.mentionScore || 0,
      mentions7d: pluginB.mentionCount7d || 0,
    },
    
    comparison: {
      category: pluginA.category,
      priceWinner,
      trendingWinner,
      formatsA,
      formatsB,
      platformsA,
      platformsB,
    },
    
    generatedAt: Date.now(),
  };
}

// Find best comparison candidates for a plugin
function findComparisonCandidates(plugin, allPlugins, limit = 5) {
  return allPlugins
    .filter(p => p._id !== plugin._id) // Not itself
    .map(p => ({ plugin: p, score: similarityScore(plugin, p) }))
    .filter(({ score }) => score > 50) // Must be same category at minimum
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ plugin }) => plugin);
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 100;
  const outputDir = args.find(a => a.startsWith('--output='))?.split('=')[1] || 'data/comparisons';
  const dryRun = args.includes('--dry-run');
  const topOnly = args.includes('--top-only'); // Only compare popular plugins
  
  console.log('=== Comparison Page Generator ===');
  console.log(`Limit: ${limit} comparisons`);
  console.log(`Output: ${outputDir}`);
  console.log(`Dry run: ${dryRun}`);
  
  // Get all plugins
  const pluginResult = await client.query('plugins:list', { limit: 1000 });
  let plugins = pluginResult.items || pluginResult;
  
  // Get manufacturer lookup
  const manufacturers = await client.query('manufacturers:list', { limit: 100 });
  const mfrMap = Object.fromEntries(manufacturers.map(m => [m._id, m]));
  
  // Filter to comparable categories
  plugins = plugins.filter(p => COMPARABLE_CATEGORIES.includes(p.category));
  
  // If top-only, filter to plugins with trending scores
  if (topOnly) {
    plugins = plugins.filter(p => p.mentionScore && p.mentionScore > 0);
  }
  
  console.log(`\nFound ${plugins.length} comparable plugins`);
  
  // Generate comparisons
  const comparisons = [];
  const seenSlugs = new Set();
  
  for (const plugin of plugins) {
    const candidates = findComparisonCandidates(plugin, plugins, 3);
    
    for (const candidate of candidates) {
      const slug = comparisonSlug(plugin, candidate);
      
      // Skip if we've already generated this comparison
      if (seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);
      
      const mfrA = mfrMap[plugin.manufacturer];
      const mfrB = mfrMap[candidate.manufacturer];
      
      if (!mfrA || !mfrB) continue;
      
      const comparison = generateComparisonContent(plugin, candidate, mfrA, mfrB);
      comparisons.push(comparison);
      
      if (comparisons.length >= limit) break;
    }
    
    if (comparisons.length >= limit) break;
  }
  
  console.log(`\nGenerated ${comparisons.length} comparisons`);
  
  if (dryRun) {
    console.log('\n[DRY RUN] Sample comparisons:');
    for (const c of comparisons.slice(0, 5)) {
      console.log(`  - ${c.title} (${c.comparison.category})`);
    }
    return;
  }
  
  // Create output directory
  const fullOutputDir = path.join(process.cwd(), outputDir);
  if (!fs.existsSync(fullOutputDir)) {
    fs.mkdirSync(fullOutputDir, { recursive: true });
  }
  
  // Write individual comparison files
  for (const comparison of comparisons) {
    const filePath = path.join(fullOutputDir, `${comparison.slug}.json`);
    fs.writeFileSync(filePath, JSON.stringify(comparison, null, 2));
  }
  
  // Write index file
  const index = comparisons.map(c => ({
    slug: c.slug,
    title: c.title,
    category: c.comparison.category,
    pluginA: c.pluginA.slug,
    pluginB: c.pluginB.slug,
  }));
  
  fs.writeFileSync(
    path.join(fullOutputDir, '_index.json'),
    JSON.stringify(index, null, 2)
  );
  
  console.log(`\nWritten to ${fullOutputDir}/`);
  console.log(`  - ${comparisons.length} comparison files`);
  console.log(`  - _index.json`);
  
  // Summary by category
  const byCategory = {};
  for (const c of comparisons) {
    byCategory[c.comparison.category] = (byCategory[c.comparison.category] || 0) + 1;
  }
  console.log('\nBy category:');
  for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }
}

main().catch(console.error);
