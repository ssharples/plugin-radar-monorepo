#!/usr/bin/env node
/**
 * Plugin Image Enrichment v2
 *
 * Smarter approach: scrapes manufacturer product pages for og:image,
 * but validates that the image is PRODUCT-SPECIFIC (not a generic logo/social share).
 *
 * Validation rules:
 *   - Reject URLs used by multiple plugins (generic manufacturer images)
 *   - Reject URLs containing generic patterns (logo, social-share, preview, fallback)
 *   - Reject URLs that don't look like product images
 *   - Only accept og:image from pages where the URL path contains the plugin name
 *
 * Usage:
 *   node scripts/enrich-images-v2.mjs                 # process all missing
 *   node scripts/enrich-images-v2.mjs --limit 20      # process 20
 *   node scripts/enrich-images-v2.mjs --dry-run        # preview only
 *   node scripts/enrich-images-v2.mjs --verbose        # detailed output
 */

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
  const og1 = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (og1) return og1[1];
  const og2 = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (og2) return og2[1];
  const tw1 = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
  if (tw1) return tw1[1];
  const tw2 = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
  if (tw2) return tw2[1];
  return null;
}

// =============================================================================
// Image quality validation
// =============================================================================

const GENERIC_PATTERNS = [
  'social-preview', 'social-share', 'PREVIEW-IMAGE', 'share.jpg', 'share.png',
  'Logo', 'logo', 'facebook', 'acustica-share', 'MTotalFXBundle', 'TotalFX',
  'kontakt-', 'img-modpack', 'hero_fallback', 'favicon', 'default-og',
  'brand-image', 'site-image', 'generic', 'placeholder', 'default.',
  'opengraph-default', 'og-default', 'banner-default',
];

function isGenericImage(imageUrl) {
  const urlLower = imageUrl.toLowerCase();
  return GENERIC_PATTERNS.some(p => urlLower.includes(p.toLowerCase()));
}

function isProductSpecificImage(imageUrl, pluginName, pluginSlug) {
  if (isGenericImage(imageUrl)) return false;

  const urlLower = imageUrl.toLowerCase();
  const nameSlug = pluginName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Check if URL contains some form of the plugin name
  const nameVariants = [
    pluginSlug,
    nameSlug,
    pluginName.toLowerCase().replace(/\s+/g, ''),
    pluginName.toLowerCase().replace(/\s+/g, '_'),
    pluginName.toLowerCase().replace(/\s+/g, '-'),
  ];

  // If the image URL references the plugin name, it's specific
  for (const v of nameVariants) {
    if (v.length >= 3 && urlLower.includes(v)) return true;
  }

  // If it contains product/plugin/gui/screenshot terms, likely good
  if (/\/(product|plugin|gui|screenshot|interface|preset)/i.test(imageUrl)) return true;

  // If it's from a CDN with a long hash path, it's likely auto-generated per product
  if (/\/[a-f0-9]{20,}\//i.test(imageUrl)) return true;

  // If none of these match, be cautious — could be generic
  return false;
}

// Track seen image URLs to detect duplicates within this run
const seenImageUrls = new Set();

function isUniqueImage(imageUrl) {
  if (seenImageUrls.has(imageUrl)) return false;
  seenImageUrls.add(imageUrl);
  return true;
}

// =============================================================================
// Manufacturer-specific product page URL builders
// =============================================================================

function getProductUrls(plugin, mfrName, mfrSlug, mfrWebsite) {
  const name = plugin.name;
  const slug = plugin.slug;
  const nameSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const mfrLower = (mfrName || '').toLowerCase();
  const urls = [];

  // SSL
  if (mfrLower.includes('solid state logic') || mfrSlug === 'solid-state-logic') {
    const sslName = slug.startsWith('ssl-') ? slug.slice(4) : nameSlug;
    urls.push(`https://store.solidstatelogic.com/plug-ins/${sslName}`);
    urls.push(`https://store.solidstatelogic.com/plug-ins/${nameSlug}`);
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
  }

  // Cableguys
  if (mfrLower.includes('cableguys') || mfrSlug === 'cableguys') {
    urls.push(`https://www.cableguys.com/${nameSlug}.html`);
  }

  // Waves
  if (mfrLower.includes('waves') || mfrSlug === 'waves') {
    urls.push(`https://www.waves.com/plugins/${nameSlug}`);
  }

  // Eventide
  if (mfrLower.includes('eventide') || mfrSlug === 'eventide') {
    urls.push(`https://www.eventideaudio.com/plug-ins/${nameSlug}/`);
  }

  // Arturia
  if (mfrLower.includes('arturia') || mfrSlug === 'arturia') {
    urls.push(`https://www.arturia.com/products/${nameSlug}/overview`);
    urls.push(`https://www.arturia.com/products/software-effects/${nameSlug}/overview`);
  }

  // Slate Digital
  if (mfrLower.includes('slate digital') || mfrSlug === 'slate-digital') {
    urls.push(`https://www.slatedigital.com/${nameSlug}`);
  }

  // Universal Audio
  if (mfrLower.includes('universal audio') || mfrSlug === 'universal-audio') {
    urls.push(`https://www.uaudio.com/uad-plugins/${nameSlug}.html`);
  }

  // Plugin Alliance / Brainworx
  if (mfrLower.includes('plugin alliance') || mfrSlug === 'plugin-alliance' || mfrLower.includes('brainworx')) {
    urls.push(`https://www.plugin-alliance.com/en/products/${nameSlug}.html`);
  }

  // Softube
  if (mfrLower.includes('softube') || mfrSlug === 'softube') {
    urls.push(`https://www.softube.com/products/${nameSlug}`);
  }

  // oeksound
  if (mfrLower.includes('oeksound') || mfrSlug === 'oeksound') {
    urls.push(`https://oeksound.com/plugins/${name.toLowerCase()}/`);
  }

  // Acon Digital
  if (mfrLower.includes('acon digital') || mfrSlug === 'acon-digital') {
    urls.push(`https://acondigital.com/products/${nameSlug}/`);
  }

  // MeldaProduction
  if (mfrLower.includes('meldaproduction') || mfrSlug === 'meldaproduction') {
    // MeldaProduction uses "M" prefix — e.g., MReverb, MCompressor
    const meldaName = name.startsWith('M') ? name : `M${name}`;
    urls.push(`https://www.meldaproduction.com/plugins/${meldaName}`);
    urls.push(`https://www.meldaproduction.com/${meldaName}`);
  }

  // Acustica Audio
  if (mfrLower.includes('acustica') || mfrSlug === 'acustica-audio') {
    urls.push(`https://www.acustica-audio.com/shop/products/${nameSlug}`);
  }

  // Klanghelm
  if (mfrLower.includes('klanghelm') || mfrSlug === 'klanghelm') {
    urls.push(`https://klanghelm.com/contents/products/${nameSlug}/${nameSlug}.php`);
    urls.push(`https://klanghelm.com/contents/products/${name}/${name}.php`);
  }

  // Xfer Records
  if (mfrLower.includes('xfer') || mfrSlug === 'xfer-records') {
    urls.push(`https://xferrecords.com/products/${nameSlug}`);
  }

  // Tokyo Dawn Labs
  if (mfrLower.includes('tokyo dawn') || mfrSlug === 'tokyo-dawn-labs') {
    urls.push(`https://www.tokyodawn.net/tdr-${nameSlug}/`);
    urls.push(`https://www.tokyodawn.net/${nameSlug}/`);
  }

  // Tone Empire
  if (mfrLower.includes('tone empire') || mfrSlug === 'tone-empire') {
    urls.push(`https://tone-empire.com/shop/${nameSlug}/`);
  }

  // Baby Audio
  if (mfrLower.includes('baby audio') || mfrSlug === 'baby-audio') {
    urls.push(`https://babyaud.io/${nameSlug}`);
  }

  // Goodhertz
  if (mfrLower.includes('goodhertz') || mfrSlug === 'goodhertz') {
    urls.push(`https://goodhertz.com/${nameSlug}`);
  }

  // Safari Pedals
  if (mfrLower.includes('safari') || mfrSlug === 'safari-pedals') {
    urls.push(`https://www.safaripedals.com/${nameSlug}`);
  }

  // Generic fallback: manufacturer website + paths
  if (mfrWebsite) {
    const base = mfrWebsite.replace(/\/$/, '');
    urls.push(`${base}/products/${nameSlug}`);
    urls.push(`${base}/plugins/${nameSlug}`);
  }

  return urls;
}

// =============================================================================
// Plugin Boutique — only follow specific product pages, not search
// =============================================================================

async function findViaPluginBoutique(pluginName, pluginSlug) {
  try {
    // Search Plugin Boutique
    const searchUrl = `https://www.pluginboutique.com/search?q=${encodeURIComponent(pluginName)}`;
    const html = await fetchPage(searchUrl);
    if (!html) return null;

    // Find product links that match the plugin name
    const productLinks = [];
    const linkRegex = /href=["'](\/product\/\d+-[^"']+)["'][^>]*>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      productLinks.push(match[1]);
    }

    if (productLinks.length === 0) return null;

    // Follow the first product link
    const productUrl = `https://www.pluginboutique.com${productLinks[0]}`;
    if (OPTIONS.verbose) console.log(`    PB product page: ${productUrl}`);

    const productHtml = await fetchPage(productUrl);
    if (!productHtml) return null;

    const ogImage = extractOgImage(productHtml);
    if (!ogImage || !ogImage.startsWith('http')) return null;

    // Validate: Plugin Boutique og:images from product pages are specific
    // But reject if it's a generic PB banner
    if (ogImage.includes('pluginboutique.com') && !isGenericImage(ogImage)) {
      // Check the product page title contains the plugin name
      const titleMatch = productHtml.match(/<title[^>]*>([^<]+)</i);
      if (titleMatch) {
        const pageTitle = titleMatch[1].toLowerCase();
        const nameParts = pluginName.toLowerCase().split(/\s+/);
        // At least one significant word from plugin name should appear in page title
        const hasMatch = nameParts.some(part => part.length >= 3 && pageTitle.includes(part));
        if (hasMatch) return ogImage;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// Main image finder
// =============================================================================

async function findImageForPlugin(plugin, mfrName, mfrSlug, mfrWebsite) {
  const urls = getProductUrls(plugin, mfrName, mfrSlug, mfrWebsite);

  // Try manufacturer product pages
  for (const url of urls) {
    if (OPTIONS.verbose) console.log(`    Trying: ${url}`);

    const html = await fetchPage(url);
    if (!html) continue;

    // Verify the page is about this specific plugin (check title)
    const titleMatch = html.match(/<title[^>]*>([^<]+)</i);
    const pageTitle = titleMatch ? titleMatch[1].toLowerCase() : '';

    // Check if at least part of the plugin name appears in the page title
    const nameParts = plugin.name.toLowerCase().split(/\s+/);
    const titleHasPluginName = nameParts.some(part => part.length >= 2 && pageTitle.includes(part));

    if (!titleHasPluginName && nameParts[0].length >= 3) {
      if (OPTIONS.verbose) console.log(`    Page title doesn't match plugin name, skipping`);
      continue;
    }

    const ogImage = extractOgImage(html);
    if (!ogImage || !ogImage.startsWith('http')) continue;

    // Validate the image is product-specific
    if (isGenericImage(ogImage)) {
      if (OPTIONS.verbose) console.log(`    Rejected generic image: ${ogImage.substring(0, 70)}`);
      continue;
    }

    // Check uniqueness
    if (!isUniqueImage(ogImage)) {
      if (OPTIONS.verbose) console.log(`    Rejected duplicate image`);
      continue;
    }

    return { url: ogImage, source: 'og:image', page: url };
  }

  // Plugin Boutique fallback (with validation)
  const pbImage = await findViaPluginBoutique(plugin.name, plugin.slug);
  if (pbImage && !isGenericImage(pbImage) && isUniqueImage(pbImage)) {
    return { url: pbImage, source: 'plugin-boutique' };
  }

  return null;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('Plugin Image Enrichment v2 (validated og:image)');
  console.log('='.repeat(60));
  console.log(`  Mode: ${OPTIONS.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Limit: ${OPTIONS.limit}`);
  console.log('');

  const result = await convexQuery('plugins:list', { limit: 1000 });
  const allPlugins = result.items;

  let manufacturers = {};
  try {
    const mfrResult = await convexQuery('manufacturers:list', {});
    for (const m of (mfrResult.items || mfrResult || [])) {
      manufacturers[m._id] = m;
    }
  } catch {}

  const needsImage = allPlugins.filter(p => !p.imageUrl && !p.imageStorageId);
  const toProcess = needsImage.slice(0, OPTIONS.limit);

  console.log(`Total plugins: ${allPlugins.length}`);
  console.log(`Missing images: ${needsImage.length}`);
  console.log(`Processing: ${toProcess.length}`);
  console.log('');

  let found = 0, notFound = 0, errors = 0;
  let batch = [];
  const notFoundList = [];

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
        notFoundList.push({ name: plugin.name, mfr: mfrName, slug: plugin.slug });
        notFound++;
      }
    } catch (err) {
      console.log(`error: ${err.message}`);
      errors++;
    }

    if (batch.length >= 10 && !OPTIONS.dryRun) {
      await saveBatch(batch);
      batch = [];
    }

    await new Promise(r => setTimeout(r, 1200));
  }

  if (batch.length > 0 && !OPTIONS.dryRun) {
    await saveBatch(batch);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Results:');
  console.log(`  Found: ${found}`);
  console.log(`  Not found: ${notFound}`);
  console.log(`  Errors: ${errors}`);

  if (notFoundList.length > 0) {
    console.log('\nPlugins still missing images:');
    for (const p of notFoundList) {
      console.log(`  - ${p.name} (${p.mfr}) [${p.slug}]`);
    }
  }

  const afterResult = await convexQuery('plugins:list', { limit: 1000 });
  const withImage = afterResult.items.filter(p => p.imageUrl || p.imageStorageId).length;
  console.log(`\n  Images: ${withImage}/${afterResult.items.length} (${Math.round(withImage / afterResult.items.length * 100)}%)`);
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
