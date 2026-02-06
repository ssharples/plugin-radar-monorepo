import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================
  // CORE ENTITIES
  // ============================================

  manufacturers: defineTable({
    name: v.string(),
    slug: v.string(),
    website: v.string(),
    description: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")), // Convex storage for logo
    
    // Newsletter tracking
    newsletterEmail: v.optional(v.string()), // email address they send from
    newsletterSubscribed: v.boolean(),
    
    // Metadata
    pluginCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_name", ["name"])
    .searchIndex("search_name", { searchField: "name" }),

  plugins: defineTable({
    name: v.string(),
    slug: v.string(),
    manufacturer: v.id("manufacturers"),
    
    // Description
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    
    // Classification (effects only: eq, compressor, limiter, reverb, delay,
    // saturation, modulation, stereo-imaging, gate-expander, de-esser,
    // filter, channel-strip, metering, noise-reduction, multiband, utility)
    category: v.string(),
    subcategory: v.optional(v.string()),
    tags: v.array(v.string()), // ["analog-modeling", "vintage", "mastering", "free", "ai-powered"]
    
    // Effect taxonomy (from plugin-radar)
    effectType: v.optional(v.string()), // Granular subtype: parametric, VCA, FET, optical, brickwall, algorithmic, convolution, etc.
    circuitEmulation: v.optional(v.string()), // e.g. "Neve 1073", "SSL G-Bus", "LA-2A", "1176"
    tonalCharacter: v.optional(v.array(v.string())), // ["warm", "transparent", "aggressive", "smooth", "colored", "clean"]
    
    // Technical specs
    formats: v.array(v.string()), // ["VST3", "AU", "AAX", "CLAP", "Standalone"]
    platforms: v.array(v.string()), // ["windows", "mac", "linux"]
    systemRequirements: v.optional(v.string()),
    
    // Version info
    currentVersion: v.optional(v.string()),
    releaseDate: v.optional(v.number()),
    lastUpdated: v.optional(v.number()),
    
    // Pricing
    msrp: v.optional(v.number()), // regular price in cents (USD)
    currentPrice: v.optional(v.number()), // current best price in cents
    currency: v.string(), // "USD", "EUR", "GBP"
    isFree: v.boolean(),
    hasDemo: v.boolean(),
    hasTrial: v.boolean(),
    trialDays: v.optional(v.number()),
    
    // Media
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")), // Convex storage for main image
    bannerUrl: v.optional(v.string()),
    bannerStorageId: v.optional(v.id("_storage")), // Convex storage for banner
    screenshots: v.array(v.string()),
    screenshotStorageIds: v.optional(v.array(v.id("_storage"))), // Convex storage for screenshots
    videoUrl: v.optional(v.string()), // YouTube demo etc
    audioDemo: v.optional(v.string()),
    
    // Links
    productUrl: v.string(), // manufacturer's product page
    manualUrl: v.optional(v.string()),
    
    // Status
    isActive: v.boolean(), // still being sold
    isDiscontinued: v.boolean(),
    
    // Mention/Trending stats
    mentionCount7d: v.optional(v.number()),
    mentionCount30d: v.optional(v.number()),
    mentionScore: v.optional(v.number()),  // weighted trending score
    lastMentionScan: v.optional(v.number()),
    
    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
    lastScrapedAt: v.optional(v.number()),

    // Enrichment fields (from enrichment pipeline — plugin-radar-ui)
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
  })
    .index("by_slug", ["slug"])
    .index("by_mention_score", ["mentionScore"])
    .index("by_manufacturer", ["manufacturer"])
    .index("by_category", ["category"])
    .index("by_free", ["isFree"])
    .index("by_updated", ["updatedAt"])
    .index("by_skill_level", ["skillLevel"])
    .index("by_cpu_usage", ["cpuUsage"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["category", "manufacturer", "isFree"]
    }),

  // ============================================
  // STORES & PRICING
  // ============================================

  stores: defineTable({
    name: v.string(),
    slug: v.string(),
    website: v.string(),
    affiliateBaseUrl: v.optional(v.string()),
    affiliateParam: v.optional(v.string()), // e.g., "?ref=pluginradar"
    logoUrl: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"]),

  // Current prices at each store
  storePrices: defineTable({
    plugin: v.id("plugins"),
    store: v.id("stores"),
    price: v.number(), // in cents
    currency: v.string(),
    url: v.string(), // direct product link
    inStock: v.boolean(),
    lastChecked: v.number(),
  })
    .index("by_plugin", ["plugin"])
    .index("by_store", ["store"])
    .index("by_plugin_store", ["plugin", "store"]),

  // Historical price tracking
  priceHistory: defineTable({
    plugin: v.id("plugins"),
    store: v.id("stores"),
    price: v.number(),
    currency: v.string(),
    wasOnSale: v.boolean(),
    recordedAt: v.number(),
  })
    .index("by_plugin", ["plugin"])
    .index("by_plugin_date", ["plugin", "recordedAt"])
    .index("by_store", ["store"]),

  // ============================================
  // SALES & PROMOTIONS
  // ============================================

  sales: defineTable({
    plugin: v.id("plugins"),
    store: v.optional(v.id("stores")), // null = direct from manufacturer
    
    // Pricing
    salePrice: v.number(),
    originalPrice: v.number(),
    discountPercent: v.number(),
    currency: v.string(),
    
    // Timing
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    
    // Details
    saleName: v.optional(v.string()), // "Black Friday 2026", "Summer Sale"
    promoCode: v.optional(v.string()),
    url: v.string(),
    
    // Tracking
    source: v.string(), // "email", "scrape", "manual", "reddit", "twitter"
    sourceUrl: v.optional(v.string()),
    isVerified: v.boolean(),
    isActive: v.boolean(),
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_plugin", ["plugin"])
    .index("by_active", ["isActive"])
    .index("by_ends", ["endsAt"])
    .index("by_created", ["createdAt"]),

  // ============================================
  // VERSION HISTORY & CHANGELOGS
  // ============================================

  versions: defineTable({
    plugin: v.id("plugins"),
    version: v.string(),
    releaseDate: v.number(),
    
    // Changelog
    changelogRaw: v.optional(v.string()), // original text
    changelogParsed: v.optional(v.object({
      features: v.array(v.string()),
      fixes: v.array(v.string()),
      improvements: v.array(v.string()),
      breaking: v.array(v.string()),
    })),
    
    // Source
    source: v.string(),
    sourceUrl: v.optional(v.string()),
    
    createdAt: v.number(),
  })
    .index("by_plugin", ["plugin"])
    .index("by_plugin_version", ["plugin", "version"])
    .index("by_release_date", ["releaseDate"]),

  // ============================================
  // TIMELINE EVENTS (from plugin-radar-ui)
  // ============================================

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

  // ============================================
  // EMAIL MONITORING
  // ============================================

  emailSources: defineTable({
    manufacturer: v.optional(v.id("manufacturers")),
    store: v.optional(v.id("stores")),
    
    emailAddress: v.string(), // sender address
    name: v.string(),
    type: v.string(), // "manufacturer", "store", "blog", "other"
    
    isSubscribed: v.boolean(),
    subscribedAt: v.optional(v.number()),
    
    // Stats
    emailsReceived: v.number(),
    lastEmailAt: v.optional(v.number()),
  })
    .index("by_email", ["emailAddress"])
    .index("by_manufacturer", ["manufacturer"])
    .index("by_store", ["store"]),

  incomingEmails: defineTable({
    source: v.optional(v.id("emailSources")),
    
    // Email metadata
    from: v.string(),
    subject: v.string(),
    receivedAt: v.number(),
    messageId: v.string(),
    
    // Content
    bodyText: v.optional(v.string()),
    bodyHtml: v.optional(v.string()),
    
    // Processing
    status: v.string(), // "pending", "processed", "irrelevant", "error"
    classification: v.optional(v.string()), // "sale", "new_release", "update", "promo", "newsletter", "irrelevant"
    
    // Extracted data
    extractedData: v.optional(v.object({
      plugins: v.array(v.string()),
      prices: v.array(v.object({
        plugin: v.string(),
        price: v.number(),
        originalPrice: v.optional(v.number()),
      })),
      promoCodes: v.array(v.string()),
      saleEnds: v.optional(v.number()),
    })),
    
    processedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_received", ["receivedAt"])
    .index("by_source", ["source"]),

  // ============================================
  // SCRAPING & DATA SOURCES
  // ============================================

  scrapeSources: defineTable({
    name: v.string(),
    type: v.string(), // "manufacturer_site", "store", "rss", "reddit", "twitter"
    url: v.string(),
    
    // Scraping config
    scrapeFrequency: v.string(), // "hourly", "daily", "weekly"
    scrapeScript: v.optional(v.string()), // script name/path
    
    // Status
    isActive: v.boolean(),
    lastScrapeAt: v.optional(v.number()),
    lastSuccess: v.optional(v.number()),
    lastError: v.optional(v.string()),
    consecutiveFailures: v.number(),
    
    // Stats
    totalScrapes: v.number(),
    successfulScrapes: v.number(),
    itemsFound: v.number(),
  })
    .index("by_type", ["type"])
    .index("by_active", ["isActive"])
    .index("by_last_scrape", ["lastScrapeAt"]),

  scrapeRuns: defineTable({
    source: v.id("scrapeSources"),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    
    status: v.string(), // "running", "success", "failed"
    
    // Results
    itemsFound: v.number(),
    itemsCreated: v.number(),
    itemsUpdated: v.number(),
    
    error: v.optional(v.string()),
    logs: v.optional(v.string()),
  })
    .index("by_source", ["source"])
    .index("by_started", ["startedAt"]),

  // ============================================
  // USER DATA
  // ============================================

  users: defineTable({
    // Auth
    externalId: v.optional(v.string()),
    email: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    
    // Password auth
    passwordHash: v.optional(v.string()),
    isAdmin: v.optional(v.boolean()),
    
    // Subscription
    tier: v.optional(v.string()), // "free", "premium"
    premiumUntil: v.optional(v.number()),
    
    // Preferences
    preferredCurrency: v.optional(v.string()),
    emailDigest: v.optional(v.string()), // "none", "daily", "weekly"
    
    createdAt: v.optional(v.number()),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_external_id", ["externalId"])
    .index("by_email", ["email"])
    .index("by_admin", ["isAdmin"]),

  // Password reset tokens
  passwordResetTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    email: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()), // null if unused, timestamp if consumed
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"])
    .index("by_email", ["email"]),

  // Session-based auth (from plugin-radar-ui)
  sessions: defineTable({
    token: v.string(),
    userId: v.id("users"),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"])
    .index("by_expires", ["expiresAt"]),

  wishlists: defineTable({
    user: v.id("users"),
    plugin: v.id("plugins"),
    
    targetPrice: v.optional(v.number()), // alert when below this
    notes: v.optional(v.string()),
    
    addedAt: v.number(),
    notifiedAt: v.optional(v.number()), // last time we sent an alert
  })
    .index("by_user", ["user"])
    .index("by_plugin", ["plugin"])
    .index("by_user_plugin", ["user", "plugin"]),

  ownedPlugins: defineTable({
    user: v.id("users"),
    plugin: v.id("plugins"),
    
    purchasePrice: v.optional(v.number()),
    purchaseDate: v.optional(v.number()),
    purchaseStore: v.optional(v.id("stores")),
    
    // License (optional, encrypted in real app)
    licenseKey: v.optional(v.string()),
    
    addedAt: v.number(),
  })
    .index("by_user", ["user"])
    .index("by_plugin", ["plugin"])
    .index("by_user_plugin", ["user", "plugin"]),

  alerts: defineTable({
    user: v.id("users"),
    
    type: v.string(), // "price_drop", "new_release", "update", "any_sale"
    
    // What to watch (at least one should be set)
    plugin: v.optional(v.id("plugins")),
    manufacturer: v.optional(v.id("manufacturers")),
    category: v.optional(v.string()),
    
    // Conditions
    priceThreshold: v.optional(v.number()),
    
    // Status
    isActive: v.boolean(),
    lastTriggeredAt: v.optional(v.number()),
    
    createdAt: v.number(),
  })
    .index("by_user", ["user"])
    .index("by_plugin", ["plugin"])
    .index("by_manufacturer", ["manufacturer"])
    .index("by_active", ["isActive"]),

  // User notification history
  notifications: defineTable({
    user: v.id("users"),
    
    type: v.string(), // "price_drop", "new_release", "wishlist", "digest"
    title: v.string(),
    body: v.string(),
    
    // Related entities
    plugin: v.optional(v.id("plugins")),
    sale: v.optional(v.id("sales")),
    
    // Delivery
    channel: v.string(), // "email", "push", "in_app"
    sentAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_user", ["user"])
    .index("by_user_unread", ["user", "readAt"])
    .index("by_sent", ["sentAt"]),

  // ============================================
  // MENTIONS & TRENDING
  // ============================================

  pluginMentions: defineTable({
    plugin: v.id("plugins"),

    // Source info
    platform: v.string(),  // "youtube" | "reddit" | "tiktok" | "instagram" | "twitter"
    sourceUrl: v.string(),
    sourceId: v.string(),  // video ID, post ID, etc.

    // Content
    title: v.optional(v.string()),
    snippet: v.optional(v.string()),  // context around mention
    author: v.optional(v.string()),
    description: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),

    // Channel info (YouTube-specific)
    channelName: v.optional(v.string()),
    channelId: v.optional(v.string()),
    channelUrl: v.optional(v.string()),
    channelThumbnail: v.optional(v.string()),

    // Engagement signals (legacy fields)
    views: v.optional(v.number()),
    likes: v.optional(v.number()),
    comments: v.optional(v.number()),

    // Engagement signals (new normalized fields)
    viewCount: v.optional(v.number()),
    likeCount: v.optional(v.number()),
    commentCount: v.optional(v.number()),

    // Classification
    mentionType: v.optional(v.string()),
    sentiment: v.optional(v.string()),

    // Video metadata
    duration: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),

    // Timestamps
    publishedAt: v.number(),
    fetchedAt: v.number(),
    discoveredAt: v.optional(v.number()),

    // Status
    isVerified: v.optional(v.boolean()),
  })
    .index("by_plugin", ["plugin"])
    .index("by_plugin_platform", ["plugin", "platform"])
    .index("by_platform", ["platform"])
    .index("by_published", ["publishedAt"])
    .index("by_fetched", ["fetchedAt"])
    .index("by_source_id", ["sourceId"]),

  // ============================================
  // VIDEO CONTENT
  // ============================================

  pluginVideos: defineTable({
    plugin: v.id("plugins"),
    
    // Platform info
    platform: v.string(), // "youtube", "tiktok", "instagram"
    videoId: v.string(),
    videoUrl: v.string(),
    
    // Content metadata
    title: v.optional(v.string()),
    caption: v.optional(v.string()),
    thumbnail: v.string(),
    
    // Author info
    author: v.string(),
    authorHandle: v.string(),
    authorUrl: v.optional(v.string()),
    authorFollowers: v.optional(v.number()),
    
    // Engagement metrics
    duration: v.optional(v.number()), // seconds
    views: v.optional(v.number()),
    likes: v.optional(v.number()),
    comments: v.optional(v.number()),
    shares: v.optional(v.number()),
    
    // Timestamps
    publishedAt: v.optional(v.number()),
    fetchedAt: v.number(),
    
    // Quality scoring
    relevanceScore: v.number(), // 0-100, higher = better match
    isVerified: v.boolean(), // manually curated/approved
    isFeatured: v.boolean(), // show prominently
    
    // Status
    isActive: v.boolean(),
  })
    .index("by_plugin", ["plugin"])
    .index("by_plugin_platform", ["plugin", "platform"])
    .index("by_platform", ["platform"])
    .index("by_video_id", ["videoId"])
    .index("by_featured", ["isFeatured"])
    .index("by_fetched", ["fetchedAt"]),

  // ============================================
  // TIKTOK RAW DATA
  // ============================================

  tiktokPosts: defineTable({
    // Link to plugin (if matched)
    plugin: v.optional(v.id("plugins")),
    
    // TikTok identifiers
    videoId: v.string(),
    videoUrl: v.string(),
    
    // Search context
    searchKeyword: v.string(), // what keyword found this post
    
    // Content
    caption: v.string(),
    coverUrl: v.string(),
    
    // Author
    authorId: v.string(),
    authorUniqueId: v.string(), // @handle
    authorNickname: v.string(),
    authorAvatarUrl: v.optional(v.string()),
    authorFollowers: v.optional(v.number()),
    authorVerified: v.optional(v.boolean()),
    
    // Engagement stats
    playCount: v.number(),
    likeCount: v.number(),
    commentCount: v.number(),
    shareCount: v.number(),
    collectCount: v.optional(v.number()), // saves/bookmarks
    
    // Video metadata
    duration: v.number(), // seconds
    
    // Music
    musicId: v.optional(v.string()),
    musicTitle: v.optional(v.string()),
    musicAuthor: v.optional(v.string()),
    
    // Timestamps
    createTime: v.number(), // TikTok's timestamp
    fetchedAt: v.number(),
    
    // Processing status
    isProcessed: v.boolean(), // linked to pluginVideos?
    isRelevant: v.optional(v.boolean()), // manually marked as relevant/not
  })
    .index("by_video_id", ["videoId"])
    .index("by_plugin", ["plugin"])
    .index("by_keyword", ["searchKeyword"])
    .index("by_fetched", ["fetchedAt"])
    .index("by_plays", ["playCount"])
    .index("by_processed", ["isProcessed"]),

  // ============================================
  // STRUCTURED PARAMETERS (effects only — synth fields removed)
  // ============================================

  pluginParameters: defineTable({
    plugin: v.id("plugins"),
    
    // Core specs
    channels: v.optional(v.string()),        // "mono", "stereo", "mono-to-stereo", "surround"
    latency: v.optional(v.number()),         // samples
    oversampling: v.optional(v.array(v.string())), // ["Off", "2x", "4x", "8x"]
    sampleRates: v.optional(v.array(v.number())),  // [44100, 48000, 96000, 192000]
    
    // Inputs/Outputs  
    hasSidechain: v.optional(v.boolean()),
    sidechainFilters: v.optional(v.array(v.string())), // ["HPF", "LPF", "BPF"]
    hasMidSide: v.optional(v.boolean()),
    hasExternalInput: v.optional(v.boolean()),
    
    // UI/UX
    hasResizableUI: v.optional(v.boolean()),
    uiSizes: v.optional(v.array(v.string())),  // ["50%", "100%", "150%", "200%"]
    hasPresetBrowser: v.optional(v.boolean()),
    presetCount: v.optional(v.number()),
    
    // Processing modes
    processingModes: v.optional(v.array(v.string())), // ["Digital", "Vintage", "Modern", "Smooth"]
    hasAutoGain: v.optional(v.boolean()),
    hasDryWetMix: v.optional(v.boolean()),
    
    // EQ-specific
    bandCount: v.optional(v.number()),
    filterTypes: v.optional(v.array(v.string())), // ["Bell", "Shelf", "HPF", "LPF", "Notch"]
    hasLinearPhase: v.optional(v.boolean()),
    hasDynamicEQ: v.optional(v.boolean()),
    
    // Compressor-specific
    compressionTypes: v.optional(v.array(v.string())), // ["VCA", "FET", "Opto", "Variable-Mu"]
    hasParallelMix: v.optional(v.boolean()),
    hasLookahead: v.optional(v.boolean()),
    attackRange: v.optional(v.object({ min: v.number(), max: v.number() })),
    releaseRange: v.optional(v.object({ min: v.number(), max: v.number() })),
    ratioRange: v.optional(v.object({ min: v.number(), max: v.number() })),
    
    // Reverb-specific
    reverbTypes: v.optional(v.array(v.string())), // ["Hall", "Plate", "Room", "Chamber", "Spring", "Convolution"]
    hasModulation: v.optional(v.boolean()),
    hasPreDelay: v.optional(v.boolean()),
    hasEarlyReflections: v.optional(v.boolean()),
    irCount: v.optional(v.number()),  // for convolution reverbs
    
    // Delay-specific
    delayModes: v.optional(v.array(v.string())), // ["Mono", "Stereo", "Ping-Pong", "Dual"]
    hasTapTempo: v.optional(v.boolean()),
    hasSyncToHost: v.optional(v.boolean()),
    maxDelayTime: v.optional(v.number()), // ms
    
    // Extraction metadata
    extractedAt: v.number(),
    extractionSource: v.string(),  // "manual", "ai-docs", "ai-video"
    confidence: v.number(),        // 0-100
    verifiedBy: v.optional(v.id("users")),
    verifiedAt: v.optional(v.number()),
  })
    .index("by_plugin", ["plugin"])
    .index("by_sidechain", ["hasSidechain"])
    .index("by_midside", ["hasMidSide"])
    .index("by_confidence", ["confidence"]),

  // Plugin features (free-form, for discovery)
  pluginFeatures: defineTable({
    plugin: v.id("plugins"),
    
    feature: v.string(),           // "Vintage Console Emulation"
    category: v.string(),          // "sound-character", "workflow", "compatibility"
    description: v.optional(v.string()),
    
    // Voting (community can upvote/downvote accuracy)
    upvotes: v.number(),
    downvotes: v.number(),
    
    addedBy: v.optional(v.id("users")),
    addedAt: v.number(),
    verifiedAt: v.optional(v.number()),
  })
    .index("by_plugin", ["plugin"])
    .index("by_feature", ["feature"])
    .index("by_category", ["category"]),

  // ============================================
  // COMMUNITY WIKI SYSTEM
  // ============================================

  wikiEdits: defineTable({
    plugin: v.id("plugins"),
    
    section: v.string(),           // "tips", "settings", "alternatives", "workflow", "compatibility"
    content: v.string(),           // Markdown content
    
    version: v.number(),
    parentVersion: v.optional(v.number()),
    
    author: v.id("users"),
    editSummary: v.optional(v.string()),
    
    status: v.string(),            // "pending", "approved", "rejected", "superseded"
    moderatedBy: v.optional(v.id("users")),
    moderatedAt: v.optional(v.number()),
    moderationNote: v.optional(v.string()),
    
    createdAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index("by_plugin", ["plugin"])
    .index("by_plugin_section", ["plugin", "section"])
    .index("by_status", ["status"])
    .index("by_author", ["author"])
    .index("by_created", ["createdAt"]),

  wikiVotes: defineTable({
    edit: v.id("wikiEdits"),
    user: v.id("users"),
    vote: v.number(),
    createdAt: v.number(),
  })
    .index("by_edit", ["edit"])
    .index("by_user_edit", ["user", "edit"]),

  userReputation: defineTable({
    user: v.id("users"),
    
    totalPoints: v.number(),
    editPoints: v.number(),
    votePoints: v.number(),
    helpfulPoints: v.number(),
    
    level: v.number(),
    title: v.string(),
    
    badges: v.array(v.object({
      id: v.string(),
      name: v.string(),
      awardedAt: v.number(),
    })),
    
    totalEdits: v.number(),
    approvedEdits: v.number(),
    totalVotes: v.number(),
    
    updatedAt: v.number(),
  })
    .index("by_user", ["user"])
    .index("by_points", ["totalPoints"])
    .index("by_level", ["level"]),

  // ============================================
  // COMPARISONS (stored)
  // ============================================

  comparisons: defineTable({
    slug: v.string(),
    
    pluginA: v.id("plugins"),
    pluginB: v.id("plugins"),
    
    title: v.string(),
    metaDescription: v.string(),
    
    category: v.string(),
    priceWinner: v.optional(v.string()),
    trendingWinner: v.optional(v.string()),
    
    summary: v.optional(v.string()),
    pros: v.optional(v.object({
      a: v.array(v.string()),
      b: v.array(v.string()),
    })),
    cons: v.optional(v.object({
      a: v.array(v.string()),
      b: v.array(v.string()),
    })),
    
    faqs: v.optional(v.array(v.object({
      question: v.string(),
      answer: v.string(),
    }))),
    
    views: v.number(),
    
    generatedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_plugin_a", ["pluginA"])
    .index("by_plugin_b", ["pluginB"])
    .index("by_category", ["category"])
    .index("by_views", ["views"]),

  // ============================================
  // GLOSSARY TERMS
  // ============================================

  glossaryTerms: defineTable({
    slug: v.string(),
    term: v.string(),
    
    definition: v.string(),
    extendedDescription: v.optional(v.string()),
    
    relatedTerms: v.array(v.string()),
    relatedCategories: v.array(v.string()),
    
    metaDescription: v.optional(v.string()),
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_term", ["term"])
    .searchIndex("search_term", { searchField: "term" }),

  // ============================================
  // ADMIN: ENRICHMENT JOBS
  // ============================================

  enrichmentJobs: defineTable({
    plugin: v.id("plugins"),
    pluginSlug: v.string(),
    pluginName: v.string(),
    
    status: v.string(),
    priority: v.string(),
    
    requestedBy: v.optional(v.id("users")),
    requestedAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    
    result: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_plugin", ["plugin"])
    .index("by_requested", ["requestedAt"]),

  // ============================================
  // PLUGIN DIRECTORY INTEGRATION
  // ============================================

  // Raw scanned plugins from user's DAW
  scannedPlugins: defineTable({
    user: v.optional(v.id("users")),
    userId: v.optional(v.string()), // Legacy field
    
    // From JUCE plugin scan
    name: v.string(),
    manufacturer: v.string(),
    format: v.string(),              // "VST3", "AU", "AAX", "CLAP"
    uid: v.number(),                 // JUCE unique identifier
    fileOrIdentifier: v.string(),    // File path or plugin identifier
    isInstrument: v.boolean(),
    numInputChannels: v.number(),
    numOutputChannels: v.number(),
    version: v.optional(v.string()),
    
    // Matching to PluginRadar database
    matchedPlugin: v.optional(v.id("plugins")),
    matchConfidence: v.optional(v.number()),  // 0-100
    matchMethod: v.optional(v.string()),      // "exact", "normalized", "fuzzy", "uid", "manual"
    
    // Timestamps
    firstSeenAt: v.optional(v.number()),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_user", ["user"])
    .index("by_user_uid", ["user", "uid"])
    .index("by_user_name_manufacturer", ["user", "name", "manufacturer"])
    .index("by_matched_plugin", ["matchedPlugin"])
    .index("by_unmatched", ["user", "matchedPlugin"]),

  // Plugin chains created/saved by users
  pluginChains: defineTable({
    user: v.id("users"),
    
    // Metadata
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    category: v.string(),            // "vocal", "drums", "mastering", "mixing", "creative", "live"
    tags: v.array(v.string()),       // ["warm", "punchy", "vintage", "modern", "subtle"]
    
    // Genre/use case
    genre: v.optional(v.string()),   // "hip-hop", "rock", "edm", "acoustic", "orchestral"
    useCase: v.optional(v.string()), // "lead-vocal", "drum-bus", "master", "bass-guitar"
    
    // The actual chain
    slots: v.array(v.object({
      position: v.number(),
      pluginName: v.string(),
      manufacturer: v.string(),
      format: v.optional(v.string()),
      uid: v.optional(v.number()),
      version: v.optional(v.string()),       // Plugin version when saved
      
      // Link to PluginRadar (if matched)
      matchedPlugin: v.optional(v.id("plugins")),
      
      // Preset info
      presetName: v.optional(v.string()),
      presetData: v.optional(v.string()),    // Base64 encoded preset blob
      presetSizeBytes: v.optional(v.number()), // Size for UI display
      
      // Settings
      bypassed: v.boolean(),
      notes: v.optional(v.string()),         // User notes for this slot
    })),
    
    // Total plugins required
    pluginCount: v.number(),
    
    // Engagement stats
    views: v.number(),
    downloads: v.number(),
    likes: v.number(),
    
    // Sharing settings
    isPublic: v.boolean(),
    shareCode: v.optional(v.string()),     // Short code for private sharing: "ABC123"
    
    // Forking
    forkedFrom: v.optional(v.id("pluginChains")),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["user"])
    .index("by_slug", ["slug"])
    .index("by_category", ["category"])
    .index("by_public", ["isPublic"])
    .index("by_downloads", ["downloads"])
    .index("by_likes", ["likes"])
    .index("by_share_code", ["shareCode"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["category", "isPublic"]
    }),

  // Likes/saves on chains
  chainLikes: defineTable({
    chain: v.id("pluginChains"),
    user: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_chain", ["chain"])
    .index("by_user", ["user"])
    .index("by_user_chain", ["user", "chain"]),

  // Chain downloads — keep BOTH legacy and new field patterns (all optional)
  chainDownloads: defineTable({
    chain: v.optional(v.id("pluginChains")),
    user: v.optional(v.id("users")),
    
    // Legacy fields (old data uses chainId/userId instead of chain/user)
    chainId: v.optional(v.string()),
    userId: v.optional(v.string()),
    
    // What plugins did they have at download time?
    ownedPluginCount: v.optional(v.number()),
    missingPluginCount: v.optional(v.number()),
    
    createdAt: v.optional(v.number()),
  })
    .index("by_chain", ["chain"])
    .index("by_user", ["user"]),

  // ============================================
  // SOCIAL FEATURES (from plugin-radar-ui)
  // ============================================

  // Comments on plugin chains
  chainComments: defineTable({
    chainId: v.id("pluginChains"),
    userId: v.id("users"),
    authorName: v.string(),
    content: v.string(),
    createdAt: v.float64(),
    parentCommentId: v.optional(v.id("chainComments")),
  })
    .index("by_chain", ["chainId"]),

  // Ratings on plugin chains (1-5 stars)
  chainRatings: defineTable({
    chainId: v.id("pluginChains"),
    userId: v.id("users"),
    rating: v.number(),
    createdAt: v.float64(),
  })
    .index("by_chain_user", ["chainId", "userId"]),

  // User follows
  userFollows: defineTable({
    followerId: v.id("users"),
    followedId: v.id("users"),
    createdAt: v.float64(),
  })
    .index("by_follower", ["followerId"])
    .index("by_followed", ["followedId"])
    .index("by_follower_followed", ["followerId", "followedId"]),

  // Chain forks tracking
  chainForks: defineTable({
    originalChainId: v.id("pluginChains"),
    forkedChainId: v.id("pluginChains"),
    userId: v.id("users"),
    createdAt: v.float64(),
  })
    .index("by_original", ["originalChainId"])
    .index("by_forked", ["forkedChainId"]),

  // ============================================
  // RATE LIMITING
  // ============================================

  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
  })
    .index("by_key", ["key"]),
});
