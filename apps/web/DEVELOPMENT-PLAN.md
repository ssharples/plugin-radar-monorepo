# PluginRadar Web App — Development Plan

> Complete plan for making plugin-radar-ui feature-complete, merging the backend repo, and building Phase 3 growth features.

*Generated: February 5, 2026*

---

## Executive Summary

The core web app is **remarkably complete** — all 13 pages work with real Convex data. The main work ahead is:
1. **Merge** the `plugin-radar` backend repo (adds tiktok.ts, videos.ts, enrichment scripts)
2. **Fix** schema mismatches that will cause deploy failures (missing table, missing fields)
3. **Fix** bugs (double AuthProvider, weak auth, incomplete sitemap)
4. **Build** Phase 3 features (all schema-only today: wiki, parameters, glossary, chains, notifications)

---

## Step 0: Merge Backend Repo (PREREQUISITE)

The `plugin-radar` backend repo has Convex functions and scripts not in the web app. The schemas are identical, so this is primarily additive.

### 0A. Copy New Files (Backend -> Web App)

| Source File | Destination | Notes |
|-------------|-------------|-------|
| `plugin-radar/convex/tiktok.ts` | `plugin-radar-ui/convex/tiktok.ts` | New file — TikTok post CRUD |
| `plugin-radar/convex/videos.ts` | `plugin-radar-ui/convex/videos.ts` | New file — plugin video CRUD |
| `plugin-radar/scripts/*` | `plugin-radar-ui/scripts/` | Enrichment webhook + Claude agent |

### 0B. Merge Divergent Files

Three Convex files differ between repos. For each, the web app version is the primary and the backend adds specific things:

**`plugins.ts`** — Web app is superset. Only change needed:
- Add missing `update` mutation args from backend: `systemRequirements`, `releaseDate`, `lastUpdated`, `manualUrl`, `mentionCount7d`, `mentionCount30d`, `mentionScore`, `lastMentionScan`

**`sales.ts`** — Web app is strict superset. No merge needed.

**`mentions.ts`** — Neither is superset. Merge plan:
- Base: web app version (has YouTube-specific features the UI needs)
- Port from backend: `getTrendingPlugins` (uses index, more efficient), `getMentionStats`, `cleanupOld`
- Drop web app's `getTrending` (replaced by backend's `getTrendingPlugins`)
- Update `create`/`batchCreate` to write both field name conventions for compat
- Use backend's `recalculateScores` algorithm (has platform weights) but update for dual field names

### 0C. Add Dependencies from Backend

```bash
bun add @anthropic-ai/sdk exa-js imap mailparser
bun add -d @types/imap @types/mailparser
```

Remove unused deps from web app: `@auth/core`, `@convex-dev/auth` (custom auth is used instead).

---

## Step 1: Fix Schema Mismatches (CRITICAL — Deploy Blockers)

Code references tables, fields, and indexes that don't exist in `convex/schema.ts`. These will cause runtime errors.

### 1A. Add `timelineEvents` Table

```typescript
timelineEvents: defineTable({
  type: v.string(),
  plugin: v.optional(v.id("plugins")),
  manufacturer: v.optional(v.id("manufacturers")),
  sale: v.optional(v.id("sales")),
  version: v.optional(v.id("versions")),
  title: v.string(),
  description: v.optional(v.string()),
  versionNumber: v.optional(v.string()),
  oldPrice: v.optional(v.number()),
  newPrice: v.optional(v.number()),
  discountPercent: v.optional(v.number()),
  occurredAt: v.number(),
  createdAt: v.number(),
})
  .index("by_plugin_occurred", ["plugin", "occurredAt"])
  .index("by_manufacturer_occurred", ["manufacturer", "occurredAt"])
  .index("by_type", ["type"])
  .index("by_occurred", ["occurredAt"]),
```

### 1B. Add Enrichment Fields to `plugins` Table

```typescript
// Add to plugins defineTable (optional fields)
worksWellOn: v.optional(v.array(v.string())),
useCases: v.optional(v.array(v.string())),
genreSuitability: v.optional(v.array(v.string())),
sonicCharacter: v.optional(v.array(v.string())),
comparableTo: v.optional(v.array(v.string())),
skillLevel: v.optional(v.string()),
learningCurve: v.optional(v.string()),
cpuUsage: v.optional(v.string()),
licenseType: v.optional(v.string()),
keyFeatures: v.optional(v.array(v.string())),
recommendedDaws: v.optional(v.array(v.string())),
isIndustryStandard: v.optional(v.boolean()),
```

Add indexes:
```typescript
.index("by_skill_level", ["skillLevel"])
.index("by_cpu_usage", ["cpuUsage"])
```

### 1C. Add Missing Fields/Indexes to `pluginMentions` Table

Add YouTube-specific fields:
```typescript
description: v.optional(v.string()),
thumbnailUrl: v.optional(v.string()),
channelName: v.optional(v.string()),
channelId: v.optional(v.string()),
channelUrl: v.optional(v.string()),
channelThumbnail: v.optional(v.string()),
viewCount: v.optional(v.number()),
likeCount: v.optional(v.number()),
commentCount: v.optional(v.number()),
mentionType: v.optional(v.string()),
sentiment: v.optional(v.string()),
duration: v.optional(v.string()),
durationSeconds: v.optional(v.number()),
discoveredAt: v.optional(v.number()),
isVerified: v.optional(v.boolean()),
```

Add index:
```typescript
.index("by_source_id", ["sourceId"])
```

### 1D. Mention Field Name Strategy

Both field naming conventions exist in the codebase. Plan:
- **Write both**: `views` + `viewCount`, `likes` + `likeCount`, `comments` + `commentCount`
- **Read with fallback**: `m.viewCount ?? m.views`
- **Long-term**: Deprecate short names after data migration

---

## Step 2: Fix Bugs (HIGH Priority)

| # | Bug | Fix | Effort |
|---|-----|-----|--------|
| 1 | **Double AuthProvider** — `convex-provider.tsx` AND `layout.tsx` both wrap | Remove AuthProvider from one (keep in convex-provider.tsx) | 5 min |
| 2 | **Weak auth hash** — `auth.ts` uses bit-shifting, not bcrypt | Replace `simpleHash()` with proper hashing (bcrypt or scrypt) | 1 hour |
| 3 | **Predictable session tokens** — `sess_{userId}_{timestamp}_{random}` | Use crypto.randomUUID() for opaque tokens, store mapping in DB | 1 hour |
| 4 | **Sitemap incomplete** — missing `/plugins/[slug]` and `/manufacturers/[slug]` | Add dynamic plugin + manufacturer URLs to `app/sitemap.ts` | 30 min |
| 5 | **Compare pages standalone layout** — `/compare/*` has own header/footer | Remove standalone header/footer, use shared layout from app/layout.tsx | 30 min |
| 6 | **Comparisons from filesystem** — reads JSON from `../plugin-radar/data/` | Migrate to read from Convex `comparisons` table (agentEnrich.ts already writes there) | 1 hour |

---

## Step 3: Quick Wins (< 1 Session Each)

### 3A. `/free` Landing Page
- Backend query `plugins.freePlugins` already exists
- Create `app/free/page.tsx` — group by category, "best free" picks
- SEO metadata: "Free Audio Plugins 2026 | PluginRadar"
- Add to navigation and sitemap

### 3B. Complete Sitemap
- Add all `/plugins/[slug]` URLs (750+ pages)
- Add all `/manufacturers/[slug]` URLs (34 pages)
- Add `/free` page
- Add `/chains` page (when built)

### 3C. Compare Pages Integration
- Remove standalone header/footer from `/compare` pages
- Migrate comparison data source from filesystem JSON to Convex DB
- Add internal links from plugin detail pages to relevant comparisons

### 3D. Discovery Features on Homepage
- "New This Week" section (plugins with recent `createdAt`)
- "Trending" section (using `mentions.getTrendingPlugins`)
- "Staff Picks" — curated featured plugins (add `isFeatured` field or use existing tags)

---

## Step 4: Medium Features (1-2 Sessions Each)

### 4A. Plugin Chain Browser (Web)
- New page: `app/chains/page.tsx` — browse public chains
- New page: `app/chains/[slug]/page.tsx` — chain detail with slot list
- Backend already done: `pluginDirectory.browseChains`, `getChain`, `checkChainCompatibility`
- Show compatibility percentage based on user's owned plugins
- Download/like buttons
- "Open in Plugin Chain Manager" link (share code fallback)

### 4B. Auth Hardening
- Replace `simpleHash` with bcrypt (Convex action for hashing)
- Opaque session tokens (crypto.randomUUID) with DB-stored mapping
- Session expiry (7-day default, 30-day "remember me")
- Remove unused `@auth/core` and `@convex-dev/auth` packages

### 4C. Notifications System
- `notifications` table already in schema
- Build `convex/notifications.ts` — CRUD + mark-as-read
- Notification bell in navigation with unread count
- Types: price_drop, sale_alert, wishlist_match, chain_download, system
- Triggered by: price history changes, new sales, chain interactions

### 4D. TikTok/Video Content Integration
- Wire up `tiktok.ts` and `videos.ts` from backend merge
- Show plugin videos on detail pages (alongside YouTube mentions)
- "Trending on TikTok" section
- Video player embeds

---

## Step 5: Large Features (3+ Sessions Each)

### 5A. Community Wiki System
Schema exists: `wikiEdits`, `wikiVotes`, `userReputation`

Build:
1. `convex/wiki.ts` — CRUD for wiki edits, voting, moderation
2. `convex/reputation.ts` — point calculation, level progression, badges
3. `components/PluginWiki.tsx` — wiki sections on plugin detail pages
4. `components/WikiEditor.tsx` — markdown editor for contributions
5. `app/admin/moderation/page.tsx` — moderation queue for pending edits
6. Gamification: levels 1-5 (Newcomer -> Expert), badges, leaderboard

### 5B. Structured Parameters
Schema exists: `pluginParameters`, `pluginFeatures`

Build:
1. `convex/pluginParameters.ts` — CRUD + comparison engine
2. `convex/pluginFeatures.ts` — CRUD + voting
3. AI extraction pipeline (Claude API) — parse product pages and manuals
4. Parameter display on plugin detail pages
5. Advanced comparison: side-by-side parameter tables
6. Filter by parameters (hasSidechain, hasLinearPhase, etc.)
7. `app/admin/parameters/page.tsx` — manual curation UI

### 5C. Glossary System
Schema exists: `glossaryTerms`

Build:
1. `convex/glossary.ts` — CRUD, search, related terms
2. `app/glossary/page.tsx` — alphabetical index of audio terms
3. `app/glossary/[term]/page.tsx` — term detail with related plugins/terms
4. 50+ initial terms (attack time, threshold, ratio, wet/dry, etc.)
5. Internal linking: auto-link glossary terms in plugin descriptions
6. Schema.org markup for definitions

### 5D. Email Monitoring System
Schema exists: `emailSources`, `incomingEmails`

Build:
1. IMAP integration for newsletter parsing
2. `convex/emailMonitoring.ts` — source management, email processing
3. AI-powered sale detection from email content
4. Auto-create sales entries when deals detected
5. New product announcement tracking
6. Weekly digest email for users (using preferences from account page)

---

## Priority Matrix

| Priority | Task | Effort | Impact | Dependencies |
|----------|------|--------|--------|--------------|
| **P0** | Step 0: Merge backend repo | 1 session | Unblocks everything | None |
| **P0** | Step 1: Fix schema mismatches | 1 session | Prevents deploy failures | Step 0 |
| **P0** | Step 2: Fix bugs | 1 session | Quality/security | Step 1 |
| **P1** | 3A: `/free` page | 30 min | SEO traffic | Step 1 |
| **P1** | 3B: Complete sitemap | 30 min | SEO indexing | Step 1 |
| **P1** | 3D: Discovery features | 1 session | User engagement | Step 1 |
| **P1** | 4A: Chain browser | 1-2 sessions | Cross-platform value | Step 1 |
| **P1** | 4B: Auth hardening | 1-2 sessions | Security | Step 2 |
| **P2** | 3C: Compare pages fix | 1 hour | Code quality | Step 0 |
| **P2** | 4C: Notifications | 1-2 sessions | Engagement | Step 2 |
| **P2** | 4D: TikTok/video integration | 1 session | Content richness | Step 0 |
| **P3** | 5A: Wiki system | 3-4 sessions | Community | Step 2 |
| **P3** | 5B: Parameters | 3-4 sessions | Comparison engine | Step 2 |
| **P3** | 5C: Glossary | 2 sessions | SEO content | Step 1 |
| **P4** | 5D: Email monitoring | 3-4 sessions | Automation | Step 2 |

---

## Recommended Build Order

```
Session 1:  Step 0 (merge) + Step 1 (schema fixes) + Step 2 (bug fixes)
Session 2:  3A (/free page) + 3B (sitemap) + 3C (compare fix) + 3D (discovery)
Session 3:  4A (chain browser — web UI)
Session 4:  4B (auth hardening)
Session 5:  4C (notifications) + 4D (video integration)
Session 6+: 5A-5D (large features, order based on priorities)
```

---

## Current Feature Status At-a-Glance

| Feature | Pages | Components | Backend | Status |
|---------|-------|------------|---------|--------|
| Plugin Catalog | DONE | DONE | DONE | **COMPLETE** |
| Search & Filters | DONE | DONE | DONE | **COMPLETE** |
| Sales & Deals | DONE | DONE | DONE | **COMPLETE** |
| Wishlists | DONE | DONE | DONE | **COMPLETE** |
| Price Alerts | DONE | DONE | DONE | **COMPLETE** |
| Collection | DONE | DONE | DONE | **COMPLETE** |
| Manufacturers | DONE | DONE | DONE | **COMPLETE** |
| Categories | DONE | DONE | DONE | **COMPLETE** |
| Comparisons | DONE | DONE | PARTIAL | **NEEDS FIX** (filesystem->DB) |
| Account/Auth | DONE | DONE | PARTIAL | **NEEDS FIX** (weak hash) |
| SEO/Sitemap | PARTIAL | DONE | DONE | **NEEDS FIX** (missing URLs) |
| Enrichment | DONE | DONE | DONE | **COMPLETE** |
| Free Plugins | MISSING | — | DONE | **QUICK WIN** |
| Chain Browser | MISSING | — | DONE | **BUILD** |
| Notifications | — | — | MISSING | **BUILD** |
| Wiki | — | — | SCHEMA ONLY | **BUILD** |
| Parameters | — | — | SCHEMA ONLY | **BUILD** |
| Glossary | — | — | SCHEMA ONLY | **BUILD** |
| Email Monitor | — | — | SCHEMA ONLY | **BUILD** |
| Video/TikTok | — | — | DONE (backend) | **MERGE + BUILD** |

---

## Repositories

| Repo | Path | Role |
|------|------|------|
| plugin-radar-ui | `/Users/dev/Downloads/plugin-radar-ui` | Web app (Next.js 16 + frontend) |
| plugin-radar | `/Users/dev/Downloads/plugin-radar` | Backend scripts + additional Convex functions |
| plugin-directory | `/Users/dev/plugin-directory` | JUCE C++ desktop app (separate team) |

*All share Convex backend: `https://next-frog-231.convex.cloud`*
