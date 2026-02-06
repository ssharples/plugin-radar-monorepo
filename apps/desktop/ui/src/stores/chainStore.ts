import { create } from 'zustand';
import type { ChainSlot, ChainNodeUI, ChainStateV2 } from '../api/types';
import { juceBridge } from '../api/juce-bridge';
import { useUsageStore } from './usageStore';

interface ChainStoreState {
  // Tree-based state (V2)
  nodes: ChainNodeUI[];
  // Flat state for backward compat
  slots: ChainSlot[];
  selectedNodeId: number | null;
  /** @deprecated Use selectedNodeId. Kept for backward compat with PluginViewer. */
  selectedSlotIndex: number | null;
  openEditors: Set<number>;  // keyed by node ID
  loading: boolean;
  error: string | null;
}

interface ChainActions {
  fetchChainState: () => Promise<void>;

  // Flat API (backward compat - delegates to tree when possible)
  addPlugin: (pluginId: string, insertIndex?: number) => Promise<boolean>;
  removePlugin: (slotIndex: number) => Promise<boolean>;
  movePlugin: (fromIndex: number, toIndex: number) => Promise<boolean>;
  toggleBypass: (slotIndex: number) => Promise<void>;

  // Tree API (new)
  removeNode: (nodeId: number) => Promise<boolean>;
  moveNode: (nodeId: number, newParentId: number, newIndex: number) => Promise<boolean>;
  toggleNodeBypass: (nodeId: number) => Promise<void>;

  // Group operations
  createGroup: (childIds: number[], mode: 'serial' | 'parallel', name?: string) => Promise<number | null>;
  dissolveGroup: (groupId: number) => Promise<boolean>;
  setGroupMode: (groupId: number, mode: 'serial' | 'parallel') => Promise<void>;
  setGroupDryWet: (groupId: number, mix: number) => Promise<void>;
  setBranchGain: (nodeId: number, gainDb: number) => Promise<void>;
  setBranchSolo: (nodeId: number, solo: boolean) => Promise<void>;
  setBranchMute: (nodeId: number, mute: boolean) => Promise<void>;

  // Editor management
  openPluginEditor: (nodeId: number) => Promise<void>;
  closePluginEditor: (nodeId: number) => Promise<void>;
  togglePluginEditor: (nodeId: number) => Promise<void>;
  selectNode: (nodeId: number | null) => void;
  toggleGroupCollapsed: (groupId: number) => void;

  // Backward compat alias
  selectSlot: (slotIndex: number | null) => void;
}

function applyState(state: ChainStateV2) {
  return {
    nodes: state.nodes || [],
    slots: state.slots || [],
  };
}

// Helper: find a node by ID in the tree
function findNodeById(nodes: ChainNodeUI[], id: number): ChainNodeUI | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.type === 'group') {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

// Helper: toggle collapsed state in immutable tree
function toggleCollapsed(nodes: ChainNodeUI[], groupId: number): ChainNodeUI[] {
  return nodes.map(node => {
    if (node.id === groupId && node.type === 'group') {
      return { ...node, collapsed: !node.collapsed };
    }
    if (node.type === 'group') {
      return { ...node, children: toggleCollapsed(node.children, groupId) };
    }
    return node;
  });
}

const initialState: ChainStoreState = {
  nodes: [],
  slots: [],
  selectedNodeId: null,
  selectedSlotIndex: null,
  openEditors: new Set<number>(),
  loading: false,
  error: null,
};

export const useChainStore = create<ChainStoreState & ChainActions>((set, get) => ({
  ...initialState,

  fetchChainState: async () => {
    set({ loading: true, error: null });
    try {
      const state = await juceBridge.getChainState();
      set({ ...applyState(state), loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  // =============================================
  // Flat API (backward compat)
  // =============================================

  addPlugin: async (pluginId: string, insertIndex = -1) => {
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.addPlugin(pluginId, insertIndex);
      if (result.success && result.chainState) {
        const chainState = result.chainState as ChainStateV2;
        const newState = applyState(chainState);
        set({ ...newState, loading: false });

        // Track usage
        const newSlots = newState.slots;
        const newIndex = insertIndex === -1 ? newSlots.length - 1 : insertIndex;
        const newPlugin = newSlots[newIndex];
        if (newPlugin) {
          const { recordPluginLoad, recordCoUsage } = useUsageStore.getState();
          recordPluginLoad(newPlugin.uid, newPlugin.name, newPlugin.manufacturer);
          newSlots.forEach((slot) => {
            if (slot.uid !== newPlugin.uid) {
              recordCoUsage(newPlugin.uid, slot.uid);
              recordCoUsage(slot.uid, newPlugin.uid);
            }
          });
        }

        return true;
      } else {
        set({ error: result.error || 'Failed to add plugin', loading: false });
        return false;
      }
    } catch (err) {
      set({ error: String(err), loading: false });
      return false;
    }
  },

  removePlugin: async (slotIndex: number) => {
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.removePlugin(slotIndex);
      if (result.success && result.chainState) {
        const chainState = result.chainState as ChainStateV2;
        set({ ...applyState(chainState), loading: false });
        return true;
      } else {
        set({ error: result.error || 'Failed to remove plugin', loading: false });
        return false;
      }
    } catch (err) {
      set({ error: String(err), loading: false });
      return false;
    }
  },

  movePlugin: async (fromIndex: number, toIndex: number) => {
    const { slots, nodes } = get();
    // Optimistic update for flat slots
    const newSlots = [...slots];
    const [moved] = newSlots.splice(fromIndex, 1);
    newSlots.splice(toIndex, 0, moved);
    newSlots.forEach((slot, i) => { slot.index = i; });
    set({ slots: newSlots });

    try {
      const result = await juceBridge.movePlugin(fromIndex, toIndex);
      if (result.success && result.chainState) {
        const chainState = result.chainState as ChainStateV2;
        set(applyState(chainState));
        return true;
      } else {
        set({ slots, nodes, error: result.error || 'Failed to move plugin' });
        return false;
      }
    } catch (err) {
      set({ slots, nodes, error: String(err) });
      return false;
    }
  },

  toggleBypass: async (slotIndex: number) => {
    const { slots } = get();
    const slot = slots[slotIndex];
    if (!slot) return;

    // Optimistic
    const newSlots = [...slots];
    newSlots[slotIndex] = { ...slot, bypassed: !slot.bypassed };
    set({ slots: newSlots });

    try {
      const result = await juceBridge.setSlotBypassed(slotIndex, !slot.bypassed);
      if (result.chainState) {
        const chainState = result.chainState as ChainStateV2;
        set(applyState(chainState));
      }
    } catch (err) {
      set({ slots, error: String(err) });
    }
  },

  // =============================================
  // Tree API (new)
  // =============================================

  removeNode: async (nodeId: number) => {
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.removeNode(nodeId);
      if (result.success && result.chainState) {
        const chainState = result.chainState as ChainStateV2;
        const openEditors = new Set(get().openEditors);
        openEditors.delete(nodeId);
        set({ ...applyState(chainState), loading: false, openEditors });
        return true;
      } else {
        set({ error: result.error || 'Failed to remove node', loading: false });
        return false;
      }
    } catch (err) {
      set({ error: String(err), loading: false });
      return false;
    }
  },

  moveNode: async (nodeId: number, newParentId: number, newIndex: number) => {
    try {
      const result = await juceBridge.moveNode(nodeId, newParentId, newIndex);
      if (result.success && result.chainState) {
        const chainState = result.chainState as ChainStateV2;
        set(applyState(chainState));
        return true;
      } else {
        set({ error: result.error || 'Failed to move node' });
        return false;
      }
    } catch (err) {
      set({ error: String(err) });
      return false;
    }
  },

  toggleNodeBypass: async (nodeId: number) => {
    const { nodes } = get();
    const node = findNodeById(nodes, nodeId);
    if (!node || node.type !== 'plugin') return;

    try {
      const result = await juceBridge.setNodeBypassed(nodeId, !node.bypassed);
      if (result.chainState) {
        const chainState = result.chainState as ChainStateV2;
        set(applyState(chainState));
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  // =============================================
  // Group operations
  // =============================================

  createGroup: async (childIds: number[], mode: 'serial' | 'parallel', name?: string) => {
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.createGroup(childIds, mode, name || 'Group');
      if (result.success && result.chainState) {
        const chainState = result.chainState as ChainStateV2;
        set({ ...applyState(chainState), loading: false });
        return (result as any).groupId ?? null;
      } else {
        set({ error: result.error || 'Failed to create group', loading: false });
        return null;
      }
    } catch (err) {
      set({ error: String(err), loading: false });
      return null;
    }
  },

  dissolveGroup: async (groupId: number) => {
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.dissolveGroup(groupId);
      if (result.success && result.chainState) {
        const chainState = result.chainState as ChainStateV2;
        set({ ...applyState(chainState), loading: false });
        return true;
      } else {
        set({ error: result.error || 'Failed to dissolve group', loading: false });
        return false;
      }
    } catch (err) {
      set({ error: String(err), loading: false });
      return false;
    }
  },

  setGroupMode: async (groupId: number, mode: 'serial' | 'parallel') => {
    try {
      const result = await juceBridge.setGroupMode(groupId, mode);
      if (result.success && result.chainState) {
        const chainState = result.chainState as ChainStateV2;
        set(applyState(chainState));
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setGroupDryWet: async (groupId: number, mix: number) => {
    try {
      const result = await juceBridge.setGroupDryWet(groupId, mix);
      if (result.success && result.chainState) {
        const chainState = result.chainState as ChainStateV2;
        set(applyState(chainState));
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setBranchGain: async (nodeId: number, gainDb: number) => {
    try {
      const result = await juceBridge.setBranchGain(nodeId, gainDb);
      if (result.success && result.chainState) {
        const chainState = result.chainState as ChainStateV2;
        set(applyState(chainState));
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setBranchSolo: async (nodeId: number, solo: boolean) => {
    try {
      const result = await juceBridge.setBranchSolo(nodeId, solo);
      if (result.success && result.chainState) {
        const chainState = result.chainState as ChainStateV2;
        set(applyState(chainState));
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setBranchMute: async (nodeId: number, mute: boolean) => {
    try {
      const result = await juceBridge.setBranchMute(nodeId, mute);
      if (result.success && result.chainState) {
        const chainState = result.chainState as ChainStateV2;
        set(applyState(chainState));
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  // =============================================
  // Editor management
  // =============================================

  openPluginEditor: async (nodeId: number) => {
    try {
      // Use slot index for backward compat bridge call
      await juceBridge.openPluginUI(nodeId);
      const openEditors = new Set(get().openEditors);
      openEditors.add(nodeId);
      set({ openEditors });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  closePluginEditor: async (nodeId: number) => {
    try {
      await juceBridge.closePluginUI(nodeId);
      const openEditors = new Set(get().openEditors);
      openEditors.delete(nodeId);
      set({ openEditors });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  togglePluginEditor: async (nodeId: number) => {
    const { openEditors } = get();
    if (openEditors.has(nodeId)) {
      get().closePluginEditor(nodeId);
    } else {
      get().openPluginEditor(nodeId);
    }
  },

  selectNode: (nodeId: number | null) => {
    set({ selectedNodeId: nodeId, selectedSlotIndex: nodeId });
  },

  // Backward compat
  selectSlot: (slotIndex: number | null) => {
    set({ selectedNodeId: slotIndex, selectedSlotIndex: slotIndex });
    if (slotIndex !== null) {
      juceBridge.openPluginUI(slotIndex).catch((err) => {
        set({ error: String(err) });
      });
    }
  },

  toggleGroupCollapsed: (groupId: number) => {
    const { nodes } = get();
    set({ nodes: toggleCollapsed(nodes, groupId) });
  },
}));

// Set up event listener - handles both V1 and V2 chain state
juceBridge.onChainChanged((state: ChainStateV2) => {
  useChainStore.setState(applyState(state));
});
