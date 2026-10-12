import { create } from 'zustand';
import type { PresetInfo, LoadProgress } from '../api/types';
import { juceBridge } from '../api/juce-bridge';

interface PresetState {
  presets: PresetInfo[];
  categories: string[];
  currentPreset: PresetInfo | null;
  selectedCategory: string | null;
  loading: boolean;
  listLoading: boolean;
  pendingLoad: { requestId: number; path: string; allowPartial: boolean } | null;
  loadProgress: LoadProgress | null;
  loadIssues: Array<{ name: string; reason: string }>;
  loadStatus: LoadProgress['status'] | null;
  saving: boolean;
  error: string | null;
}

interface PresetActions {
  fetchPresets: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  savePreset: (name: string, category: string) => Promise<boolean>;
  loadPreset: (path: string, allowPartial?: boolean) => Promise<boolean>;
  loadAvailableEffects: () => Promise<boolean>;
  deletePreset: (path: string) => Promise<boolean>;
  setSelectedCategory: (category: string | null) => void;
}

const initialState: PresetState = {
  presets: [],
  categories: [],
  currentPreset: null,
  selectedCategory: null,
  loading: false,
  listLoading: false,
  pendingLoad: null,
  loadProgress: null,
  loadIssues: [],
  loadStatus: null,
  saving: false,
  error: null,
};

let nextClientRequestId = 0;

export const usePresetStore = create<PresetState & PresetActions>((set, get) => ({
  ...initialState,

  fetchPresets: async () => {
    set({ loading: true, listLoading: true, error: null });
    try {
      const presets = await juceBridge.getPresetList();
      set({ presets: presets || [], loading: false, listLoading: false });
    } catch (err) {
      set({ error: String(err), loading: false, listLoading: false });
    }
  },

  fetchCategories: async () => {
    try {
      const categories = await juceBridge.getCategories();
      set({ categories: categories || [] });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  savePreset: async (name: string, category: string) => {
    set({ saving: true, error: null });
    try {
      const result = await juceBridge.savePreset(name, category);
      if (result.success) {
        if (result.presetList) {
          set({ presets: result.presetList, saving: false });
        }
        get().fetchCategories();
        return true;
      } else {
        set({ error: result.error || 'Failed to save preset', saving: false });
        return false;
      }
    } catch (err) {
      set({ error: String(err), saving: false });
      return false;
    }
  },

  loadPreset: async (path: string, allowPartial = false) => {
    const requestId = ++nextClientRequestId;
    set({ pendingLoad: { requestId, path, allowPartial }, loadProgress: { requestId, path, status: 'loading', completed: 0, total: 0 }, loadIssues: [], loadStatus: 'loading', error: null });
    try {
      const result = await juceBridge.loadPreset(path, allowPartial, requestId);
      if (get().pendingLoad?.requestId !== requestId) return false;
      const terminal = result.status || (result.success ? 'committed' : 'failed');
      const issues = result.issues || [];
      const ok = terminal === 'committed' || terminal === 'partial';
      set({ currentPreset: ok ? (result.preset || get().currentPreset) : get().currentPreset, pendingLoad: null, loadStatus: terminal, loadIssues: issues, loadProgress: { requestId, path, status: terminal, completed: ok ? 1 : 0, total: 1, issues }, error: ok ? null : (result.error || issues[0]?.reason || 'Failed to load preset') });
      return ok;
    } catch (err) {
      if (get().pendingLoad?.requestId === requestId) set({ pendingLoad: null, loadStatus: 'failed', loadIssues: [], error: String(err) });
      return false;
    }
  },

  loadAvailableEffects: async () => {
    const pending = get().pendingLoad;
    const path = pending?.path || get().loadProgress?.path;
    return path ? get().loadPreset(path, true) : false;
  },

  deletePreset: async (path: string) => {
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.deletePreset(path);
      if (result.success) {
        if (result.presetList) {
          set({ presets: result.presetList, loading: false });
        }
        // Clear current preset if it was deleted
        const { currentPreset } = get();
        if (currentPreset?.path === path) {
          set({ currentPreset: null });
        }
        get().fetchCategories();
        return true;
      } else {
        set({ error: result.error || 'Failed to delete preset', loading: false });
        return false;
      }
    } catch (err) {
      set({ error: String(err), loading: false });
      return false;
    }
  },

  setSelectedCategory: (category: string | null) => {
    set({ selectedCategory: category });
  },
}));

// Set up event listeners
juceBridge.onPresetListChanged((presets) => {
  usePresetStore.setState({ presets: presets || [] });
  usePresetStore.getState().fetchCategories();
});

juceBridge.onPresetLoaded((preset) => {
  // Legacy event has no request id; terminal load responses remain authoritative.
  if (!usePresetStore.getState().pendingLoad) usePresetStore.setState({ currentPreset: preset });
});

juceBridge.onLoadProgress((progress) => {
  const state = usePresetStore.getState();
  if (!state.pendingLoad || progress.requestId !== state.pendingLoad.requestId) return;
  usePresetStore.setState({ loadProgress: progress, loadStatus: progress.status, loadIssues: progress.issues || state.loadIssues });
});
