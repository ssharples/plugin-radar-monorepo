import { create } from 'zustand';
import type { ChainSlot, ChainNodeUI, ChainStateV2, NodeMeterReadings, FormatSubstitution, AutomationSlotWarning, LatencyWarning } from '../api/types';
import { useMeterStore } from './meterStore';
import { juceBridge } from '../api/juce-bridge';
import { useUsageStore } from './usageStore';
import { usePluginStore } from './pluginStore';
import { getParameterMapByName, contributeParameterDiscovery } from '../api/convex-client';
import { getCategoryColor } from '../constants/categoryColors';

// ============================================
// Throttled bridge call helper for continuous controls (knobs/sliders)
// Coalesces rapid updates to ~60fps, only sends latest value.
// ============================================
type PendingCall = { fn: (...args: unknown[]) => Promise<unknown>; args: unknown[]; key: string };
const _pendingCalls = new Map<string, PendingCall>();
let _rafScheduled = false;

function _flushPendingCalls() {
  _rafScheduled = false;
  const calls = Array.from(_pendingCalls.values());
  _pendingCalls.clear();
  for (const { fn, args } of calls) {
    fn(...args);
  }
}

/**
 * Throttle a bridge call to at most once per animation frame (~16ms / 60fps).
 * Only the latest args for each key are kept — intermediate values are dropped.
 */
function throttledBridgeCall(key: string, fn: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]) {
  _pendingCalls.set(key, { fn, args, key });
  if (!_rafScheduled) {
    _rafScheduled = true;
    requestAnimationFrame(_flushPendingCalls);
  }
}

// ============================================
// Undo/Redo snapshot type
// ============================================
interface ChainSnapshot {
  binaryData: string;       // Base64 from captureSnapshot() — full state including plugin presets
  nodes: ChainNodeUI[];     // Cached UI state for instant display
  slots: ChainSlot[];       // Cached flat state
}

const MAX_HISTORY = 50;

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

  // LUFS target — the recommended input level for the currently loaded chain (legacy)
  targetInputLufs: number | null;
  // Peak dB target range — recommended input peak level for the currently loaded chain
  targetInputPeakMin: number | null;
  targetInputPeakMax: number | null;
  // Current chain name (for header display / rename)
  chainName: string;

  // Undo/Redo stacks
  history: ChainSnapshot[];
  future: ChainSnapshot[];
  /** Whether the last state change was from undo/redo (skip pushing to history) */
  _undoRedoInProgress: boolean;
  /** Snapshot captured at the start of a continuous drag gesture (slider/knob) */
  _continuousDragSnapshot: ChainSnapshot | null;
  /** Timestamp of last _beginContinuousGesture call (for safety timer) */
  _continuousGestureLastActivity: number;

  // Last cloud chain ID (for share-without-re-saving)
  lastCloudChainId: string | null;

  // Plugin settings clipboard (copy/paste between slots)
  pluginClipboard: { name: string; fileOrIdentifier: string; nodeId: number } | null;

  // Toast notifications
  toastMessage: string | null;

  // Format substitutions from last chain import (AU→VST3 etc.)
  formatSubstitutions: FormatSubstitution[];

  // Inline plugin search state (nodeId + parentId + insertIndex)
  inlineSearchState: { nodeId: number; parentId: number; insertIndex: number } | null;

  // Per-plugin expandable controls panel
  expandedNodeIds: Set<number>;

  // Inline editor mode (plugin editor embedded in host window, null = webview mode)
  inlineEditorNodeId: number | null;
  searchOverlayActive: boolean;
  searchOverlayMode: 'add' | 'replace';

  // AI chat mode (replaces Galaxy visualizer)
  aiChatActive: boolean;

  // Automation slot warning (Team 3)
  automationWarning: AutomationSlotWarning | null;

  // Latency info from C++ (Team 4)
  totalLatencySamples: number;
  sampleRate: number;
  latencyWarning: LatencyWarning | null;

  // Track where the current chain was loaded from (for context-aware preset navigation)
  chainSource: 'browse' | 'myChains' | 'preset' | null;
  chainSourceList: string[]; // List of chain IDs from the source
  chainSourceIndex: number;  // Current index in the source list

  // Dirty state (chain modified since last save/load)
  isDirty: boolean;
}

interface ChainActions {
  fetchChainState: () => Promise<void>;

  // Flat API (backward compat - delegates to tree when possible)
  addPlugin: (pluginId: string, insertIndex?: number) => Promise<boolean>;
  addPluginToGroup: (pluginId: string, parentId: number, insertIndex?: number) => Promise<boolean>;
  removePlugin: (slotIndex: number) => Promise<boolean>;
  movePlugin: (fromIndex: number, toIndex: number) => Promise<boolean>;
  toggleBypass: (slotIndex: number) => Promise<void>;

  // Tree API (new)
  removeNode: (nodeId: number) => Promise<boolean>;
  moveNode: (nodeId: number, newParentId: number, newIndex: number) => Promise<boolean>;
  toggleNodeBypass: (nodeId: number) => Promise<void>;
  duplicateNode: (nodeId: number) => Promise<boolean>;

  // Group operations
  createGroup: (childIds: number[], mode: 'serial' | 'parallel', name?: string) => Promise<number | null>;
  dissolveGroup: (groupId: number) => Promise<boolean>;
  /** Dissolve group without pushing to undo history (for auto-dissolve after moveNode) */
  dissolveGroupSilent: (groupId: number) => Promise<boolean>;
  setGroupMode: (groupId: number, mode: 'serial' | 'parallel' | 'midside' | 'fxselector') => Promise<void>;
  setActiveBranch: (groupId: number, branchIndex: number) => Promise<void>;
  setGroupDryWet: (groupId: number, mix: number) => Promise<void>;
  setGroupWetGain: (groupId: number, gainDb: number) => Promise<void>;
  setNodeDucking: (nodeId: number, enabled: boolean, thresholdDb: number, attackMs: number, releaseMs: number) => Promise<void>;
  setBranchGain: (nodeId: number, gainDb: number) => Promise<void>;
  setBranchMute: (nodeId: number, mute: boolean) => Promise<void>;
  setBranchSolo: (nodeId: number, solo: boolean) => Promise<void>;
  addDryPath: (parentId: number, insertIndex?: number) => Promise<void>;

  // Per-plugin controls
  setNodeInputGain: (nodeId: number, gainDb: number) => Promise<void>;
  setNodeOutputGain: (nodeId: number, gainDb: number) => Promise<void>;
  setNodeDryWet: (nodeId: number, mix: number) => Promise<void>;
  setNodeMidSideMode: (nodeId: number, mode: number) => Promise<void>;
  setNodeAutoGain: (nodeId: number, enabled: boolean) => Promise<void>;
  toggleNodeExpanded: (nodeId: number) => void;

  // Editor management
  openPluginEditor: (nodeId: number) => Promise<void>;
  closePluginEditor: (nodeId: number) => Promise<void>;
  togglePluginEditor: (nodeId: number) => Promise<void>;
  selectNode: (nodeId: number | null) => void;
  toggleGroupCollapsed: (groupId: number) => void;

  // Backward compat alias
  selectSlot: (slotIndex: number | null) => void;

  // LUFS target (legacy)
  setTargetInputLufs: (lufs: number | null) => void;
  // Peak range target
  setTargetInputPeakRange: (min: number | null, max: number | null) => void;
  setChainName: (name: string) => void;

  // Cloud chain ID tracking
  setLastCloudChainId: (id: string | null) => void;

  // Undo/Redo
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Push current state (binary snapshot) to history before a mutation */
  _pushHistory: () => Promise<void>;
  /** Capture snapshot at drag start for continuous controls */
  _beginContinuousGesture: () => Promise<void>;
  /** Push drag-start snapshot to history on drag end */
  _endContinuousGesture: () => void;

  // Plugin settings copy (direct copy between slots)
  pastePluginSettings: (sourceNodeId: number, targetNodeId: number) => Promise<boolean>;

  // Format substitutions
  setFormatSubstitutions: (subs: FormatSubstitution[]) => void;
  clearFormatSubstitutions: () => void;

  // Toast
  showToast: (message: string, durationMs?: number) => void;

  // Inline plugin search
  showInlineSearchBelow: (nodeId: number, parentId: number, insertIndex: number) => void;
  hideInlineSearch: () => void;

  // Inline editor mode (plugin editor embedded in host window)
  openInlineEditor: (nodeId: number) => Promise<void>;
  closeInlineEditor: () => Promise<void>;
  showSearchOverlay: (mode?: 'add' | 'replace') => Promise<void>;
  hideSearchOverlay: () => Promise<void>;

  // AI chat
  openAiChat: () => void;
  closeAiChat: () => void;

  // Chain source tracking & clear
  clearChain: () => void;
  setChainSource: (source: 'browse' | 'myChains' | 'preset' | null, list?: string[], index?: number) => void;

  // Dirty state
  setIsDirty: (dirty: boolean) => void;

  // Slot colors (right-click palette)
  slotColors: Record<number, string>;
  setSlotColor: (nodeId: number, color: string) => void;
  clearSlotColor: (nodeId: number) => void;
}

function applyState(state: ChainStateV2) {
  return {
    nodes: state.nodes || [],
    slots: state.slots || [],
    lastCloudChainId: null,
    totalLatencySamples: state.totalLatencySamples ?? 0,
    sampleRate: state.sampleRate ?? 44100,
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

/** Collect all plugin node IDs from a tree (for diffing new vs old). */
function collectPluginNodeIds(nodes: ChainNodeUI[]): Set<number> {
  const ids = new Set<number>();
  for (const node of nodes) {
    if (node.type === 'plugin') ids.add(node.id);
    if (node.type === 'group') {
      for (const id of collectPluginNodeIds(node.children)) ids.add(id);
    }
  }
  return ids;
}

// Helper: find a node by ID anywhere in the tree
function findNodeInTree(nodes: ChainNodeUI[], nodeId: number): ChainNodeUI | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.type === 'group') {
      const found = findNodeInTree(node.children, nodeId);
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

/**
 * Auto-discover plugin parameters and upload to Convex (fire-and-forget).
 * Only uploads if no existing map exists or the new one is better.
 * Minimum confidence of 30 required to upload.
 */
async function autoDiscoverAndUpload(
  nodeId: number,
  pluginName: string,
  matchedPluginId?: string
): Promise<void> {
  try {
    // Skip if no matched plugin ID — we need it for Convex storage
    if (!matchedPluginId) {
      return;
    }

    // Only skip discovery if a manual map exists (let crowdpool re-contribute for auto maps)
    const existingMap = await getParameterMapByName(pluginName);
    if (existingMap && existingMap.source === 'manual') {
      return;
    }

    // Run JUCE discovery
    const discoveryResult = await juceBridge.discoverPluginParameters(nodeId);
    if (!discoveryResult.success || !discoveryResult.map) {
      return;
    }

    const { map } = discoveryResult;

    // Skip if confidence too low
    if (map.confidence < 30) {
      return;
    }

    // Compute matched count for crowdpool logic
    const matchedCount = map.parameters.filter(
      (p: { semantic: string }) => p.semantic !== 'unknown'
    ).length;

    // Upload via crowdpool mutation
    await contributeParameterDiscovery(matchedPluginId, {
      ...map,
      matchedCount,
      totalCount: map.parameters.length,
      source: 'juce-scanned',
    });
  } catch (_err) {
    // Silently ignored — auto-discovery is best-effort
  }
}

/**
 * Auto-discover and upload parameter maps for all plugins in a chain.
 * Staggers calls with a 200ms delay to avoid overwhelming the host.
 * Fire-and-forget — errors are silently ignored.
 */
export async function autoDiscoverAllPlugins(
  nodes: ChainNodeUI[]
): Promise<void> {
  // Flatten tree to get all plugin leaf nodes
  const pluginNodes: Array<{ nodeId: number; pluginName: string; uid: number }> = [];

  function collectPlugins(nodeList: ChainNodeUI[]) {
    for (const node of nodeList) {
      if (node.type === 'plugin' && node.name) {
        pluginNodes.push({
          nodeId: node.id,
          pluginName: node.name,
          uid: node.uid,
        });
      }
      if (node.type === 'group') {
        collectPlugins(node.children);
      }
    }
  }

  collectPlugins(nodes);

  // Look up matched Convex plugin IDs from enrichment data
  const enrichedData = usePluginStore.getState().enrichedData;

  for (const pn of pluginNodes) {
    const enriched = enrichedData.get(pn.uid);
    const matchedPluginId = enriched?._id;
    await autoDiscoverAndUpload(pn.nodeId, pn.pluginName, matchedPluginId);
    // Stagger to avoid overwhelming the host
    await new Promise((r) => setTimeout(r, 200));
  }
}

const initialState: ChainStoreState = {
  nodes: [],
  slots: [],
  selectedNodeId: null,
  selectedSlotIndex: null,
  openEditors: new Set<number>(),
  loading: false,
  error: null,
  targetInputLufs: null,
  targetInputPeakMin: null,
  targetInputPeakMax: null,
  chainName: 'Untitled Chain',
  lastCloudChainId: null,
  history: [],
  future: [],
  _undoRedoInProgress: false,
  _continuousDragSnapshot: null,
  _continuousGestureLastActivity: 0,
  pluginClipboard: null,
  toastMessage: null,
  formatSubstitutions: [],
  inlineSearchState: null,
  expandedNodeIds: new Set<number>(),
  inlineEditorNodeId: null,
  searchOverlayActive: false,
  searchOverlayMode: 'add' as const,
  aiChatActive: false,
  automationWarning: null,
  totalLatencySamples: 0,
  sampleRate: 44100,
  latencyWarning: null,
  chainSource: null,
  chainSourceList: [],
  chainSourceIndex: -1,
  isDirty: false,
  slotColors: {},
};

export const useChainStore = create<ChainStoreState & ChainActions>((set, get) => ({
  ...initialState,

  // =============================================
  // Undo/Redo
  // =============================================

  _pushHistory: async () => {
    if (get()._undoRedoInProgress) return;
    set({ isDirty: true });
    try {
      // Capture full binary snapshot (includes all plugin preset data).
      // We store only binaryData — nodes/slots are reconstructed from C++ on restore.
      // This avoids structuredClone overhead on 50 history entries.
      const binaryData = await juceBridge.captureSnapshot();
      const { history } = get();
      const snapshot: ChainSnapshot = {
        binaryData,
        nodes: [],
        slots: [],
      };
      const newHistory = [...history, snapshot];
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }
      set({ history: newHistory, future: [] });
    } catch (_err) {
      // Silently ignored — snapshot serialization failure is non-critical
    }
  },

  canUndo: () => get().history.length > 0,
  canRedo: () => get().future.length > 0,

  undo: async () => {
    const { history } = get();
    if (history.length === 0) return;

    set({ _undoRedoInProgress: true });

    try {
      // Capture current state as binary for the redo stack
      const currentBinary = await juceBridge.captureSnapshot();
      const { history: freshHistory, future: freshFuture } = get();
      if (freshHistory.length === 0) {
        set({ _undoRedoInProgress: false });
        return;
      }

      const currentSnapshot: ChainSnapshot = {
        binaryData: currentBinary,
        nodes: [],
        slots: [],
      };

      const newHistory = [...freshHistory];
      const previousState = newHistory.pop()!;

      set({
        history: newHistory,
        future: [...freshFuture, currentSnapshot],
        lastCloudChainId: null,
      });

      // Restore full binary snapshot (includes all plugin presets)
      // Chain state will be applied via the chainChanged event
      await juceBridge.restoreSnapshot(previousState.binaryData);
    } catch (_err) {
      // Silently ignored — undo restore failure leaves UI in last-known state
    }

    set({ _undoRedoInProgress: false });
  },

  redo: async () => {
    const { future } = get();
    if (future.length === 0) return;

    set({ _undoRedoInProgress: true });

    try {
      // Capture current state as binary for the undo stack
      const currentBinary = await juceBridge.captureSnapshot();
      const { history: freshHistory, future: freshFuture } = get();
      if (freshFuture.length === 0) {
        set({ _undoRedoInProgress: false });
        return;
      }

      const currentSnapshot: ChainSnapshot = {
        binaryData: currentBinary,
        nodes: [],
        slots: [],
      };

      const newFuture = [...freshFuture];
      const nextState = newFuture.pop()!;

      set({
        history: [...freshHistory, currentSnapshot],
        future: newFuture,
        lastCloudChainId: null,
      });

      // Restore full binary snapshot (includes all plugin presets)
      // Chain state will be applied via the chainChanged event
      await juceBridge.restoreSnapshot(nextState.binaryData);
    } catch (_err) {
      // Silently ignored — redo restore failure leaves UI in last-known state
    }

    set({ _undoRedoInProgress: false });
  },

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
    await get()._pushHistory();
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.addPlugin(pluginId, insertIndex);
      if (result.success) {
        // Chain state will be applied via chainChanged event (sets loading: false)
        // Defer usage tracking and auto-discovery to after chainChanged fires
        setTimeout(() => {
          const { slots, nodes } = get();
          const newIndex = insertIndex === -1 ? slots.length - 1 : insertIndex;
          const newPlugin = slots[newIndex];
          if (newPlugin) {
            const { recordPluginLoad, recordCoUsage } = useUsageStore.getState();
            recordPluginLoad(newPlugin.uid, newPlugin.name, newPlugin.manufacturer);
            slots.forEach((slot) => {
              if (slot.uid !== newPlugin.uid) {
                recordCoUsage(newPlugin.uid, slot.uid);
                recordCoUsage(slot.uid, newPlugin.uid);
              }
            });
          }

          // Fire-and-forget: auto-discover parameter map and upload to Convex
          const findLastPluginNodeId = (nodeList: ChainNodeUI[]): number | null => {
            let lastId: number | null = null;
            for (const node of nodeList) {
              if (node.type === 'plugin' && node.name === newPlugin?.name) {
                lastId = node.id;
              }
              if (node.type === 'group') {
                const found = findLastPluginNodeId(node.children);
                if (found !== null) lastId = found;
              }
            }
            return lastId;
          };
          const newNodeId = newPlugin ? findLastPluginNodeId(nodes) : null;
          if (newNodeId !== null && newPlugin) {
            const enrichedData = usePluginStore.getState().enrichedData;
            const enriched = enrichedData.get(newPlugin.uid);
            const matchedPluginId = enriched?._id;
            autoDiscoverAndUpload(newNodeId, newPlugin.name, matchedPluginId).catch(() => {});
          }
        }, 50);

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

  addPluginToGroup: async (pluginId: string, parentId: number, insertIndex = -1) => {
    await get()._pushHistory();
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.addPluginToGroup(pluginId, parentId, insertIndex);
      if (result.success) {
        // Chain state will be applied via chainChanged event (sets loading: false)
        // Defer auto-discovery to after chainChanged fires
        setTimeout(() => {
          const { nodes } = get();
          const findPluginNode = (nodeList: ChainNodeUI[], pid: string): ChainNodeUI | null => {
            for (const node of nodeList) {
              if (node.type === 'plugin' && node.fileOrIdentifier === pid) return node;
              if (node.type === 'group') {
                const found = findPluginNode(node.children, pid);
                if (found) return found;
              }
            }
            return null;
          };
          const addedNode = findPluginNode(nodes, pluginId);
          if (addedNode) {
            const enrichedData = usePluginStore.getState().enrichedData;
            const enriched = enrichedData.get(addedNode.uid);
            autoDiscoverAndUpload(addedNode.id, addedNode.name, enriched?._id).catch(() => {});
          }
        }, 50);

        return true;
      } else {
        set({ error: result.error || 'Failed to add plugin to group', loading: false });
        return false;
      }
    } catch (err) {
      set({ error: String(err), loading: false });
      return false;
    }
  },

  removePlugin: async (slotIndex: number) => {
    await get()._pushHistory();
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.removePlugin(slotIndex);
      if (result.success) {
        // Chain state applied via chainChanged event
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
    await get()._pushHistory();
    const { slots, nodes } = get();
    // Optimistic update for flat slots
    const newSlots = [...slots];
    const [moved] = newSlots.splice(fromIndex, 1);
    newSlots.splice(toIndex, 0, moved);
    newSlots.forEach((slot, i) => { slot.index = i; });
    set({ slots: newSlots });

    try {
      const result = await juceBridge.movePlugin(fromIndex, toIndex);
      if (result.success) {
        // Chain state applied via chainChanged event
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

    set({ isDirty: true });

    // Optimistic
    const newSlots = [...slots];
    newSlots[slotIndex] = { ...slot, bypassed: !slot.bypassed };
    set({ slots: newSlots });

    try {
      await juceBridge.setSlotBypassed(slotIndex, !slot.bypassed);
      // Chain state applied via chainChanged event
    } catch (err) {
      set({ slots, error: String(err) });
    }
  },

  // =============================================
  // Tree API (new)
  // =============================================

  removeNode: async (nodeId: number) => {
    await get()._pushHistory();
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.removeNode(nodeId);
      if (result.success) {
        // Chain state applied via chainChanged event
        const openEditors = new Set(get().openEditors);
        openEditors.delete(nodeId);
        set({ openEditors });
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

  duplicateNode: async (nodeId: number) => {
    await get()._pushHistory();
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.duplicateNode(nodeId);
      if (result.success) {
        // Chain state applied via chainChanged event
        return true;
      } else {
        set({ error: result.error || 'Failed to duplicate node', loading: false });
        return false;
      }
    } catch (err) {
      set({ error: String(err), loading: false });
      return false;
    }
  },

  moveNode: async (nodeId: number, newParentId: number, newIndex: number) => {
    await get()._pushHistory();
    try {
      const result = await juceBridge.moveNode(nodeId, newParentId, newIndex);
      if (result.success) {
        // Chain state applied via chainChanged event
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
    if (!node) return;
    // Allow both plugin and group bypass
    if (node.type !== 'plugin' && node.type !== 'group') return;
    await get()._pushHistory();

    try {
      await juceBridge.setNodeBypassed(nodeId, !node.bypassed);
      // Chain state applied via chainChanged event
    } catch (err) {
      set({ error: String(err) });
    }
  },

  // =============================================
  // Group operations
  // =============================================

  createGroup: async (childIds: number[], mode: 'serial' | 'parallel', name?: string) => {
    await get()._pushHistory();
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.createGroup(childIds, mode, name || 'Send Bus');
      if (result.success) {
        const groupId = result.groupId ?? null;
        // C++ createGroup auto-inserts dry path for parallel groups
        // Chain state applied via chainChanged event
        return groupId;
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
    await get()._pushHistory();
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.dissolveGroup(groupId);
      if (result.success) {
        // Chain state applied via chainChanged event
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

  dissolveGroupSilent: async (groupId: number) => {
    // Same as dissolveGroup but without _pushHistory — used for auto-dissolve after moveNode
    // so that move + dissolve is a single undo unit
    set({ loading: true, error: null });
    try {
      const result = await juceBridge.dissolveGroup(groupId);
      if (result.success) {
        // Chain state applied via chainChanged event
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

  setGroupMode: async (groupId: number, mode: 'serial' | 'parallel' | 'midside' | 'fxselector') => {
    await get()._pushHistory();
    try {
      await juceBridge.setGroupMode(groupId, mode);
      // Chain state applied via chainChanged event
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setActiveBranch: async (groupId: number, branchIndex: number) => {
    try {
      await juceBridge.setActiveBranch(groupId, branchIndex);
      // Chain state applied via chainChanged event
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setGroupDryWet: async (groupId: number, mix: number) => {
    await get()._beginContinuousGesture();
    // Optimistic local update for instant UI feedback
    const nodes = get().nodes.map(n =>
      n.id === groupId && n.type === 'group' ? { ...n, dryWetMix: mix } : n
    );
    set({ nodes });
    // Throttle the actual bridge call
    throttledBridgeCall(`groupDryWet_${groupId}`, async () => {
      try {
        await juceBridge.setGroupDryWet(groupId, mix);
      } catch (err) {
        set({ error: String(err) });
      }
    });
  },

  setGroupWetGain: async (groupId: number, gainDb: number) => {
    await get()._beginContinuousGesture();
    const nodes = get().nodes.map(n =>
      n.id === groupId && n.type === 'group' ? { ...n, wetGainDb: gainDb } : n
    );
    set({ nodes });
    throttledBridgeCall(`groupWetGain_${groupId}`, async () => {
      try {
        await juceBridge.setGroupWetGain(groupId, gainDb);
      } catch (err) {
        set({ error: String(err) });
      }
    });
  },

  setNodeDucking: async (nodeId: number, enabled: boolean, thresholdDb: number, attackMs: number, releaseMs: number) => {
    await get()._beginContinuousGesture();
    try {
      await juceBridge.setNodeDucking(nodeId, enabled, thresholdDb, attackMs, releaseMs);
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setBranchGain: async (nodeId: number, gainDb: number) => {
    await get()._beginContinuousGesture();
    const nodes = get().nodes.map(n =>
      n.id === nodeId ? { ...n, branchGainDb: gainDb } : n
    );
    set({ nodes });
    throttledBridgeCall(`branchGain_${nodeId}`, async () => {
      try {
        await juceBridge.setBranchGain(nodeId, gainDb);
      } catch (err) {
        set({ error: String(err) });
      }
    });
  },

  setBranchMute: async (nodeId: number, mute: boolean) => {
    await get()._pushHistory();
    try {
      await juceBridge.setBranchMute(nodeId, mute);
      // Chain state applied via chainChanged event
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setBranchSolo: async (nodeId: number, solo: boolean) => {
    await get()._pushHistory();
    try {
      await juceBridge.setBranchSolo(nodeId, solo);
      // Chain state applied via chainChanged event
    } catch (err) {
      set({ error: String(err) });
    }
  },

  addDryPath: async (parentId: number, insertIndex = -1) => {
    await get()._pushHistory();
    try {
      await juceBridge.addDryPath(parentId, insertIndex);
      // Chain state applied via chainChanged event
    } catch (err) {
      set({ error: String(err) });
    }
  },

  // =============================================
  // Per-plugin controls
  // =============================================

  setNodeInputGain: async (nodeId: number, gainDb: number) => {
    await get()._beginContinuousGesture();
    const nodes = get().nodes.map(n =>
      n.id === nodeId && n.type === 'plugin' ? { ...n, inputGainDb: gainDb } : n
    );
    set({ nodes });
    throttledBridgeCall(`nodeInputGain_${nodeId}`, async () => {
      try {
        await juceBridge.setNodeInputGain(nodeId, gainDb);
      } catch (err) {
        set({ error: String(err) });
      }
    });
  },

  setNodeOutputGain: async (nodeId: number, gainDb: number) => {
    await get()._beginContinuousGesture();
    const nodes = get().nodes.map(n =>
      n.id === nodeId && n.type === 'plugin' ? { ...n, outputGainDb: gainDb } : n
    );
    set({ nodes });
    throttledBridgeCall(`nodeOutputGain_${nodeId}`, async () => {
      try {
        await juceBridge.setNodeOutputGain(nodeId, gainDb);
      } catch (err) {
        set({ error: String(err) });
      }
    });
  },

  setNodeDryWet: async (nodeId: number, mix: number) => {
    await get()._beginContinuousGesture();
    // Optimistic local update for instant UI feedback
    const nodes = get().nodes.map(n =>
      n.id === nodeId && n.type === 'plugin' ? { ...n, pluginDryWet: mix } : n
    );
    set({ nodes });
    // Throttle the actual bridge call
    throttledBridgeCall(`nodeDryWet_${nodeId}`, async () => {
      try {
        await juceBridge.setNodeDryWet(nodeId, mix);
      } catch (err) {
        set({ error: String(err) });
      }
    });
  },

  setNodeMidSideMode: async (nodeId: number, mode: number) => {
    await get()._pushHistory();
    try {
      await juceBridge.setNodeMidSideMode(nodeId, mode);
      // Chain state applied via chainChanged event
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setNodeAutoGain: async (nodeId: number, enabled: boolean) => {
    try {
      await juceBridge.setNodeAutoGain(nodeId, enabled);
      // Chain state applied via chainChanged event
    } catch (err) {
      set({ error: String(err) });
    }
  },

  toggleNodeExpanded: (nodeId: number) => {
    const expanded = new Set(get().expandedNodeIds);
    if (expanded.has(nodeId)) {
      expanded.delete(nodeId);
    } else {
      expanded.add(nodeId);
    }
    set({ expandedNodeIds: expanded });
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

  // LUFS target (legacy)
  setTargetInputLufs: (lufs: number | null) => {
    set({ targetInputLufs: lufs });
  },

  // Peak range target
  setTargetInputPeakRange: (min: number | null, max: number | null) => {
    set({ targetInputPeakMin: min, targetInputPeakMax: max });
  },

  setChainName: (name: string) => {
    set({ chainName: name });
    // Sync with cloudChainStore if this chain has a cloud ID
    const cloudId = get().lastCloudChainId;
    if (cloudId) {
      // Lazy import to avoid circular dependency — cloudChainStore may import chainStore
      import('./cloudChainStore').then(({ useCloudChainStore }) => {
        useCloudChainStore.getState().updateLocalChainName(cloudId, name);
      }).catch(() => {
        // Silently ignored — cross-store sync is best-effort
      });
    }
  },

  setLastCloudChainId: (id: string | null) => {
    set({ lastCloudChainId: id });
  },

  // =============================================
  // Plugin Settings Clipboard (copy/paste between slots)
  // =============================================

  pastePluginSettings: async (sourceNodeId: number, targetNodeId: number) => {
    const { nodes } = get();

    const sourceNode = findNodeInTree(nodes, sourceNodeId);
    const targetNode = findNodeInTree(nodes, targetNodeId);

    if (!sourceNode || sourceNode.type !== 'plugin') return false;
    if (!targetNode || targetNode.type !== 'plugin') return false;

    // Only paste to same plugin type
    if (targetNode.fileOrIdentifier !== sourceNode.fileOrIdentifier) {
      get().showToast('Cannot paste: different plugin type');
      return false;
    }

    try {
      const result = await juceBridge.copyNodeState(sourceNodeId, targetNodeId);
      if (result.success) {
        return true;
      } else {
        get().showToast(result.error || 'Failed to paste settings');
        return false;
      }
    } catch {
      get().showToast('Failed to paste plugin settings');
      return false;
    }
  },

  // =============================================
  // Format substitutions
  // =============================================

  setFormatSubstitutions: (subs: FormatSubstitution[]) => {
    set({ formatSubstitutions: subs });
  },

  clearFormatSubstitutions: () => {
    set({ formatSubstitutions: [] });
  },

  // =============================================
  // Toast notifications
  // =============================================

  showToast: (message: string, durationMs = 2000) => {
    set({ toastMessage: message });
    setTimeout(() => {
      // Only clear if the message is still the same
      if (useChainStore.getState().toastMessage === message) {
        useChainStore.setState({ toastMessage: null });
      }
    }, durationMs);
  },

  // =============================================
  // Inline plugin search
  // =============================================

  showInlineSearchBelow: (nodeId: number, parentId: number, insertIndex: number) => {
    set({ inlineSearchState: { nodeId, parentId, insertIndex } });
  },

  hideInlineSearch: () => {
    set({ inlineSearchState: null });
  },

  // =============================================
  // Inline Editor Mode
  // =============================================

  openInlineEditor: async (nodeId: number) => {
    // Already showing this plugin — nothing to do
    if (get().inlineEditorNodeId === nodeId) return;
    try {
      const result = await juceBridge.openPluginInline(nodeId);
      if (result.success) {
        set({ inlineEditorNodeId: nodeId });
      } else {
        // Plugin has no GUI — fall back to external window
        get().openPluginEditor(nodeId);
      }
    } catch (err) {
      console.error('[chainStore] openInlineEditor failed:', err);
      // Fallback to external window
      get().openPluginEditor(nodeId);
    }
  },

  closeInlineEditor: async () => {
    try {
      await juceBridge.closePluginInline();
      set({ inlineEditorNodeId: null, searchOverlayActive: false });
    } catch (err) {
      console.error('[chainStore] closeInlineEditor failed:', err);
    }
  },

  showSearchOverlay: async (mode: 'add' | 'replace' = 'add') => {
    // Set state immediately so the overlay shows, then tell C++ to adjust layout
    set({ searchOverlayActive: true, searchOverlayMode: mode });
    juceBridge.showSearchOverlay().catch((err) => {
      console.error('[chainStore] showSearchOverlay C++ call failed:', err);
    });
  },

  hideSearchOverlay: async () => {
    try {
      await juceBridge.hideSearchOverlay();
      set({ searchOverlayActive: false });
    } catch (err) {
      console.error('[chainStore] hideSearchOverlay failed:', err);
    }
  },

  // =============================================
  // AI Chat
  // =============================================

  openAiChat: () => {
    // Close any open inline plugin editor first
    const current = get().inlineEditorNodeId;
    if (current !== null) {
      juceBridge.closePluginInline().catch(() => {});
    }
    set({ aiChatActive: true, inlineEditorNodeId: null, searchOverlayActive: false });
  },

  closeAiChat: () => {
    set({ aiChatActive: false });
  },

  // =============================================
  // Chain source tracking & clear
  // =============================================

  clearChain: () => {
    // Try to clear the C++ chain via import with empty data
    juceBridge.importChain('').catch(() => {
      // If native clear fails, just clear local state
    });
    set({
      nodes: [],
      slots: [],
      chainName: 'Untitled Chain',
      selectedNodeId: null,
      selectedSlotIndex: null,
      lastCloudChainId: null,
      history: [],
      future: [],
      isDirty: false,
      expandedNodeIds: new Set<number>(),
      chainSource: null,
      chainSourceList: [],
      chainSourceIndex: -1,
      slotColors: {},
    });
    // Reset meter data in the dedicated meter store
    useMeterStore.setState((s) => ({
      nodeMeterData: {},
      peakMeterVersion: s.peakMeterVersion + 1,
    }));
  },

  setChainSource: (source, list = [], index = -1) => {
    set({ chainSource: source, chainSourceList: list, chainSourceIndex: index });
  },

  setIsDirty: (dirty: boolean) => {
    set({ isDirty: dirty });
  },

  // =============================================
  // Slot colors
  // =============================================

  setSlotColor: (nodeId, color) => {
    set((s) => ({ slotColors: { ...s.slotColors, [nodeId]: color } }));
  },

  clearSlotColor: (nodeId) => {
    set((s) => {
      const next = { ...s.slotColors };
      delete next[nodeId];
      return { slotColors: next };
    });
  },

  // =============================================
  // Continuous gesture helpers (debounce sliders/knobs)
  // =============================================

  _beginContinuousGesture: async () => {
    // Only capture once at the start of a drag
    if (get()._continuousDragSnapshot !== null) {
      // Already in a gesture — just update activity timestamp
      set({ _continuousGestureLastActivity: Date.now() });
      return;
    }
    if (get()._undoRedoInProgress) return;

    try {
      const binaryData = await juceBridge.captureSnapshot();
      const snapshot: ChainSnapshot = {
        binaryData,
        nodes: [],
        slots: [],
      };
      set({
        _continuousDragSnapshot: snapshot,
        _continuousGestureLastActivity: Date.now(),
      });
    } catch (_err) {
      // Silently ignored — snapshot serialization failure is non-critical
    }
  },

  _endContinuousGesture: () => {
    const { _continuousDragSnapshot, history } = get();
    if (!_continuousDragSnapshot) return;

    const newHistory = [...history, _continuousDragSnapshot];
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }
    set({
      history: newHistory,
      future: [],
      _continuousDragSnapshot: null,
      _continuousGestureLastActivity: 0,
    });
  },
}));

// Stable actions selector — defined outside components so it's referentially stable.
// Zustand action functions never change identity (created once in create()), so this
// selector always returns the same object reference, avoiding unnecessary re-renders.
const actionsSelector = (state: ChainStoreState & ChainActions) => ({
  fetchChainState: state.fetchChainState,
  addPlugin: state.addPlugin,
  addPluginToGroup: state.addPluginToGroup,
  removePlugin: state.removePlugin,
  movePlugin: state.movePlugin,
  toggleBypass: state.toggleBypass,
  removeNode: state.removeNode,
  moveNode: state.moveNode,
  toggleNodeBypass: state.toggleNodeBypass,
  duplicateNode: state.duplicateNode,
  createGroup: state.createGroup,
  dissolveGroup: state.dissolveGroup,
  dissolveGroupSilent: state.dissolveGroupSilent,
  setGroupMode: state.setGroupMode,
  setGroupDryWet: state.setGroupDryWet,
  setGroupWetGain: state.setGroupWetGain,
  setNodeDucking: state.setNodeDucking,
  setBranchGain: state.setBranchGain,
  setBranchMute: state.setBranchMute,
  setBranchSolo: state.setBranchSolo,
  setActiveBranch: state.setActiveBranch,
  addDryPath: state.addDryPath,
  setNodeInputGain: state.setNodeInputGain,
  setNodeOutputGain: state.setNodeOutputGain,
  setNodeDryWet: state.setNodeDryWet,
  setNodeMidSideMode: state.setNodeMidSideMode,
  setNodeAutoGain: state.setNodeAutoGain,
  toggleNodeExpanded: state.toggleNodeExpanded,
  openPluginEditor: state.openPluginEditor,
  closePluginEditor: state.closePluginEditor,
  togglePluginEditor: state.togglePluginEditor,
  selectNode: state.selectNode,
  toggleGroupCollapsed: state.toggleGroupCollapsed,
  selectSlot: state.selectSlot,
  setTargetInputLufs: state.setTargetInputLufs,
  setTargetInputPeakRange: state.setTargetInputPeakRange,
  setChainName: state.setChainName,
  setLastCloudChainId: state.setLastCloudChainId,
  undo: state.undo,
  redo: state.redo,
  canUndo: state.canUndo,
  canRedo: state.canRedo,
  _pushHistory: state._pushHistory,
  _beginContinuousGesture: state._beginContinuousGesture,
  _endContinuousGesture: state._endContinuousGesture,
  pastePluginSettings: state.pastePluginSettings,
  showToast: state.showToast,
  setFormatSubstitutions: state.setFormatSubstitutions,
  clearFormatSubstitutions: state.clearFormatSubstitutions,
  showInlineSearchBelow: state.showInlineSearchBelow,
  hideInlineSearch: state.hideInlineSearch,
  openInlineEditor: state.openInlineEditor,
  closeInlineEditor: state.closeInlineEditor,
  showSearchOverlay: state.showSearchOverlay,
  hideSearchOverlay: state.hideSearchOverlay,
  openAiChat: state.openAiChat,
  closeAiChat: state.closeAiChat,
  clearChain: state.clearChain,
  setChainSource: state.setChainSource,
  setIsDirty: state.setIsDirty,
});

// Hook for components to access chain actions without re-rendering on state changes.
// Cached because action functions never change identity in Zustand (created once in create()).
let _cachedActions: ReturnType<typeof actionsSelector> | null = null;
export const useChainActions = () => useChainStore((state) => {
  if (!_cachedActions) _cachedActions = actionsSelector(state);
  return _cachedActions;
});

// Set up event listener - handles both V1 and V2 chain state
juceBridge.onChainChanged((state: ChainStateV2) => {
  const prev = useChainStore.getState();
  const prevPluginIds = collectPluginNodeIds(prev.nodes);

  // Always reset loading flag when receiving chain updates (e.g., from mirror sync)
  useChainStore.setState({ ...applyState(state), loading: false });

  // Auto-color new plugin nodes by their enriched category
  const { enrichedData } = usePluginStore.getState();
  if (enrichedData.size === 0) return;

  const newColors: Record<number, string> = {};
  const assignCategoryColors = (nodeList: ChainNodeUI[]) => {
    for (const node of nodeList) {
      if (node.type === 'plugin' && !prevPluginIds.has(node.id) && !prev.slotColors[node.id]) {
        const enriched = enrichedData.get(node.uid);
        if (enriched?.category) {
          const color = getCategoryColor(enriched.category);
          if (color !== 'rgba(255,255,255,0.15)') {
            newColors[node.id] = color;
          }
        }
      }
      if (node.type === 'group') assignCategoryColors(node.children);
    }
  };
  assignCategoryColors(state.nodes || []);

  if (Object.keys(newColors).length > 0) {
    useChainStore.setState((s) => ({
      slotColors: { ...s.slotColors, ...newColors },
    }));
  }
});

// Per-node meter data for inline plugin meters.
// Writes to the dedicated meterStore so that 30fps updates only trigger
// selector evaluations in meter-displaying components, not all chainStore subscribers.
// C++ sends packed string format: "nodeId,v0,v1,...;nodeId,v0,v1,..."
// where floats are scaled to ints (×10000 for levels, ×100 for latency/lufs).
juceBridge.onNodeMeterData((raw: string | Record<string, NodeMeterReadings>) => {
  let data: Record<string, NodeMeterReadings>;
  if (typeof raw === 'string') {
    // Parse packed string format (fast path)
    data = {};
    const nodes = raw.split(';');
    for (let i = 0; i < nodes.length; i++) {
      const parts = nodes[i].split(',');
      if (parts.length < 16) continue;
      const S = 0.0001; // scale factor for level values (÷10000)
      const L = 0.01;   // scale factor for latency/lufs (÷100)
      data[parts[0]] = {
        peakL: +parts[1] * S,
        peakR: +parts[2] * S,
        peakHoldL: +parts[3] * S,
        peakHoldR: +parts[4] * S,
        rmsL: +parts[5] * S,
        rmsR: +parts[6] * S,
        inputPeakL: +parts[7] * S,
        inputPeakR: +parts[8] * S,
        inputPeakHoldL: +parts[9] * S,
        inputPeakHoldR: +parts[10] * S,
        inputRmsL: +parts[11] * S,
        inputRmsR: +parts[12] * S,
        latencyMs: +parts[13] * L,
        inputLufs: +parts[14] * L,
        outputLufs: +parts[15] * L,
      };
    }
  } else {
    data = raw;
  }
  const prev = useMeterStore.getState().nodeMeterData;
  const next: Record<string, NodeMeterReadings> = { ...prev };
  let changed = false;
  for (const key in data) {
    const p = prev[key];
    const n = data[key];
    if (
      !p ||
      p.peakL !== n.peakL ||
      p.peakR !== n.peakR ||
      p.rmsL !== n.rmsL ||
      p.rmsR !== n.rmsR ||
      p.inputPeakL !== n.inputPeakL ||
      p.inputPeakR !== n.inputPeakR
    ) {
      next[key] = n;
      changed = true;
    }
  }
  // Remove nodes no longer present
  for (const key in prev) {
    if (!(key in data)) {
      delete next[key];
      changed = true;
    }
  }
  if (changed) {
    useMeterStore.setState({ nodeMeterData: next });
  }
});

// Automation slot warning (Team 3)
juceBridge.onAutomationSlotWarning((warning: AutomationSlotWarning | null) => {
  useChainStore.setState({ automationWarning: warning });
});

// Latency warning (Team 4)
juceBridge.onLatencyWarning((warning: LatencyWarning | null) => {
  useChainStore.setState({ latencyWarning: warning });
});

// Inline editor mode changes (C++ → JS sync)
juceBridge.onInlineEditorChanged((state: { mode: string; nodeId?: number }) => {
  useChainStore.setState({
    inlineEditorNodeId: state.mode === 'plugin' ? (state.nodeId ?? null) : null,
  });
});

// Safety timer: auto-end continuous gesture if mouseUp was missed (e.g., pointer left window)
setInterval(() => {
  const { _continuousDragSnapshot, _continuousGestureLastActivity } = useChainStore.getState();
  if (_continuousDragSnapshot && _continuousGestureLastActivity > 0) {
    const elapsed = Date.now() - _continuousGestureLastActivity;
    if (elapsed > 2000) {
      useChainStore.getState()._endContinuousGesture();
    }
  }
}, 500);

// Phase 3: Handle child plugin parameter changes from C++
juceBridge.on('pluginParameterChangeSettled', (data: { beforeSnapshot: string }) => {
  const { _undoRedoInProgress, _continuousDragSnapshot, history } = useChainStore.getState();
  if (_undoRedoInProgress) return;
  if (_continuousDragSnapshot !== null) return; // Don't interfere with UI slider gestures

  const snapshot: ChainSnapshot = {
    binaryData: data.beforeSnapshot,
    nodes: [],  // No cached UI state — C++ will provide on restore
    slots: [],
  };

  const newHistory = [...history, snapshot];
  if (newHistory.length > MAX_HISTORY) newHistory.shift();
  useChainStore.setState({ history: newHistory, future: [] });
});
