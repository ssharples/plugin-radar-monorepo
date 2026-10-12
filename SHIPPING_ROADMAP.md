# ProChain / Plugin Radar — Shipping Roadmap

> Generated 2026-02-12 from a 5-agent comprehensive codebase audit covering:
> Convex backend, Next.js web app, Desktop React UI, JUCE C++ backend, and cross-layer integration.

---

## Status (Updated 2026-02-12)

Phase 0 and Phase 1 execution is underway with a **10-agent ship-it team** working in parallel:

- **Auth security** (Phase 0, items 1-4): In progress -- converting userId mutations to sessionToken across all Convex functions.
- **C++ crash fixes** (Phase 0, items 5-8): Completed -- suspendProcessing guards, SafePointer patterns for async callbacks, plugin code collision fixed.
- **C++ audio engine** (Phase 1, items 20-23): Completed -- VST3 format registration, latency compensation fix, AlertWindow replacement, mute implementation.
- **Bridge fixes** (Phase 1, items 11, 32-34): Completed -- setNodeMute implemented, missing TS wrappers added, templateListChanged event wired.
- **Web navigation** (Phase 0, item 9): Completed -- navigation links restored, branding updated to "ProChain by Plugin Radar" with neon lime identity.
- **Web SEO** (Phase 1, item 25): Completed -- per-page metadata, error boundaries, and loading states added across all routes.
- **Web functional bugs** (Phase 1, items 28-30): Completed -- Load More handler, "More from Manufacturer" section, compatible-only filter all fixed.
- **Backend hardening** (Phase 1, items 13-19): In progress -- adding rate limits and input validation.
- **Desktop UI cleanup** (Phase 1, items 31-32): In progress -- removing console.logs, dead code, and type safety improvements.
- **Documentation** (Phase 3, items 60, 63, 66): In progress -- CLAUDE.md updated, USER_GUIDE.md, CHANGELOG.md, and PRIVACY_POLICY.md created.

---

## Executive Summary

The product is **feature-rich and architecturally sound** across all layers. The chain editor, audio processing pipeline, social features, cloud sync, and cross-instance awareness are all functional. However, there are **12 critical blockers** that must be resolved before any public release, primarily around security (auth bypass), stability (use-after-free crashes, audio glitches), and user-facing completeness (broken navigation, broken CTAs, disabled VST3 support).

**Estimated timeline to MVP ship:** 3-4 weeks of focused engineering (assuming 2 developers).

---

## Phase 0: Critical Blockers (Must Fix Before Any Release)

*These issues will cause crashes, security breaches, or make the product unusable.*

### Security — Auth Bypass (Convex Backend)
| # | Issue | Effort | Layer |
|---|-------|--------|-------|
| 1 | **Many mutations accept raw `userId` instead of `sessionToken`** — saveChain, downloadChain, toggleChainLike, syncScannedPlugins, wishlists, alerts, ownedPlugins. Any client can impersonate any user. | M | Convex |
| 2 | **All plugin/manufacturer CRUD has NO auth** — create, update, remove are callable by anyone. | S | Convex |
| 3 | **All enrichment mutations have NO auth** — upsertPluginEnrichment, enrichPlugin, batchEnrich are public. | S | Convex |
| 4 | **`seedAdmin` mutation is unprotected** — anyone can promote any user to admin. | S | Convex |

**Fix approach:** Convert all `userId`-accepting mutations to use `sessionToken` + `getSessionUser()`. Add admin auth checks to catalog CRUD and enrichment mutations. Remove or protect `seedAdmin`.

### Stability — Crash Risks (JUCE C++)
| # | Issue | Effort | Layer |
|---|-------|--------|-------|
| 5 | **`setAllBypass()` calls `rebuildGraph()` without `suspendProcessing()`** — audio thread processes half-rebuilt graph, causing clicks/pops/crashes. | S | C++ |
| 6 | **Use-after-free in ChainSharingManager** — background threads capture `this`, destructor doesn't wait for them. | M | C++ |
| 7 | **Use-after-free in MirrorManager async callbacks** — `MessageManager::callAsync` captures `this`, destroyed when editor closes. | M | C++ |
| 8 | **Use-after-free in InstanceRegistry::notifyListeners** — same pattern with `callAsync` + `this`. | S | C++ |

**Fix approach:** Add `suspendProcessing` guard to `setAllBypass`. Implement weak-reference or SafePointer patterns for all async callbacks. Wait for in-flight threads in destructors.

### Functionality — User-Facing Breakage
| # | Issue | Effort | Layer |
|---|-------|--------|-------|
| 9 | **Web navigation has NO links to any feature** — users can't reach plugins, chains, sales, etc. from the homepage or nav. | S | Web |
| 10 | **Download/purchase CTA buttons are `href="#"`** — primary revenue conversion is broken. | S | Web |
| 11 | **`setNodeMute` returns fake success** — UI shows mute toggled but audio keeps playing. | S | C++/Bridge |
| 12 | **PLUGIN_CODE collision in CMakeLists** — manufacturer and plugin codes both `Prcn`. DAW identification issues. | S | C++ |

**Total Phase 0 effort: ~2-3 weeks** (S = 1-2 days, M = 3-5 days)

---

## Phase 1: MVP Launch Requirements (Ship-Blocking)

*Required for a credible v1.0 launch, but not crash/security critical.*

### Backend Hardening
| # | Issue | Effort | Layer |
|---|-------|--------|-------|
| 13 | **Password reset email not implemented** — TODO in code. Users cannot recover accounts. | M | Convex |
| 14 | **Registration rate limit is global** (3/hr for ALL users combined) — will block legitimate signups. | S | Convex |
| 15 | **Missing rate limits** on saveChain, rateChain, followUser, toggleChainLike, downloadChain, forkChain. | S | Convex |
| 16 | **No password strength validation** on registration (only on reset). | S | Convex |
| 17 | **Legacy password hash is trivially reversible** — force reset or flag affected accounts. | S | Convex |
| 18 | **Comment content length not validated** — users can submit arbitrarily long comments. | S | Convex |
| 19 | **`getComments` leaks user email** in response data. | S | Convex |

### C++ Audio Engine
| # | Issue | Effort | Layer |
|---|-------|--------|-------|
| 20 | **VST3 format not registered** in PluginManager — only AU plugins discoverable. | S | C++ |
| 21 | **LatencyCompensationProcessor** uses wrong `maximumBlockSize` (delaySamples instead of actual block size). | S | C++ |
| 22 | **`getMirrorGroupForInstanceMutable`** returns raw pointer into vector — invalidation risk. | S | C++ |
| 23 | **GroupTemplateManager shows native AlertWindow** — modal dialog in plugin context can hang DAW. | S | C++ |

### Web App
| # | Issue | Effort | Layer |
|---|-------|--------|-------|
| 24 | **Brand identity decision** — "ProChain" vs "PluginRadar" used inconsistently everywhere. | M | Web/All |
| 25 | **No per-page SEO metadata** on most routes (plugins, manufacturers, sales, compare, etc.). | M | Web |
| 26 | **All pages are client-rendered** (`"use client"`) — search engines get empty HTML. High-value content pages need SSR or at minimum `generateMetadata()`. | L | Web |
| 27 | **No error boundaries** or `error.tsx` / `not-found.tsx` files anywhere. | M | Web |
| 28 | **"Load More" button on chains page is non-functional** — no onClick handler. | S | Web |
| 29 | **"More from Manufacturer" section is empty** on plugin detail page. | S | Web |
| 30 | **Compatible-only filter on chains page does nothing** — wired in UI but not passed to query. | S | Web |

### Desktop UI
| # | Issue | Effort | Layer |
|---|-------|--------|-------|
| 31 | **118 console.log statements** — must clean up for production build. | S | Desktop UI |
| 32 | **`templateListChanged` event not in setupEventListeners()** — group template saves/deletes don't update UI. | S | Bridge |

### Integration
| # | Issue | Effort | Layer |
|---|-------|--------|-------|
| 33 | **5 C++ handlers with no TS wrappers** — blacklist management and refreshLatency inaccessible from UI. | S | Bridge |
| 34 | **2 TS wrappers with no C++ handlers** — `copyNodeState`, `sendPluginToInstance` silently broken. | S | Bridge |

**Total Phase 1 effort: ~2-3 weeks** (concurrent with Phase 0 on separate tracks)

---

## Phase 2: Post-Launch Polish (First 30 Days After Ship)

*Important for user retention and growth, but can ship without these.*

### Code Quality & Maintainability
| # | Issue | Effort | Layer |
|---|-------|--------|-------|
| 35 | Split monolithic files: chainStore.ts (1132 lines), convex-client.ts (1400 lines), ChainEditor.tsx (1470 lines) | L | Desktop UI |
| 36 | Remove dead feature flag code (USE_CYBER_DESIGN always true, classic ChainSlot path dead) | S | Desktop UI |
| 37 | Replace `window.confirm()` in FriendsList with custom modal | S | Desktop UI |
| 38 | Fix SVG gradient ID collision in Knob.tsx (use `useId()`) | S | Desktop UI |
| 39 | Replace native `<select>` in PluginFilters with CustomDropdown | S | Desktop UI |
| 40 | Centralize Friends/ChainSharing to use convex-client.ts helpers instead of direct `api` imports | M | Desktop UI |
| 41 | Fix heavy `any` types in ChainBrowser components | S | Desktop UI |
| 42 | Deduplicate code: handlePrevPlugin/handleNextPlugin, computeCompat, USE_CASE_GROUPS, category constants | M | Desktop UI |

### Backend Cleanup
| # | Issue | Effort | Layer |
|---|-------|--------|-------|
| 43 | Remove or document 6 orphaned table schemas (wikiEdits, wikiVotes, userReputation, glossaryTerms, notifications, emailSources/incomingEmails/scrapeSources/scrapeRuns) | S | Convex |
| 44 | Add cascading deletes for `plugins.remove` (affects sales, alerts, wishlists, etc.) | M | Convex |
| 45 | Add session cleanup mutation (delete expired sessions) | S | Convex |
| 46 | Add rate limit record cleanup | S | Convex |
| 47 | `deleteComment` should cascade-delete child comments | S | Convex |
| 48 | Add structured error codes (not just string messages) | M | Convex |
| 49 | Webhook API key: remove hardcoded fallback `"pluginradar-enrich-2026"` | S | Convex |

### Web App Polish
| # | Issue | Effort | Layer |
|---|-------|--------|-------|
| 50 | Replace all `<img>` tags with Next.js `<Image>` for optimization | M | Web |
| 51 | Add route-level `loading.tsx` files | S | Web |
| 52 | Use SchemaMarkup components on plugin and manufacturer pages | S | Web |
| 53 | Consolidate to single icon library (remove lucide-react, use phosphor only) | S | Web |
| 54 | Fix relative import path for shared package in chains page | S | Web |
| 55 | Add forgot-password link to account page login form | S | Web |
| 56 | Fix manufacturer sticky header background color mismatch | S | Web |
| 57 | Fix `@ts-nocheck` in field.tsx (React 19 ref compat) | S | Web |

### C++ Cleanup
| # | Issue | Effort | Layer |
|---|-------|--------|-------|
| 58 | Remove legacy PluginCanvas.cpp and PluginEditorHost.cpp (superseded by WebView) | S | C++ |
| 59 | Evaluate ParameterProxyPool 2048-param allocation for DAW UX impact | S | C++ |

**Total Phase 2 effort: ~3-4 weeks**

---

## Phase 3: Marketing & Documentation Readiness

### Documentation Needed
| # | Deliverable | Effort | Priority |
|---|-------------|--------|----------|
| 60 | **User Guide** — Getting started, scanning plugins, building chains, sharing, keyboard shortcuts | L | Launch day |
| 61 | **Website copy cleanup** — Finalize ProChain vs PluginRadar branding across all pages | M | Launch day |
| 62 | **Plugin format compatibility page** — Supported formats (AU now, VST3 after fix), OS support | S | Launch day |
| 63 | **Changelog / Release Notes** — v1.0 feature list for marketing | S | Launch day |
| 64 | **API documentation** (if opening Convex API to third parties) | L | Post-launch |
| 65 | **Developer contributing guide** — Build instructions, architecture overview | M | Post-launch |
| 66 | **Privacy policy & Terms of Service** — Required for user accounts and data collection | M | Launch day |
| 67 | **EULA for desktop plugin** — Standard audio plugin EULA | S | Launch day |

### Marketing Readiness
| # | Deliverable | Effort | Priority |
|---|-------------|--------|----------|
| 68 | **Landing page CTA links** — Point to actual download/purchase page | S | Launch day |
| 69 | **macOS + Windows download hosting** — Actual binary distribution (signed/notarized) | L | Launch day |
| 70 | **App Store / Plugin Boutique listing** (if distributing there) | M | Week 1 |
| 71 | **Demo video** — 2-3 min screencast showing chain building, sharing, cloud sync | M | Launch day |
| 72 | **Social media assets** — Open Graph images, Twitter cards for chain/plugin pages | S | Launch day |
| 73 | **Email infrastructure** — For password reset, notifications, onboarding drip | M | Launch day |
| 74 | **Analytics integration** — Usage tracking, funnel metrics | M | Week 1 |
| 75 | **Payment integration** — Stripe/Gumroad/Paddle for the $25 purchase flow | L | Launch day |

---

## Phase 4: Future Roadmap (Post-Launch Features)

*Feature ideas and improvements discovered during audit.*

### High Value
| # | Feature | Effort | Rationale |
|---|---------|--------|-----------|
| 76 | **Windows support** — Currently macOS-only (AU format only, KeyboardInterceptor.mm). VST3 enables cross-platform. | XL | Doubles addressable market |
| 77 | **Plugin preset browsing/sharing** — Extend cloud sync to include individual plugin presets, not just chains | L | High user demand in DAW ecosystem |
| 78 | **Community wiki system** — Schema tables exist (wikiEdits, wikiVotes, userReputation) but no implementation | L | User engagement, SEO content |
| 79 | **Notification system** — Schema exists but no delivery. Email + in-app for comments, follows, friend requests | M | Re-engagement |
| 80 | **Admin moderation panel** — Comment moderation, user management, content flagging | M | Required at scale |

### Medium Value
| # | Feature | Effort | Rationale |
|---|---------|--------|-----------|
| 81 | **SSR for web content pages** — Move plugin/manufacturer/chain pages to server components | L | SEO, performance |
| 82 | **Comment editing** — Currently delete-only | S | Expected UX |
| 83 | **Session refresh mechanism** — Extend sessions without re-login | S | User retention |
| 84 | **Partial username search** — Currently exact-match only | M | Discoverability |
| 85 | **Glossary system** — Schema exists, no implementation | M | SEO content |
| 86 | **Pagination for friends/pending requests** | S | Scale readiness |
| 87 | **Debug logging utility** — Replace console.logs with togglable debug mode | S | Developer experience |

### Architecture Improvements
| # | Improvement | Effort | Rationale |
|---|-------------|--------|-----------|
| 88 | **Import shared package** instead of hardcoded category duplicates in desktop UI and plugin filters | S | Maintainability |
| 89 | **Standardize field naming** across layers — resolve `pluginName`/`name`, `pluginDryWet`/`dryWetMix` inconsistencies | M | Reduce bug surface |
| 90 | **Update CLAUDE.md** — Desktop UI uses typed `api` not `anyApi`, brand is "Propane" in desktop UI | S | Developer onboarding |
| 91 | **Performance indexes** — Add compound `by_user_plugin` index to alerts table, optimize `plugins.browse` and `getCategories` to avoid `.collect()` on entire table | M | Scale readiness |
| 92 | **Optimize `plugins.browse`** — Currently loads all matching rows into memory for some filter combos | M | Performance at scale |

---

## Priority Matrix

```
                    IMPACT
                High          Low
         ┌──────────────┬──────────────┐
  Urgent │  PHASE 0     │  Phase 1     │
  (Now)  │  12 items    │  Backend     │
         │  Security,   │  hardening,  │
         │  crashes,    │  missing     │
    U    │  broken UX   │  features    │
    R    ├──────────────┼──────────────┤
    G    │  Phase 1     │  Phase 2     │
    E    │  Web, SEO,   │  Code        │
    N    │  brand       │  quality,    │
    C    │  identity    │  cleanup     │
    Y    │              │              │
         └──────────────┴──────────────┘
```

---

## Recommended Sprint Plan

### Sprint 1 (Week 1-2): "Make It Safe"
- All Phase 0 security fixes (items 1-4)
- All Phase 0 crash fixes (items 5-8)
- Brand identity decision (item 24)
- Password reset email infrastructure (item 13, 73)
- VST3 format registration (item 20)

### Sprint 2 (Week 2-3): "Make It Work"
- All Phase 0 functionality fixes (items 9-12)
- Web navigation restoration (item 9)
- CTA link targets (items 10, 68)
- Bridge fixes — mute implementation, event listeners, missing wrappers (items 11, 32-34)
- Rate limiting additions (item 15)
- SEO metadata (item 25)

### Sprint 3 (Week 3-4): "Make It Shippable"
- Error boundaries (item 27)
- Payment integration (item 75)
- Download hosting + code signing (item 69)
- Console.log cleanup (item 31)
- User guide (item 60)
- Privacy policy + EULA (items 66-67)
- Demo video (item 71)

### Sprint 4 (Week 4-5): "Make It Polished"
- Phase 2 code quality items
- Image optimization (item 50)
- Loading states (item 51)
- Schema markup (item 52)
- Analytics (item 74)
- Launch

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Auth bypass exploited before fix | Medium | Critical | Prioritize Phase 0 security fixes above all else |
| Use-after-free crash in DAW during demo | High | Critical | Fix async callback patterns before any beta testing |
| SEO invisibility due to client rendering | High | High | At minimum add generateMetadata(); full SSR is Phase 4 |
| VST3 support delays | Low | High | Simple code change but needs thorough testing across DAWs |
| Payment integration complexity | Medium | High | Start Stripe/Paddle integration early in Sprint 3 |
| Brand confusion hurts marketing | Medium | Medium | Make branding decision in Sprint 1, propagate immediately |
| Large chain performance | Low | Medium | Tree traversal O(N) acceptable for typical chains (<50 plugins) |

---

## Metrics to Track Post-Launch

1. **Activation rate**: % of downloads that complete onboarding (scan + first chain)
2. **Chain creation rate**: Chains created per active user per week
3. **Cloud sync adoption**: % of users who save at least one chain to cloud
4. **Social engagement**: Comments, ratings, follows, forks per week
5. **Retention**: 7-day and 30-day return rate
6. **Crash rate**: Crashes per 1000 sessions (target: <1)
7. **Plugin compatibility**: % of users' scanned plugins matched to catalog

---

*This roadmap should be reviewed weekly and updated as items are completed or new issues are discovered.*
