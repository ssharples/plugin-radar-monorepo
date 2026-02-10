import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Offline Sync Stress Tests
// ============================================
// Tests the full offline cycle: save chain -> network dies -> writes queue up
// -> network returns -> flush queue -> verify data integrity.
//
// Strategy: Mock the Convex HTTP client + navigator.onLine.
// Use the REAL offlineStore so we exercise the full withWriteQueue ->
// enqueueWrite -> processQueue -> executeQueuedWrite path.

// Shared mock functions for ConvexHttpClient
const mockQuery = vi.fn();
const mockMutation = vi.fn();

// Mock convex/browser
vi.mock('convex/browser', () => ({
  ConvexHttpClient: class MockConvexHttpClient {
    query = mockQuery;
    mutation = mockMutation;
  },
}));

// Mock generated API (string stubs matching convexClient.test.ts patterns)
vi.mock('@convex/_generated/api', () => ({
  api: {
    auth: {
      login: 'auth:login',
      register: 'auth:register',
      logout: 'auth:logout',
      verifySession: 'auth:verifySession',
    },
    plugins: { getByIds: 'plugins:getByIds' },
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
    privateChains: { getReceivedChains: 'privateChains:getReceivedChains' },
    friends: { getPendingRequests: 'friends:getPendingRequests' },
  },
}));

// ---------------------
// Helpers
// ---------------------

/** Set navigator.onLine to the given value */
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    value,
    writable: true,
    configurable: true,
  });
}

/** Helper: log in the module so cachedUserId is set for mutations */
async function loginUser(mod: typeof import('../convex-client')) {
  mockMutation.mockResolvedValueOnce({ sessionToken: 'tok-offline-test', userId: 'user-offline' });
  await mod.login('offline@test.com', 'pass');
}

const sampleSlots = [
  {
    position: 0,
    pluginName: 'ProQ3',
    manufacturer: 'FabFilter',
    bypassed: false,
  },
];

describe('Offline Sync Stress Tests', () => {
  let mod: typeof import('../convex-client');
  let offlineMod: typeof import('../../stores/offlineStore');

  beforeEach(async () => {
    vi.resetModules();
    mockQuery.mockReset();
    mockMutation.mockReset();
    localStorage.clear();
    setOnline(true);

    // Fresh imports — the real offlineStore + real convex-client
    offlineMod = await import('../../stores/offlineStore');
    mod = await import('../convex-client');

    // Initialize the offline store (loads from localStorage, starts listeners)
    offlineMod.useOfflineStore.getState().initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    offlineMod.stopRetryLoop();
    setOnline(true);
  });

  // =============================================
  // 1. Happy path: online save succeeds immediately
  // =============================================

  it('saves chain successfully when online — no queue', async () => {
    await loginUser(mod);
    mockMutation.mockResolvedValueOnce({
      chainId: 'c-happy',
      slug: 'happy-chain',
      shareCode: 'HAPPY1',
    });

    const result = await mod.saveChain('Happy Chain', sampleSlots, { isPublic: true });

    expect(result.slug).toBe('happy-chain');
    expect(result.error).toBeUndefined();

    // Queue should be empty
    const store = offlineMod.useOfflineStore.getState();
    expect(store.writeQueue).toHaveLength(0);
    expect(store.pendingWrites).toBe(0);
  });

  // =============================================
  // 2. Offline save: queues write correctly
  // =============================================

  it('queues write when navigator.onLine is false', async () => {
    await loginUser(mod);
    setOnline(false);
    offlineMod.useOfflineStore.getState().setOnline(false);

    const result = await mod.saveChain('Offline Chain', sampleSlots, { category: 'mixing' });

    // Should return friendly offline error
    expect(result.error).toContain('will sync when back online');

    // Queue should have 1 entry
    const store = offlineMod.useOfflineStore.getState();
    expect(store.writeQueue).toHaveLength(1);
    expect(store.writeQueue[0].action).toBe('saveChain');
    expect(store.writeQueue[0].args[0]).toBe('Offline Chain');
    expect(store.writeQueue[0].retries).toBe(0);
    expect(store.syncStatus).toBe('offline');
  });

  // =============================================
  // 3. Queue accumulation: multiple writes while offline
  // =============================================

  it('accumulates multiple writes in queue while offline', async () => {
    await loginUser(mod);
    setOnline(false);
    offlineMod.useOfflineStore.getState().setOnline(false);

    // Queue 3 different writes
    await mod.saveChain('Chain A', sampleSlots).catch(() => {});
    await mod.saveChain('Chain B', sampleSlots).catch(() => {});
    await mod.saveChain('Chain C', sampleSlots).catch(() => {});

    const store = offlineMod.useOfflineStore.getState();
    expect(store.writeQueue).toHaveLength(3);
    expect(store.pendingWrites).toBe(3);

    // Verify order preserved
    expect(store.writeQueue[0].args[0]).toBe('Chain A');
    expect(store.writeQueue[1].args[0]).toBe('Chain B');
    expect(store.writeQueue[2].args[0]).toBe('Chain C');

    // Verify unique IDs
    const ids = store.writeQueue.map((w) => w.id);
    expect(new Set(ids).size).toBe(3);
  });

  // =============================================
  // 4. Flush on reconnect: all mutations dispatched in order
  // =============================================

  it('flushes queued writes in order on reconnect', async () => {
    await loginUser(mod);

    // Manually enqueue 3 writes
    offlineMod.useOfflineStore.getState().enqueueWrite('saveChain', ['Chain 1', sampleSlots, {}]);
    offlineMod.useOfflineStore.getState().enqueueWrite('saveChain', ['Chain 2', sampleSlots, {}]);
    offlineMod.useOfflineStore.getState().enqueueWrite('rateChain', ['chain-id-1', 5]);

    expect(offlineMod.useOfflineStore.getState().writeQueue).toHaveLength(3);

    // Mock the mutations that executeQueuedWrite will call
    // saveChain calls login first, so cachedUserId is set
    mockMutation
      .mockResolvedValueOnce({ chainId: 'c1', slug: 'chain-1', shareCode: 'A1' }) // saveChain 1
      .mockResolvedValueOnce({ chainId: 'c2', slug: 'chain-2', shareCode: 'A2' }) // saveChain 2
      .mockResolvedValueOnce(true); // rateChain

    // Set session token for rateChain (uses getStoredSession)
    localStorage.setItem('pluginradar_session', 'tok-offline-test');

    setOnline(true);
    offlineMod.useOfflineStore.getState().setOnline(true);

    // Process the queue using executeQueuedWrite
    await offlineMod.useOfflineStore.getState().processQueue(mod.executeQueuedWrite);

    // Queue should be empty
    const updated = offlineMod.useOfflineStore.getState();
    expect(updated.writeQueue).toHaveLength(0);
    expect(updated.pendingWrites).toBe(0);
    expect(updated.syncStatus).toBe('synced');

    // Verify mutations were called (login was 1, then 3 queue flushes)
    // mockMutation calls: login(1) + saveChain(1) + saveChain(1) + rateChain(1) = 4
    expect(mockMutation).toHaveBeenCalledTimes(4);
  });

  // =============================================
  // 5. Partial flush failure: failed writes remain queued
  // =============================================

  it('keeps failed writes in queue while committing successful ones', async () => {
    offlineMod.useOfflineStore.getState().enqueueWrite('actionA', ['OK 1']);
    offlineMod.useOfflineStore.getState().enqueueWrite('actionB', ['FAIL']);
    offlineMod.useOfflineStore.getState().enqueueWrite('actionC', ['OK 2']);

    expect(offlineMod.useOfflineStore.getState().writeQueue).toHaveLength(3);

    // Use a direct executor to control throw behavior
    // (saveChain swallows errors internally, so we test processQueue logic directly)
    let callCount = 0;
    const executor = vi.fn(async (action: string) => {
      callCount++;
      if (action === 'actionB') throw new Error('Server error: 500');
      return { ok: true };
    });

    setOnline(true);
    offlineMod.useOfflineStore.getState().setOnline(true);
    await offlineMod.useOfflineStore.getState().processQueue(executor);

    const updated = offlineMod.useOfflineStore.getState();
    // The failed write should remain
    expect(updated.writeQueue).toHaveLength(1);
    expect(updated.writeQueue[0].action).toBe('actionB');
    expect(updated.writeQueue[0].args[0]).toBe('FAIL');
    expect(updated.writeQueue[0].retries).toBe(1);
    expect(updated.writeQueue[0].lastError).toContain('Server error: 500');
    expect(updated.pendingWrites).toBe(1);
    expect(updated.syncStatus).toBe('pending');
    expect(executor).toHaveBeenCalledTimes(3);
  });

  // =============================================
  // 6. Cache fallback: returns cached data when offline
  // =============================================

  it('returns cached chain data when offline after prior fetch', async () => {
    const chainData = { name: 'Cached Chain', slots: sampleSlots, _id: 'c-cached' };

    // First fetch while online — succeeds and caches
    mockQuery.mockResolvedValueOnce(chainData);
    const online = await mod.loadChain('cached-slug');
    expect(online).toMatchObject({ name: 'Cached Chain' });

    // Go offline
    setOnline(false);

    // Second fetch — should return from cache
    const offline = await mod.loadChain('cached-slug');
    expect(offline).toMatchObject({ name: 'Cached Chain' });
    // Query should only have been called once (the online fetch)
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  // =============================================
  // 7. Cache miss offline: returns null when no cached data
  // =============================================

  it('returns null when offline with no cached data', async () => {
    setOnline(false);

    const result = await mod.loadChain('never-fetched');
    expect(result).toBeNull();
  });

  // =============================================
  // 8. Network error detection: all error patterns trigger queueing
  // =============================================

  describe('network error detection', () => {
    const networkErrors = [
      'Failed to fetch',
      'NetworkError when attempting to fetch resource',
      'ERR_INTERNET_DISCONNECTED',
      'ECONNREFUSED',
    ];

    for (const errMsg of networkErrors) {
      it(`queues write on "${errMsg}" error`, async () => {
        // Need a fresh import for each sub-test to avoid stale store state
        vi.resetModules();
        localStorage.clear();
        setOnline(true);
        mockQuery.mockReset();
        mockMutation.mockReset();

        const freshOffline = await import('../../stores/offlineStore');
        const freshMod = await import('../convex-client');
        freshOffline.useOfflineStore.getState().initialize();

        // Login
        mockMutation.mockResolvedValueOnce({ sessionToken: 'tok-net', userId: 'user-net' });
        await freshMod.login('net@test.com', 'pass');

        // Mutation fails with network error
        mockMutation.mockRejectedValueOnce(new Error(errMsg));

        // saveChain should throw but still queue
        await expect(
          freshMod.saveChain('Net Error Chain', sampleSlots)
        ).resolves.toMatchObject({ error: expect.stringContaining(errMsg) });

        const store = freshOffline.useOfflineStore.getState();
        expect(store.writeQueue).toHaveLength(1);
        expect(store.writeQueue[0].action).toBe('saveChain');
        // Should also flip online to false
        expect(store.online).toBe(false);

        freshOffline.stopRetryLoop();
      });
    }
  });

  // =============================================
  // 9. Non-network errors do NOT queue
  // =============================================

  it('does not queue writes for non-network errors (e.g. validation)', async () => {
    await loginUser(mod);

    mockMutation.mockRejectedValueOnce(new Error('Validation: name too long'));

    const result = await mod.saveChain('Bad Name '.repeat(100), sampleSlots);

    // Should return error but NOT queue
    expect(result.error).toContain('Validation: name too long');
    const store = offlineMod.useOfflineStore.getState();
    expect(store.writeQueue).toHaveLength(0);
  });

  // =============================================
  // 10. Queue persistence across store reinitialize
  // =============================================

  it('persists queued writes in localStorage across re-initialization', async () => {
    await loginUser(mod);

    // Enqueue writes
    offlineMod.useOfflineStore.getState().enqueueWrite('saveChain', ['Persistent Chain', sampleSlots, {}]);
    offlineMod.useOfflineStore.getState().enqueueWrite('rateChain', ['chain-xyz', 4]);

    expect(offlineMod.useOfflineStore.getState().writeQueue).toHaveLength(2);

    // Verify localStorage has the data
    const raw = localStorage.getItem('pr_write_queue');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveLength(2);

    // Simulate re-initialization (e.g. app restart)
    vi.resetModules();
    const freshOffline = await import('../../stores/offlineStore');
    freshOffline.useOfflineStore.getState().initialize();

    const freshStore = freshOffline.useOfflineStore.getState();
    expect(freshStore.writeQueue).toHaveLength(2);
    expect(freshStore.writeQueue[0].action).toBe('saveChain');
    expect(freshStore.writeQueue[1].action).toBe('rateChain');
    expect(freshStore.pendingWrites).toBe(2);

    freshOffline.stopRetryLoop();
  });

  // =============================================
  // 11. Max retries: drops write after MAX_RETRIES
  // =============================================

  it('drops a write from queue after 5 failed retries', async () => {
    await loginUser(mod);

    // Manually add a write that has already been retried 4 times
    offlineMod.useOfflineStore.getState().enqueueWrite('saveChain', ['Doomed Chain', sampleSlots, {}]);

    // Manually set retries to 4 (one more failure = 5 = MAX_RETRIES = drop)
    const queue = offlineMod.useOfflineStore.getState().writeQueue.map((w) => ({ ...w, retries: 4 }));
    offlineMod.useOfflineStore.setState({ writeQueue: queue });

    // Executor always fails
    const failExecutor = vi.fn().mockRejectedValue(new Error('Server down'));

    setOnline(true);
    offlineMod.useOfflineStore.getState().setOnline(true);
    await offlineMod.useOfflineStore.getState().processQueue(failExecutor);

    const updated = offlineMod.useOfflineStore.getState();
    // Should be dropped (retries was 4, incremented to 5 = MAX_RETRIES)
    expect(updated.writeQueue).toHaveLength(0);
    expect(updated.pendingWrites).toBe(0);
    expect(updated.lastError).toContain('dropped after 5 retries');
  });

  // =============================================
  // 12. Session token survives offline period
  // =============================================

  it('session token persists through offline period and is usable on reconnect', async () => {
    await loginUser(mod);

    // Verify token stored
    expect(localStorage.getItem('pluginradar_session')).toBe('tok-offline-test');

    // Go offline
    setOnline(false);
    offlineMod.useOfflineStore.getState().setOnline(false);

    // Token should still be in localStorage
    expect(localStorage.getItem('pluginradar_session')).toBe('tok-offline-test');

    // Come back online
    setOnline(true);
    offlineMod.useOfflineStore.getState().setOnline(true);

    // Verify session is still valid by calling verifySession
    mockQuery.mockResolvedValueOnce({ userId: 'user-offline', email: 'offline@test.com' });
    const restored = await mod.initializeAuth();
    expect(restored).toBe(true);
  });

  // =============================================
  // 13. Browse chains with cache fallback
  // =============================================

  it('browseChains returns cached results when offline', async () => {
    const chains = [
      { _id: 'c1', name: 'Chain 1', slug: 'chain-1' },
      { _id: 'c2', name: 'Chain 2', slug: 'chain-2' },
    ];

    // Online fetch
    mockQuery.mockResolvedValueOnce(chains);
    const onlineResult = await mod.browseChains({ category: 'mixing', sortBy: 'popular' });
    expect(onlineResult).toHaveLength(2);

    // Go offline
    setOnline(false);

    // Should return cached
    const offlineResult = await mod.browseChains({ category: 'mixing', sortBy: 'popular' });
    expect(offlineResult).toHaveLength(2);
    expect(offlineResult[0]).toMatchObject({ name: 'Chain 1' });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  // =============================================
  // 14. processQueue skips when already retrying
  // =============================================

  it('processQueue is a no-op when already retrying (prevents concurrent flushes)', async () => {
    offlineMod.useOfflineStore.getState().enqueueWrite('saveChain', ['Concurrent Chain', sampleSlots, {}]);

    // Manually set retrying flag
    offlineMod.useOfflineStore.setState({ retrying: true });

    const executor = vi.fn();
    await offlineMod.useOfflineStore.getState().processQueue(executor);

    // Executor should not have been called
    expect(executor).not.toHaveBeenCalled();

    // Queue should remain unchanged
    expect(offlineMod.useOfflineStore.getState().writeQueue).toHaveLength(1);
  });

  // =============================================
  // 15. Cache eviction when over MAX_CACHE_ENTRIES
  // =============================================

  it('evicts oldest cache entries when over 100 entries', () => {
    const store = offlineMod.useOfflineStore.getState();

    // Fill cache with 101 entries
    for (let i = 0; i < 101; i++) {
      store.cacheChain(`chain:test-${i.toString().padStart(3, '0')}`, { name: `Chain ${i}` });
    }

    // localStorage should have been saved with eviction applied
    const raw = localStorage.getItem('pr_offline_chains');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(Object.keys(parsed).length).toBeLessThanOrEqual(100);
  });
});
