import { create } from 'zustand';
import { juceBridge } from '../api/juce-bridge';
import type { GroupTemplateInfo } from '../api/types';

interface GroupTemplateState {
  templates: GroupTemplateInfo[];
  categories: string[];
  selectedCategory: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

interface GroupTemplateActions {
  fetchTemplates: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  saveTemplate: (groupId: number, name: string, category: string) => Promise<boolean>;
  loadTemplate: (path: string, parentId: number, insertIndex: number) => Promise<number | null>;
  deleteTemplate: (path: string) => Promise<boolean>;
  setSelectedCategory: (category: string | null) => void;
  setError: (error: string | null) => void;
}

type GroupTemplateStore = GroupTemplateState & GroupTemplateActions;

export const useGroupTemplateStore = create<GroupTemplateStore>((set, get) => ({
  // State
  templates: [],
  categories: [],
  selectedCategory: null,
  loading: false,
  saving: false,
  error: null,

  // Actions
  fetchTemplates: async () => {
    set({ loading: true, error: null });
    try {
      const templates = await juceBridge.getGroupTemplateList();
      set({ templates, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  fetchCategories: async () => {
    try {
      const categories = await juceBridge.getGroupTemplateCategories();
      set({ categories });
    } catch (_err) {
      // Silently ignored — categories are optional UI data
    }
  },

  saveTemplate: async (groupId: number, name: string, category: string) => {
    set({ saving: true, error: null });
    try {
      const result = await juceBridge.saveGroupTemplate(groupId, name, category);
      if (result.success) {
        if (result.templateList) {
          set({ templates: result.templateList, saving: false });
        } else {
          await get().fetchTemplates();
          set({ saving: false });
        }
        await get().fetchCategories();
        return true;
      } else {
        set({ error: result.error || 'Failed to save template', saving: false });
        return false;
      }
    } catch (err) {
      set({ error: (err as Error).message, saving: false });
      return false;
    }
  },

  loadTemplate: async (path: string, parentId: number, insertIndex: number) => {
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.loadGroupTemplate(path, parentId, insertIndex);
      set({ loading: false });
      if (result.success) {
        return result.groupId ?? null;
      } else {
        set({ error: result.error || 'Failed to load template' });
        return null;
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      return null;
    }
  },

  deleteTemplate: async (path: string) => {
    set({ error: null });
    try {
      const result = await juceBridge.deleteGroupTemplate(path);
      if (result.success) {
        if (result.templateList) {
          set({ templates: result.templateList });
        } else {
          await get().fetchTemplates();
        }
        await get().fetchCategories();
        return true;
      } else {
        set({ error: result.error || 'Failed to delete template' });
        return false;
      }
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },

  setSelectedCategory: (category: string | null) => {
    set({ selectedCategory: category });
  },

  setError: (error: string | null) => {
    set({ error });
  },
}));

// Setup event listener for template list changes
juceBridge.onTemplateListChanged((templates) => {
  useGroupTemplateStore.setState({ templates });
});
