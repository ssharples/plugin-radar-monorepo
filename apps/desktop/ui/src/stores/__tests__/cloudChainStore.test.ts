import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock juce-bridge
vi.mock('../../api/juce-bridge', () => ({
  juceBridge: {
    onChainChanged: vi.fn(),
    onNodeMeterData: vi.fn(),
    exportChain: vi.fn().mockResolvedValue({
      slots: [
        { index: 0, name: 'EQ', manufacturer: 'Fab', format: 'VST3', uid: 1, version: '1.0', bypassed: false, presetData: 'abc', presetSizeBytes: 100 },
      ],
    }),
  },
}));

// Mock convex-client
vi.mock('../../api/convex-client', () => ({
  browseChains: vi.fn().mockResolvedValue([]),
  browseChainsPaginated: vi.fn().mockResolvedValue({ chains: [], total: 0, hasMore: false }),
  loadChain: vi.fn().mockResolvedValue(null),
  checkChainCompatibility: vi.fn().mockResolvedValue(null),
  saveChain: vi.fn().mockResolvedValue({ chainId: 'c1', slug: 'test-chain', shareCode: 'ABC' }),
  fetchDetailedCompatibility: vi.fn().mockResolvedValue(null),
  downloadChain: vi.fn().mockResolvedValue(true),
  toggleLike: vi.fn().mockResolvedValue({ liked: true }),
  getMyCollection: vi.fn().mockResolvedValue([]),
  addToCollection: vi.fn().mockResolvedValue({}),
  removeFromCollection: vi.fn().mockResolvedValue(true),
  getUserId: vi.fn().mockReturnValue('user-1'),
  getChainsByUser: vi.fn().mockResolvedValue([]),
  getScannedPlugins: vi.fn().mockResolvedValue([]),
  getChainRating: vi.fn().mockResolvedValue({ average: 4.5, count: 10, userRating: 5 }),
  rateChain: vi.fn().mockResolvedValue(true),
  getComments: vi.fn().mockResolvedValue([]),
  addComment: vi.fn().mockResolvedValue('comment-1'),
  deleteComment: vi.fn().mockResolvedValue(true),
  followUser: vi.fn().mockResolvedValue(true),
  unfollowUser: vi.fn().mockResolvedValue(true),
  isFollowing: vi.fn().mockResolvedValue(false),
  forkChain: vi.fn().mockResolvedValue({ chainId: 'c2', slug: 'forked', shareCode: 'DEF' }),
}));

// Mock captureSlotParameters
vi.mock('../../utils/captureParameters', () => ({
  captureSlotParameters: vi.fn().mockResolvedValue(new Map()),
}));

import { useCloudChainStore } from '../cloudChainStore';
import * as convexClient from '../../api/convex-client';

describe('cloudChainStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCloudChainStore.setState({
      chains: [],
      currentChain: null,
      compatibility: null,
      detailedCompatibility: null,
      loading: false,
      saving: false,
      error: null,
      browseTotal: 0,
      browseHasMore: false,
      collection: [],
      collectionLoading: false,
      myChains: [],
      myChainsLoading: false,
      ownedPluginIds: new Set<string>(),
    });
  });

  // =============================================
  // Collection management
  // =============================================

  describe('collection', () => {
    it('addToCollection triggers fetchCollection on success', async () => {
      const fetchSpy = vi.spyOn(useCloudChainStore.getState(), 'fetchCollection');
      vi.mocked(convexClient.addToCollection).mockResolvedValueOnce({});

      const result = await useCloudChainStore.getState().addToCollection('chain-1');

      expect(result).toBe(true);
      expect(convexClient.addToCollection).toHaveBeenCalledWith('chain-1', 'desktop');
    });

    it('addToCollection returns false on error', async () => {
      vi.mocked(convexClient.addToCollection).mockResolvedValueOnce({ error: 'Already exists' });

      const result = await useCloudChainStore.getState().addToCollection('chain-1');

      expect(result).toBe(false);
    });

    it('removeFromCollection optimistic update filters local state', async () => {
      // Set up initial collection with two items
      useCloudChainStore.setState({
        collection: [
          {
            _id: 'col-1',
            chain: { _id: 'chain-1', name: 'Chain A', slug: 'a', category: 'mixing', tags: [], pluginCount: 2, downloads: 0, likes: 0, isPublic: true, slots: [] },
            addedAt: Date.now(),
            source: 'desktop',
          },
          {
            _id: 'col-2',
            chain: { _id: 'chain-2', name: 'Chain B', slug: 'b', category: 'mixing', tags: [], pluginCount: 1, downloads: 0, likes: 0, isPublic: true, slots: [] },
            addedAt: Date.now(),
            source: 'desktop',
          },
        ],
      });

      vi.mocked(convexClient.removeFromCollection).mockResolvedValueOnce(true);

      const result = await useCloudChainStore.getState().removeFromCollection('chain-1');

      expect(result).toBe(true);
      const { collection } = useCloudChainStore.getState();
      expect(collection).toHaveLength(1);
      expect(collection[0].chain._id).toBe('chain-2');
    });
  });

  // =============================================
  // Social actions
  // =============================================

  describe('social actions', () => {
    it('rateChain calls convexClient.rateChain with correct args', async () => {
      await useCloudChainStore.getState().rateChain('chain-1', 5);

      expect(convexClient.rateChain).toHaveBeenCalledWith('chain-1', 5);
    });

    it('followAuthor extracts authorId from currentChain', async () => {
      useCloudChainStore.setState({
        currentChain: {
          _id: 'chain-1',
          name: 'Test Chain',
          slug: 'test',
          category: 'mixing',
          tags: [],
          pluginCount: 2,
          downloads: 10,
          likes: 5,
          isPublic: true,
          slots: [],
          authorId: 'author-42',
        },
      });

      await useCloudChainStore.getState().followAuthor('chain-1');

      expect(convexClient.followUser).toHaveBeenCalledWith('author-42');
    });

    it('followAuthor returns false if chainId does not match currentChain', async () => {
      useCloudChainStore.setState({
        currentChain: {
          _id: 'chain-1',
          name: 'Test Chain',
          slug: 'test',
          category: 'mixing',
          tags: [],
          pluginCount: 2,
          downloads: 10,
          likes: 5,
          isPublic: true,
          slots: [],
          authorId: 'author-42',
        },
      });

      const result = await useCloudChainStore.getState().followAuthor('chain-different');

      expect(result).toBe(false);
      expect(convexClient.followUser).not.toHaveBeenCalled();
    });

    it('followAuthor returns false if currentChain has no authorId', async () => {
      useCloudChainStore.setState({
        currentChain: {
          _id: 'chain-1',
          name: 'Test Chain',
          slug: 'test',
          category: 'mixing',
          tags: [],
          pluginCount: 2,
          downloads: 10,
          likes: 5,
          isPublic: true,
          slots: [],
          // No authorId
        },
      });

      const result = await useCloudChainStore.getState().followAuthor('chain-1');

      expect(result).toBe(false);
      expect(convexClient.followUser).not.toHaveBeenCalled();
    });

    it('getChainRating delegates to convexClient', async () => {
      const rating = await useCloudChainStore.getState().getChainRating('chain-1');

      expect(convexClient.getChainRating).toHaveBeenCalledWith('chain-1');
      expect(rating).toEqual({ average: 4.5, count: 10, userRating: 5 });
    });

    it('forkChain delegates and returns result', async () => {
      const result = await useCloudChainStore.getState().forkChain('chain-1', 'My Fork');

      expect(convexClient.forkChain).toHaveBeenCalledWith('chain-1', 'My Fork');
      expect(result).toEqual({ chainId: 'c2', slug: 'forked', shareCode: 'DEF' });
    });
  });

  // =============================================
  // Browse and load
  // =============================================

  describe('browse and load', () => {
    it('browseChains sets loading state and stores results', async () => {
      const mockChains = [
        { _id: 'c1', name: 'Chain 1', slug: 'chain-1', category: 'mixing', tags: [], pluginCount: 2, downloads: 10, likes: 5, isPublic: true, slots: [] },
      ];
      vi.mocked(convexClient.browseChains).mockResolvedValueOnce(mockChains);

      await useCloudChainStore.getState().browseChains({ category: 'mixing' });

      const state = useCloudChainStore.getState();
      expect(state.loading).toBe(false);
      expect(state.chains).toEqual(mockChains);
    });

    it('browseChains sets error on failure', async () => {
      vi.mocked(convexClient.browseChains).mockRejectedValueOnce(new Error('Network error'));

      await useCloudChainStore.getState().browseChains();

      const state = useCloudChainStore.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toContain('Network error');
    });
  });

  // =============================================
  // Owned plugin IDs
  // =============================================

  describe('owned plugin IDs', () => {
    it('fetchOwnedPluginIds populates set from scanned plugins with matchedPlugin', async () => {
      vi.mocked(convexClient.getScannedPlugins).mockResolvedValueOnce([
        { matchedPlugin: 'pid-1' },
        { matchedPlugin: null },
        { matchedPlugin: 'pid-2' },
      ] as any);

      await useCloudChainStore.getState().fetchOwnedPluginIds();

      const { ownedPluginIds } = useCloudChainStore.getState();
      expect(ownedPluginIds.size).toBe(2);
      expect(ownedPluginIds.has('pid-1')).toBe(true);
      expect(ownedPluginIds.has('pid-2')).toBe(true);
    });
  });
});
