import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { useOfflineStore, isOnline } from "../stores/offlineStore";

// Helper to cast string IDs to typed Convex Ids.
// The desktop app stores IDs as plain strings but the typed API expects Id<"table">.
const asId = (s: string) => s as any;

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
      userId: asId(userId),
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

// ============================================
// ENRICHMENT DATA
// ============================================

/**
 * Enriched plugin data from the Convex catalog.
 * Merged with scanned plugins in the desktop UI.
 */
export interface EnrichedPluginData {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  shortDescription?: string;
  category: string;
  subcategory?: string;
  effectType?: string;
  circuitEmulation?: string;
  tonalCharacter?: string[];
  tags: string[];
  worksWellOn?: string[];
  useCases?: string[];
  genreSuitability?: string[];
  sonicCharacter?: string[];
  comparableTo?: string[];
  skillLevel?: string;
  cpuUsage?: string;
  keyFeatures?: string[];
  imageUrl?: string;
  resolvedImageUrl?: string;
  isFree: boolean;
  currentPrice?: number;
  msrp?: number;
  currency: string;
  hasDemo: boolean;
  hasTrial: boolean;
  productUrl: string;
  formats: string[];
  platforms: string[];
  licenseType?: string;
  learningCurve?: string;
  isIndustryStandard?: boolean;
}

// In-memory cache for enriched data to avoid re-fetching
let enrichedDataCache: Map<string, EnrichedPluginData> = new Map();
let enrichedDataTimestamp: number = 0;
const ENRICHMENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch enrichment data for matched scanned plugins.
 * Calls the getByIds query to get full plugin details from the catalog.
 */
export async function fetchEnrichedPluginData(
  pluginIds: string[]
): Promise<EnrichedPluginData[]> {
  if (pluginIds.length === 0) return [];

  // Check cache freshness
  const now = Date.now();
  if (now - enrichedDataTimestamp < ENRICHMENT_CACHE_TTL) {
    const cached = pluginIds
      .map((id) => enrichedDataCache.get(id))
      .filter((d): d is EnrichedPluginData => d !== undefined);
    // If all requested IDs are cached, return from cache
    if (cached.length === pluginIds.length) {
      return cached;
    }
  }

  // Find which IDs are not cached
  const uncachedIds = pluginIds.filter(
    (id) => !enrichedDataCache.has(id) || now - enrichedDataTimestamp >= ENRICHMENT_CACHE_TTL
  );

  if (uncachedIds.length > 0) {
    try {
      // Batch in chunks of 50 to stay within limits
      const BATCH_SIZE = 50;
      for (let i = 0; i < uncachedIds.length; i += BATCH_SIZE) {
        const batch = uncachedIds.slice(i, i + BATCH_SIZE);
        const results = await convex.query(api.plugins.getByIds, {
          ids: batch as any,
        });
        for (const plugin of results) {
          if (plugin) {
            enrichedDataCache.set(plugin._id, plugin as unknown as EnrichedPluginData);
          }
        }
      }
      enrichedDataTimestamp = now;
    } catch (err) {
      console.error("[ConvexClient] Failed to fetch enrichment data:", err);
    }
  }

  return pluginIds
    .map((id) => enrichedDataCache.get(id))
    .filter((d): d is EnrichedPluginData => d !== undefined);
}

/**
 * Clear the enrichment cache (e.g., after re-sync).
 */
export function clearEnrichmentCache() {
  enrichedDataCache.clear();
  enrichedDataTimestamp = 0;
}

/**
 * Get user's synced plugins with match data
 */
export async function getScannedPlugins(): Promise<any[]> {
  const userId = getUserId();
  if (!userId) return [];

  try {
    return await convex.query(api.pluginDirectory.getUserScannedPlugins, {
      userId: asId(userId),
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
    useCase?: string;
    tags?: string[];
    isPublic?: boolean;
    targetInputLufs?: number;
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
        userId: asId(userId),
        name,
        slots,
        category: options.category ?? "mixing",
        tags: options.tags ?? [],
        description: options.description,
        isPublic: options.isPublic ?? false,
        targetInputLufs: options.targetInputLufs,
        useCase: options.useCase,
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
      chainId: asId(chainId),
      userId: asId(userId),
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
    alternatives: Array<{
      id: string;
      name: string;
      manufacturer: string;
      slug?: string;
      similarityScore?: number;
      similarityReasons?: string;
    }>;
  }>;
} | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    return await convex.query(api.pluginDirectory.getDetailedCompatibility, {
      chainId: asId(chainId),
      userId: asId(userId),
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
      chainId: asId(chainId),
      userId: asId(userId),
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
      chainId: asId(chainId),
      userId: asId(userId),
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
      chainId: asId(chainId),
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
      chainId: asId(chainId),
      content,
      parentCommentId: parentCommentId ? asId(parentCommentId) : undefined,
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
      commentId: asId(commentId),
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
      chainId: asId(chainId),
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
      chainId: asId(chainId),
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
      userId: asId(userId),
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
      userId: asId(userId),
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
      userId: asId(userId),
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
      chainId: asId(chainId),
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
      userId: asId(userId),
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
      userId: asId(userId),
    });
  } catch (err) {
    console.error("Failed to get user stats:", err);
    return null;
  }
}

// ============================================
// PARAMETER TRANSLATION
// ============================================

/**
 * Find compatible plugins for swapping (same category, user-owned, with parameter maps)
 */
export async function findCompatibleSwaps(
  pluginId: string
): Promise<Array<{
  pluginId: string;
  pluginName: string;
  category: string;
  confidence: number;
  parameterCount: number;
  eqBandCount?: number;
}>> {
  const userId = getUserId();
  if (!userId) return [];

  try {
    return await convex.query(api.parameterTranslation.findCompatibleSwaps, {
      pluginId: pluginId as any,
      userId: userId as any,
    });
  } catch (err) {
    console.error("Failed to find compatible swaps:", err);
    return [];
  }
}

/**
 * Get a random compatible swap for the "randomize" button
 */
export async function getRandomSwap(
  pluginId: string
): Promise<{
  pluginId: string;
  pluginName: string;
  category: string;
  confidence: number;
  parameterCount: number;
} | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    return await convex.query(api.parameterTranslation.getRandomSwap, {
      pluginId: pluginId as any,
      userId: userId as any,
      randomSeed: Math.floor(Math.random() * 1000000),
    });
  } catch (err) {
    console.error("Failed to get random swap:", err);
    return null;
  }
}

/**
 * Translate parameters from source plugin to target plugin
 */
export async function translateParameters(
  sourcePluginId: string,
  targetPluginId: string,
  sourceParams: Array<{ paramId: string; paramIndex?: number; normalizedValue: number }>
): Promise<{
  targetParams: Array<{ paramId: string; paramIndex?: number; value: number }>;
  confidence: number;
  unmappedParams: string[];
  sourcePluginName?: string;
  targetPluginName?: string;
  error?: string;
} | null> {
  try {
    return await convex.query(api.parameterTranslation.translateParameters, {
      sourcePluginId: sourcePluginId as any,
      targetPluginId: targetPluginId as any,
      sourceParams,
    });
  } catch (err) {
    console.error("Failed to translate parameters:", err);
    return null;
  }
}

/**
 * Get parameter map for a plugin
 */
export async function getParameterMap(pluginId: string): Promise<any | null> {
  try {
    return await convex.query(api.parameterTranslation.getParameterMap, {
      pluginId: pluginId as any,
    });
  } catch (err) {
    console.error("Failed to get parameter map:", err);
    return null;
  }
}

/**
 * Get parameter map by plugin name (for auto-discovery lookups when we don't have the Convex ID)
 */
export async function getParameterMapByName(pluginName: string): Promise<any | null> {
  try {
    return await convex.query(api.parameterTranslation.getParameterMapByName, {
      pluginName,
    });
  } catch (err) {
    console.error("Failed to get parameter map by name:", err);
    return null;
  }
}

/**
 * Upload a discovered parameter map to Convex.
 * Respects existing manual maps (won't overwrite higher-confidence maps).
 *
 * @param discoveredMap - The parameter map from JUCE auto-discovery
 * @param pluginId - The Convex plugin ID (if matched to catalog)
 */
export async function uploadDiscoveredParameterMap(
  discoveredMap: {
    pluginName: string;
    manufacturer: string;
    category: string;
    confidence: number;
    eqBandCount?: number;
    eqBandParameterPattern?: string;
    compHasParallelMix?: boolean;
    compHasAutoMakeup?: boolean;
    compHasLookahead?: boolean;
    parameters: Array<{
      juceParamId: string;
      juceParamIndex?: number;
      semantic: string;
      physicalUnit: string;
      mappingCurve: string;
      minValue: number;
      maxValue: number;
      defaultValue?: number;
      // NormalisableRange data
      rangeStart?: number;
      rangeEnd?: number;
      skewFactor?: number;
      symmetricSkew?: boolean;
      interval?: number;
      hasNormalisableRange?: boolean;
      curveSamples?: Array<{ normalized: number; physical: number }>;
      qRepresentation?: string;
    }>;
  },
  pluginId: string
): Promise<{ success: boolean; action?: string; error?: string }> {
  try {
    // Check if a map already exists
    const existing = await convex.query(api.parameterTranslation.getParameterMap, {
      pluginId: pluginId as any,
    });

    if (existing) {
      // Don't overwrite manual maps or higher-confidence maps
      if (existing.source === "manual" || existing.confidence > discoveredMap.confidence) {
        return { success: true, action: "skipped_higher_confidence" };
      }

      // Don't overwrite if previous auto-discovered map has more matched params
      if (existing.source === "juce-scanned") {
        const existingMatchedCount = existing.parameters.filter(
          (p: any) => p.semantic !== "unknown"
        ).length;
        const newMatchedCount = discoveredMap.parameters.filter(
          (p) => p.semantic !== "unknown"
        ).length;

        if (existingMatchedCount >= newMatchedCount) {
          return { success: true, action: "skipped_same_or_better" };
        }
      }
    }

    // Upload the map
    await convex.mutation(api.parameterTranslation.upsertParameterMap, {
      plugin: pluginId as any,
      pluginName: discoveredMap.pluginName,
      category: discoveredMap.category,
      parameters: discoveredMap.parameters.map((p) => ({
        juceParamId: p.juceParamId,
        juceParamIndex: p.juceParamIndex,
        semantic: p.semantic,
        physicalUnit: p.physicalUnit,
        mappingCurve: p.mappingCurve,
        minValue: p.minValue,
        maxValue: p.maxValue,
        defaultValue: p.defaultValue,
        // NormalisableRange data
        ...(p.hasNormalisableRange ? {
          rangeStart: p.rangeStart,
          rangeEnd: p.rangeEnd,
          skewFactor: p.skewFactor,
          symmetricSkew: p.symmetricSkew,
          interval: p.interval,
          hasNormalisableRange: p.hasNormalisableRange,
          curveSamples: p.curveSamples,
          qRepresentation: p.qRepresentation,
        } : {}),
      })),
      eqBandCount: discoveredMap.eqBandCount,
      eqBandParameterPattern: discoveredMap.eqBandParameterPattern,
      compHasAutoMakeup: discoveredMap.compHasAutoMakeup,
      compHasParallelMix: discoveredMap.compHasParallelMix,
      compHasLookahead: discoveredMap.compHasLookahead,
      confidence: discoveredMap.confidence,
      source: "juce-scanned",
    });

    return { success: true, action: existing ? "updated" : "created" };
  } catch (err) {
    console.error("[ConvexClient] Failed to upload discovered parameter map:", err);
    return { success: false, error: String(err) };
  }
}

// ============================================
// ENHANCED CHAIN BROWSING
// ============================================

/**
 * Browse chains with granular filters (use-case taxonomy, compatibility, pagination)
 */
export async function browseChainsPaginated(
  options: {
    useCaseGroup?: string;
    useCase?: string;
    search?: string;
    sortBy?: "popular" | "recent" | "downloads" | "rating";
    compatibilityFilter?: "all" | "full" | "close";
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ chains: any[]; total: number; hasMore: boolean }> {
  const token = getStoredSession();
  const cacheKey = `browse:${options.useCaseGroup ?? 'all'}:${options.useCase ?? 'all'}:${options.sortBy ?? 'popular'}:${options.offset ?? 0}`;

  const result = await withOfflineFallback(cacheKey, () =>
    convex.query(api.pluginDirectory.browseChainsPaginated, {
      ...options,
      sessionToken: token ?? undefined,
    })
  );
  return result ?? { chains: [], total: 0, hasMore: false };
}

// ============================================
// CHAIN COLLECTIONS
// ============================================

/**
 * Add a chain to the user's collection
 */
export async function addToCollection(
  chainId: string,
  source: "web" | "desktop" = "desktop",
  notes?: string
): Promise<{ _id?: string; alreadyExists?: boolean; error?: string }> {
  const token = getStoredSession();
  if (!token) return { error: "Not logged in" };

  try {
    return await convex.mutation(api.pluginDirectory.addToCollection, {
      sessionToken: token,
      chainId: asId(chainId),
      source,
      notes,
    });
  } catch (err) {
    console.error("Failed to add to collection:", err);
    return { error: String(err) };
  }
}

/**
 * Remove a chain from the user's collection
 */
export async function removeFromCollection(chainId: string): Promise<boolean> {
  const token = getStoredSession();
  if (!token) return false;

  try {
    await convex.mutation(api.pluginDirectory.removeFromCollection, {
      sessionToken: token,
      chainId: asId(chainId),
    });
    return true;
  } catch (err) {
    console.error("Failed to remove from collection:", err);
    return false;
  }
}

/**
 * Get the user's chain collection
 */
export async function getMyCollection(limit?: number): Promise<any[]> {
  const token = getStoredSession();
  if (!token) return [];

  try {
    return await convex.query(api.pluginDirectory.getMyCollection, {
      sessionToken: token,
      limit,
    });
  } catch (err) {
    console.error("Failed to get collection:", err);
    return [];
  }
}

/**
 * Check if a chain is in the user's collection
 */
export async function isInCollection(chainId: string): Promise<boolean> {
  const token = getStoredSession();
  if (!token) return false;

  try {
    return await convex.query(api.pluginDirectory.isInCollection, {
      sessionToken: token,
      chainId: asId(chainId),
    });
  } catch (err) {
    console.error("Failed to check collection status:", err);
    return false;
  }
}

// ============================================
// FRIENDS & CHAIN SHARING
// ============================================

/**
 * Get the count of pending received chains (for notification badge)
 */
export async function getPendingChainCount(): Promise<number> {
  const token = getStoredSession();
  if (!token) return 0;

  try {
    const received = await convex.query(api.privateChains.getReceivedChains, {
      sessionToken: token,
    });
    return received.length;
  } catch (err) {
    console.error("Failed to get pending chain count:", err);
    return 0;
  }
}

/**
 * Get the count of pending friend requests (for notification badge)
 */
export async function getPendingFriendRequestCount(): Promise<number> {
  const token = getStoredSession();
  if (!token) return 0;

  try {
    const requests = await convex.query(api.friends.getPendingRequests, {
      sessionToken: token,
    });
    return requests.length;
  } catch (err) {
    console.error("Failed to get pending request count:", err);
    return 0;
  }
}
