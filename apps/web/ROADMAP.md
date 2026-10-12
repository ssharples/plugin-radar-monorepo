# PluginRadar Roadmap

> Track audio plugin deals, discover new tools, never miss a sale.

---

## ✅ Phase 1: Foundation (Complete)

### Database & Backend
- [x] Convex database deployed (https://next-frog-231.convex.cloud)
- [x] Schema: plugins, manufacturers, stores, sales, priceHistory, versions, users, wishlists, alerts
- [x] CRUD functions for all entities
- [x] Search index on plugin names
- [x] Image storage via Convex (CDN-served)

### Data Collection
- [x] 750+ plugins scraped from 34 manufacturers
- [x] 7 major stores configured (Plugin Boutique, Sweetwater, etc.)
- [x] Automated scraper scripts for catalog updates
- [x] Newsletter subscriptions for 10+ manufacturers

### Frontend MVP
- [x] Next.js 16 + shadcn UI (emerald/stone theme)
- [x] Homepage with stats, plugin grid, manufacturer list
- [x] Dynamic plugin detail pages (`/plugins/[slug]`)
- [x] YouTube tutorial integration on detail pages
- [x] Responsive design

---

## ✅ Phase 2: Core Features (Complete)

### Search & Discovery
- [x] Global search with filters (category, format, price range, platform)
- [x] Advanced filtering UI (multi-select dropdowns)
- [x] Sort options (price, newest, name)
- [x] Category pages (`/category/[slug]`)
- [x] Manufacturer pages (`/manufacturers` and `/manufacturers/[slug]`)
- [x] Plugins browse page (`/plugins`) with search and filters

### Sales & Deals
- [x] Active sales page with countdown timers (`/sales`)
- [x] Price history charts per plugin (using Recharts)
- [x] Sale badges on plugin cards (showing discount %)
- [x] "Biggest discounts" and "Ending soon" filters
- [x] Hot deals section on homepage
- [ ] Email parsing for automated sale detection (Phase 3)

### User Features
- [x] User authentication (email-based)
- [x] Wishlist functionality (`/wishlist`)
- [x] Price drop alerts (`/alerts`)
- [x] Plugin ownership tracking (`/collection`)
- [x] User account page with preferences (`/account`)

### Navigation & Layout
- [x] Shared navigation with search bar
- [x] Footer with quick links and stats
- [x] Responsive mobile navigation

---

## 📋 Phase 3: Growth Features (In Progress)

### Comparison Pages ✅
- [x] Generated 200 programmatic comparison pages
- [x] Comparison index at `/compare`
- [x] Individual comparison pages at `/compare/[slug]`
- [x] Schema.org markup (Product, ItemList, FAQ, Breadcrumb)
- [x] SEO-optimized titles and meta descriptions

### SEO Infrastructure ✅
- [x] XML sitemap generation (`/sitemap.xml`)
- [x] Schema markup components (`components/SchemaMarkup.tsx`)
- [ ] `/free` landing page for free plugins
- [ ] Glossary pages for audio terms
- [ ] Enhanced internal linking

### Structured Parameters (Schema Ready)
- [x] Database schema for `pluginParameters` table
- [x] Database schema for `pluginFeatures` table
- [x] Parameter extraction script template
- [ ] AI extraction pipeline (needs API keys)
- [ ] Manual curation UI for top plugins
- [ ] Parameter comparison engine

### Community Wiki System (Schema Ready)
- [x] Database schema for `wikiEdits`, `wikiVotes`, `userReputation`
- [x] Database schema for `comparisons` (stored)
- [x] Database schema for `glossaryTerms`
- [ ] Wiki edit UI component
- [ ] Voting system
- [ ] Moderation queue
- [ ] Gamification (badges, points)

### Email Monitoring
- [ ] IMAP integration for newsletter parsing
- [ ] Automated sale detection from emails
- [ ] New product announcements
- [ ] Weekly digest emails for users

### Discovery & Curation
- [ ] "New this week" section
- [ ] Staff picks / featured plugins
- [ ] Bundle tracking
- [ ] Free plugin spotlight

### Community
- [ ] User reviews & ratings
- [ ] Comments on plugins
- [ ] "Similar plugins" recommendations
- [ ] User-submitted deals

---

## 🔮 Phase 4: Advanced Features

### Price Intelligence
- [ ] Historical price trends (extended)
- [ ] "Best time to buy" predictions
- [ ] Price alerts automation (email notifications)
- [ ] Multi-store price comparison
- [ ] Currency conversion

### Integrations
- [ ] Browser extension for price checks
- [ ] DAW plugin manager integration
- [ ] iLok/Plugin Alliance account sync
- [ ] Splice Rent-to-Own tracking

### Mobile
- [ ] PWA support
- [ ] Push notifications
- [ ] Mobile-optimized browsing

### API & Ecosystem
- [ ] Public API for plugin data
- [ ] Affiliate link integration
- [ ] Partner dashboards for manufacturers

---

## 🛠 Technical Debt & Improvements

### Performance
- [ ] Image optimization pipeline
- [ ] Infinite scroll pagination
- [ ] Search result caching
- [ ] CDN for static assets

### Data Quality
- [ ] Duplicate plugin detection
- [ ] Automated data validation
- [ ] Missing data alerts
- [ ] Regular scraper health checks

### Monitoring
- [ ] Error tracking (Sentry)
- [ ] Analytics (Plausible/PostHog)
- [ ] Uptime monitoring
- [ ] Scraper success rates

---

## 📊 Current Stats

| Metric | Value |
|--------|-------|
| Total Plugins | 750+ |
| Manufacturers | 34 |
| Stores | 7 |
| Active Sales | 23 |
| Free Plugins | 31 |

---

## 🎯 North Star Metrics

1. **Monthly Active Users** - People checking deals
2. **Saved Money** - Total discounts found for users
3. **Plugin Coverage** - % of market cataloged
4. **Data Freshness** - Avg time to detect new sales

---

## 📅 Timeline

| Phase | Target | Status |
|-------|--------|--------|
| Phase 1 | Feb 2026 | ✅ Complete |
| Phase 2 | Mar 2026 | ✅ Complete |
| Phase 3 | Apr 2026 | 📋 Planned |
| Phase 4 | Q2 2026 | 🔮 Future |

---

*Last updated: February 4, 2026*
