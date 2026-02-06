# Plugin Directory - Build Plan

## Overview

Transform the plugin manager into a connected, intelligent plugin browser with cloud sync, community chain sharing, and enriched plugin metadata from PluginRadar.

---

## Phase 1: Cloud Integration UI

### 1.1 Mount CloudSync Component

**File:** `ui/src/App.tsx`

```tsx
import { CloudSync } from './components/CloudSync';

// In the component, add to header area:
<div className="flex items-center justify-between p-2 border-b border-plugin-border">
  <h1 className="text-white font-bold">Plugin Directory</h1>
  <CloudSync />
</div>
```

### 1.2 Add Cloud Buttons to Footer

**File:** `ui/src/components/Footer/Footer.tsx`

Add two new buttons:
- **"Save to Cloud"** → Opens `SaveChainModal`
- **"Browse Chains"** → Opens `LoadChainModal`

```tsx
import { useState } from 'react';
import { SaveChainModal, LoadChainModal } from '../CloudSync';
import { useChainStore } from '../../stores/chainStore';
import { useSyncStore } from '../../stores/syncStore';

// In Footer component:
const { slots } = useChainStore();
const { isLoggedIn } = useSyncStore();
const [showSaveModal, setShowSaveModal] = useState(false);
const [showLoadModal, setShowLoadModal] = useState(false);

// Add buttons:
<button 
  onClick={() => setShowSaveModal(true)}
  disabled={!isLoggedIn || slots.length === 0}
  className="px-3 py-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-sm"
>
  ☁️ Save to Cloud
</button>

<button 
  onClick={() => setShowLoadModal(true)}
  className="px-3 py-1 bg-plugin-surface hover:bg-plugin-hover border border-plugin-border rounded text-sm"
>
  🌐 Browse Chains
</button>

// Render modals:
{showSaveModal && <SaveChainModal slots={slots} onClose={() => setShowSaveModal(false)} />}
{showLoadModal && <LoadChainModal onClose={() => setShowLoadModal(false)} onLoad={handleLoadChain} />}
```

### 1.3 Initialize Sync Store

**File:** `ui/src/App.tsx`

```tsx
import { useEffect } from 'react';
import { useSyncStore } from './stores/syncStore';

function App() {
  const { initialize } = useSyncStore();
  
  useEffect(() => {
    initialize(); // Check for existing login
  }, []);
  
  // ... rest of app
}
```

### 1.4 Rebuild JUCE Plugin

```bash
cd ~/clawd/projects/plugin-directory
mkdir -p build && cd build
cmake ..
cmake --build . --config Release
```

---

## Phase 2: Enhanced Plugin Browser

### 2.1 New Data Model - Local Usage Tracking

**File:** `ui/src/stores/usageStore.ts` (NEW)

Track local plugin usage:

```typescript
interface PluginUsage {
  uid: number;
  name: string;
  manufacturer: string;
  
  // Usage stats
  loadCount: number;           // Times added to chain
  totalSessionTime: number;    // Seconds plugin was in chain
  lastUsedAt: number;          // Timestamp
  firstUsedAt: number;         // Timestamp
  
  // "Works well with" - other plugins loaded in same chain
  coUsage: Record<number, number>;  // uid -> count
}

interface UsageState {
  plugins: Record<number, PluginUsage>;  // keyed by uid
}
```

**Persistence:** Use `localStorage` for offline-first:
```typescript
const STORAGE_KEY = 'plugin_usage_stats';

// Load on init
const stored = localStorage.getItem(STORAGE_KEY);
if (stored) setState(JSON.parse(stored));

// Save on change
useEffect(() => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.plugins));
}, [state.plugins]);
```

### 2.2 Track Plugin Usage Events

**File:** `ui/src/stores/chainStore.ts`

When plugin is added to chain:
```typescript
import { useUsageStore } from './usageStore';

// In addPlugin success handler:
const { recordPluginLoad, recordCoUsage } = useUsageStore.getState();

// Record this plugin was loaded
recordPluginLoad(newPlugin.uid, newPlugin.name, newPlugin.manufacturer);

// Record co-usage with existing plugins in chain
slots.forEach(existingSlot => {
  recordCoUsage(newPlugin.uid, existingSlot.uid);
  recordCoUsage(existingSlot.uid, newPlugin.uid);
});
```

### 2.3 Enriched Plugin Data from Convex

**File:** `ui/src/api/convex-client.ts`

Add new query:
```typescript
/**
 * Get enriched plugin data from PluginRadar
 * Returns category, tags, popularity, trending score
 */
export async function getPluginEnrichment(
  plugins: Array<{ name: string; manufacturer: string }>
): Promise<Record<string, {
  category: string;
  subcategory?: string;
  tags: string[];
  mentionScore?: number;
  isFree: boolean;
  imageUrl?: string;
}>> {
  // Batch query to Convex
  return await convex.query("pluginDirectory:batchGetPluginInfo" as any, { plugins });
}
```

**File:** `convex/pluginDirectory.ts` (Backend)

Add new query:
```typescript
export const batchGetPluginInfo = query({
  args: {
    plugins: v.array(v.object({
      name: v.string(),
      manufacturer: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const results: Record<string, any> = {};
    
    for (const p of args.plugins) {
      const match = await matchPlugin(ctx, p.name, p.manufacturer);
      if (match?.pluginId) {
        const plugin = await ctx.db.get(match.pluginId);
        if (plugin) {
          const key = `${p.name}|${p.manufacturer}`;
          results[key] = {
            category: plugin.category,
            subcategory: plugin.subcategory,
            tags: plugin.tags,
            mentionScore: plugin.mentionScore,
            isFree: plugin.isFree,
            imageUrl: plugin.imageUrl,
          };
        }
      }
    }
    
    return results;
  },
});
```

### 2.4 Enhanced Plugin Store

**File:** `ui/src/stores/pluginStore.ts`

Extend state:
```typescript
interface EnrichedPlugin extends PluginDescription {
  // Local usage
  loadCount: number;
  lastUsedAt?: number;
  worksWellWith: Array<{ name: string; count: number }>;
  
  // From Convex (PluginRadar)
  category?: string;
  subcategory?: string;
  tags?: string[];
  popularity?: number;  // mentionScore
  isFree?: boolean;
  imageUrl?: string;
  
  // Computed
  enrichmentStatus: 'pending' | 'loaded' | 'not-found';
}
```

### 2.5 Filter & Sort System

**File:** `ui/src/stores/pluginStore.ts`

```typescript
interface FilterState {
  // Text search
  searchQuery: string;
  
  // Format filter
  format: string | null;  // "VST3" | "AU" | "AAX" | null
  
  // Category filter (from Convex)
  category: string | null;  // "eq" | "compressor" | "reverb" | etc
  
  // Type filter
  type: 'all' | 'instruments' | 'effects';
  
  // Tags (multi-select)
  tags: string[];  // ["vintage", "free", "analog-modeling"]
  
  // Sort
  sortBy: 'name' | 'manufacturer' | 'most-used' | 'recent' | 'popularity';
  sortOrder: 'asc' | 'desc';
}

// Sort implementations:
const sortFunctions = {
  'name': (a, b) => a.name.localeCompare(b.name),
  'manufacturer': (a, b) => a.manufacturer.localeCompare(b.manufacturer),
  'most-used': (a, b) => (b.loadCount || 0) - (a.loadCount || 0),
  'recent': (a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0),
  'popularity': (a, b) => (b.popularity || 0) - (a.popularity || 0),
};
```

### 2.6 Filter UI Component

**File:** `ui/src/components/PluginBrowser/PluginFilters.tsx` (NEW)

```tsx
interface PluginFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  availableCategories: string[];
  availableTags: string[];
}

export function PluginFilters({ filters, onFilterChange, ... }) {
  return (
    <div className="flex flex-wrap gap-2 p-2 bg-plugin-surface rounded-lg">
      {/* Search */}
      <input 
        type="text"
        placeholder="Search plugins..."
        value={filters.searchQuery}
        onChange={e => onFilterChange({ searchQuery: e.target.value })}
        className="..."
      />
      
      {/* Format dropdown */}
      <select value={filters.format || ''} onChange={...}>
        <option value="">All Formats</option>
        <option value="VST3">VST3</option>
        <option value="AU">Audio Unit</option>
        <option value="AAX">AAX</option>
      </select>
      
      {/* Category dropdown */}
      <select value={filters.category || ''} onChange={...}>
        <option value="">All Categories</option>
        <option value="eq">🎚️ EQ</option>
        <option value="compressor">🔊 Compressor</option>
        <option value="reverb">🌊 Reverb</option>
        <option value="delay">⏱️ Delay</option>
        <option value="saturation">🔥 Saturation</option>
        <option value="synth">🎹 Synth</option>
        {/* ... */}
      </select>
      
      {/* Type toggle */}
      <div className="flex rounded overflow-hidden">
        <button className={filters.type === 'all' ? 'active' : ''}>All</button>
        <button className={filters.type === 'effects' ? 'active' : ''}>Effects</button>
        <button className={filters.type === 'instruments' ? 'active' : ''}>Instruments</button>
      </div>
      
      {/* Sort dropdown */}
      <select value={filters.sortBy} onChange={...}>
        <option value="name">Name A-Z</option>
        <option value="manufacturer">Manufacturer</option>
        <option value="most-used">Most Used</option>
        <option value="recent">Recently Used</option>
        <option value="popularity">Trending</option>
      </select>
      
      {/* Tag chips */}
      <div className="flex flex-wrap gap-1">
        {availableTags.map(tag => (
          <button
            key={tag}
            onClick={() => toggleTag(tag)}
            className={filters.tags.includes(tag) ? 'bg-purple-600' : 'bg-plugin-surface'}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### 2.7 "Works Well With" Display

**File:** `ui/src/components/PluginBrowser/PluginItem.tsx`

When hovering/selecting a plugin, show co-usage data:

```tsx
{plugin.worksWellWith.length > 0 && (
  <div className="mt-2 text-xs text-gray-400">
    <span className="text-gray-500">Works well with:</span>
    <div className="flex flex-wrap gap-1 mt-1">
      {plugin.worksWellWith.slice(0, 5).map(p => (
        <span key={p.name} className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded">
          {p.name} ({p.count}×)
        </span>
      ))}
    </div>
  </div>
)}
```

---

## Phase 3: Sync Enrichment on Login

### 3.1 Auto-Enrich After Sync

**File:** `ui/src/stores/syncStore.ts`

After successful plugin sync, fetch enrichment:

```typescript
syncPlugins: async (plugins) => {
  // ... existing sync code ...
  
  // After sync, fetch enrichment data
  const enrichment = await convexClient.getPluginEnrichment(
    plugins.map(p => ({ name: p.name, manufacturer: p.manufacturer }))
  );
  
  // Update plugin store with enrichment
  usePluginStore.getState().applyEnrichment(enrichment);
}
```

### 3.2 Cache Enrichment Locally

Store enrichment in localStorage to avoid re-fetching:

```typescript
const ENRICHMENT_KEY = 'plugin_enrichment_cache';
const ENRICHMENT_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCachedEnrichment() {
  const cached = localStorage.getItem(ENRICHMENT_KEY);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < ENRICHMENT_TTL) {
      return data;
    }
  }
  return null;
}
```

---

## Phase 4: Plugin Detail View

### 4.1 Expanded Plugin Card

When user clicks a plugin, show detailed view:

**File:** `ui/src/components/PluginBrowser/PluginDetail.tsx` (NEW)

```tsx
interface PluginDetailProps {
  plugin: EnrichedPlugin;
  onClose: () => void;
  onAddToChain: () => void;
}

export function PluginDetail({ plugin, onClose, onAddToChain }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-plugin-surface rounded-lg p-6 max-w-lg w-full">
        {/* Header with image */}
        <div className="flex gap-4">
          {plugin.imageUrl && (
            <img src={plugin.imageUrl} className="w-24 h-24 rounded object-cover" />
          )}
          <div>
            <h2 className="text-xl font-bold text-white">{plugin.name}</h2>
            <p className="text-gray-400">{plugin.manufacturer}</p>
            <div className="flex gap-2 mt-2">
              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs">
                {plugin.format}
              </span>
              {plugin.category && (
                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs">
                  {plugin.category}
                </span>
              )}
              {plugin.isFree && (
                <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded text-xs">
                  FREE
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-4 text-center">
          <div>
            <div className="text-2xl font-bold text-white">{plugin.loadCount || 0}</div>
            <div className="text-xs text-gray-400">Times Used</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">
              {plugin.worksWellWith?.length || 0}
            </div>
            <div className="text-xs text-gray-400">Pairings</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">
              {plugin.popularity ? `#${plugin.popularity}` : '—'}
            </div>
            <div className="text-xs text-gray-400">Trending</div>
          </div>
        </div>
        
        {/* Tags */}
        {plugin.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-4">
            {plugin.tags.map(tag => (
              <span key={tag} className="px-2 py-1 bg-plugin-hover rounded text-xs text-gray-300">
                #{tag}
              </span>
            ))}
          </div>
        )}
        
        {/* Works well with */}
        {plugin.worksWellWith?.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-400 mb-2">Works Well With</h3>
            <div className="space-y-1">
              {plugin.worksWellWith.slice(0, 5).map(p => (
                <div key={p.name} className="flex justify-between text-sm">
                  <span className="text-white">{p.name}</span>
                  <span className="text-gray-400">{p.count} chains</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-plugin-border ...">
            Close
          </button>
          <button onClick={onAddToChain} className="flex-1 bg-purple-600 ...">
            Add to Chain
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S MACHINE                           │
├─────────────────────────────────────────────────────────────────┤
│  JUCE Plugin Scan                                               │
│       ↓                                                         │
│  pluginStore (PluginDescription[])                              │
│       ↓                                                         │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐    │
│  │ usageStore  │    │ syncStore    │    │ enrichmentCache │    │
│  │ (localStorage)│   │ (Convex auth)│    │ (localStorage)  │    │
│  │             │    │              │    │                 │    │
│  │ - loadCount │    │ - userId     │    │ - categories    │    │
│  │ - coUsage   │    │ - lastSync   │    │ - tags          │    │
│  │ - lastUsed  │    │              │    │ - popularity    │    │
│  └─────────────┘    └──────────────┘    └─────────────────┘    │
│       ↓                   ↓                    ↓                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              pluginStore.enrichedPlugins                │   │
│  │  (merged: scan data + usage + convex enrichment)        │   │
│  └─────────────────────────────────────────────────────────┘   │
│       ↓                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   PluginFilters                          │   │
│  │  search | format | category | type | tags | sort         │   │
│  └─────────────────────────────────────────────────────────┘   │
│       ↓                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   PluginBrowser                          │   │
│  │  (filtered, sorted, enriched plugin list)                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↕
                         (Convex API)
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                      PLUGINRADAR (Convex)                       │
├─────────────────────────────────────────────────────────────────┤
│  plugins table                                                  │
│  - category, subcategory, tags                                  │
│  - mentionScore (trending)                                      │
│  - imageUrl                                                     │
│  - isFree                                                       │
│                                                                 │
│  scannedPlugins table                                           │
│  - user's synced plugins                                        │
│  - matchedPlugin → plugins._id                                  │
│                                                                 │
│  pluginChains table                                             │
│  - saved chains with presets                                    │
│  - public/private sharing                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Order

### Week 1: Core Integration
1. ☐ Mount CloudSync in App.tsx
2. ☐ Add cloud buttons to Footer
3. ☐ Initialize sync store on app load
4. ☐ Rebuild JUCE plugin
5. ☐ Test login → sync → save chain flow

### Week 2: Usage Tracking
1. ☐ Create usageStore with localStorage
2. ☐ Hook into chainStore to track loads
3. ☐ Track co-usage (works well with)
4. ☐ Add "Most Used" and "Recent" sort options

### Week 3: Convex Enrichment
1. ☐ Add batchGetPluginInfo query to Convex
2. ☐ Fetch enrichment after sync
3. ☐ Cache enrichment in localStorage
4. ☐ Merge enrichment into plugin data

### Week 4: Filter UI
1. ☐ Create PluginFilters component
2. ☐ Implement all filter logic in store
3. ☐ Add category/tag filtering
4. ☐ Add popularity sorting

### Week 5: Detail View
1. ☐ Create PluginDetail modal
2. ☐ Display all enriched data
3. ☐ Show "works well with" recommendations
4. ☐ Polish UI/UX

---

## Future Enhancements

- **AI Recommendations:** "Based on your chain, try adding..."
- **Chain Templates:** Pre-built chains by genre/use-case
- **Plugin Reviews:** Community ratings integrated from PluginRadar
- **Preset Marketplace:** Share/sell individual presets
- **A/B Compare:** Compare two plugins side-by-side
- **Session Analytics:** Time spent per plugin, gain staging stats
