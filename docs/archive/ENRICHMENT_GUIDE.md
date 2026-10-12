# Plugin Database Enrichment Guide

This guide explains how to enrich your Convex plugin database using web search automation.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Available Scripts](#available-scripts)
4. [Quick Start](#quick-start)
5. [Advanced Usage](#advanced-usage)
6. [Enrichment Fields](#enrichment-fields)
7. [Monitoring Progress](#monitoring-progress)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The enrichment pipeline automatically populates missing plugin metadata by:
1. Querying unenriched plugins from Convex
2. Searching the web for plugin information
3. Extracting structured data using pattern matching
4. Batch updating plugins in Convex

**What gets enriched:**
- Effect taxonomy (effectType, circuitEmulation, tonalCharacter)
- Usage context (worksWellOn, useCases, genreSuitability)
- Sonic profile (sonicCharacter, comparableTo)
- User experience (skillLevel, learningCurve, cpuUsage)
- Technical details (licenseType, keyFeatures, isIndustryStandard)

---

## Prerequisites

### 1. Exa API Key

Get your API key from [exa.ai](https://exa.ai) and set it up:

```bash
# Option A: Environment variable
export EXA_API_KEY="your-api-key-here"

# Option B: Credentials file
mkdir -p ~/.credentials/exa
echo '{"apiKey": "your-api-key-here"}' > ~/.credentials/exa/credentials.json
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Convex Deployment

Ensure your Convex backend is deployed:

```bash
pnpm deploy
```

---

## Available Scripts

### 1. **batch-web-enrich-exa.mjs** (Recommended)

Production-ready script that uses Exa API for high-quality web search.

**Features:**
- Real web search with content extraction
- Pattern-based enrichment extraction
- Batch processing with rate limiting
- Progress tracking and stats
- Dry-run mode for testing

**Basic usage:**
```bash
node scripts/batch-web-enrich-exa.mjs
```

**Options:**
```bash
--limit N          # Process N plugins (default: 20)
--batch-size N     # Convex update batch size (default: 5)
--delay N          # Delay between plugins in ms (default: 3000)
--dry-run          # Preview without saving
--category CAT     # Only enrich specific category
--verbose          # Show detailed logs
```

**Examples:**
```bash
# Process 10 compressors
node scripts/batch-web-enrich-exa.mjs --limit 10 --category compressor

# Dry run to see what would be enriched
node scripts/batch-web-enrich-exa.mjs --limit 5 --dry-run --verbose

# Process 50 plugins with faster batching
node scripts/batch-web-enrich-exa.mjs --limit 50 --batch-size 10 --delay 2000
```

### 2. **batch-web-enrich.mjs**

Simpler version with pattern-based extraction only (no API calls).

**Usage:**
```bash
node scripts/batch-web-enrich.mjs --limit 20 --dry-run
```

### 3. **exa-enrich.mjs**

Legacy single-plugin enrichment script.

---

## Quick Start

### Step 1: Check Current Status

```bash
# View enrichment stats in Convex dashboard
# Or run:
node -e "import('./scripts/batch-web-enrich-exa.mjs').then(m => m.default())" --limit 0
```

### Step 2: Test with Dry Run

```bash
# Test on 5 plugins without saving
node scripts/batch-web-enrich-exa.mjs --limit 5 --dry-run --verbose
```

### Step 3: Run Small Batch

```bash
# Process 10 plugins
node scripts/batch-web-enrich-exa.mjs --limit 10
```

### Step 4: Monitor Results

Check Convex dashboard or query:

```javascript
// In Convex dashboard Console
await ctx.query(api.enrichment.getEnrichmentStats, {})
```

### Step 5: Scale Up

```bash
# Process category by category
node scripts/batch-web-enrich-exa.mjs --category eq --limit 50
node scripts/batch-web-enrich-exa.mjs --category compressor --limit 50
node scripts/batch-web-enrich-exa.mjs --category reverb --limit 50

# Or process all unenriched
node scripts/batch-web-enrich-exa.mjs --limit 200
```

---

## Advanced Usage

### Enriching Specific Categories

Process all plugins in a category:

```bash
# All EQs
node scripts/batch-web-enrich-exa.mjs --category eq --limit 100

# All compressors
node scripts/batch-web-enrich-exa.mjs --category compressor --limit 100

# All reverbs
node scripts/batch-web-enrich-exa.mjs --category reverb --limit 50
```

### Rate Limiting Configuration

Adjust delays to respect API limits:

```bash
# Conservative (safe for Exa free tier)
node scripts/batch-web-enrich-exa.mjs --limit 20 --delay 5000

# Moderate (paid tier)
node scripts/batch-web-enrich-exa.mjs --limit 50 --delay 2000

# Aggressive (paid tier + high quota)
node scripts/batch-web-enrich-exa.mjs --limit 100 --delay 1000 --batch-size 10
```

### Batch Size Optimization

Larger batches = fewer Convex mutations:

```bash
# Small batches (safer, more frequent saves)
node scripts/batch-web-enrich-exa.mjs --batch-size 5

# Large batches (faster, less overhead)
node scripts/batch-web-enrich-exa.mjs --batch-size 20
```

### Continuous Enrichment Pipeline

Set up a daily cron job:

```bash
# Add to crontab -e
0 2 * * * cd /path/to/repo && node scripts/batch-web-enrich-exa.mjs --limit 50 >> logs/enrichment.log 2>&1
```

---

## Enrichment Fields

### Effect Taxonomy

**effectType** (string)
- Purpose: Granular subtype of the effect
- Examples: "Parametric", "VCA", "Algorithmic", "Tape"
- Categories have specific subtypes:
  - EQ: Parametric, Graphic, Dynamic, Linear Phase
  - Compressor: VCA, FET, Opto, Variable-Mu
  - Reverb: Algorithmic, Convolution, Plate, Spring
  - Delay: Tape, Analog, Digital, Ping-Pong
  - Saturation: Tube, Tape, Transformer, Harmonic

**circuitEmulation** (string)
- Purpose: Specific hardware circuit being emulated
- Examples: "Neve 1073", "SSL G-Bus", "LA-2A", "1176"
- Only populated if plugin emulates specific hardware

**tonalCharacter** (string[])
- Purpose: Tonal descriptors
- Values: warm, transparent, aggressive, smooth, colored, clean, punchy, vintage, modern, crisp
- Max 4 values

### Usage Context

**worksWellOn** (string[])
- Purpose: Sources/instruments the plugin works well on
- Values: vocals, drums, bass, guitars, keys, synths, mix-bus, master, dialogue
- Extracted from reviews and documentation

**useCases** (string[])
- Purpose: Ideal use cases
- Values: mixing, mastering, sound-design, post-production, recording, beat-making, podcast
- Multiple values possible

**genreSuitability** (string[])
- Purpose: Genres the plugin is suited for
- Values: electronic, hip-hop, rock, pop, classical, jazz, cinematic, ambient, metal, edm
- Optional field

### Sonic Profile

**sonicCharacter** (string[])
- Purpose: Sonic characteristics
- Values: transparent, warm, colored, surgical, creative, punchy
- Max 3 values

**comparableTo** (string[])
- Purpose: Comparable plugins or hardware
- Examples: ["SSL-style", "Neve-style", "1176-style"]
- Optional field

### User Experience

**skillLevel** (string)
- Purpose: Skill level required to use effectively
- Values: "beginner" | "intermediate" | "advanced" | "professional"
- Default: "intermediate"

**learningCurve** (string)
- Purpose: How difficult it is to learn
- Values: "easy" | "moderate" | "steep"
- Optional field

**cpuUsage** (string)
- Purpose: CPU resource usage
- Values: "light" | "moderate" | "heavy" | "very-heavy"
- Default: "moderate"

### Technical/Business

**licenseType** (string)
- Purpose: Licensing model
- Values: "perpetual" | "subscription" | "rent-to-own" | "free" | "freemium"
- Extracted from pricing pages

**keyFeatures** (string[])
- Purpose: Notable features
- Values: sidechain, multiband, mid-side, linear-phase, analog-modeling, oversampling, zero-latency
- Max 5 values

**isIndustryStandard** (boolean)
- Purpose: Whether considered an industry standard
- True if mentioned as ubiquitous/standard in the industry
- Optional field

---

## Monitoring Progress

### View Stats in Convex Dashboard

1. Open Convex dashboard: https://dashboard.convex.dev
2. Navigate to your deployment
3. Go to Functions → Queries
4. Run `enrichment:getEnrichmentStats`

### Query Progress Programmatically

```javascript
import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api.js';

const convex = new ConvexHttpClient('https://next-frog-231.convex.cloud');

const stats = await convex.query(api.enrichment.getEnrichmentStats, {});

console.log(`Fully enriched: ${stats.fullyEnriched}/${stats.total} (${stats.percentages.fullyEnriched}%)`);
console.log(`Effect types: ${stats.percentages.effectType}%`);
console.log(`Skill levels: ${stats.percentages.skillLevel}%`);
```

### Get Unenriched Plugin List

```javascript
const unenriched = await convex.query(api.enrichment.getUnenriched, {
  limit: 10
});

console.log(`${unenriched.length} plugins need enrichment`);
unenriched.forEach(p => {
  console.log(`- ${p.name} (${p.category})`);
});
```

---

## Troubleshooting

### Issue: "EXA_API_KEY not found"

**Solution:**
```bash
# Set environment variable
export EXA_API_KEY="your-key"

# Or create credentials file
mkdir -p ~/.credentials/exa
echo '{"apiKey": "your-key"}' > ~/.credentials/exa/credentials.json
```

### Issue: "No web results found"

**Possible causes:**
- Plugin name is too obscure
- Manufacturer name incorrect
- Exa API rate limits hit

**Solutions:**
```bash
# Increase delay between requests
node scripts/batch-web-enrich-exa.mjs --delay 5000

# Process fewer plugins per run
node scripts/batch-web-enrich-exa.mjs --limit 10

# Try verbose mode to see queries
node scripts/batch-web-enrich-exa.mjs --verbose
```

### Issue: Batch save failures

**Solution:**
```bash
# Reduce batch size
node scripts/batch-web-enrich-exa.mjs --batch-size 5

# Add more delay
node scripts/batch-web-enrich-exa.mjs --delay 4000
```

### Issue: Pattern matching not extracting data

**Solution:**
The pattern matching may need tuning for specific plugin types. Edit the regex patterns in `extractEnrichmentFromResults()` function in the script.

### Issue: Too many API calls

**Solution:**
```bash
# Use dry-run first
node scripts/batch-web-enrich-exa.mjs --dry-run --limit 5

# Process in smaller batches
node scripts/batch-web-enrich-exa.mjs --limit 10 --delay 5000
```

---

## Best Practices

### 1. Start Small
Always test with `--dry-run` and small `--limit` first.

### 2. Process by Category
Enrich category by category for better organization and easier monitoring.

### 3. Monitor Exa API Usage
Check your Exa dashboard to track API usage and costs.

### 4. Run During Off-Peak Hours
Schedule enrichment jobs during low-traffic periods.

### 5. Review Results
Spot-check enriched plugins in Convex dashboard to verify quality.

### 6. Iterate and Improve
If extraction quality is low, adjust the regex patterns in the script.

---

## Example Workflow

**Daily Enrichment Routine:**

```bash
# Monday: EQs and filters
node scripts/batch-web-enrich-exa.mjs --category eq --limit 50
node scripts/batch-web-enrich-exa.mjs --category filter --limit 30

# Tuesday: Dynamics
node scripts/batch-web-enrich-exa.mjs --category compressor --limit 50
node scripts/batch-web-enrich-exa.mjs --category limiter --limit 30

# Wednesday: Spatial effects
node scripts/batch-web-enrich-exa.mjs --category reverb --limit 40
node scripts/batch-web-enrich-exa.mjs --category delay --limit 40

# Thursday: Color and modulation
node scripts/batch-web-enrich-exa.mjs --category saturation --limit 40
node scripts/batch-web-enrich-exa.mjs --category modulation --limit 30

# Friday: Utilities and catch-up
node scripts/batch-web-enrich-exa.mjs --category utility --limit 50
node scripts/batch-web-enrich-exa.mjs --limit 20  # Any remaining
```

---

## Next Steps

1. **Set up Exa API key** (see Prerequisites)
2. **Run test enrichment** with `--dry-run`
3. **Process small batch** (10-20 plugins)
4. **Review results** in Convex dashboard
5. **Scale up** with category-based batches
6. **Monitor progress** with stats queries
7. **Schedule daily runs** via cron

For questions or issues, check the [Convex docs](https://docs.convex.dev) and [Exa docs](https://docs.exa.ai).
