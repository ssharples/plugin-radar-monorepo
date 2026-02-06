import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { useOfflineStore, isOnline } from "../stores/offlineStore";

// PluginRadar Convex backend (shared monorepo convex/)
const CONVEX_URL = "https://next-frog-231.convex.cloud";

// HTTP client — now uses typed API from the shared monorepo convex/
export const convex = new ConvexHttpClient(CONVEX_URL);

// ============================================
// Offline-aware helpers
// ============================================

/** Check if we're currently online */
export { isOnline };

/**
 * Execute a cloud read with offline cache fallback.
 * On success, caches the result. On failure (offline), returns cached data.
 */
async function withOfflineFallback<T>(
  cacheKey: string,
  remoteFn: () => Promise<T>
): Promise<T | null> {
  const offlineStore = useOfflineStore.getState();

  if (isOnline()) {
    try {
      const result = await remoteFn();
      // Cache successful reads
      if (result !== null && result !== undefined) {
        offlineStore.cacheChain(cacheKey, result);
      }
      return result;
    } catch (err) {
      console.warn(`[ConvexClient] Cloud call failed, falling back to cache for "${cacheKey}":`, err);
      const cached = offlineStore.getCachedChain(cacheKey);
      if (cached) return cached.data as T;
      throw err; // No cache either — propagate the error
    }
  } else {
    // Offline — use cache
    const cached = offlineStore.getCachedChain(cacheKey);
    if (cached) return cached.data as T;
    return null;
  }
}

/**
 * Execute a cloud write. If offline or if it fails, queue it for retry.
 */
async function withWriteQueue<T>(
  actionName: string,
  args: any[],
  remoteFn: () => Promise<T>
): Promise<T> {
  const offlineStore = useOfflineStore.getState();

  if (!isOnline()) {
    offlineStore.enqueueWrite(actionName, args);
    throw new Error('Offline — write queued for retry');
  }

  try {
    return await remoteFn();
  } catch (err) {
    // Queue for retry on network errors
    const errMsg = String(err);
    if (
      errMsg.includes('Failed to fetch') ||
      errMsg.includes('NetworkError') ||
      errMsg.includes('ERR_INTERNET_DISCONNECTED') ||
      errMsg.includes('ECONNREFUSED')
    ) {
      offlineStore.enqueueWrite(actionName, args);
      offlineStore.setOnline(false);
    }
    throw err;
  }
}

/**
 * Execute a queued write action by name.
 * Used by the retry loop to replay failed writes.
 */
export async function executeQueuedWrite(action: string, args: any[]): Promise<any> {
  switch (action) {
    case 'saveChain':
      return saveChain(args[0], args[1], args[2]);
    case 'syncPlugins':
      return syncPlugins(args[0]);
    case 'toggleLike':
      return toggleLike(args[0]);
    case 'rateChain':
      return rateChain(args[0], args[1]);
    case 'addComment':
      return addComment(args[0], args[1], args[2]);
    case 'deleteComment':
      return deleteComment(args[0]);
    case 'followUser':
      return followUser(args[0]);
    case 'unfollowUser':
      return unfollowUser(args[0]);
    default:
      console.warn(`[ConvexClient] Unknown queued action: ${action}`);
      return null;
  }
}

// Types matching the deployed web app's Convex schema
export interface ScannedPlugin {
  name: string;
  manufacturer: string;
  format: string;
  uid: number;
  fileOrIdentifier: string;
  isInstrument: boolean;
  numInputChannels: number;
  numOutputChannels: number;
  version?: string;
}

export interface ChainSlot {
  position: number;
  pluginName: string;
  manufacturer: string;
  format?: string;
  uid?: number;
  version?: string;
  fileOrIdentifier?: string;
  presetName?: string;
  presetData?: string;
  presetSizeBytes?: number;
  bypassed: boolean;
  notes?: string;
}

export interface PluginRadarUser {
  _id: string;
  email: string;
  name?: string;
}

// ============================================
// Session Token Management
// ============================================
// The web app uses opaque session tokens (not JWT).
// Auth flow: auth:login → sessionToken → auth:verifySession

const SESSION_KEY = "pluginradar_session";
let cachedUserId: string | null = null;

function storeSession(token: string) {
  localStorage.setItem(SESSION_KEY, token);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  cachedUserId = null;
}

function getStoredSession(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

/**
 * Initialize auth from stored session token.
 * Returns true if session was restored.
 */
export async function initializeAuth(): Promise<boolean> {
  const token = getStoredSession();
  if (!token) return false;

  try {
    const session = await convex.query(api.auth.verifySession, {
      sessionToken: token,
    });
    if (session && session.userId) {
      cachedUserId = session.userId;
      return true;
    }
    clearSession();
    return false;
  } catch {
    clearSession();
    return false;
  }
}

// ============================================
// AUTH (matches deployed web app functions)
// ============================================

/**
 * Login with email/password
 * Calls deployed auth:login mutation
 */
export async function login(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await convex.mutation(api.auth.login, {
      email,
      password,
    });
    if (result && result.sessionToken) {
      storeSession(result.sessionToken);
      cachedUserId = result.userId;
      return { success: true };
    }
    return { success: false, error: "Login failed" };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Register new account
 * Calls deployed auth:register mutation
 */
export async function register(
  email: string,
  password: string,
  name?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await convex.mutation(api.auth.register, {
      email,
      password,
      name,
    });
    if (result && result.sessionToken) {
      storeSession(result.sessionToken);
      cachedUserId = result.userId;
      return { success: true };
    }
    return { success: false, error: "Registration failed" };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function logout() {
  const token = getStoredSession();
  if (token) {
    try {
      await convex.mutation(api.auth.logout, { sessionToken: token });
    } catch {
      // Ignore errors on sign out
    }
  }
  clearSession();
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<PluginRadarUser | null> {
  const token = getStoredSession();
  if (!token) return null;

  try {
    const session = await convex.query(api.auth.verifySession, {
      sessionToken: token,
    });
    if (!session) return null;

    cachedUserId = session.userId;
    return {
      _id: session.userId,
      email: session.email,
      name: session.name,
    };
  } catch {
    return null;
  }
}

/**
 * Get the cached userId (set after login/initialize)
 */
export function getUserId(): string | null {
  return cachedUserId;
}

// ============================================
// PLUGIN SYNC
// ============================================

/**
 * Sync scanned plugins to PluginRadar
 * Calls deployed pluginDirectory:syncScannedPlugins
 */
export async function syncPlugins(
  plugins: ScannedPlugin[]
): Promise<{ synced: number; inCatalog: number; newPlugins: string[]; error?: string }> {
  const userId = getUserId();
  if (!userId) return { synced: 0, inCatalog: 0, newPlugins: [], error: "Not logged in" };

  try {
    const result = await convex.mutation(api.pluginDirectory.syncScannedPlugins, {
      userId: userId,
      plugins,
    });
    return {
      synced: result.synced,
      inCatalog: result.matched ?? result.created ?? 0,
      newPlugins: [],
    };
  } catch (err) {
    return { synced: 0, inCatalog: 0, newPlugins: [], error: String(err) };
  }
}

/**
 * Get user's synced plugins with match data
 */
export async function getScannedPlugins(): Promise<any[]> {
  const userId = getUserId();
  if (!userId) return [];

  try {
    return await convex.query(api.pluginDirectory.getUserScannedPlugins, {
      userId: userId,
    });
  } catch (err) {
    console.error("Failed to get scanned plugins:", err);
    return [];
  }
}

// ============================================
// CHAIN MANAGEMENT
// ============================================

/**
 * Save a plugin chain to PluginRadar.
 * Also caches locally. Queues for retry if offline.
 */
export async function saveChain(
  name: string,
  slots: ChainSlot[],
  options: {
    description?: string;
    category?: string;
    tags?: string[];
    isPublic?: boolean;
  } = {}
): Promise<{
  chainId?: string;
  slug?: string;
  shareCode?: string;
  error?: string;
}> {
  const userId = getUserId();
  if (!userId) return { error: "Not logged in" };

  // Always cache locally
  const offlineStore = useOfflineStore.getState();
  const localData = { name, slots, options, savedAt: new Date().toISOString() };
  offlineStore.cacheChain(`local:${name}`, localData);

  try {
    const result = await withWriteQueue(
      'saveChain',
      [name, slots, options],
      () => convex.mutation(api.pluginDirectory.saveChain, {
        userId: userId,
        name,
        slots,
        category: options.category ?? "mixing",
        tags: options.tags ?? [],
        description: options.description,
        isPublic: options.isPublic ?? false,
      })
    );
    // Cache the cloud result with the proper slug
    if (result.slug) {
      offlineStore.cacheChain(`chain:${result.slug}`, { name, slots, ...result });
    }
    return {
      chainId: result.chainId as string,
      slug: result.slug,
      shareCode: result.shareCode,
    };
  } catch (err) {
    const errMsg = String(err);
    if (errMsg.includes('queued for retry')) {
      return { error: 'Saved locally — will sync when back online' };
    }
    return { error: errMsg };
  }
}

/**
 * Load a chain by slug or share code.
 * Uses offline cache fallback if the cloud is unreachable.
 */
export async function loadChain(slugOrCode: string): Promise<any | null> {
  const cacheKey = `chain:${slugOrCode.toLowerCase()}`;

  return withOfflineFallback(cacheKey, async () => {
    // Try as slug first
    let chain = await convex.query(api.pluginDirectory.getChain, {
      slug: slugOrCode,
    });
    if (chain) return chain;

    // Try as share code
    chain = await convex.query(api.pluginDirectory.getChain, {
      shareCode: slugOrCode.toUpperCase(),
    });
    return chain;
  });
}

/**
 * Check if user can load a chain
 */
export async function checkChainCompatibility(
  chainId: string
): Promise<{
  canFullyLoad: boolean;
  ownedCount: number;
  missingCount: number;
  percentage: number;
} | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    return await convex.query(api.pluginDirectory.checkChainCompatibility, {
      chainId: chainId,
      userId: userId,
    });
  } catch (err) {
    console.error("Failed to check compatibility:", err);
    return null;
  }
}

/**
 * Get detailed compatibility for a chain — per-slot owned/missing
 * with alternative plugin suggestions for missing slots.
 */
export async function fetchDetailedCompatibility(
  chainId: string
): Promise<{
  percentage: number;
  ownedCount: number;
  missingCount: number;
  missing: Array<{
    pluginName: string;
    manufacturer: string;
    suggestion: string | null;
  }>;
  slots: Array<{
    position: number;
    pluginName: string;
    manufacturer: string;
    status: "owned" | "missing";
    alternatives: Array<{ id: string; name: string; manufacturer: string; slug?: string }>;
  }>;
} | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    return await convex.query(api.pluginDirectory.getDetailedCompatibility, {
      chainId: chainId,
      userId: userId,
    });
  } catch (err) {
    console.error("Failed to fetch detailed compatibility:", err);
    return null;
  }
}

/**
 * Browse public chains.
 * Falls back to cached browse results when offline.
 */
export async function browseChains(
  options: {
    category?: string;
    sortBy?: "popular" | "recent" | "downloads" | "rating";
    limit?: number;
  } = {}
): Promise<any[]> {
  const cacheKey = `browse:${options.category ?? 'all'}:${options.sortBy ?? 'popular'}`;

  const result = await withOfflineFallback(cacheKey, () =>
    convex.query(api.pluginDirectory.browseChains, options)
  );
  return result ?? [];
}

/**
 * Download a chain
 */
export async function downloadChain(chainId: string): Promise<boolean> {
  const userId = getUserId();
  if (!userId) return false;

  try {
    await convex.mutation(api.pluginDirectory.downloadChain, {
      chainId: chainId,
      userId: userId,
    });
    return true;
  } catch (err) {
    console.error("Failed to record download:", err);
    return false;
  }
}

/**
 * Like/unlike a chain
 */
export async function toggleLike(
  chainId: string
): Promise<{ liked: boolean } | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    return await convex.mutation(api.pluginDirectory.toggleChainLike, {
      chainId: chainId,
      userId: userId,
    });
  } catch (err) {
    console.error("Failed to toggle like:", err);
    return null;
  }
}

// ============================================
// SOCIAL FEATURES
// ============================================

/**
 * Get comments for a chain
 */
export async function getComments(chainId: string): Promise<any[]> {
  try {
    return await convex.query(api.social.getComments, {
      chainId: chainId,
    });
  } catch (err) {
    console.error("Failed to get comments:", err);
    return [];
  }
}

/**
 * Add a comment to a chain
 */
export async function addComment(
  chainId: string,
  content: string,
  parentCommentId?: string
): Promise<string | null> {
  const token = getStoredSession();
  if (!token) return null;

  try {
    const result = await convex.mutation(api.social.addComment, {
      sessionToken: token,
      chainId: chainId,
      content,
      parentCommentId: parentCommentId ? (parentCommentId) : undefined,
    });
    return result as string;
  } catch (err) {
    console.error("Failed to add comment:", err);
    return null;
  }
}

/**
 * Delete a comment
 */
export async function deleteComment(commentId: string): Promise<boolean> {
  const token = getStoredSession();
  if (!token) return false;

  try {
    await convex.mutation(api.social.deleteComment, {
      sessionToken: token,
      commentId: commentId,
    });
    return true;
  } catch (err) {
    console.error("Failed to delete comment:", err);
    return false;
  }
}

/**
 * Get rating info for a chain
 */
export async function getChainRating(
  chainId: string
): Promise<{ average: number; count: number; userRating: number | null } | null> {
  const token = getStoredSession();

  try {
    return await convex.query(api.social.getChainRating, {
      chainId: chainId,
      sessionToken: token ?? undefined,
    });
  } catch (err) {
    console.error("Failed to get chain rating:", err);
    return null;
  }
}

/**
 * Rate a chain (1-5)
 */
export async function rateChain(
  chainId: string,
  rating: number
): Promise<boolean> {
  const token = getStoredSession();
  if (!token) return false;

  try {
    await convex.mutation(api.social.rateChain, {
      sessionToken: token,
      chainId: chainId,
      rating,
    });
    return true;
  } catch (err) {
    console.error("Failed to rate chain:", err);
    return false;
  }
}

/**
 * Follow a user
 */
export async function followUser(userId: string): Promise<boolean> {
  const token = getStoredSession();
  if (!token) return false;

  try {
    await convex.mutation(api.social.followUser, {
      sessionToken: token,
      userId: userId,
    });
    return true;
  } catch (err) {
    console.error("Failed to follow user:", err);
    return false;
  }
}

/**
 * Unfollow a user
 */
export async function unfollowUser(userId: string): Promise<boolean> {
  const token = getStoredSession();
  if (!token) return false;

  try {
    await convex.mutation(api.social.unfollowUser, {
      sessionToken: token,
      userId: userId,
    });
    return true;
  } catch (err) {
    console.error("Failed to unfollow user:", err);
    return false;
  }
}

/**
 * Check if the current user is following a target user
 */
export async function isFollowing(userId: string): Promise<boolean> {
  const token = getStoredSession();
  if (!token) return false;

  try {
    return await convex.query(api.social.isFollowing, {
      sessionToken: token,
      userId: userId,
    });
  } catch (err) {
    console.error("Failed to check follow status:", err);
    return false;
  }
}

/**
 * Fork a chain with a new name
 */
export async function forkChain(
  chainId: string,
  newName: string
): Promise<{ chainId: string; slug: string; shareCode: string } | null> {
  const token = getStoredSession();
  if (!token) return null;

  try {
    const result = await convex.mutation(api.social.forkChain, {
      sessionToken: token,
      chainId: chainId,
      newName,
    });
    return {
      chainId: result.chainId as string,
      slug: result.slug,
      shareCode: result.shareCode,
    };
  } catch (err) {
    console.error("Failed to fork chain:", err);
    return null;
  }
}

/**
 * Get chains by a specific user
 */
export async function getChainsByUser(userId: string): Promise<any[]> {
  const token = getStoredSession();

  try {
    return await convex.query(api.pluginDirectory.getChainsByUser, {
      userId: userId,
      sessionToken: token ?? undefined,
    });
  } catch (err) {
    console.error("Failed to get user chains:", err);
    return [];
  }
}

/**
 * Get aggregated stats for a user
 */
export async function getUserStats(
  userId: string
): Promise<{ chainCount: number; totalLikes: number; totalDownloads: number; followerCount: number } | null> {
  try {
    return await convex.query(api.pluginDirectory.getUserStats, {
      userId: userId,
    });
  } catch (err) {
    console.error("Failed to get user stats:", err);
    return null;
  }
}
