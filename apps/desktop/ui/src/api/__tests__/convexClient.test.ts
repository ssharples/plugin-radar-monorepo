import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Shared mock functions for the ConvexHttpClient instance
const mockQuery = vi.fn();
const mockMutation = vi.fn();

// Mock the Convex HTTP client as a class
vi.mock('convex/browser', () => ({
  ConvexHttpClient: class MockConvexHttpClient {
    query = mockQuery;
    mutation = mockMutation;
  },
}));

// Mock the generated API
vi.mock('@convex/_generated/api', () => ({
  api: {
    auth: {
      login: 'auth:login',
      register: 'auth:register',
      logout: 'auth:logout',
      verifySession: 'auth:verifySession',
    },
    plugins: {
      getByIds: 'plugins:getByIds',
    },
    pluginDirectory: {
      syncScannedPlugins: 'pluginDirectory:syncScannedPlugins',
      saveChain: 'pluginDirectory:saveChain',
      getChain: 'pluginDirectory:getChain',
      browseChains: 'pluginDirectory:browseChains',
      browseChainsPaginated: 'pluginDirectory:browseChainsPaginated',
      checkChainCompatibility: 'pluginDirectory:checkChainCompatibility',
      getDetailedCompatibility: 'pluginDirectory:getDetailedCompatibility',
      downloadChain: 'pluginDirectory:downloadChain',
      toggleChainLike: 'pluginDirectory:toggleChainLike',
      getUserScannedPlugins: 'pluginDirectory:getUserScannedPlugins',
      getChainsByUser: 'pluginDirectory:getChainsByUser',
      getUserStats: 'pluginDirectory:getUserStats',
      addToCollection: 'pluginDirectory:addToCollection',
      removeFromCollection: 'pluginDirectory:removeFromCollection',
      getMyCollection: 'pluginDirectory:getMyCollection',
      isInCollection: 'pluginDirectory:isInCollection',
    },
    social: {
      getComments: 'social:getComments',
      addComment: 'social:addComment',
      deleteComment: 'social:deleteComment',
      getChainRating: 'social:getChainRating',
      rateChain: 'social:rateChain',
      followUser: 'social:followUser',
      unfollowUser: 'social:unfollowUser',
      isFollowing: 'social:isFollowing',
      forkChain: 'social:forkChain',
    },
    parameterTranslation: {
      getParameterMap: 'parameterTranslation:getParameterMap',
      getParameterMapByName: 'parameterTranslation:getParameterMapByName',
      upsertParameterMap: 'parameterTranslation:upsertParameterMap',
      findCompatibleSwaps: 'parameterTranslation:findCompatibleSwaps',
      getRandomSwap: 'parameterTranslation:getRandomSwap',
      translateParameters: 'parameterTranslation:translateParameters',
    },
    privateChains: {
      getReceivedChains: 'privateChains:getReceivedChains',
    },
    friends: {
      getPendingRequests: 'friends:getPendingRequests',
    },
  },
}));

// Mock the offlineStore
vi.mock('../../stores/offlineStore', () => {
  const cacheStore: Record<string, any> = {};
  return {
    useOfflineStore: {
      getState: () => ({
        cacheChain: vi.fn((key: string, data: any) => {
          cacheStore[key] = { data, cachedAt: new Date().toISOString(), key, syncStatus: 'synced' };
        }),
        getCachedChain: vi.fn((key: string) => cacheStore[key] ?? null),
        enqueueWrite: vi.fn(),
        setOnline: vi.fn(),
      }),
    },
    isOnline: vi.fn().mockReturnValue(true),
  };
});

describe('convex-client', () => {
  let mod: typeof import('../convex-client');

  beforeEach(async () => {
    vi.resetModules();
    mockQuery.mockReset();
    mockMutation.mockReset();
    localStorage.clear();

    // Fresh import for each test
    mod = await import('../convex-client');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =============================================
  // Session management
  // =============================================

  describe('session management', () => {
    it('login stores session token on success', async () => {
      mockMutation.mockResolvedValueOnce({ sessionToken: 'tok-123', userId: 'user-1' });

      const result = await mod.login('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(localStorage.getItem('pluginradar_session')).toBe('tok-123');
    });

    it('login returns error on failure', async () => {
      mockMutation.mockResolvedValueOnce(null);

      const result = await mod.login('bad@example.com', 'wrong');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Login failed');
      expect(localStorage.getItem('pluginradar_session')).toBeNull();
    });

    it('login returns error on exception', async () => {
      mockMutation.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await mod.login('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
    });

    it('logout clears session from localStorage', async () => {
      localStorage.setItem('pluginradar_session', 'tok-123');
      mockMutation.mockResolvedValueOnce(undefined);

      await mod.logout();

      expect(localStorage.getItem('pluginradar_session')).toBeNull();
    });

    it('register stores session token on success', async () => {
      mockMutation.mockResolvedValueOnce({ sessionToken: 'tok-new', userId: 'user-2' });

      const result = await mod.register('new@example.com', 'password123', 'Test User');

      expect(result.success).toBe(true);
      expect(localStorage.getItem('pluginradar_session')).toBe('tok-new');
    });

    it('initializeAuth returns true when session is valid', async () => {
      localStorage.setItem('pluginradar_session', 'tok-valid');
      mockQuery.mockResolvedValueOnce({ userId: 'user-1', email: 'test@example.com' });

      const result = await mod.initializeAuth();

      expect(result).toBe(true);
    });

    it('initializeAuth returns false and clears session when token is invalid', async () => {
      localStorage.setItem('pluginradar_session', 'tok-expired');
      mockQuery.mockResolvedValueOnce(null);

      const result = await mod.initializeAuth();

      expect(result).toBe(false);
      expect(localStorage.getItem('pluginradar_session')).toBeNull();
    });

    it('initializeAuth returns false when no stored session exists', async () => {
      const result = await mod.initializeAuth();

      expect(result).toBe(false);
    });

    it('getUserId returns null before login', () => {
      expect(mod.getUserId()).toBeNull();
    });
  });

  // =============================================
  // Enrichment cache
  // =============================================

  describe('enrichment cache', () => {
    it('fetchEnrichedPluginData returns empty array for empty input', async () => {
      const result = await mod.fetchEnrichedPluginData([]);
      expect(result).toEqual([]);
    });

    it('fetchEnrichedPluginData fetches from API and returns results', async () => {
      const mockPlugins = [
        { _id: 'p1', name: 'EQ', slug: 'eq', category: 'eq', tags: [], isFree: false, currency: 'USD', hasDemo: false, hasTrial: false, productUrl: '', formats: [], platforms: [] },
        { _id: 'p2', name: 'Comp', slug: 'comp', category: 'compressor', tags: [], isFree: true, currency: 'USD', hasDemo: false, hasTrial: false, productUrl: '', formats: [], platforms: [] },
      ];
      mockQuery.mockResolvedValueOnce(mockPlugins);

      const result = await mod.fetchEnrichedPluginData(['p1', 'p2']);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ _id: 'p1', name: 'EQ' });
      expect(result[1]).toMatchObject({ _id: 'p2', name: 'Comp' });
    });

    it('fetchEnrichedPluginData returns cached data within TTL without re-fetching', async () => {
      const mockPlugins = [
        { _id: 'p1', name: 'EQ', slug: 'eq', category: 'eq', tags: [], isFree: false, currency: 'USD', hasDemo: false, hasTrial: false, productUrl: '', formats: [], platforms: [] },
      ];
      mockQuery.mockResolvedValueOnce(mockPlugins);

      // First call — fetches from API
      await mod.fetchEnrichedPluginData(['p1']);
      expect(mockQuery).toHaveBeenCalledTimes(1);

      // Second call — should use cache (no new API call)
      const result = await mod.fetchEnrichedPluginData(['p1']);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ _id: 'p1', name: 'EQ' });
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('clearEnrichmentCache forces refetch on next call', async () => {
      const mockPlugins = [
        { _id: 'p1', name: 'EQ', slug: 'eq', category: 'eq', tags: [], isFree: false, currency: 'USD', hasDemo: false, hasTrial: false, productUrl: '', formats: [], platforms: [] },
      ];
      mockQuery.mockResolvedValue(mockPlugins);

      // First call
      await mod.fetchEnrichedPluginData(['p1']);
      expect(mockQuery).toHaveBeenCalledTimes(1);

      // Clear cache
      mod.clearEnrichmentCache();

      // Second call — should fetch again
      await mod.fetchEnrichedPluginData(['p1']);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // =============================================
  // executeQueuedWrite
  // =============================================

  describe('executeQueuedWrite', () => {
    it('dispatches saveChain action', async () => {
      // Login first to set cachedUserId
      mockMutation.mockResolvedValueOnce({ sessionToken: 'tok-123', userId: 'user-1' });
      await mod.login('test@example.com', 'pass');

      // Mock the saveChain mutation
      mockMutation.mockResolvedValueOnce({
        chainId: 'c1',
        slug: 'test',
        shareCode: 'ABC',
      });

      const result = await mod.executeQueuedWrite('saveChain', ['My Chain', [], {}]);
      expect(result).toBeDefined();
    });

    it('returns null for unknown action', async () => {
      const result = await mod.executeQueuedWrite('unknownAction', []);
      expect(result).toBeNull();
    });
  });

  // =============================================
  // syncPlugins
  // =============================================

  describe('syncPlugins', () => {
    it('returns error when not logged in', async () => {
      const result = await mod.syncPlugins([
        { name: 'EQ', manufacturer: 'Fab', format: 'VST3', uid: 1, fileOrIdentifier: '/eq.vst3', isInstrument: false, numInputChannels: 2, numOutputChannels: 2 },
      ]);

      expect(result.error).toBe('Not logged in');
      expect(result.synced).toBe(0);
    });

    it('returns result on successful sync', async () => {
      // Login first
      mockMutation.mockResolvedValueOnce({ sessionToken: 'tok', userId: 'u1' });
      await mod.login('test@example.com', 'pass');

      // Mock sync mutation
      mockMutation.mockResolvedValueOnce({ synced: 10, matched: 8 });

      const result = await mod.syncPlugins([
        { name: 'EQ', manufacturer: 'Fab', format: 'VST3', uid: 1, fileOrIdentifier: '/eq.vst3', isInstrument: false, numInputChannels: 2, numOutputChannels: 2 },
      ]);

      expect(result.synced).toBe(10);
      expect(result.inCatalog).toBe(8);
      expect(result.error).toBeUndefined();
    });
  });
});
