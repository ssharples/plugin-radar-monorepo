import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock juce-bridge before importing the store
vi.mock('../../api/juce-bridge', () => ({
  juceBridge: {
    onChainChanged: vi.fn(),
    onNodeMeterData: vi.fn(),
    importChain: vi.fn().mockResolvedValue(undefined),
    exportChain: vi.fn().mockResolvedValue({ nodes: [], slots: [] }),
    getChainState: vi.fn().mockResolvedValue({ nodes: [], slots: [] }),
    addPlugin: vi.fn(),
    addPluginToGroup: vi.fn(),
    removePlugin: vi.fn(),
    movePlugin: vi.fn(),
    removeNode: vi.fn(),
    moveNode: vi.fn(),
    duplicateNode: vi.fn(),
    setSlotBypassed: vi.fn(),
    setNodeBypassed: vi.fn(),
    createGroup: vi.fn(),
    dissolveGroup: vi.fn(),
    setGroupMode: vi.fn(),
    setGroupDryWet: vi.fn(),
    setBranchGain: vi.fn(),
    setBranchSolo: vi.fn(),
    setBranchMute: vi.fn(),
    openPluginUI: vi.fn().mockResolvedValue(undefined),
    closePluginUI: vi.fn().mockResolvedValue(undefined),
    discoverPluginParameters: vi.fn(),
  },
}));

// Mock convex-client
vi.mock('../../api/convex-client', () => ({
  uploadDiscoveredParameterMap: vi.fn(),
  getParameterMapByName: vi.fn(),
}));

// Mock usageStore
vi.mock('../usageStore', () => ({
  useUsageStore: {
    getState: () => ({
      recordPluginLoad: vi.fn(),
      recordCoUsage: vi.fn(),
    }),
  },
}));

// Mock pluginStore
vi.mock('../pluginStore', () => ({
  usePluginStore: {
    getState: () => ({
      enrichedData: new Map(),
    }),
  },
}));

import { useChainStore } from '../chainStore';
import type { ChainNodeUI } from '../../api/types';

// Helper to build plugin nodes
function makePlugin(id: number, name = `Plugin ${id}`): ChainNodeUI {
  return {
    id,
    type: 'plugin',
    name,
    format: 'VST3',
    uid: id * 100,
    fileOrIdentifier: `/path/${name}.vst3`,
    bypassed: false,
    manufacturer: 'TestMfr',
    branchGainDb: 0,
    solo: false,
    mute: false,
  };
}

// Helper to build group nodes
function makeGroup(
  id: number,
  children: ChainNodeUI[],
  mode: 'serial' | 'parallel' = 'serial'
): ChainNodeUI {
  return {
    id,
    type: 'group',
    name: `Group ${id}`,
    mode,
    dryWet: 1.0,
    collapsed: false,
    children,
  };
}

describe('chainStore', () => {
  beforeEach(() => {
    // Reset the store to initial state before each test
    useChainStore.setState({
      nodes: [],
      slots: [],
      selectedNodeId: null,
      selectedSlotIndex: null,
      openEditors: new Set<number>(),
      loading: false,
      error: null,
      targetInputLufs: null,
      chainName: 'Untitled Chain',
      lastCloudChainId: null,
      history: [],
      future: [],
      _undoRedoInProgress: false,
      snapshots: [null, null, null],
      activeSnapshot: null,
      nodeMeterData: {},
    });
  });

  // =============================================
  // Undo/Redo
  // =============================================

  describe('undo/redo', () => {
    it('_pushHistory deep clones state — mutating original does not affect history', () => {
      const nodes: ChainNodeUI[] = [makePlugin(1, 'EQ')];
      const slots = [{ index: 0, name: 'EQ', format: 'VST3', uid: 100, fileOrIdentifier: '/eq.vst3', bypassed: false, manufacturer: 'TestMfr' }];
      useChainStore.setState({ nodes, slots });

      // Push to history
      useChainStore.getState()._pushHistory();

      // Mutate the original nodes array
      nodes.push(makePlugin(2, 'Comp'));

      // The snapshot in history should still have only 1 node
      const { history } = useChainStore.getState();
      expect(history).toHaveLength(1);
      expect(history[0].nodes).toHaveLength(1);
      expect(history[0].nodes[0]).toMatchObject({ id: 1, name: 'EQ' });
    });

    it('history is capped at 50 entries', () => {
      // Push 55 history entries
      for (let i = 0; i < 55; i++) {
        useChainStore.setState({ nodes: [makePlugin(i)] });
        useChainStore.getState()._pushHistory();
      }

      const { history } = useChainStore.getState();
      expect(history.length).toBeLessThanOrEqual(50);
    });

    it('undo restores previous state and pushes current to future', async () => {
      // State A: one plugin
      const nodesA = [makePlugin(1, 'EQ')];
      useChainStore.setState({ nodes: nodesA, slots: [] });

      // Push state A to history, then set state B
      useChainStore.getState()._pushHistory();
      const nodesB = [makePlugin(1, 'EQ'), makePlugin(2, 'Comp')];
      useChainStore.setState({ nodes: nodesB, slots: [] });

      // Undo: should restore state A, and B goes to future
      await useChainStore.getState().undo();

      const state = useChainStore.getState();
      expect(state.nodes).toHaveLength(1);
      expect(state.nodes[0]).toMatchObject({ id: 1, name: 'EQ' });
      expect(state.future).toHaveLength(1);
      expect(state.future[0].nodes).toHaveLength(2);
      expect(state.history).toHaveLength(0);
    });

    it('redo restores future state symmetrically', async () => {
      // Set up: A -> push -> B -> undo -> redo should get B back
      useChainStore.setState({ nodes: [makePlugin(1)], slots: [] });
      useChainStore.getState()._pushHistory();
      useChainStore.setState({ nodes: [makePlugin(1), makePlugin(2)], slots: [] });

      await useChainStore.getState().undo();
      // Now at state A, future has state B
      expect(useChainStore.getState().nodes).toHaveLength(1);

      await useChainStore.getState().redo();
      // Should be back at state B
      const state = useChainStore.getState();
      expect(state.nodes).toHaveLength(2);
      expect(state.history).toHaveLength(1);
      expect(state.future).toHaveLength(0);
    });

    it('new mutation clears redo stack (future)', () => {
      // Push two history entries so we can undo
      useChainStore.setState({ nodes: [makePlugin(1)], slots: [] });
      useChainStore.getState()._pushHistory();
      useChainStore.setState({ nodes: [makePlugin(2)], slots: [] });

      // Simulate: set some future items as if user had undone
      useChainStore.setState({
        future: [{ nodes: [makePlugin(99)], slots: [] }],
      });

      // Now push new history (simulates a new mutation)
      useChainStore.getState()._pushHistory();

      const { future } = useChainStore.getState();
      expect(future).toHaveLength(0);
    });

    it('canUndo returns false when history is empty', () => {
      expect(useChainStore.getState().canUndo()).toBe(false);
    });

    it('canRedo returns false when future is empty', () => {
      expect(useChainStore.getState().canRedo()).toBe(false);
    });

    it('undo on empty history is a no-op', async () => {
      useChainStore.setState({ nodes: [makePlugin(1)], slots: [] });
      await useChainStore.getState().undo();

      // State should be unchanged
      expect(useChainStore.getState().nodes).toHaveLength(1);
      expect(useChainStore.getState().future).toHaveLength(0);
    });
  });

  // =============================================
  // Tree navigation
  // =============================================

  describe('tree navigation', () => {
    it('findNodeById with DFS returns the correct node in a nested tree', () => {
      // We test via toggleGroupCollapsed which internally uses the same tree structure
      // For direct findNodeById, we test indirectly through toggleNodeBypass which
      // calls findNodeById. Let's test toggleGroupCollapsed for tree traversal instead.
      const innerPlugin = makePlugin(3, 'InnerPlugin');
      const innerGroup = makeGroup(2, [innerPlugin]);
      const outerGroup = makeGroup(1, [innerGroup]);
      useChainStore.setState({ nodes: [outerGroup] });

      // Toggle the inner group collapsed state
      useChainStore.getState().toggleGroupCollapsed(2);

      const state = useChainStore.getState();
      const topGroup = state.nodes[0];
      expect(topGroup.type).toBe('group');
      if (topGroup.type === 'group') {
        const inner = topGroup.children[0];
        expect(inner.type).toBe('group');
        if (inner.type === 'group') {
          expect(inner.collapsed).toBe(true);
        }
      }
    });

    it('toggleGroupCollapsed returns immutable new tree (original reference differs)', () => {
      const plugin = makePlugin(1);
      const group = makeGroup(10, [plugin]);
      useChainStore.setState({ nodes: [group] });

      const nodesBefore = useChainStore.getState().nodes;

      useChainStore.getState().toggleGroupCollapsed(10);

      const nodesAfter = useChainStore.getState().nodes;
      expect(nodesBefore).not.toBe(nodesAfter);
      // The group node itself should be a new reference
      expect(nodesBefore[0]).not.toBe(nodesAfter[0]);
    });

    it('toggleGroupCollapsed on nonexistent ID leaves tree unchanged', () => {
      const plugin = makePlugin(1);
      const group = makeGroup(10, [plugin]);
      useChainStore.setState({ nodes: [group] });

      useChainStore.getState().toggleGroupCollapsed(999);

      const state = useChainStore.getState();
      if (state.nodes[0].type === 'group') {
        expect(state.nodes[0].collapsed).toBe(false);
      }
    });
  });

  // =============================================
  // A/B/C Snapshots
  // =============================================

  describe('A/B/C snapshots', () => {
    it('saveSnapshot stores at the correct index and sets activeSnapshot', async () => {
      const { juceBridge } = await import('../../api/juce-bridge');
      const mockExportData = { nodes: [makePlugin(1)], slots: [] };
      vi.mocked(juceBridge.exportChain).mockResolvedValueOnce(mockExportData);

      await useChainStore.getState().saveSnapshot(1);

      const state = useChainStore.getState();
      expect(state.snapshots[1]).not.toBeNull();
      expect(state.snapshots[1]!.data).toEqual(mockExportData);
      expect(state.snapshots[1]!.savedAt).toBeGreaterThan(0);
      expect(state.activeSnapshot).toBe(1);
      // Other slots should remain null
      expect(state.snapshots[0]).toBeNull();
      expect(state.snapshots[2]).toBeNull();
    });

    it('recallSnapshot updates activeSnapshot and pushes history', async () => {
      // Pre-populate a snapshot at index 0
      const snapshotData = { nodes: [makePlugin(5)], slots: [] };
      useChainStore.setState({
        snapshots: [{ data: snapshotData, savedAt: Date.now() }, null, null],
      });

      await useChainStore.getState().recallSnapshot(0);

      const state = useChainStore.getState();
      expect(state.activeSnapshot).toBe(0);
      // History should have been pushed (the state before recall)
      expect(state.history.length).toBeGreaterThanOrEqual(1);
    });

    it('recallSnapshot on empty slot is a no-op', async () => {
      await useChainStore.getState().recallSnapshot(2);

      const state = useChainStore.getState();
      expect(state.activeSnapshot).toBeNull();
      expect(state.history).toHaveLength(0);
    });
  });

  // =============================================
  // Selection and simple setters
  // =============================================

  describe('selection and setters', () => {
    it('selectNode sets both selectedNodeId and selectedSlotIndex', () => {
      useChainStore.getState().selectNode(42);

      const state = useChainStore.getState();
      expect(state.selectedNodeId).toBe(42);
      expect(state.selectedSlotIndex).toBe(42);
    });

    it('selectNode with null clears selection', () => {
      useChainStore.getState().selectNode(42);
      useChainStore.getState().selectNode(null);

      const state = useChainStore.getState();
      expect(state.selectedNodeId).toBeNull();
      expect(state.selectedSlotIndex).toBeNull();
    });

    it('setChainName updates the chain name', () => {
      useChainStore.getState().setChainName('My Chain');
      expect(useChainStore.getState().chainName).toBe('My Chain');
    });

    it('setTargetInputLufs updates the LUFS target', () => {
      useChainStore.getState().setTargetInputLufs(-14);
      expect(useChainStore.getState().targetInputLufs).toBe(-14);
    });

    it('setLastCloudChainId updates the cloud chain ID', () => {
      useChainStore.getState().setLastCloudChainId('abc-123');
      expect(useChainStore.getState().lastCloudChainId).toBe('abc-123');
    });
  });
});
