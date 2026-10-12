# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PluginRadar is a Next.js web application that tracks audio plugin prices, sales, and deals. It uses Convex as the backend database and real-time API layer.

## Development Commands

```bash
bun install          # Install dependencies
bun run dev          # Start development server (localhost:3000)
bun run build        # Production build
bun run lint         # Run ESLint
```

## Tech Stack

- **Next.js 16** with App Router (React 19)
- **Convex** - Backend-as-a-service with real-time database
- **Tailwind CSS 4** with PostCSS
- **shadcn/ui** - Component library (Radix Nova style, stone base color)
- **Phosphor Icons** - Icon library
- **TypeScript** - Strict mode enabled

## Architecture

### Directory Structure

- `app/` - Next.js App Router pages and API routes
- `components/` - React components including shadcn/ui primitives in `ui/`
- `convex/` - Backend functions, schema, and auto-generated types
- `lib/` - Utility functions (`cn()` for classname merging)

### Key Files

- `convex/schema.ts` - Database schema (21 tables: plugins, manufacturers, stores, sales, users, etc.)
- `convex/plugins.ts` - Main plugin queries and mutations
- `app/page.tsx` - Homepage with stats dashboard and plugin grid
- `app/plugins/[slug]/page.tsx` - Dynamic plugin detail page

### Backend (Convex)

Convex functions are in `/convex/`. The schema defines tables for:
- **Core**: manufacturers, plugins
- **Pricing**: stores, storePrices, priceHistory
- **Sales**: sales (promotions, discounts)
- **Users**: users, wishlists, ownedPlugins, alerts, notifications
- **Data ingestion**: emailSources, incomingEmails, scrapeSources, scrapeRuns

Convex patterns:
- Queries and mutations are separate files
- Use `v.*` validators from `convex/values`
- Indexes are defined in schema for common queries (by_slug, by_category, by_free)
- Prices stored in cents; timestamps in milliseconds

### Frontend Patterns

- Server Components by default; use `"use client"` directive for interactivity
- Dark theme: stone-950 background, emerald-400 accents
- Path alias: `@/*` maps to project root

## Environment Variables

- `NEXT_PUBLIC_CONVEX_URL` - Convex backend URL (required)
- `YOUTUBE_API_KEY` - Optional; falls back to Invidious API for plugin tutorials
