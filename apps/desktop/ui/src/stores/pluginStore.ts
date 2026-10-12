import { create } from 'zustand';
import type { PluginDescription, ScanProgress } from '../api/types';
import { juceBridge } from '../api/juce-bridge';
import { useUsageStore } from './usageStore';
import {
  getScannedPlugins,
  fetchEnrichedPluginData,
  clearEnrichmentCache,
  type EnrichedPluginData,
} from '../api/convex-client';

type TypeFilter = 'all' | 'instruments' | 'effects';
type SortBy = 'name' | 'manufacturer' | 'most-used' | 'recent';
type PriceFilter = 'all' | 'free' | 'paid';

interface PluginState {
  plugins: PluginDescription[];
  filteredPlugins: PluginDescription[];
  searchQuery: string;
  formatFilter: string | null;
  typeFilter: TypeFilter;
  sortBy: SortBy;
  scanning: boolean;
  scanProgress: number;
  currentlyScanning: string;
  loading: boolean;
  error: string | null;

  // Enrichment data
  enrichedData: Map<number, EnrichedPluginData>; // keyed by plugin UID
  enrichmentLoading: boolean;
  enrichmentLoaded: boolean;

  // Enrichment-based filters
  categoryFilter: string | null;
  effectTypeFilter: string | null;
  tonalCharacterFilter: string[];
  priceFilter: PriceFilter;
}

interface PluginActions {
  fetchPlugins: () => Promise<void>;
  startScan: (rescanAll?: boolean) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setFormatFilter: (format: string | null) => void;
  setTypeFilter: (type: TypeFilter) => void;
  setSortBy: (sort: SortBy) => void;
  setCategoryFilter: (category: string | null) => void;
  setEffectTypeFilter: (effectType: string | null) => void;
  setTonalCharacterFilter: (chars: string[]) => void;
  toggleTonalCharacter: (char: string) => void;
  setPriceFilter: (filter: PriceFilter) => void;
  clearAllFilters: () => void;
  applyFilters: () => void;
  loadEnrichmentData: () => Promise<void>;
  getEnrichedDataForPlugin: (uid: number) => EnrichedPluginData | undefined;
  hasActiveFilters: () => boolean;
}

const initialState: PluginState = {
  plugins: [],
  filteredPlugins: [],
  searchQuery: '',
  formatFilter: null,
  typeFilter: 'all',
  sortBy: 'name',
  scanning: false,
  scanProgress: 0,
  currentlyScanning: '',
  loading: false,
  error: null,

  enrichedData: new Map(),
  enrichmentLoading: false,
  enrichmentLoaded: false,

  categoryFilter: null,
  effectTypeFilter: null,
  tonalCharacterFilter: [],
  priceFilter: 'all',
};

export const usePluginStore = create<PluginState & PluginActions>((set, get) => ({
  ...initialState,

  fetchPlugins: async () => {
    set({ loading: true, error: null });
    try {
      const plugins = await juceBridge.getPluginList();
      set({ plugins, loading: false });
      get().applyFilters();
      // Auto-load enrichment data after fetching plugins
      get().loadEnrichmentData();
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  startScan: async (rescanAll = false) => {
    set({ scanning: true, scanProgress: 0, currentlyScanning: '' });
    try {
      await juceBridge.startScan(rescanAll);
    } catch (err) {
      set({ error: String(err), scanning: false });
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
    get().applyFilters();
  },

  setFormatFilter: (format: string | null) => {
    set({ formatFilter: format });
    get().applyFilters();
  },

  setTypeFilter: (type: TypeFilter) => {
    set({ typeFilter: type });
    get().applyFilters();
  },

  setSortBy: (sort: SortBy) => {
    set({ sortBy: sort });
    get().applyFilters();
  },

  setCategoryFilter: (category: string | null) => {
    // Reset effect type when category changes
    set({ categoryFilter: category, effectTypeFilter: null });
    get().applyFilters();
  },

  setEffectTypeFilter: (effectType: string | null) => {
    set({ effectTypeFilter: effectType });
    get().applyFilters();
  },

  setTonalCharacterFilter: (chars: string[]) => {
    set({ tonalCharacterFilter: chars });
    get().applyFilters();
  },

  toggleTonalCharacter: (char: string) => {
    const current = get().tonalCharacterFilter;
    const next = current.includes(char)
      ? current.filter((c) => c !== char)
      : [...current, char];
    set({ tonalCharacterFilter: next });
    get().applyFilters();
  },

  setPriceFilter: (filter: PriceFilter) => {
    set({ priceFilter: filter });
    get().applyFilters();
  },

  clearAllFilters: () => {
    set({
      searchQuery: '',
      formatFilter: null,
      typeFilter: 'all',
      categoryFilter: null,
      effectTypeFilter: null,
      tonalCharacterFilter: [],
      priceFilter: 'all',
    });
    get().applyFilters();
  },

  hasActiveFilters: () => {
    const s = get();
    return (
      s.categoryFilter !== null ||
      s.effectTypeFilter !== null ||
      s.tonalCharacterFilter.length > 0 ||
      s.priceFilter !== 'all'
    );
  },

  loadEnrichmentData: async () => {
    const { enrichmentLoading } = get();
    if (enrichmentLoading) return;

    set({ enrichmentLoading: true });
    try {
      // Get user's scanned plugins with match data from Convex
      const scannedPlugins = await getScannedPlugins();
      if (!scannedPlugins || scannedPlugins.length === 0) {
        set({ enrichmentLoading: false, enrichmentLoaded: true });
        return;
      }

      // Collect matched plugin IDs
      const matchedIds: string[] = [];
      const uidToPluginId: Map<number, string> = new Map();

      for (const sp of scannedPlugins) {
        if (sp.matchedPlugin) {
          matchedIds.push(sp.matchedPlugin);
          uidToPluginId.set(sp.uid, sp.matchedPlugin);
        }
      }

      if (matchedIds.length === 0) {
        set({ enrichmentLoading: false, enrichmentLoaded: true });
        return;
      }

      // Fetch enrichment data for all matched plugins
      const enriched = await fetchEnrichedPluginData([...new Set(matchedIds)]);

      // Build UID → EnrichedData map
      const enrichedMap = new Map<number, EnrichedPluginData>();
      const idToEnriched = new Map<string, EnrichedPluginData>();
      for (const e of enriched) {
        idToEnriched.set(e._id, e);
      }
      for (const [uid, pluginId] of uidToPluginId) {
        const data = idToEnriched.get(pluginId);
        if (data) enrichedMap.set(uid, data);
      }

      set({
        enrichedData: enrichedMap,
        enrichmentLoading: false,
        enrichmentLoaded: true,
      });
      // Re-apply filters so enrichment-based filters work
      get().applyFilters();
    } catch (err) {
      console.error('[pluginStore] Failed to load enrichment data:', err);
      set({ enrichmentLoading: false, enrichmentLoaded: true });
    }
  },

  getEnrichedDataForPlugin: (uid: number) => {
    return get().enrichedData.get(uid);
  },

  applyFilters: () => {
    const {
      plugins,
      searchQuery,
      formatFilter,
      typeFilter,
      sortBy,
      enrichedData,
      categoryFilter,
      effectTypeFilter,
      tonalCharacterFilter,
      priceFilter,
    } = get();
    const usagePlugins = useUsageStore.getState().plugins;
    let filtered = [...plugins];

    // Text search — also searches enriched fields
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((p) => {
        // Basic fields
        if (
          p.name.toLowerCase().includes(query) ||
          p.manufacturer.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query)
        ) {
          return true;
        }
        // Enriched fields
        const ed = enrichedData.get(p.uid);
        if (ed) {
          if (ed.description?.toLowerCase().includes(query)) return true;
          if (ed.shortDescription?.toLowerCase().includes(query)) return true;
          if (ed.effectType?.toLowerCase().includes(query)) return true;
          if (ed.circuitEmulation?.toLowerCase().includes(query)) return true;
          if (ed.tags?.some((t) => t.toLowerCase().includes(query))) return true;
          if (ed.tonalCharacter?.some((t) => t.toLowerCase().includes(query))) return true;
          if (ed.sonicCharacter?.some((t) => t.toLowerCase().includes(query))) return true;
          if (ed.worksWellOn?.some((t) => t.toLowerCase().includes(query))) return true;
          if (ed.comparableTo?.some((t) => t.toLowerCase().includes(query))) return true;
        }
        return false;
      });
    }

    // Format filter
    if (formatFilter) {
      filtered = filtered.filter((p) => p.format === formatFilter);
    }

    // Type filter (instruments vs effects)
    if (typeFilter !== 'all') {
      filtered = filtered.filter((p) =>
        typeFilter === 'instruments' ? p.isInstrument : !p.isInstrument
      );
    }

    // Category filter (from enriched data)
    if (categoryFilter) {
      filtered = filtered.filter((p) => {
        const ed = enrichedData.get(p.uid);
        return ed?.category === categoryFilter;
      });
    }

    // Effect type filter
    if (effectTypeFilter) {
      filtered = filtered.filter((p) => {
        const ed = enrichedData.get(p.uid);
        return ed?.effectType === effectTypeFilter;
      });
    }

    // Tonal character filter (AND: all selected characters must be present)
    if (tonalCharacterFilter.length > 0) {
      filtered = filtered.filter((p) => {
        const ed = enrichedData.get(p.uid);
        if (!ed) return false;
        const chars = [...(ed.tonalCharacter ?? []), ...(ed.sonicCharacter ?? [])];
        return tonalCharacterFilter.every((c) => chars.includes(c));
      });
    }

    // Price filter
    if (priceFilter === 'free') {
      filtered = filtered.filter((p) => {
        const ed = enrichedData.get(p.uid);
        return ed?.isFree === true;
      });
    } else if (priceFilter === 'paid') {
      filtered = filtered.filter((p) => {
        const ed = enrichedData.get(p.uid);
        return ed ? ed.isFree === false : true; // Show unmatched as "paid" by default
      });
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'manufacturer':
          return a.manufacturer.localeCompare(b.manufacturer) || a.name.localeCompare(b.name);
        case 'most-used': {
          const aCount = usagePlugins[a.uid]?.loadCount || 0;
          const bCount = usagePlugins[b.uid]?.loadCount || 0;
          return bCount - aCount || a.name.localeCompare(b.name);
        }
        case 'recent': {
          const aTime = usagePlugins[a.uid]?.lastUsedAt || 0;
          const bTime = usagePlugins[b.uid]?.lastUsedAt || 0;
          return bTime - aTime || a.name.localeCompare(b.name);
        }
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    set({ filteredPlugins: filtered });
  },
}));

// Set up event listeners
juceBridge.onPluginListChanged((plugins) => {
  console.log('pluginListChanged received, plugins count:', plugins?.length);
  usePluginStore.setState({ plugins: plugins || [] });
  usePluginStore.getState().applyFilters();
});

juceBridge.onScanProgress((progress: ScanProgress) => {
  console.log('scanProgress received:', progress);
  const wasScanningBefore = usePluginStore.getState().scanning;
  usePluginStore.setState({
    scanning: progress.scanning ?? true,
    scanProgress: progress.progress ?? 0,
    currentlyScanning: progress.currentPlugin ?? '',
  });
  // Reload enrichment data when scanning completes
  if (wasScanningBefore && !(progress.scanning ?? true)) {
    clearEnrichmentCache();
    usePluginStore.getState().loadEnrichmentData();
  }
});
