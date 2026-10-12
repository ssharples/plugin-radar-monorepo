# Plugin Enrichment & Manufacturer Logo Fix

## 🔍 Issues Identified

### 1. **Incomplete Enrichment Data** ❌
The `convex/plugins.ts:getByIds` query was returning plugin data but **not populating manufacturer information**. It only returned the manufacturer ID reference (`manufacturer: Id<"manufacturers">`), missing:
- Manufacturer name
- Logo URL
- Logo storage ID

### 2. **Category Filters Return Empty** ❌
The plugin browser filters rely on enriched data fields (`category`, `effectType`, `tonalCharacter`), but since manufacturer data wasn't being fetched, the enriched data mapping was incomplete, causing filters to return no results.

**Root Cause**: The enrichment flow was:
```
pluginStore.loadEnrichmentData()
  → getScannedPlugins() (gets matched plugin IDs)
  → fetchEnrichedPluginData(pluginIds)
  → api.plugins.getByIds
  → Returns plugin with manufacturer: Id<"manufacturers"> (just an ID)
```

But the desktop UI expected manufacturer name and logo in `EnrichedPluginData`.

### 3. **No Manufacturer Logos** ❌
`PluginItem.tsx` was showing generic icons (Music/Sliders) instead of manufacturer logos because enriched data didn't include logo URLs.

---

## ✅ Solution Implemented

### **File 1: `convex/plugins.ts`**
Updated `getByIds` query to populate full manufacturer data:

```typescript
// Fetch and resolve manufacturer data
const manufacturer = await ctx.db.get(plugin.manufacturer);
let manufacturerData = null;
if (manufacturer) {
  let resolvedLogoUrl: string | null | undefined = manufacturer.logoUrl;
  if (manufacturer.logoStorageId) {
    resolvedLogoUrl = await ctx.storage.getUrl(manufacturer.logoStorageId);
  }
  manufacturerData = {
    _id: manufacturer._id,
    name: manufacturer.name,
    slug: manufacturer.slug,
    logoUrl: manufacturer.logoUrl,
    resolvedLogoUrl,
  };
}

return {
  ...plugin,
  resolvedImageUrl,
  manufacturerData, // NEW: Now includes full manufacturer info
};
```

**Key Changes**:
- Fetches manufacturer document for each plugin
- Resolves storage URL for manufacturer logo (if using Convex storage)
- Returns `manufacturerData` object with name, slug, logoUrl, and resolvedLogoUrl

---

### **File 2: `apps/desktop/ui/src/api/convex-client.ts`**
Updated `EnrichedPluginData` interface to match new shape:

```typescript
export interface EnrichedPluginData {
  // ... existing fields ...

  // NEW: Manufacturer data (populated from manufacturer document)
  manufacturerData?: {
    _id: string;
    name: string;
    slug: string;
    logoUrl?: string;
    resolvedLogoUrl?: string;
  };
}
```

---

### **File 3: `apps/desktop/ui/src/components/PluginBrowser/PluginItem.tsx`**
Updated to display manufacturer logos with proper fallback:

**Changes**:
1. Added `logoError` state to handle failed image loads
2. Prefers `resolvedLogoUrl` (Convex storage URL) over `logoUrl`
3. Shows manufacturer logo if available, otherwise falls back to icon
4. Handles image load errors gracefully

```typescript
// Manufacturer logo URL (prefer resolved storage URL, fallback to direct URL)
const manufacturerLogoUrl = enriched?.manufacturerData?.resolvedLogoUrl
  ?? enriched?.manufacturerData?.logoUrl;
const shouldShowLogo = manufacturerLogoUrl && !logoError;

// In render:
{shouldShowLogo ? (
  <img
    src={manufacturerLogoUrl}
    alt={enriched?.manufacturerData?.name ?? plugin.manufacturer}
    className="w-full h-full object-contain p-0.5"
    onError={() => setLogoError(true)}
  />
) : plugin.isInstrument ? (
  <Music className="w-3 h-3" />
) : (
  <Sliders className="w-3 h-3" />
)}
```

---

## 🧪 Testing Instructions

### 1. **Deploy Convex Changes**
```bash
cd /Users/satti/Development-projects/plugin-radar-monorepo
pnpm deploy
```

This will deploy the updated `getByIds` query to production.

### 2. **Rebuild Desktop UI**
```bash
cd apps/desktop/ui
pnpm build
```

### 3. **Update Embedded UI in JUCE Plugin**
```bash
cd apps/desktop/build
zip -r ../resources/ui.zip -j ../ui/dist/index.html
```

### 4. **Rebuild JUCE Plugin**
```bash
cd apps/desktop/build
cmake ..
cmake --build . --target PluginChainManager_AU
```

### 5. **Test in DAW**
1. Load the rebuilt plugin in your DAW
2. Open the plugin browser
3. **Verify enrichment sync**:
   - Look for "syncing catalog..." indicator
   - Should show green dot when complete
4. **Test filters**:
   - Click "Filters" dropdown
   - Select a category (e.g., "Compressor")
   - Should return results if you have compressor plugins
5. **Check manufacturer logos**:
   - Plugins matched to the catalog should show manufacturer logos instead of generic icons

### 6. **Debug if Needed**
Open browser console in the JUCE WebView to check:
```javascript
// Check if enrichment data loaded
console.log(usePluginStore.getState().enrichmentLoaded); // should be true
console.log(usePluginStore.getState().enrichedData); // should have entries

// Check a specific plugin
const plugin = usePluginStore.getState().plugins[0];
const enriched = usePluginStore.getState().getEnrichedDataForPlugin(plugin.uid);
console.log(enriched); // should have manufacturerData field
```

---

## 📊 Expected Results

### Before Fix ❌
- Filters: Empty results even with valid plugins
- Enriched data: Missing manufacturer info
- Plugin icons: Generic Music/Sliders icons only

### After Fix ✅
- **Filters**: Return results based on category, effect type, tonal character
- **Enriched data**: Full plugin + manufacturer info with logos
- **Plugin browser**: Shows manufacturer logos for catalog-matched plugins
- **Fallback**: Still shows icons for unmatched plugins or failed image loads

---

## 🔄 Data Flow (After Fix)

```
1. User scans plugins in DAW
   ↓
2. syncScannedPlugins mutation
   - Matches scanned plugins to catalog
   - Stores matchedPlugin ID in scannedPlugins table
   ↓
3. Desktop UI: loadEnrichmentData()
   - Calls getUserScannedPlugins query
   - Extracts matchedPlugin IDs
   ↓
4. Desktop UI: fetchEnrichedPluginData(pluginIds)
   - Calls getByIds query with plugin IDs
   ↓
5. Convex: getByIds handler
   - Fetches plugin docs
   - For each plugin:
     • Fetches manufacturer doc
     • Resolves logo storage URL if needed
     • Returns { ...plugin, manufacturerData }
   ↓
6. Desktop UI: enrichedData Map
   - Keyed by plugin UID
   - Contains full plugin + manufacturer data
   ↓
7. PluginItem component
   - Reads enriched data
   - Displays manufacturer logo or fallback icon
   ↓
8. PluginFilters component
   - Filters work correctly with enriched category/effectType data
```

---

## 🚨 Important Notes

1. **Requires plugin rescan**: After deploying, users should rescan their plugins to ensure fresh enrichment data is fetched with the new manufacturer fields.

2. **Manufacturer logos must exist**: The fix enables logo display, but logos must be populated in the `manufacturers` table for them to show. Check catalog data:
   ```bash
   # In Convex dashboard, run:
   db.query("manufacturers").collect()
   ```

3. **Storage vs direct URLs**: The code prefers `resolvedLogoUrl` (Convex storage) but falls back to `logoUrl` (direct URL). Make sure at least one is populated.

4. **Cache invalidation**: The desktop UI caches enrichment data for 5 minutes. To force a refresh:
   - Restart the plugin, OR
   - Rescan plugins

---

## 📝 Follow-up Tasks

1. **Populate manufacturer logos**: Ensure all manufacturers in the catalog have logo URLs
2. **Monitor logs**: Check for image load errors in production
3. **Add placeholder logos**: Consider a default manufacturer placeholder for brands without logos
4. **Optimize batch size**: Current batch size is 50 plugins per query. Monitor performance and adjust if needed.
