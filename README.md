# PluginRadar Monorepo

Audio plugin database, price tracker, and chain manager.

## Structure

```
├── convex/           — Shared Convex backend (schema + functions)
├── apps/
│   ├── web/          — Next.js web app (pluginradar.com)
│   ├── desktop-ui/   — Vite+React UI for JUCE plugin
│   └── desktop-native/ — JUCE C++ plugin (DAW integration)
├── packages/
│   └── shared/       — Shared types and constants
├── scripts/          — Scraping, enrichment, and data scripts
├── data/             — Data files and comparisons
└── docs/             — Documentation
```

## Setup

```bash
pnpm install
```

## Development

```bash
# Start Convex dev server
pnpm dev:convex

# Start web app
pnpm dev:web

# Start desktop UI
pnpm dev:desktop-ui
```

## Deploy

```bash
# Deploy Convex functions
pnpm deploy

# Build web app
pnpm build:web
```

## Convex Backend

Single deployment at `next-frog-231.convex.cloud` shared by all apps.

All schema and functions live in `convex/` at the root.
