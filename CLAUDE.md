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

# Deploy Convex functions
pnpm deploy

# Build web app for production
pnpm build:web

# Build desktop UI for embedding in JUCE
pnpm build:desktop-ui

# Build JUCE AU plugin (from apps/desktop/)
cd apps/desktop && cd build && cmake .. && cmake --build . --target PluginChainManager_AU

# Full rebuild: Desktop UI → zip → C++ AU
cd apps/desktop/ui && pnpm build && cd ../build && zip -r ../resources/ui.zip -j ../ui/dist/index.html && cmake .. && cmake --build . --target PluginChainManager_AU
```

Other JUCE targets: `PluginChainManager_VST3`, `PluginChainManager_Standalone`, `PluginScannerHelper`

## Monorepo Structure

```
plugin-radar-monorepo/
├── convex/                  # Unified Convex backend (single deployment)
│   ├── schema.ts            # 35+ tables
│   ├── lib/auth.ts          # getSessionUser() helper
│   ├── lib/rateLimit.ts     # Sliding-window rate limiter
│   ├── auth.ts              # PBKDF2 password auth, session tokens
│   ├── plugins.ts           # Plugin CRUD, search, browse
│   ├── pluginDirectory.ts   # Desktop integration: sync, chains, compatibility
│   ├── social.ts            # Comments, ratings, following, chain forking
│   ├── friends.ts           # Friend requests, accept/reject/block
│   ├── privateChains.ts     # Send chains to friends
│   ├── userProfiles.ts      # Username, contact info, profile management
│   ├── parameterTranslation.ts # JUCE 0-1 → physical parameter mapping
│   ├── agentEnrich.ts       # Claude Agent SDK enrichment mutations
│   └── ...                  # manufacturers, sales, mentions, videos, etc.
├── apps/
│   ├── web/                 # Next.js 16 web app (React 19, Tailwind 4)
│   │   ├── app/             # App Router: pages, layouts, routes
│   │   ├── components/      # UI components + social/ subdirectory
│   │   └── lib/             # Utilities
│   └── desktop/             # JUCE 8.0.4 C++ plugin
│       ├── src/             # C++ source
│       │   ├── core/        # ChainProcessor, ChainNode, PluginManager, PresetManager
│       │   ├── bridge/      # WebViewBridge (JS↔C++), ResourceProvider
│       │   ├── audio/       # DSP: DryWetMix, BranchGain, FFT, LatencyCompensation
│       │   ├── automation/  # ParameterProxyPool, ProxyParameter
│       │   └── scanner/     # Out-of-process plugin scanner
│       ├── ui/              # Vite + React 18 + Zustand (embedded WebView)
│       │   └── src/
│       │       ├── api/     # convex-client.ts, juce-bridge.ts, types.ts
│       │       ├── stores/  # chainStore, cloudChainStore, pluginStore, syncStore, etc.
│       │       └── components/  # ChainEditor, CloudSync, Friends, SpectrumAnalyzer, etc.
│       ├── CMakeLists.txt   # JUCE CMake build
│       └── resources/       # Embedded ui.zip (built from ui/dist)
├── packages/
│   └── shared/              # Shared types and constants
│       └── src/categories.ts  # EFFECT_CATEGORIES const + EffectCategory type
├── scripts/                 # Scraping, enrichment, data pipelines
│   ├── plugin-agent.mjs     # Claude Agent SDK enrichment agent
│   ├── scrapers/            # Store scrapers (Plugin Boutique, etc.)
│   ├── youtube-*.mjs        # YouTube mention scanners
│   ├── tiktok-fetcher.mjs   # TikTok video fetcher
│   └── ...                  # Import, migration, image upload scripts
├── data/                    # Static data, deal snapshots, comparisons
├── docs/                    # Documentation (newsletter subscriptions, etc.)
├── convex.json              # Convex deployment config
└── pnpm-workspace.yaml      # Workspace: apps/web, apps/desktop/ui, packages/*
```

## Convex Backend (`convex/`)

Single deployment at `next-frog-231.convex.cloud` shared by both apps.

### Auth Flow
Both apps use opaque session tokens (not JWT). `auth:login` → `sessionToken` → stored in localStorage as `pluginradar_session` → verified via `auth:verifySession`. Sessions expire after 7 days.

### Key Function Files

| File | Purpose |
|------|---------|
| `schema.ts` | 35+ tables: plugins, manufacturers, stores, sales, users, sessions, pluginChains, scannedPlugins, chainComments, chainRatings, userFollows, chainForks, friendships, sharedChains, userProfiles, rateLimits, parameterMaps, enrichmentJobs, etc. |
| `auth.ts` | PBKDF2 password hashing, register/login/logout, session management |
| `lib/auth.ts` | `getSessionUser(ctx, sessionToken)` — shared helper for authenticated mutations |
| `lib/rateLimit.ts` | `checkRateLimit(ctx, key, max, windowMs)` — sliding-window rate limiter |
| `plugins.ts` | Plugin CRUD, search indexes, browse with filters |
| `pluginDirectory.ts` | Desktop sync: `syncScannedPlugins`, chain CRUD, `browseChains` (with rating sort), `getChainsByUser`, `getUserStats` |
| `social.ts` | Comments (`addComment`/`getComments`/`deleteComment`), ratings (`rateChain`/`getChainRating` with upsert), following (`followUser`/`unfollowUser`/`isFollowing`/`getFollowers`/`getFollowing`), forking (`forkChain`) |
| `friends.ts` | Friend requests (`sendFriendRequest`/`acceptFriendRequest`/`removeFriend`/`blockUser`), friend list queries |
| `privateChains.ts` | Send chains to friends, lookup by username/email/phone/instagram |
| `userProfiles.ts` | Profile CRUD with unique usernames, contact info |
| `parameterTranslation.ts` | JUCE normalized 0-1 → physical parameter denormalization (log, exp, stepped curves) |
| `agentEnrich.ts` | Claude Agent SDK mutations for plugin enrichment |
| `mentions.ts` | YouTube/Reddit/TikTok mention tracking + trending scores |

### Desktop App Bridge Pattern

The desktop plugin uses `anyApi` from `convex/server` (not generated types) because its `ui/` workspace has a different `convex/` directory than the monorepo root. This allows calling deployed functions by name without type generation conflicts.

```typescript
// apps/desktop/ui/src/api/convex-client.ts
import { anyApi } from "convex/server";
const result = await convex.mutation(anyApi.social.rateChain, {
  sessionToken: token,
  chainId: chainId as any,
  rating: 5,
});
```

## Desktop JUCE Plugin (`apps/desktop/`)

JUCE 8.0.4 audio plugin host with embedded React UI via `WebBrowserComponent`.

### C++ Architecture (`src/`)

| File | Purpose |
|------|---------|
| `PluginProcessor.cpp` | Main plugin entry, stereo I/O, FFT, metering |
| `core/ChainProcessor.cpp` | Tree-based `AudioProcessorGraph` — serial/parallel groups, latency compensation |
| `core/ChainNode.h` | `ChainNode` with `std::variant<PluginLeaf, GroupData>` tree model |
| `core/PluginManager.cpp` | VST3/AU discovery with out-of-process scanner |
| `core/PresetManager.cpp` | Chain export/import with preset binary state |
| `bridge/WebViewBridge.cpp` | 40+ native functions registered via `webView->emplace()` |
| `bridge/ResourceProvider.cpp` | Serves embedded ui.zip to WebBrowserComponent |
| `audio/DryWetMixProcessor` | 4-in/2-out (ch0-1=dry, ch2-3=wet), SmoothedValue crossfade |
| `audio/BranchGainProcessor` | Stereo gain with SmoothedValue (Multiplicative) |
| `audio/FFTProcessor` | `juce::dsp::FFT` for real-time spectrum data → JS |
| `audio/LatencyCompensationProcessor` | `juce::dsp::DelayLine` for parallel branch alignment |
| `automation/ParameterProxyPool` | DAW parameter automation proxies |

### Chain Tree Data Model

```
Root (Serial Group, id=0)
├── PluginLeaf (single plugin instance)
├── SerialGroup (sequential, with dry/wet mix)
│   ├── PluginLeaf
│   └── PluginLeaf
└── ParallelGroup (branches with per-branch gain/solo/mute)
    ├── Branch 0: PluginLeaf → PluginLeaf
    └── Branch 1: PluginLeaf
```

- `ChainNodeId = int` (typedef) — cannot overload methods with both `int` and `ChainNodeId`
- `std::variant` requires complete types — `GroupData` must be defined before `ChainNode` in header
- `AudioProcessorGraph` auto-sums when multiple connections target same input channel (parallel fan-in)
- Parallel branches get `LatencyCompensationProcessor` delay nodes on shorter branches

### WebView Bridge (`bridge/`)

**JS → C++**: `juceBridge.callNative('functionName', arg1, arg2)` → `window.__JUCE__.backend.emitEvent("__juce__invoke", ...)` → C++ lambda

**C++ → JS**: `WebViewBridge::emitEvent("eventName", data)` → `window.__JUCE__.backend.addEventListener()`

**Critical pattern**: Group operations pass args as `JSON.stringify({...})`. Each handler must `juce::JSON::parse(args.toString())` then `getDynamicObject()`. Older functions pass primitive args directly.

### Desktop UI (`ui/`)

Vite + React 18 + TypeScript + Zustand + Tailwind + @dnd-kit

| File | Purpose |
|------|---------|
| `api/convex-client.ts` | Full Convex integration via `anyApi`: auth, sync, chains, social, friends |
| `api/juce-bridge.ts` | TypeScript wrapper for all native C++ functions |
| `api/types.ts` | TS types mirroring C++ data model |
| `stores/chainStore.ts` | Tree + flat chain state, node selection, DnD |
| `stores/cloudChainStore.ts` | Cloud chain browsing, social actions (rate, comment, fork, follow) |
| `stores/pluginStore.ts` | Scanned plugin list from JUCE |
| `stores/syncStore.ts` | Plugin sync to PluginRadar cloud |
| `components/ChainEditor/` | Main tree-based chain UI, GroupContainer, ChainSlot, ParallelBranchControls |
| `components/CloudSync/` | LoadChainModal, ChainDetailModal, StarRating, CommentSection |
| `components/Friends/` | FriendsList, AddFriend, FriendRequests, ProfileSettings |
| `components/ChainSharing/` | ShareChainModal, ReceivedChains |
| `components/SpectrumAnalyzer/` | Canvas-based FFT visualizer |

Vite builds as IIFE (not ES modules) via `vite-plugin-singlefile` — required for JUCE WebBrowserComponent. A custom Vite plugin strips `type="module"` and `crossorigin` attributes.

## Web App (`apps/web/`)

Next.js 16 with App Router, React 19, Tailwind CSS 4, shadcn/ui. Dark theme: stone-950/amber-400.

### Key Routes

| Route | Purpose |
|-------|---------|
| `/` | Home — stats, trending, sales, free plugins |
| `/plugins`, `/plugins/[slug]` | Plugin browse and detail pages |
| `/manufacturers/[slug]` | Manufacturer profiles |
| `/sales`, `/free` | Active deals and free plugins |
| `/chains`, `/chains/[slug]` | Plugin chain sharing with social features |
| `/compare/[slug]` | Side-by-side plugin comparisons |
| `/profile/[userId]` | User profiles — chains, followers, following |
| `/wishlist`, `/collection`, `/alerts` | User library features |
| `/account` | Account settings |

### Key Components

| Component | Purpose |
|-----------|---------|
| `components/auth-provider.tsx` | React context: session management, login/register/logout |
| `components/convex-provider.tsx` | ConvexReactClient wrapper |
| `components/social/StarRating.tsx` | Interactive 1-5 star rating |
| `components/social/CommentSection.tsx` | Threaded comments with auth |
| `components/social/FollowButton.tsx` | Follow/unfollow toggle |
| `components/social/ForkButton.tsx` | Fork chain with name dialog |
| `components/social/UserAvatar.tsx` | Avatar with initials fallback |
| `components/navigation.tsx` | Main nav with auth state |

## Enrichment Pipeline (`scripts/`)

- `plugin-agent.mjs` — Claude Agent SDK with tools: `save_plugin_enrichment`, `save_plugin_comparison`, `search_plugins`
- `enrich-*.mjs` — Various batch enrichment scripts
- `scrapers/` — Store scrapers (Plugin Boutique, etc.)
- `youtube-*.mjs`, `tiktok-fetcher.mjs` — Social video discovery
- `import-*.mjs` — Data import scripts
- `upload-images*.mjs` — Image pipeline to Convex storage

## Key Patterns

### Plugin Matching (Desktop → Catalog)
`pluginDirectory.ts:syncScannedPlugins` uses Levenshtein similarity to match scanned plugins against the catalog. Three-tier matching: exact → normalized (strip special chars) → fuzzy (0.7+ name + 0.6+ manufacturer similarity).

### Chain Compatibility
`checkChainCompatibility` cross-references chain slots against user's `ownedPlugins` table to show what percentage of a cloud chain the user can load locally.

### Preset Management
Chain slots include base64-encoded `presetData` with `presetSizeBytes`. JUCE `getStateInformation()`/`setStateInformation()` is format-agnostic — preset data is portable across AU/VST3.

### Latency Compensation
`ChainProcessor::wireParallelGroup()` inserts `LatencyCompensationProcessor` (delay line) on shorter parallel branches so all branches arrive time-aligned at the sum point.

### Rate Limiting
`lib/rateLimit.ts` provides sliding-window rate limiting via a `rateLimits` table. Used in friends, private chains, and profile mutations.

## Key Constraints

- `DryWetMixProcessor`: 4 input channels (0-1 dry, 2-3 wet), 2 output channels. Uses `SmoothedValue` for crossfade
- `BranchGainProcessor`: Stereo gain with `SmoothedValue` (Multiplicative smoothing)
- Vite builds as IIFE — required for JUCE WebBrowserComponent. Custom plugin strips `type="module"` and `crossorigin`
- Desktop UI zip must be regenerated and C++ rebuilt after frontend changes
- Desktop `convex-client.ts` uses `anyApi` (not generated types) because the desktop workspace has a separate `convex/` directory from the monorepo root
- `ChainNodeId = int` typedef — can't overload methods with both `int` and `ChainNodeId` params
- `std::variant` requires complete types — `GroupData` before `ChainNode` in header

## Testing

No formal test suite. Manual testing:
- Web: `pnpm dev:web` → test routes at localhost:3000
- Desktop UI: `pnpm dev:desktop-ui` → hot-reload at localhost:5173
- JUCE: Build AU with CMake → load in DAW
- Convex: `pnpm dev:convex` → test functions via dashboard

## Important Conventions

- All Convex mutations requiring auth accept a `sessionToken` parameter
- Desktop UI communicates with JUCE via `juceBridge` async calls
- Plugin chains use slugs for public URLs, share codes for private sharing
- Effect categories defined in `packages/shared/src/categories.ts`
- Web app uses `@phosphor-icons/react` for icons
- Web app styling: shadcn/ui + Tailwind 4 + stone-950/amber-400 dark theme
- Rate-limited mutations use `checkRateLimit()` from `convex/lib/rateLimit.ts`
