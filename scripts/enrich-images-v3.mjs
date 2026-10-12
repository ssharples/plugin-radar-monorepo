/**
 * Image Enrichment v3 — Manufacturer-specific URL patterns + validation
 *
 * Strategy per manufacturer:
 * - NI: Predictable packshot URL pattern
 * - Eventide: CDN with PLTM-{Name}.png
 * - MeldaProduction: Screenshot URL pattern
 * - Soundtoys: WordPress product pages
 * - Softube/Sonnox/etc: Individual page fetches
 * - iZotope/SSL/Acustica/Antares: Hardcoded from research
 */

const CONVEX_URL = "https://next-frog-231.convex.cloud";
const API_KEY = "pluginradar-enrich-2026";
const DRY_RUN = !process.argv.includes("--confirm");

async function query(name, args = {}) {
  const res = await fetch(CONVEX_URL + "/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: name, args })
  });
  return (await res.json()).value;
}

async function mutate(name, args) {
  const res = await fetch(CONVEX_URL + "/api/mutation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: name, args })
  });
  return (await res.json()).value;
}

async function validateImageUrl(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" }
    });
    if (res.status !== 200) return false;
    const ct = res.headers.get("content-type") || "";
    return ct.startsWith("image/");
  } catch { return false; }
}

async function fetchOgImage(url) {
  try {
    const res = await fetch(url, { redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" }
    });
    if (res.status !== 200) return null;
    const html = await res.text();
    const m = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (m) {
      let imgUrl = m[1];
      if (imgUrl.startsWith("/")) {
        const base = new URL(url);
        imgUrl = `${base.protocol}//${base.host}${imgUrl}`;
      }
      return imgUrl;
    }
    return null;
  } catch { return null; }
}

async function fetchFirstProductImage(url) {
  try {
    const res = await fetch(url, { redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" }
    });
    if (res.status !== 200) return null;
    const html = await res.text();

    // Try og:image first
    const og = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (og) {
      let imgUrl = og[1];
      if (imgUrl.startsWith("/")) {
        const base = new URL(url);
        imgUrl = `${base.protocol}//${base.host}${imgUrl}`;
      }
      // Skip generic/social images
      const lower = imgUrl.toLowerCase();
      if (!lower.includes("logo") && !lower.includes("social") && !lower.includes("favicon")) {
        return imgUrl;
      }
    }

    // Try schema.org image
    const schema = html.match(/"image"\s*:\s*"([^"]+\.(png|jpg|jpeg|webp)[^"]*)"/i);
    if (schema) {
      let imgUrl = schema[1];
      if (imgUrl.startsWith("/")) {
        const base = new URL(url);
        imgUrl = `${base.protocol}//${base.host}${imgUrl}`;
      }
      return imgUrl;
    }

    return null;
  } catch { return null; }
}

// ====== MANUFACTURER-SPECIFIC IMAGE RESOLVERS ======

// Native Instruments: Predictable packshot URLs
async function resolveNI(slug, name) {
  const niSlug = slug.replace("native-instruments-", "");
  const url = `https://www.native-instruments.com/fileadmin/ni_media/productfinder/packshots2016facelift/${niSlug}.png`;
  if (await validateImageUrl(url)) return url;

  // Try alternate slugs
  const alt = niSlug.replace(/-/g, "");
  const altUrl = `https://www.native-instruments.com/fileadmin/ni_media/productfinder/packshots2016facelift/${alt}.png`;
  if (await validateImageUrl(altUrl)) return altUrl;

  return null;
}

// Eventide: CDN with PLTM-{Name}.png
const eventideNameMap = {
  "crushstation": "CrushStation",
  "shimmerverb": "ShimmerVerb",
  "rotary-mod": "RotaryMod",
  "ultratap": "UltraTap",
  "ultrachannel": "UltraChannel",
  "omnipressor": "Omnipressor",
  "equivocate": "EQuivocate",
  "spliteq": "SplitEQ",
  "physion-mk-ii": "PhysionMkII",
  "physion": "Physion",
  "octavox": "Octavox",
  "quadravox": "Quadravox",
  "h3000-band-delays": "H3000-BandDelays",
  "h3000-factory": "H3000-Factory",
  "h949-harmonizer": "H949",
  "h910-harmonizer": "H910",
  "micropitch": "MicroPitch",
  "tricerachorus": "TriceraChorus",
};

async function resolveEventide(slug, name) {
  // Try the name map first
  const mapped = eventideNameMap[slug];
  if (mapped) {
    const url = `https://cdn.eventideaudio.com/uploads/2023/08/PLTM-${mapped}.png`;
    if (await validateImageUrl(url)) return url;
  }

  // Try direct name (CamelCase from original)
  const camelName = name.replace(/[^a-zA-Z0-9]/g, "");
  const url2 = `https://cdn.eventideaudio.com/uploads/2023/08/PLTM-${camelName}.png`;
  if (await validateImageUrl(url2)) return url2;

  // Try fetching product page
  const pageSlug = slug.toLowerCase();
  const pageUrl = `https://www.eventideaudio.com/plug-ins/${pageSlug}/`;
  return await fetchFirstProductImage(pageUrl);
}

// MeldaProduction: Screenshot URL pattern
// Melda plugins are named M{Category} — map from our short names to full names
const meldaNameMap = {
  "meldaproduction-time": "MTimeStretch",
  "meldaproduction-stereo": "MStereoExpander",
  "meldaproduction-saturation": "MSaturator",
  "meldaproduction-reverb": "MReverb",
  "meldaproduction-modulation": "MFlanger",
  "meldaproduction-meter": "MMultiAnalyzer",
  "meldaproduction-master": "MLoudnessAnalyzer",
  "meldaproduction-lo": "MBassador",
  "meldaproduction-filter": "MFilter",
  "meldaproduction-eq": "MEqualizer",
  "meldaproduction-dynamics": "MDynamics",
  "meldaproduction-distort": "MDistortionMB",
  "meldaproduction-creative": "MTurboReverb",
  "meldaproduction-analysis": "MAnalyzer",
};

async function resolveMelda(slug, name) {
  // Try mapped name
  const mName = meldaNameMap[slug];
  if (mName) {
    const url = `https://www.meldaproduction.com/webtemp/imagecache/screenshots/${mName}00.v1.jpg`;
    if (await validateImageUrl(url)) return url;
  }

  // Try M + capitalized name
  const mPlugin = "M" + name.charAt(0).toUpperCase() + name.slice(1);
  const url2 = `https://www.meldaproduction.com/webtemp/imagecache/screenshots/${mPlugin}00.v1.jpg`;
  if (await validateImageUrl(url2)) return url2;

  // Try fetching the product page
  if (mName) {
    const pageImg = await fetchFirstProductImage(`https://www.meldaproduction.com/${mName}`);
    if (pageImg) return pageImg;
  }

  return null;
}

// Soundtoys: WordPress product pages
async function resolveSoundtoys(slug, name) {
  const stSlug = slug.replace("soundtoys-", "");
  const pageUrl = `https://www.soundtoys.com/product/${stSlug}/`;
  const img = await fetchFirstProductImage(pageUrl);
  if (img && !img.toLowerCase().includes("logo")) return img;
  return null;
}

// Softube: CDN-hosted product images
const softubeSlugMap = {
  "doepfer-a-101-2-vactrol-lpg": "doepfer-a-101-2-vactrol-lpg",
  "saturation-knob": "saturation-knob",
  "harmonics": "harmonics",
  "tape": "tape",
  "oto-biscuit-8-bit-effects": "oto-biscuit-8-bit-effects",
  "spring-reverb": "spring-reverb",
  "tsar-1r-reverb": "tsar-1r-reverb",
  "tsar-1-reverb": "tsar-1-reverb",
  "solid-state-logic-sl-4000-e": "solid-state-logic-sl-4000-e",
  "british-class-a": "british-class-a",
  "american-class-a": "american-class-a",
  "trident-a-range": "trident-a-range",
};

async function resolveSoftube(slug, name) {
  const stSlug = softubeSlugMap[slug] || slug;
  const pageUrl = `https://www.softube.com/${stSlug}`;
  const img = await fetchFirstProductImage(pageUrl);
  if (img) return img;
  return null;
}

// Sonnox: BigCommerce store
const sonnoxSlugMap = {
  "oxford-supresser-ds": "oxford-supresser-ds",
  "oxford-fraunhofer-pro-codec": "oxford-fraunhofer-pro-codec",
  "oxford-transmod": "oxford-transmod",
  "oxford-supresser": "oxford-supresser",
  "listenhub": "listenhub",
  "oxford-dynamic-eq": "oxford-dynamic-eq",
  "oxford-dynamics": "oxford-dynamics",
  "oxford-eq": "oxford-eq",
  "voxdoubler": "voxdoubler",
  "oxford-reverb": "oxford-reverb",
  "oxford-envolution": "oxford-envolution",
};

async function resolveSonnox(slug, name) {
  const pageUrl = `https://www.sonnox.com/plugin/${slug}`;
  const img = await fetchFirstProductImage(pageUrl);
  if (img) return img;
  return null;
}

// Antares: Use product page URLs
const antaresSlugMap = {
  "vocal-reverb": "vocal-reverb",
  "vocal-compressor": "vocal-compressor",
  "vocal-eq": "vocal-eq",
  "vocal-prep": "vocal-prep",
  "mic-mod": "mic-mod",
  "vocodist": "vocodist",
  "harmony-engine": "harmony-engine",
  "auto-tune-efx-plus": "auto-tune-efx-plus",
  "autokey": "autokey",
  "auto-tune-hybrid": "auto-tune-hybrid",
  "auto-tune-2026": "auto-tune-pro",
  "auto-tune-pro-11": "auto-tune-pro",
};

async function resolveAntares(slug, name) {
  const aSlug = antaresSlugMap[slug] || slug;
  const pageUrl = `https://www.antarestech.com/product/${aSlug}`;
  const img = await fetchFirstProductImage(pageUrl);
  if (img) return img;
  return null;
}

// Slate Digital: WordPress site
const slateSlugMap = {
  "lustrous-plates": "lustrous-plates",
  "metatune": "metatune",
  "custom-series-eq": "custom-series-eq",
  "eiosis-aireq": "eiosis-air-eq",
  "fg-76": "fg-76",
  "fg-n": "fg-n",
  "fg-401": "fg-401",
  "fg-mu": "fg-mu",
  "fg-116-blue-series": "fg-116",
  "fg-x-mastering-processor": "fg-x",
  "sd-pe1": "sd-pe1",
  "submerge": "submerge",
  "infinity-eq-2": "infinity-eq",
  "stellar-echo-sd-201": "stellar-echo-sd-201",
  "vmr-3-0": "virtual-mix-rack",
  "virtual-microphone-system": "virtual-microphone-system",
  "sd-3a-compressor": "sd-3a",
  "ml-1-vintage-reverb": "ml-1",
  "e2deesser": "eiosis-e2deesser",
  "aireq": "eiosis-air-eq",
};

async function resolveSlate(slug, name) {
  const sdSlug = slateSlugMap[slug] || slug;
  const pageUrl = `https://www.slatedigital.com/${sdSlug}/`;
  const img = await fetchFirstProductImage(pageUrl);
  if (img && !img.includes("slate-digital-logo")) return img;
  return null;
}

// SSL: Hardcoded known URLs (from SSL store research)
async function resolveSSL(slug, name) {
  // Map to SSL store page slugs
  const sslSlugMap = {
    "ssl-deess": "de-ess",
    "ssl-x-echo": "x-echo",
    "ssl-fusion-violet-eq": "fusion-violet-eq",
    "ssl-fusion-hf-compressor": "fusion-hf-compressor",
    "ssl-4k-b-channel-strip": "4k-b-channel-strip",
    "ssl-4k-g-channel-strip": "4k-g-channel-strip",
    "ssl-bus-compressor-2": "bus-compressor-2",
    "ssl-x-delay": "x-delay",
    "ssl-autoeq": "autoeq",
    "ssl-native-flexverb": "flexverb",
    "ssl-4k-e-channel-strip": "4k-e-channel-strip",
    "ssl-native-channel-strip-2": "channel-strip-2",
    "ssl-native-bus-compressor-2": "bus-compressor-2",
    "ssl-native-x-saturator": "x-saturator",
  };

  const storeSlug = sslSlugMap[slug];
  if (storeSlug) {
    const pageUrl = `https://store.solidstatelogic.com/plug-ins/${storeSlug}`;
    const img = await fetchOgImage(pageUrl);
    if (img) return img;
  }

  // Try the SSL main site
  const mainSlug = slug.replace("ssl-", "").replace("ssl-native-", "");
  const mainUrl = `https://www.solidstatelogic.com/products/${mainSlug}`;
  const mainImg = await fetchFirstProductImage(mainUrl);
  if (mainImg) return mainImg;

  return null;
}

// iZotope: SPA site — need hardcoded CDN URLs or NI image patterns
// Since iZotope was acquired by NI, some products may be on NI's CDN
async function resolveIzotope(slug, name) {
  // Try fetching the iZotope product page (might have og:image now)
  const izoSlug = slug.replace("izotope-", "");
  const possibleUrls = [
    `https://www.izotope.com/en/products/${izoSlug}.html`,
    `https://www.izotope.com/en/products/${izoSlug}`,
  ];

  for (const url of possibleUrls) {
    const img = await fetchFirstProductImage(url);
    if (img) return img;
  }

  return null;
}

// Acustica Audio: SPA site
async function resolveAcustica(slug, name) {
  const aaSlug = slug.replace("acustica-audio-", "").toUpperCase();
  const pageUrl = `https://www.acustica-audio.com/shop/products/${aaSlug}`;
  const img = await fetchFirstProductImage(pageUrl);
  if (img) return img;
  return null;
}

// Output: iZotope 5 → not found via patterns
// Xfer: Individual product pages
async function resolveXfer(slug, name) {
  const xSlug = slug.replace("xfer-", "");
  const pageUrl = `https://xferrecords.com/products/${xSlug}`;
  const img = await fetchFirstProductImage(pageUrl);
  if (img) return img;
  return null;
}

// Output (Cableguys): Portal, Thermal, Movement
async function resolveOutput(slug, name) {
  // These are Output plugins (Movement, Portal, Thermal) or Cableguys
  const pageUrl = `https://output.com/products/${slug}`;
  const img = await fetchFirstProductImage(pageUrl);
  if (img) return img;
  return null;
}

// Generic: Try product page fetch
async function resolveGeneric(slug, name) {
  return null;
}

// ====== MANUFACTURER ID → RESOLVER MAPPING ======
const MANUFACTURER_RESOLVERS = {
  "jh73k2x87b0taapbaw75z5cv2x80ghqd": { name: "Native Instruments", resolver: resolveNI },
  "jh74fshw5e8qmbd305sh97rye980gr5m": { name: "Eventide", resolver: resolveEventide },
  "jh74m8xhpxeza3ad3a4fg11mt580mr5f": { name: "MeldaProduction", resolver: resolveMelda },
  "jh7cw7cmphx1a6zhbxhkp3c4sn80grzt": { name: "Soundtoys", resolver: resolveSoundtoys },
  "jh79nc638jsqcs011tw2p2yk8n80gbbz": { name: "Softube", resolver: resolveSoftube },
  "jh73r34q9yvxz88jqyzhf8wnzd80gy9v": { name: "Sonnox", resolver: resolveSonnox },
  "jh7bnnx5yy172t3p1dvj7rkfx580g5vx": { name: "Antares", resolver: resolveAntares },
  "jh72b567razrxzna9nqkrrcyb180hg18": { name: "Slate Digital", resolver: resolveSlate },
  "jh77ferhakcdmtaa06y4bqp99980ga99": { name: "SSL", resolver: resolveSSL },
  "jh7301k1fe2njtpz06x7bfc01580hteq": { name: "iZotope", resolver: resolveIzotope },
  "jh79s7yaek53jh946r3b5wh9nx80npck": { name: "Acustica Audio", resolver: resolveAcustica },
  "jh75ereykg5rvdvg99z4wf8k2h80h9b5": { name: "Xfer Records", resolver: resolveXfer },
  "jh776t9hxsaks9nvq3sfrmwxz980hdsz": { name: "Output", resolver: resolveOutput },
};

// ====== GLOBAL BLACKLIST — reject known generic/placeholder images ======
const IMAGE_BLACKLIST = [
  "PREVIEW-IMAGE",           // Soundtoys generic
  "AutoTune-Meta-Tag",       // Antares generic company meta tag
  "AutoTune-SEO-Tag",        // Antares SEO tag
  "social-logo",             // Company social logo
  "social-share",            // Social share placeholder
  "slate-digital-logo",      // Slate Digital logo
  "menu-bg",                 // Background image
  "logos-2",                 // Logo collection
];

// ====== MAIN ======
const result = await query("plugins:list", { limit: 1000 });
const all = result.items;
const noImage = all.filter(p => !p.imageUrl);

console.log(`Found ${noImage.length} plugins without images\n`);

const imageMap = [];
const failures = [];
const seenUrls = new Map(); // Track seen URLs to detect duplicates
let processed = 0;

for (const plugin of noImage) {
  processed++;
  const mfr = MANUFACTURER_RESOLVERS[plugin.manufacturer];
  const mfrName = mfr ? mfr.name : "Unknown";

  process.stdout.write(`[${processed}/${noImage.length}] ${plugin.slug} (${mfrName})... `);

  let imageUrl = null;

  if (mfr) {
    imageUrl = await mfr.resolver(plugin.slug, plugin.name);
  }

  if (imageUrl) {
    // Check against blacklist
    const isBlacklisted = IMAGE_BLACKLIST.some(pat => imageUrl.includes(pat));
    if (isBlacklisted) {
      failures.push({ slug: plugin.slug, name: plugin.name, reason: `Blacklisted: ${imageUrl.substring(0, 60)}` });
      console.log(`✗ Blacklisted generic image`);
      await new Promise(r => setTimeout(r, 300));
      continue;
    }

    // Check for duplicates (same URL used by another plugin)
    if (seenUrls.has(imageUrl)) {
      failures.push({ slug: plugin.slug, name: plugin.name, reason: `Duplicate of ${seenUrls.get(imageUrl)}` });
      console.log(`✗ Duplicate of ${seenUrls.get(imageUrl)}`);
      await new Promise(r => setTimeout(r, 300));
      continue;
    }

    // Validate the URL is a real image
    const valid = await validateImageUrl(imageUrl);
    if (valid) {
      seenUrls.set(imageUrl, plugin.slug);
      imageMap.push({ slug: plugin.slug, imageUrl });
      console.log(`✓ ${imageUrl.substring(0, 80)}`);
    } else {
      failures.push({ slug: plugin.slug, name: plugin.name, reason: `Invalid: ${imageUrl.substring(0, 60)}` });
      console.log(`✗ Invalid image: ${imageUrl.substring(0, 60)}`);
    }
  } else {
    failures.push({ slug: plugin.slug, name: plugin.name, reason: "No image found" });
    console.log(`✗ No image found`);
  }

  // Rate limit between requests
  await new Promise(r => setTimeout(r, 300));
}

console.log(`\n\n=== RESULTS ===`);
console.log(`Found: ${imageMap.length}/${noImage.length}`);
console.log(`Failed: ${failures.length}/${noImage.length}`);

if (failures.length > 0) {
  console.log(`\nFailed plugins:`);
  for (const f of failures) {
    console.log(`  ${f.slug}: ${f.reason}`);
  }
}

if (DRY_RUN) {
  console.log(`\n[DRY RUN] Would update ${imageMap.length} plugins. Run with --confirm to apply.`);
  if (imageMap.length > 0) {
    console.log("\nSample updates:");
    for (const m of imageMap.slice(0, 10)) {
      console.log(`  ${m.slug} → ${m.imageUrl.substring(0, 80)}`);
    }
  }
} else {
  console.log(`\nApplying ${imageMap.length} image updates...`);
  for (let i = 0; i < imageMap.length; i += 25) {
    const batch = imageMap.slice(i, i + 25);
    const result = await mutate("enrichment:batchUpdatePluginImages", {
      apiKey: API_KEY,
      plugins: batch,
    });
    console.log(`  Batch ${Math.floor(i/25)+1}: updated ${result.updated}/${batch.length}`);
  }
  console.log("Done!");
}
