# Community & Account Features Plan

## Context

The JUCE plugin already has social features built into its frontend (ChainDetailModal, CommentSection, StarRating, fork/follow UI), but they're currently stubbed because the backend functions don't exist yet on the deployed Convex backend. This plan adds those backend functions and builds the corresponding web app pages.

The web app schema already has tables for `wikiEdits`, `wikiVotes`, `userReputation`, and `pluginFeatures` — but no backend functions or UI for them. This plan activates those tables too.

---

## Phase 1: Social Backend Functions

### 1A. Create `convex/social.ts` — Chain Social Features

Add these functions (matching what the plugin expects):

**Comments (uses existing `chainComments` schema — needs to be added):**
```
addComment(sessionToken, chainId, content, parentCommentId?) → commentId
getComments(chainId) → Comment[] with author info, threaded
deleteComment(sessionToken, commentId) → void
```

**Ratings (uses existing `chainRatings` schema — needs to be added):**
```
rateChain(sessionToken, chainId, rating: 1-5) → void (upsert)
getChainRating(chainId) → { average, count, userRating }
```

**Following (uses existing `userFollows` schema — needs to be added):**
```
followUser(sessionToken, userId) → void
unfollowUser(sessionToken, userId) → void
isFollowing(sessionToken, userId) → boolean
getFollowers(userId) → User[]
getFollowing(userId) → User[]
```

**Forking:**
```
forkChain(sessionToken, chainId, newName) → { chainId, slug, shareCode }
```

### 1B. Schema Additions — `convex/schema.ts`

Add these tables (some already exist in the plugin's schema but not the web app's):

```typescript
chainComments: defineTable({
  chainId: v.id("pluginChains"),
  userId: v.id("users"),
  authorName: v.string(),
  content: v.string(),
  createdAt: v.float64(),
  parentCommentId: v.optional(v.id("chainComments")),
})
  .index("by_chain", ["chainId"])

chainRatings: defineTable({
  chainId: v.id("pluginChains"),
  userId: v.id("users"),
  rating: v.number(),
  createdAt: v.float64(),
})
  .index("by_chain_user", ["chainId", "userId"])

userFollows: defineTable({
  followerId: v.id("users"),
  followedId: v.id("users"),
  createdAt: v.float64(),
})
  .index("by_follower", ["followerId"])
  .index("by_followed", ["followedId"])
  .index("by_follower_followed", ["followerId", "followedId"])

chainForks: defineTable({
  originalChainId: v.id("pluginChains"),
  forkedChainId: v.id("pluginChains"),
  userId: v.id("users"),
  createdAt: v.float64(),
})
  .index("by_original", ["originalChainId"])
  .index("by_forked", ["forkedChainId"])
```

Also add to `pluginChains`:
```typescript
forkedFrom: v.optional(v.id("pluginChains")),
```

### 1C. Enhance `convex/pluginDirectory.ts`

- Add `getCompatibilityScore(chainId, userId)` — returns missing plugins with suggestions from owned alternatives
- Add `browseChains` sort by `"rating"` using `chainRatings` averages
- Add `getChainsByUser(userId)` — for profile pages
- Add `getUserStats(userId)` — chain count, total likes, total downloads, follower count

### 1D. Auth helper

Create `convex/lib/auth.ts` with shared `getSessionUser(ctx, sessionToken)` helper that all social mutations use (avoids duplicating session verification logic).

---

## Phase 2: User Profile Pages

### 2A. `/profile/[userId]/page.tsx` — Public User Profile

**Layout:**
- Avatar + name + member since + tier badge
- Stats bar: chains shared | total downloads | total likes | followers
- Follow/Unfollow button (if logged in & not own profile)

**Tabs:**
- **Chains** — Grid of user's public chains with ratings, downloads, likes
- **Collection** — User's owned plugins (count + top categories breakdown)
- **Following** — List of users they follow
- **Activity** — Recent actions (shared chain, rated chain, commented)

### 2B. `/account/page.tsx` — Enhance existing account page

Add:
- Edit profile (name, avatar upload via Convex storage)
- "My Chains" section with edit/delete/toggle visibility
- "My Comments" section
- Notification preferences for social events (new follower, comment on chain, chain forked)

---

## Phase 3: Chain Detail Social Features

### 3A. Enhance `/chains/[slug]/page.tsx`

Add below existing chain content:

**Rating Section:**
- Interactive 5-star rating (logged in users)
- Average rating display with count
- "Your rating: X" badge if rated

**Comments Section:**
- Threaded comments (max 2 levels deep)
- Add comment form (logged in only)
- Reply button on each comment
- Delete own comments
- Relative timestamps ("5m ago", "2h ago", "3d ago")

**Social Actions Bar:**
- Like button with count (already exists — enhance with logged-in state)
- Fork button → prompts for new name → creates fork with attribution
- Share button → copy share code / URL
- Follow author button

**Fork Badge:**
- If chain was forked, show "Forked from [original chain]" with link

### 3B. Create shared components in `/components/social/`

- `StarRating.tsx` — Interactive 1-5 stars, sm/md sizes
- `CommentSection.tsx` — Threaded comment list + add form
- `FollowButton.tsx` — Follow/Unfollow with optimistic UI
- `ForkButton.tsx` — Fork with name prompt dialog
- `UserAvatar.tsx` — Avatar with fallback initials

---

## Phase 4: Plugin Reviews & Wiki

### 4A. Plugin Reviews on `/plugins/[slug]/page.tsx`

Add a "Reviews" tab/section to plugin detail pages:

**New schema:**
```typescript
pluginReviews: defineTable({
  plugin: v.id("plugins"),
  userId: v.id("users"),
  rating: v.number(),        // 1-5
  title: v.string(),
  content: v.string(),
  pros: v.array(v.string()),
  cons: v.array(v.string()),
  useCases: v.array(v.string()),
  experienceLevel: v.string(), // "beginner", "intermediate", "advanced"
  createdAt: v.float64(),
  updatedAt: v.float64(),
  helpfulCount: v.number(),
})
  .index("by_plugin", ["plugin"])
  .index("by_user_plugin", ["userId", "plugin"])
```

**Backend:** `convex/reviews.ts`
- `addReview(sessionToken, pluginId, { rating, title, content, pros, cons })` — one per user per plugin
- `getReviews(pluginId, sortBy?)` — paginated, with author info
- `markHelpful(sessionToken, reviewId)` — helpful vote
- `getPluginRatingSummary(pluginId)` — average, count, distribution (1-5)

**UI:**
- Rating summary bar (like Amazon: 5-star distribution)
- Review cards with author avatar, rating, pros/cons chips
- "Write a review" form for owned plugins
- Sort: Most Helpful / Recent / Highest / Lowest

### 4B. Activate Wiki System

The `wikiEdits` and `wikiVotes` tables already exist in schema. Add:

**Backend:** `convex/wiki.ts`
- `getWikiContent(pluginId, section)` — latest approved version
- `submitEdit(sessionToken, pluginId, section, content, editSummary)`
- `getEditHistory(pluginId, section)` — version list
- `moderateEdit(sessionToken, editId, approve/reject, note)` — admin only
- `voteOnEdit(sessionToken, editId, helpful/not)` — community quality signal

**UI:** Add "Community Tips" section to plugin detail pages
- Sections: Tips & Tricks, Best Settings, Alternatives, Workflow, Compatibility
- "Edit" button per section → markdown editor
- Edit history with diffs
- Moderation queue for admins

---

## Phase 5: Activity Feed & Notifications

### 5A. `/feed/page.tsx` — Social Activity Feed

Show activity from followed users:
- "[User] shared a new chain: [Chain Name]"
- "[User] rated [Plugin] 5 stars"
- "[User] reviewed [Plugin]"
- "[User] forked [Chain]"

**Backend:** `convex/feed.ts`
- `getFeed(sessionToken, cursor?, limit?)` — paginated feed of followed users' activity
- Activity stored in existing `notifications` table or new `activityEvents` table

### 5B. In-App Notifications

**Backend additions to existing `notifications` table:**
- "Someone commented on your chain"
- "Someone rated your chain"
- "You have a new follower"
- "Your chain was forked"
- "[Followed user] shared a new chain"

**UI:** Bell icon in Navigation with:
- Unread count badge
- Dropdown with recent notifications
- Mark as read on click
- "View all" link to dedicated page

### 5C. `/notifications/page.tsx`

- Full notification history
- Filter by type (comments, ratings, followers, forks, system)
- Mark all as read
- Notification preferences link

---

## Phase 6: Reputation & Gamification

### 6A. Activate `userReputation` table

**Backend:** `convex/reputation.ts`
- Award points for: sharing chains (+10), getting likes (+2), comments (+1), reviews (+5), wiki edits (+3), approved edits (+5)
- Level thresholds: 0-49 Newcomer, 50-199 Contributor, 200-499 Enthusiast, 500-999 Expert, 1000+ Master
- Badges: "First Chain", "10 Likes", "Plugin Reviewer", "Wiki Editor", "Popular Chain (100+ downloads)"

**UI additions:**
- Level badge on user avatar/profile
- Points breakdown on profile page
- Badge showcase on profile
- Leaderboard page (`/leaderboard`)

---

## Implementation Order

| Order | Task | Effort | Dependencies |
|-------|------|--------|--------------|
| 1 | Schema additions (comments, ratings, follows, forks) | Small | None |
| 2 | `convex/social.ts` — comments, ratings, follows, forks | Medium | Schema |
| 3 | Auth helper (`convex/lib/auth.ts`) | Small | None |
| 4 | Chain detail social UI (ratings, comments, fork, follow) | Medium | social.ts |
| 5 | Shared social components (StarRating, CommentSection, etc.) | Medium | None |
| 6 | User profile page (`/profile/[userId]`) | Medium | social.ts |
| 7 | Plugin reviews backend + UI | Large | Schema |
| 8 | Activity feed backend + UI | Medium | social.ts |
| 9 | Notifications (bell icon + page) | Medium | Feed |
| 10 | Wiki activation (backend + plugin detail UI) | Large | Schema |
| 11 | Reputation system | Medium | All social actions |
| 12 | Update plugin `convex-client.ts` to call real social functions | Small | social.ts deployed |

---

## After Deployment

Once `social.ts` and the new schema are deployed to `next-frog-231`:

1. **Update plugin `convex-client.ts`** — replace stubs with real `anyApi.social.*` calls
2. **Rebuild plugin AU** — `cd ui && npm run build && cd ../build && zip -r ../resources/ui.zip -j ../ui/dist/index.html && cmake --build . --target PluginChainManager_AU`
3. **Both web app and plugin share the same social features** — comments, ratings, and follows work across both interfaces
