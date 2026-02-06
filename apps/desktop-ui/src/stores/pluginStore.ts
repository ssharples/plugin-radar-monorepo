import { create } from 'zustand';
import type { PluginDescription, ScanProgress } from '../api/types';
import { juceBridge } from '../api/juce-bridge';
import { useUsageStore } from './usageStore';

type TypeFilter = 'all' | 'instruments' | 'effects';
type SortBy = 'name' | 'manufacturer' | 'most-used' | 'recent';

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
}

interface PluginActions {
  fetchPlugins: () => Promise<void>;
  startScan: (rescanAll?: boolean) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setFormatFilter: (format: string | null) => void;
  setTypeFilter: (type: TypeFilter) => void;
  setSortBy: (sort: SortBy) => void;
  applyFilters: () => void;
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
};

export const usePluginStore = create<PluginState & PluginActions>((set, get) => ({
  ...initialState,

  fetchPlugins: async () => {
    set({ loading: true, error: null });
    try {
      const plugins = await juceBridge.getPluginList();
      set({ plugins, loading: false });
      get().applyFilters();
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

  applyFilters: () => {
    const { plugins, searchQuery, formatFilter, typeFilter, sortBy } = get();
    const usagePlugins = useUsageStore.getState().plugins;
    let filtered = [...plugins];

    // Text search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.manufacturer.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query)
      );
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
  // Don't change scanning state here - let scanProgress handle it
  // This allows plugins to appear in real-time during scanning
  usePluginStore.setState({ plugins: plugins || [] });
  usePluginStore.getState().applyFilters();
});

juceBridge.onScanProgress((progress: ScanProgress) => {
  console.log('scanProgress received:', progress);
  usePluginStore.setState({
    scanning: progress.scanning ?? true,
    scanProgress: progress.progress ?? 0,
    currentlyScanning: progress.currentPlugin ?? '',
  });
});
