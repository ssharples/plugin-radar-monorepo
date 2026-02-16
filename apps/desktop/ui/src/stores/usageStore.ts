import { create } from 'zustand';

interface PluginUsage {
  uid: number;
  name: string;
  manufacturer: string;
  loadCount: number;
  lastUsedAt: number;
  firstUsedAt: number;
  coUsage: Record<number, number>; // uid -> count of times used together
}

interface UsageState {
  plugins: Record<number, PluginUsage>;
  recordPluginLoad: (uid: number, name: string, manufacturer: string) => void;
  recordCoUsage: (uid1: number, uid2: number) => void;
  getUsageStats: (uid: number) => PluginUsage | undefined;
  getTopCoUsage: (uid: number, limit?: number) => Array<{ uid: number; count: number }>;
  getPluginUsageCount: (uid: number) => number;
  getMostRecentPlugins: () => PluginUsage[];
}

const STORAGE_KEY = 'plugin_usage_stats';

function loadFromStorage(): Record<number, PluginUsage> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function saveToStorage(plugins: Record<number, PluginUsage>) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plugins));
    } catch {
      // localStorage may be full or unavailable
    }
  }, 1000);
}

export const useUsageStore = create<UsageState>((set, get) => ({
  plugins: loadFromStorage(),

  recordPluginLoad: (uid, name, manufacturer) => {
    set((state) => {
      const now = Date.now();
      const existing = state.plugins[uid];
      const updated = {
        ...state.plugins,
        [uid]: {
          uid,
          name,
          manufacturer,
          loadCount: (existing?.loadCount || 0) + 1,
          lastUsedAt: now,
          firstUsedAt: existing?.firstUsedAt || now,
          coUsage: existing?.coUsage || {},
        },
      };
      saveToStorage(updated);
      return { plugins: updated };
    });
  },

  recordCoUsage: (uid1, uid2) => {
    if (uid1 === uid2) return;
    set((state) => {
      const plugin = state.plugins[uid1];
      if (!plugin) return state;

      const updated = {
        ...state.plugins,
        [uid1]: {
          ...plugin,
          coUsage: {
            ...plugin.coUsage,
            [uid2]: (plugin.coUsage[uid2] || 0) + 1,
          },
        },
      };
      saveToStorage(updated);
      return { plugins: updated };
    });
  },

  getUsageStats: (uid) => get().plugins[uid],

  getTopCoUsage: (uid, limit = 5) => {
    const plugin = get().plugins[uid];
    if (!plugin) return [];
    return Object.entries(plugin.coUsage)
      .map(([uidStr, count]) => ({ uid: Number(uidStr), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },

  getPluginUsageCount: (uid) => {
    const plugin = get().plugins[uid];
    return plugin?.loadCount || 0;
  },

  getMostRecentPlugins: () => {
    return Object.values(get().plugins)
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  },
}));
