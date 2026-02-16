import { create } from 'zustand';
import * as convexClient from '../api/convex-client';
import { clearEnrichmentCache } from '../api/convex-client';
import type { PluginDescription } from '../api/types';

interface SyncState {
  isLoggedIn: boolean;
  userId: string | null;
  isSyncing: boolean;
  lastSyncAt: number | null;
  syncedCount: number;
  inCatalog: number;
  newPlugins: string[];
  error: string | null;
}

interface SyncActions {
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  syncPlugins: (plugins: PluginDescription[]) => Promise<void>;
  autoSync: () => Promise<void>;
}

const initialState: SyncState = {
  isLoggedIn: false,
  userId: null,
  isSyncing: false,
  lastSyncAt: null,
  syncedCount: 0,
  inCatalog: 0,
  newPlugins: [],
  error: null,
};

export const useSyncStore = create<SyncState & SyncActions>((set, get) => ({
  ...initialState,

  initialize: async () => {
    const restored = await convexClient.initializeAuth();
    if (restored) {
      const user = await convexClient.getCurrentUser();
      set({ isLoggedIn: true, userId: user?._id ?? null });
    }
  },

  login: async (email: string, password: string) => {
    set({ error: null });
    const result = await convexClient.login(email, password);
    if (result.success) {
      const user = await convexClient.getCurrentUser();
      set({ isLoggedIn: true, userId: user?._id ?? null });
      return true;
    } else {
      set({ error: result.error || "Login failed" });
      return false;
    }
  },

  register: async (email: string, password: string, name?: string) => {
    set({ error: null });
    const result = await convexClient.register(email, password, name);
    if (result.success) {
      const user = await convexClient.getCurrentUser();
      set({ isLoggedIn: true, userId: user?._id ?? null });
      return true;
    } else {
      set({ error: result.error || "Registration failed" });
      return false;
    }
  },

  logout: async () => {
    await convexClient.logout();
    set({ isLoggedIn: false, userId: null });
  },

  syncPlugins: async (plugins: PluginDescription[]) => {
    if (!get().isLoggedIn) {
      set({ error: "Not logged in" });
      return;
    }

    set({ isSyncing: true, error: null });

    const mapped = plugins.map((p) => ({
      name: p.name,
      manufacturer: p.manufacturer,
      format: p.format,
      uid: p.uid,
      fileOrIdentifier: p.fileOrIdentifier,
      isInstrument: p.isInstrument,
      numInputChannels: p.numInputChannels,
      numOutputChannels: p.numOutputChannels,
      version: p.version,
    }));

    const result = await convexClient.syncPlugins(mapped);

    if (result.error) {
      set({ isSyncing: false, error: result.error });
    } else {
      set({
        isSyncing: false,
        lastSyncAt: Date.now(),
        syncedCount: result.synced,
        inCatalog: result.inCatalog,
        newPlugins: result.newPlugins,
      });
    }
  },

  autoSync: async () => {
    const { isLoggedIn, isSyncing } = get();
    if (!isLoggedIn || isSyncing) return;

    // Access pluginStore at runtime to avoid circular import
    const { usePluginStore } = await import('./pluginStore');
    const plugins = usePluginStore.getState().plugins;
    if (plugins.length === 0) return;

    try {
      await get().syncPlugins(plugins);
      clearEnrichmentCache();
      usePluginStore.getState().loadEnrichmentData();
    } catch {
      // Silent failure — enrichment will just be empty
    }
  },
}));
