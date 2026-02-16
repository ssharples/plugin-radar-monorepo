#!/usr/bin/env node
/**
 * Plugin Image Enrichment Script
 *
 * Finds product images for plugins missing them by:
 *   1. Trying known manufacturer product page URL patterns → scraping og:image
 *   2. Trying Plugin Boutique search → scraping og:image
 *   3. Trying the plugin's own productUrl field if present
 *
 * No external API keys needed — pure HTTP scraping of public product pages.
 *
 * Usage:
 *   node scripts/enrich-images.mjs                    # process all missing
 *   node scripts/enrich-images.mjs --limit 20         # process 20
 *   node scripts/enrich-images.mjs --dry-run           # preview only
 *   node scripts/enrich-images.mjs --verbose           # detailed output
 */

// =============================================================================
// Configuration
// =============================================================================

const CONVEX_URL = process.env.CONVEX_URL || 'https://next-frog-231.convex.cloud';
const API_KEY = 'pluginradar-enrich-2026';

const argv = process.argv.slice(2);
const OPTIONS = {
  limit: parseInt(argv.find((a, i) => argv[i - 1] === '--limit')) || 200,
  dryRun: argv.includes('--dry-run'),
  verbose: argv.includes('--verbose'),
};

// =============================================================================
// Convex helpers
// =============================================================================

async function convexQuery(path, queryArgs = {}) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args: queryArgs }),
  });
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.errorMessage);
  return data.value;
}

async function convexMutation(path, mutArgs = {}) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args: mutArgs }),
  });
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.errorMessage);
  return data.value;
}

// =============================================================================
// HTTP helpers
// =============================================================================

async function fetchPage(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractOgImage(html) {
  if (!html) return null;

  // og:image (both attribute orders)
  const og1 = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (og1) return og1[1];
  const og2 = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (og2) return og2[1];

  // twitter:image fallback
  const tw1 = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
  if (tw1) return tw1[1];
  const tw2 = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
  if (tw2) return tw2[1];

  return null;
}

async function isValidImageUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PluginRadar/1.0)' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    return ct.startsWith('image/');
  } catch {
    return false;
  }
}

// =============================================================================
// Manufacturer product page URL patterns
// =============================================================================

function getProductPageUrls(plugin, mfrName, mfrSlug, mfrWebsite) {
  const name = plugin.name;
  const slug = plugin.slug;
  const nameSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '').replace(/^-+/, '');
  const mfrLower = (mfrName || '').toLowerCase();
  const urls = [];

  // SSL — Solid State Logic
  if (mfrLower.includes('solid state logic') || mfrSlug === 'solid-state-logic') {
    // SSL Native plugins have "ssl-" prefix in slug
    const sslName = slug.startsWith('ssl-') ? slug.slice(4) : nameSlug;
    urls.push(`https://store.solidstatelogic.com/plug-ins/${sslName}`);
    urls.push(`https://store.solidstatelogic.com/plug-ins/${nameSlug}`);
    urls.push(`https://www.solidstatelogic.com/products/${sslName}`);
  }

  // iZotope
  if (mfrLower.includes('izotope') || mfrSlug === 'izotope') {
    urls.push(`https://www.izotope.com/en/products/${nameSlug}.html`);
    urls.push(`https://www.izotope.com/en/products/${nameSlug}`);
  }

  // Native Instruments
  if (mfrLower.includes('native instruments') || mfrSlug === 'native-instruments') {
    urls.push(`https://www.native-instruments.com/en/products/komplete/effects/${nameSlug}/`);
    urls.push(`https://www.native-instruments.com/en/products/komplete/synths/${nameSlug}/`);
  }

  // Soundtoys
  if (mfrLower.includes('soundtoys') || mfrSlug === 'soundtoys') {
    urls.push(`https://www.soundtoys.com/product/${nameSlug}/`);
    urls.push(`https://www.soundtoys.com/product/${nameSlug}`);
  }

  // Cableguys
  if (mfrLower.includes('cableguys') || mfrSlug === 'cableguys') {
    urls.push(`https://www.cableguys.com/${nameSlug}.html`);
    urls.push(`https://www.cableguys.com/products/${nameSlug}`);
  }

  // Waves
  if (mfrLower.includes('waves') || mfrSlug === 'waves') {
    urls.push(`https://www.waves.com/plugins/${nameSlug}`);
    urls.push(`https://www.waves.com/plugins/${name.toLowerCase().replace(/\s+/g, '-')}`);
  }

  // Eventide
  if (mfrLower.includes('eventide') || mfrSlug === 'eventide') {
    urls.push(`https://www.eventideaudio.com/plug-ins/${nameSlug}/`);
    urls.push(`https://www.eventideaudio.com/plug-ins/${nameSlug}`);
  }

  // Arturia
  if (mfrLower.includes('arturia') || mfrSlug === 'arturia') {
    urls.push(`https://www.arturia.com/products/${nameSlug}/overview`);
    urls.push(`https://www.arturia.com/products/software-effects/${nameSlug}/overview`);
  }

  // Slate Digital
  if (mfrLower.includes('slate digital') || mfrSlug === 'slate-digital') {
    urls.push(`https://www.slatedigital.com/${nameSlug}`);
    urls.push(`https://www.slatedigital.com/products/${nameSlug}`);
  }

  // Universal Audio
  if (mfrLower.includes('universal audio') || mfrSlug === 'universal-audio') {
    urls.push(`https://www.uaudio.com/uad-plugins/${nameSlug}.html`);
    urls.push(`https://www.uaudio.com/uad-plugins/${nameSlug}`);
  }

  // Plugin Alliance
  if (mfrLower.includes('plugin alliance') || mfrSlug === 'plugin-alliance') {
    urls.push(`https://www.plugin-alliance.com/en/products/${nameSlug}.html`);
  }

  // Softube
  if (mfrLower.includes('softube') || mfrSlug === 'softube') {
    urls.push(`https://www.softube.com/products/${nameSlug}`);
  }

  // oeksound
  if (mfrLower.includes('oeksound') || mfrSlug === 'oeksound') {
    urls.push(`https://oeksound.com/plugins/${nameSlug}/`);
    urls.push(`https://oeksound.com/plugins/${name.toLowerCase()}/`);
  }

  // Acon Digital
  if (mfrLower.includes('acon digital') || mfrSlug === 'acon-digital') {
    urls.push(`https://acondigital.com/products/${nameSlug}/`);
  }

  // Slate Digital FG series (Slate & Ash)
  if (name.startsWith('FG-')) {
    urls.push(`https://www.slatedigital.com/${nameSlug}`);
    urls.push(`https://www.slatedigital.com/products/${nameSlug}`);
  }

  // Generic: try manufacturer website + /products/ + slug
  if (mfrWebsite) {
    const base = mfrWebsite.replace(/\/$/, '');
    urls.push(`${base}/products/${nameSlug}`);
    urls.push(`${base}/plugins/${nameSlug}`);
    urls.push(`${base}/${nameSlug}`);
  }

  // Plugin Boutique product page (search fallback)
  urls.push(`https://www.pluginboutique.com/search?q=${encodeURIComponent(name)}`);

  return urls;
}

// =============================================================================
// Main find image function
// =============================================================================

async function findImageForPlugin(plugin, mfrName, mfrSlug, mfrWebsite) {
  const urls = getProductPageUrls(plugin, mfrName, mfrSlug, mfrWebsite);

  for (const url of urls) {
    if (OPTIONS.verbose) console.log(`    Trying: ${url}`);

    // Skip Plugin Boutique search URL — handle separately
    if (url.includes('pluginboutique.com/search')) continue;

    const html = await fetchPage(url);
    if (!html) continue;

    const ogImage = extractOgImage(html);
    if (ogImage && ogImage.startsWith('http')) {
      // Validate it's actually an image
      if (await isValidImageUrl(ogImage)) {
        return { url: ogImage, source: 'og:image', page: url };
      }
    }

    // Also try extracting prominent images from the page
    const heroImg = extractHeroImage(html, url, plugin.name, mfrName);
    if (heroImg) {
      if (await isValidImageUrl(heroImg)) {
        return { url: heroImg, source: 'hero-image', page: url };
      }
    }
  }

  // Fallback: Plugin Boutique search
  const pbImage = await findViaPluginBoutique(plugin.name);
  if (pbImage) {
    return { url: pbImage, source: 'plugin-boutique' };
  }

  return null;
}

function extractHeroImage(html, pageUrl, pluginName, mfrName) {
  // Look for large product images in the page
  const pluginSlug = pluginName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const patterns = [
    // Images with product/hero/main in src
    /<img[^>]*src=["']([^"']+(?:product|hero|main|featured|gui|screenshot)[^"']*)["']/gi,
    // Images with the plugin name in src
    new RegExp(`<img[^>]*src=["']([^"']*${pluginSlug}[^"']*)["']`, 'gi'),
  ];

  const candidates = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      let imgUrl = match[1];
      // Make absolute
      if (imgUrl.startsWith('/')) {
        try {
          const base = new URL(pageUrl);
          imgUrl = `${base.protocol}//${base.host}${imgUrl}`;
        } catch { continue; }
      }
      if (!imgUrl.startsWith('http')) continue;

      // Score
      let score = 0;
      if (/hero|product|main|featured/i.test(imgUrl)) score += 3;
      if (imgUrl.toLowerCase().includes(pluginSlug)) score += 5;
      if (/thumb|icon|avatar|logo|favicon/i.test(imgUrl)) score -= 5;

      if (score > 0) candidates.push({ url: imgUrl, score });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].url;
  }
  return null;
}

async function findViaPluginBoutique(pluginName) {
  try {
    const searchUrl = `https://www.pluginboutique.com/search?q=${encodeURIComponent(pluginName)}`;
    const html = await fetchPage(searchUrl);
    if (!html) return null;

    // Extract og:image from search results page
    const ogImage = extractOgImage(html);
    if (ogImage && ogImage.startsWith('http')) return ogImage;

    // Try to find product links and follow first one
    const productMatch = html.match(/href=["'](\/products?\/\d+[^"']*)["']/i);
    if (productMatch) {
      const productUrl = `https://www.pluginboutique.com${productMatch[1]}`;
      if (OPTIONS.verbose) console.log(`    Following PB product: ${productUrl}`);
      const productHtml = await fetchPage(productUrl);
      const productOg = extractOgImage(productHtml);
      if (productOg && productOg.startsWith('http')) return productOg;
    }

    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('Plugin Image Enrichment (og:image scraping)');
  console.log('='.repeat(60));
  console.log(`  Mode: ${OPTIONS.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Limit: ${OPTIONS.limit}`);
  console.log('');

  // Fetch all plugins
  const result = await convexQuery('plugins:list', { limit: 1000 });
  const allPlugins = result.items;

  // Build manufacturer lookup
  let manufacturers = {};
  try {
    const mfrResult = await convexQuery('manufacturers:list', {});
    const mfrList = mfrResult.items || mfrResult || [];
    for (const m of mfrList) {
      manufacturers[m._id] = m;
    }
  } catch {
    console.log('  (Could not load manufacturers)');
  }

  // Filter to plugins needing images
  const needsImage = allPlugins.filter(p => !p.imageUrl && !p.imageStorageId);
  const toProcess = needsImage.slice(0, OPTIONS.limit);

  console.log(`Total plugins: ${allPlugins.length}`);
  console.log(`Missing images: ${needsImage.length}`);
  console.log(`Processing: ${toProcess.length}`);
  console.log('');

  let found = 0;
  let notFound = 0;
  let errors = 0;
  let batch = [];

  for (let i = 0; i < toProcess.length; i++) {
    const plugin = toProcess[i];
    const mfr = manufacturers[plugin.manufacturer] || {};
    const mfrName = plugin.manufacturerName || mfr.name || '';
    const mfrSlug = mfr.slug || '';
    const mfrWebsite = mfr.website || '';

    process.stdout.write(`[${i + 1}/${toProcess.length}] ${plugin.name} (${mfrName || '?'})... `);

    try {
      const imageResult = await findImageForPlugin(plugin, mfrName, mfrSlug, mfrWebsite);

      if (imageResult) {
        console.log(`found (${imageResult.source})`);
        if (OPTIONS.verbose) console.log(`    -> ${imageResult.url}`);
        batch.push({ slug: plugin.slug, imageUrl: imageResult.url });
        found++;
      } else {
        console.log('not found');
        notFound++;
      }
    } catch (err) {
      console.log(`error: ${err.message}`);
      errors++;
    }

    // Save batch every 10
    if (batch.length >= 10 && !OPTIONS.dryRun) {
      await saveBatch(batch);
      batch = [];
    }

    // Rate limiting (be polite to manufacturer websites)
    await new Promise(r => setTimeout(r, 1000));
  }

  // Save remaining
  if (batch.length > 0 && !OPTIONS.dryRun) {
    await saveBatch(batch);
  }

  // Final stats
  console.log('');
  console.log('='.repeat(60));
  console.log('Results:');
  console.log(`  Found: ${found}`);
  console.log(`  Not found: ${notFound}`);
  console.log(`  Errors: ${errors}`);

  const afterResult = await convexQuery('plugins:list', { limit: 1000 });
  const withImage = afterResult.items.filter(p => p.imageUrl || p.imageStorageId).length;
  console.log(`\n  Images: ${withImage}/${afterResult.items.length} (${Math.round(withImage / afterResult.items.length * 100)}%)`);
  console.log('Done!');
}

async function saveBatch(items) {
  try {
    const result = await convexMutation('enrichment:batchUpdatePluginImages', {
      apiKey: API_KEY,
      plugins: items,
    });
    console.log(`  -> Saved ${result.updated} images`);
  } catch (err) {
    console.log(`  -> Save error: ${err.message}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
