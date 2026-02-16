import { create } from 'zustand';
import type { PresetInfo } from '../api/types';
import { juceBridge } from '../api/juce-bridge';
import { useChainStore } from './chainStore';

interface PresetState {
  presets: PresetInfo[];
  categories: string[];
  currentPreset: PresetInfo | null;
  selectedCategory: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

interface PresetActions {
  fetchPresets: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  savePreset: (name: string, category: string) => Promise<boolean>;
  loadPreset: (path: string) => Promise<boolean>;
  deletePreset: (path: string) => Promise<boolean>;
  renamePreset: (path: string, newName: string) => Promise<boolean>;
  setSelectedCategory: (category: string | null) => void;
}

const initialState: PresetState = {
  presets: [],
  categories: [],
  currentPreset: null,
  selectedCategory: null,
  loading: false,
  saving: false,
  error: null,
};

export const usePresetStore = create<PresetState & PresetActions>((set, get) => ({
  ...initialState,

  fetchPresets: async () => {
    set({ loading: true, error: null });
    try {
      const presets = await juceBridge.getPresetList();
      set({ presets: presets || [], loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
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

  loadPreset: async (path: string) => {
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.loadPreset(path);
      if (result.success) {
        const preset = result.preset || null;
        set({
          currentPreset: preset,
          loading: false,
        });
        if (preset?.name) {
          useChainStore.getState().setChainName(preset.name);
        }
        return true;
      } else {
        set({ error: result.error || 'Failed to load preset', loading: false });
        return false;
      }
    } catch (err) {
      set({ error: String(err), loading: false });
      return false;
    }
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

  renamePreset: async (path: string, newName: string) => {
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.renamePreset(path, newName);
      if (result.success) {
        if (result.presetList) {
          set({ presets: result.presetList, loading: false });
        }
        // Update current preset name if it was renamed
        const { currentPreset } = get();
        if (currentPreset?.path === path) {
          set({ currentPreset: { ...currentPreset, name: newName } });
        }
        get().fetchCategories();
        return true;
      } else {
        set({ error: result.error || 'Failed to rename preset', loading: false });
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
  usePresetStore.setState({ currentPreset: preset });
  if (preset?.name) {
    useChainStore.getState().setChainName(preset.name);
  }
});
