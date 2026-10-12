import { create } from 'zustand';

// ============================================
// Offline Chain Cache + Sync Queue
// ============================================
// Caches cloud chains in localStorage for offline access.
// Queues writes that fail (offline) for automatic retry.

export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'offline' | 'error';

export interface CachedChain {
  /** The chain data as returned by loadChain */
  data: any;
  /** ISO timestamp of when it was cached */
  cachedAt: string;
  /** Slug or share code used to load it */
  key: string;
  /** Current sync status */
  syncStatus: SyncStatus;
}

export interface QueuedWrite {
  id: string;
  /** The function name to call (e.g. 'saveChain') */
  action: string;
  /** Arguments to pass to the function */
  args: any[];
  /** ISO timestamp of when it was queued */
  queuedAt: string;
  /** Number of retry attempts */
  retries: number;
  /** Last error message */
  lastError?: string;
}

// localStorage keys
const CACHE_KEY = 'pr_offline_chains';
const QUEUE_KEY = 'pr_write_queue';
const MAX_CACHE_ENTRIES = 100;
const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 30_000; // 30 seconds

// ============================================
// Persistence helpers
// ============================================

function loadCache(): Record<string, CachedChain> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, CachedChain>) {
  try {
    // Evict oldest entries if over limit
    const keys = Object.keys(cache);
    if (keys.length > MAX_CACHE_ENTRIES) {
      const sorted = keys.sort(
        (a, b) => new Date(cache[a].cachedAt).getTime() - new Date(cache[b].cachedAt).getTime()
      );
      const toRemove = sorted.slice(0, keys.length - MAX_CACHE_ENTRIES);
      for (const key of toRemove) {
        delete cache[key];
      }
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('[OfflineStore] Failed to save cache:', e);
  }
}

function loadQueue(): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedWrite[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('[OfflineStore] Failed to save queue:', e);
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================
// Online detection
// ============================================

/** Check if we're online. Uses navigator.onLine + a quick fetch test. */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Ping the Convex endpoint to verify real connectivity.
 * navigator.onLine can be unreliable (LAN vs internet).
 */
export async function checkConnectivity(): Promise<boolean> {
  if (!navigator.onLine) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch('https://next-frog-231.convex.cloud', {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// Store
// ============================================

interface OfflineStoreState {
  /** Global sync status indicator */
  syncStatus: SyncStatus;
  /** Whether we believe we're online */
  online: boolean;
  /** Number of pending writes in the queue */
  pendingWrites: number;
  /** The chain cache (in-memory mirror of localStorage) */
  cache: Record<string, CachedChain>;
  /** The write queue (in-memory mirror of localStorage) */
  writeQueue: QueuedWrite[];
  /** Whether the retry loop is running */
  retrying: boolean;
  /** Last sync error message */
  lastError: string | null;
}

interface OfflineStoreActions {
  /** Initialize: load from localStorage and start online listeners */
  initialize: () => void;
  /** Cache a chain by key (slug or share code) */
  cacheChain: (key: string, data: any) => void;
  /** Get a cached chain by key */
  getCachedChain: (key: string) => CachedChain | null;
  /** Get all cached chains */
  getAllCachedChains: () => CachedChain[];
  /** Remove a chain from cache */
  removeCachedChain: (key: string) => void;
  /** Clear the entire cache */
  clearCache: () => void;
  /** Enqueue a write operation for retry */
  enqueueWrite: (action: string, args: any[]) => void;
  /** Process the write queue (retry pending writes) */
  processQueue: (executor: (action: string, args: any[]) => Promise<any>) => Promise<void>;
  /** Remove a specific write from the queue */
  removeFromQueue: (id: string) => void;
  /** Clear the entire write queue */
  clearQueue: () => void;
  /** Update online status */
  setOnline: (online: boolean) => void;
  /** Recompute the global sync status */
  updateSyncStatus: () => void;
}

export const useOfflineStore = create<OfflineStoreState & OfflineStoreActions>((set, get) => ({
  syncStatus: 'synced',
  online: navigator.onLine,
  pendingWrites: 0,
  cache: {},
  writeQueue: [],
  retrying: false,
  lastError: null,

  initialize: () => {
    const cache = loadCache();
    const writeQueue = loadQueue();
    set({
      cache,
      writeQueue,
      pendingWrites: writeQueue.length,
      online: navigator.onLine,
    });

    // Listen for online/offline events
    const handleOnline = () => {
      set({ online: true });
      get().updateSyncStatus();
    };
    const handleOffline = () => {
      set({ online: false });
      get().updateSyncStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    get().updateSyncStatus();
  },

  cacheChain: (key: string, data: any) => {
    const cache = { ...get().cache };
    cache[key] = {
      data,
      cachedAt: new Date().toISOString(),
      key,
      syncStatus: 'synced',
    };
    set({ cache });
    saveCache(cache);
  },

  getCachedChain: (key: string) => {
    return get().cache[key] ?? null;
  },

  getAllCachedChains: () => {
    return Object.values(get().cache);
  },

  removeCachedChain: (key: string) => {
    const cache = { ...get().cache };
    delete cache[key];
    set({ cache });
    saveCache(cache);
  },

  clearCache: () => {
    set({ cache: {} });
    localStorage.removeItem(CACHE_KEY);
  },

  enqueueWrite: (action: string, args: any[]) => {
    const writeQueue = [
      ...get().writeQueue,
      {
        id: generateId(),
        action,
        args,
        queuedAt: new Date().toISOString(),
        retries: 0,
      },
    ];
    set({ writeQueue, pendingWrites: writeQueue.length });
    saveQueue(writeQueue);
    get().updateSyncStatus();
  },

  processQueue: async (executor) => {
    const { writeQueue, retrying } = get();
    if (retrying || writeQueue.length === 0) return;
    if (!isOnline()) return;

    set({ retrying: true });

    const remaining: QueuedWrite[] = [];
    for (const item of writeQueue) {
      try {
        await executor(item.action, item.args);
        // Success — don't add back to remaining
      } catch (err) {
        const newRetries = item.retries + 1;
        if (newRetries < MAX_RETRIES) {
          remaining.push({
            ...item,
            retries: newRetries,
            lastError: String(err),
          });
        } else {
          console.error(`[OfflineStore] Dropping write after ${MAX_RETRIES} retries:`, item, err);
          set({ lastError: `Failed to sync: ${item.action} (dropped after ${MAX_RETRIES} retries)` });
        }
      }
    }

    set({
      writeQueue: remaining,
      pendingWrites: remaining.length,
      retrying: false,
    });
    saveQueue(remaining);
    get().updateSyncStatus();
  },

  removeFromQueue: (id: string) => {
    const writeQueue = get().writeQueue.filter((w) => w.id !== id);
    set({ writeQueue, pendingWrites: writeQueue.length });
    saveQueue(writeQueue);
    get().updateSyncStatus();
  },

  clearQueue: () => {
    set({ writeQueue: [], pendingWrites: 0 });
    localStorage.removeItem(QUEUE_KEY);
    get().updateSyncStatus();
  },

  setOnline: (online: boolean) => {
    set({ online });
    get().updateSyncStatus();
  },

  updateSyncStatus: () => {
    const { online, pendingWrites } = get();
    let status: SyncStatus;
    if (!online) {
      status = 'offline';
    } else if (pendingWrites > 0) {
      status = 'pending';
    } else {
      status = 'synced';
    }
    set({ syncStatus: status });
  },
}));

// ============================================
// Auto-retry: start a background loop
// ============================================

let retryIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Start the auto-retry loop. Call this once at app initialization.
 * Pass the executor function that knows how to dispatch queued writes.
 */
export function startRetryLoop(executor: (action: string, args: any[]) => Promise<any>) {
  if (retryIntervalId) return;
  retryIntervalId = setInterval(() => {
    const store = useOfflineStore.getState();
    if (store.online && store.pendingWrites > 0) {
      store.processQueue(executor);
    }
  }, RETRY_INTERVAL_MS);
}

export function stopRetryLoop() {
  if (retryIntervalId) {
    clearInterval(retryIntervalId);
    retryIntervalId = null;
  }
}
