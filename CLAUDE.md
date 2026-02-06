# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies (pnpm monorepo)
pnpm install

# Start Convex dev server (required for backend)
pnpm dev:convex

# Start web app (Next.js)
pnpm dev:web

# Start desktop UI (Vite + React)
pnpm dev:desktop-ui

# Deploy Convex functions to production
pnpm deploy

# Build web app for production
pnpm build:web

# Build desktop UI for embedding in JUCE
pnpm build:desktop-ui
```

## Architecture Overview

### Monorepo Structure
- **convex/** — Unified Convex backend deployed to `next-frog-231.convex.cloud`
- **apps/web/** — Next.js web app (pluginradar.com)
- **apps/desktop/** — JUCE C++ DAW plugin with embedded React/Vite WebView
- **packages/shared/** — Shared TypeScript types and constants
- **scripts/** — Scraping, enrichment, and data migration scripts

### Convex Backend (convex/)

Single deployment shared by web and desktop apps. Key function files:

| File | Purpose |
|------|---------|
| `schema.ts` | 30+ tables: plugins, manufacturers, stores, sales, users, sessions, pluginChains, scannedPlugins, enrichmentJobs |
| `plugins.ts` | Plugin CRUD, search indexes, browse with filters |
| `pluginDirectory.ts` | Desktop integration: `syncScannedPlugins`, chain management |
| `social.ts` | Comments, ratings (1-5), following, chain forking |
| `auth.ts` | PBKDF2 password hashing, 7-day session tokens |
| `agentEnrich.ts` | Claude Agent SDK mutations for enrichment |
| `enrichment.ts` | Batch enrichment pipeline |

**Auth Flow**: Desktop/web use opaque session tokens stored in localStorage. `auth:login` → sessionToken → `auth:verifySession`.

### Desktop JUCE Plugin (apps/desktop/)

C++ DAW plugin with embedded WebView for UI.

**Core C++ Components** (`src/`):
- `PluginProcessor.cpp` — Main plugin entry, stereo I/O, metering
- `core/ChainProcessor.cpp` (1764 lines) — Tree-based chain processing with serial/parallel groups
- `bridge/WebViewBridge.cpp` (1389 lines) — JS ↔ C++ bridge with 40+ native functions

**Chain Tree Architecture**:
```
ChainNode (base)
├── LeafNode — Single plugin instance
├── SerialGroupNode — Sequential processing
└── ParallelGroupNode — Parallel branches with gain/solo/mute
```

**WebView Bridge Pattern**:
```cpp
// C++ registers native functions
webView->registerNativeFunction("getPluginList", ...);

// JS calls via juceBridge
const plugins = await juceBridge.getPluginList();
```

**Desktop UI** (`ui/`): Vite + React + Zustand
- `api/convex-client.ts` — Full Convex integration (auth, sync, chains, social)
- `api/juce-bridge.ts` — TypeScript wrapper for native functions
- `stores/` — Zustand stores for plugins, chains, cloud sync

### Web App (apps/web/)

Next.js 14 with App Router. Key routes:

| Route | Purpose |
|-------|---------|
| `/` | Home with stats, trending, sales, free plugins |
| `/plugins`, `/plugins/[slug]` | Plugin browse and detail |
| `/manufacturers/[slug]` | Manufacturer profiles |
| `/sales`, `/free` | Deals and free plugins |
| `/chains`, `/chains/[slug]` | Plugin chain sharing |
| `/compare/[slug]` | Plugin comparisons |
| `/wishlist`, `/collection`, `/alerts` | User features |

### Enrichment Pipeline (scripts/)

Multiple enrichment approaches:
- `plugin-agent.mjs` — Claude Agent SDK with tools: `save_plugin_enrichment`, `save_plugin_comparison`, `search_plugins`
- `enrich-*.mjs` — Various enrichment scripts
- `scrapers/` — Store scrapers (Plugin Boutique, etc.)
- `youtube-*.mjs`, `tiktok-*.mjs` — Social video fetchers

## Key Patterns

### Plugin Matching (Desktop → Catalog)
`pluginDirectory.ts:syncScannedPlugins` uses Levenshtein similarity to match scanned plugins against the catalog, handling name variations.

### Chain Compatibility
When loading a cloud chain, `checkChainCompatibility` verifies which plugins the user owns locally.

### Preset Management
Chain slots include base64-encoded `presetData` with `presetSizeBytes` for plugin state.

### Latency Compensation
`ChainProcessor` calculates cumulative latency for tree branches and reports total to DAW.

## Testing

No formal test suite currently. For manual testing:
- Web: Run `pnpm dev:web` and test routes
- Desktop UI: Run `pnpm dev:desktop-ui` for hot-reload development
- JUCE: Build with CMake and test in DAW

## Important Conventions

- Desktop UI communicates with JUCE via `juceBridge` async calls
- All Convex mutations requiring auth use `sessionToken` parameter
- Plugin chains use slugs for public URLs, share codes for private sharing
- Effect categories defined in `packages/shared/src/categories.ts`
