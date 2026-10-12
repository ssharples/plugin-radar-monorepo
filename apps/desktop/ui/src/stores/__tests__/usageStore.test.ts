import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'plugin_usage_stats';
const plugin = (uid: number, name = `Plugin ${uid}`, manufacturer = `Maker ${uid}`) => ({ uid, name, manufacturer });

async function importUsageStore() {
  vi.resetModules();
  return (await import('../usageStore')).useUsageStore;
}

describe('usageStore public behaviour', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('records first and repeated loads with metadata, timestamps, and count', async () => {
    const store = await importUsageStore();
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(250);

    store.getState().recordPluginLoad(11, 'Echo', 'Acme');
    expect(store.getState().getUsageStats(11)?.loadCount).toBe(1);
    store.getState().recordPluginLoad(11, 'Echo Updated', 'New Acme');

    expect(store.getState().getUsageStats(11)).toMatchObject({
      uid: 11, name: 'Echo Updated', manufacturer: 'New Acme', loadCount: 2,
      firstUsedAt: 100, lastUsedAt: 250, coUsage: {},
    });
  });

  it('keeps independent plugin records and preserves co-usage across reloads', async () => {
    const store = await importUsageStore();
    vi.spyOn(Date, 'now').mockReturnValue(500);
    store.getState().recordPluginLoad(1, 'One', 'A');
    store.getState().recordPluginLoad(2, 'Two', 'B');
    store.getState().recordCoUsage(1, 2);
    store.getState().recordPluginLoad(1, 'One', 'A');

    expect(store.getState().getUsageStats(1)?.coUsage).toEqual({ 2: 1 });
    expect(store.getState().getUsageStats(2)?.coUsage).toEqual({});
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)[1].coUsage).toEqual({ 2: 1 });
  });

  it('ignores co-usage for an unknown plugin and self-pairs', async () => {
    const store = await importUsageStore();
    store.getState().recordPluginLoad(3, 'Three', 'C');
    store.getState().recordCoUsage(99, 3);
    store.getState().recordCoUsage(3, 3);
    expect(store.getState().getUsageStats(3)?.coUsage).toEqual({});
  });

  it('returns companions sorted by frequency and limited to the requested count', async () => {
    const store = await importUsageStore();
    store.getState().recordPluginLoad(1, 'One', 'A');
    for (const [uid, count] of [[2, 3], [3, 1], [4, 2]] as const) {
      store.getState().recordPluginLoad(uid, `Plugin ${uid}`, 'Maker');
      for (let i = 0; i < count; i++) store.getState().recordCoUsage(1, uid);
    }

    expect(store.getState().getTopCoUsage(1)).toEqual([{ uid: 2, count: 3 }, { uid: 4, count: 2 }, { uid: 3, count: 1 }]);
    expect(store.getState().getTopCoUsage(1, 2)).toEqual([{ uid: 2, count: 3 }, { uid: 4, count: 2 }]);
    expect(store.getState().getTopCoUsage(1, 0)).toEqual([]);
    expect(store.getState().getTopCoUsage(404)).toEqual([]);
  });

  it('restores persisted records during store startup', async () => {
    const saved = { 7: { ...plugin(7, 'Saved', 'Archive'), loadCount: 4, firstUsedAt: 10, lastUsedAt: 20, coUsage: { 8: 2 } } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    const store = await importUsageStore();
    expect(store.getState().getUsageStats(7)).toEqual(saved[7]);
  });

  it('persists load and co-usage actions while tolerating storage write failures', async () => {
    const store = await importUsageStore();
    const setItem = vi.spyOn(localStorage, 'setItem');
    store.getState().recordPluginLoad(5, 'Five', 'E');
    store.getState().recordCoUsage(5, 6);
    expect(setItem).toHaveBeenCalledTimes(2);

    setItem.mockImplementation(() => { throw new Error('quota'); });
    expect(() => store.getState().recordPluginLoad(5, 'Five', 'E')).not.toThrow();
    expect(store.getState().getUsageStats(5)?.loadCount).toBe(2);
  });

  it('starts empty when persisted JSON is malformed or storage cannot be read', async () => {
    localStorage.setItem(STORAGE_KEY, '{bad json');
    let store = await importUsageStore();
    expect(store.getState().plugins).toEqual({});

    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('unavailable'); });
    store = await importUsageStore();
    expect(getItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(store.getState().plugins).toEqual({});
  });
});
