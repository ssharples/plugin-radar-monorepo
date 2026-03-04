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
// Auth helper — reduces boilerplate for session-gated calls
// ============================================

async function withAuth<T>(
  fn: (token: string) => Promise<T>,
  fallback: T
): Promise<T> {
  const session = getStoredSession();
  if (!session) return fallback;
  try {
    return await fn(session);
  } catch (err) {
    console.error('Convex error:', err);
    return fallback;
  }
}

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
  hasPurchased?: boolean;
  trialEndsAt?: number;
}

/**
 * Check if a user has an active license (purchased or within free trial).
 */
export function isUserLicensed(user: PluginRadarUser | null): boolean {
  if (!user) return false;
  if (user.hasPurchased) return true;
  if (user.trialEndsAt && user.trialEndsAt > Date.now()) return true;
  return false;
}

// ============================================
// Session Token Management
// ============================================
// The web app uses opaque session tokens (not JWT).
// Auth flow: auth:login → sessionToken → auth:verifySession

const SESSION_KEY = "pluginradar_session";
const SESSION_TS_KEY = "pluginradar_session_ts";
const USER_KEY = "pluginradar_user";
/** 5 days in milliseconds — sessions expire server-side at 7 days */
const SESSION_EXPIRY_THRESHOLD_MS = 5 * 24 * 60 * 60 * 1000; // 432000000
let cachedUserId: string | null = null;

function storeSession(token: string) {
  localStorage.setItem(SESSION_KEY, token);
  localStorage.setItem(SESSION_TS_KEY, Date.now().toString());
}

/**
 * Check if the stored session token is older than 5 days.
 * Returns true if the token is nearing expiry and should be refreshed.
 */
export function isSessionExpiring(): boolean {
  const ts = localStorage.getItem(SESSION_TS_KEY);
  if (!ts) {
    // No timestamp stored — treat legacy tokens as expiring to force refresh
    return !!localStorage.getItem(SESSION_KEY);
  }
  const age = Date.now() - parseInt(ts, 10);
  return age > SESSION_EXPIRY_THRESHOLD_MS;
}

/** Persist credentials to disk via C++ bridge (fire-and-forget). */
export async function saveCredentialsToDisk() {
  try {
    const { juceBridge } = await import('./juce-bridge');
    const token = localStorage.getItem(SESSION_KEY);
    const userData = localStorage.getItem(USER_KEY);
    if (!token) return;

    const user = userData ? JSON.parse(userData) : {};
    const onboarding = localStorage.getItem('pluginradar_onboarding_complete');

    await juceBridge.saveCredentials({
      sessionToken: token,
      userId: user._id ?? '',
      email: user.email ?? '',
      name: user.name,
      hasPurchased: user.hasPurchased ?? false,
      trialEndsAt: user.trialEndsAt,
      onboardingComplete: onboarding === 'true',
    });
  } catch (err) {
    console.warn('[saveCredentialsToDisk] failed:', err);
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_TS_KEY);
  cachedUserId = null;
  // Clear disk credentials (fire-and-forget)
  import('./juce-bridge').then(({ juceBridge }) => {
    juceBridge.clearCredentials().catch(() => { });
  }).catch(() => { });
}

/**
 * Restore credentials from disk (auth.json) into localStorage.
 * Call this early at startup, before initializeAuth().
 */
export async function restoreCredentialsFromDisk(): Promise<boolean> {
  try {
    const { juceBridge } = await import('./juce-bridge');
    const creds = await juceBridge.loadCredentials();

    if (!creds || !creds.sessionToken) return false;

    // Only hydrate if localStorage doesn't already have a session
    if (!localStorage.getItem(SESSION_KEY)) {
      localStorage.setItem(SESSION_KEY, creds.sessionToken);
      // Set timestamp if not already present (disk credentials don't store it)
      if (!localStorage.getItem(SESSION_TS_KEY)) {
        localStorage.setItem(SESSION_TS_KEY, Date.now().toString());
      }
      if (creds.userId && creds.email) {
        localStorage.setItem(USER_KEY, JSON.stringify({
          _id: creds.userId,
          email: creds.email,
          name: creds.name,
          hasPurchased: creds.hasPurchased,
          trialEndsAt: creds.trialEndsAt,
        }));
      }
      if (creds.onboardingComplete) {
        localStorage.setItem('pluginradar_onboarding_complete', 'true');
      }
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[restoreCredentialsFromDisk] failed:', err);
    return false;
  }
}

export function getStoredSession(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

function cacheUserData(user: { _id: string; email: string; name?: string; hasPurchased?: boolean; trialEndsAt?: number; }) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function getCachedUserData(): PluginRadarUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PluginRadarUser;
  } catch {
    return null;
  }
}

function clearCachedUserData() {
  localStorage.removeItem(USER_KEY);
}

/**
 * Initialize auth from stored session token.
 * Returns true if session was restored.
 */
export async function initializeAuth(): Promise<boolean> {
  const token = getStoredSession();
  if (!token) return false;

  // If the session is older than 5 days, clear it and force re-login
  // rather than waiting for the server to reject it at 7 days
  if (isSessionExpiring()) {
    console.warn('[initializeAuth] Session token is older than 5 days — clearing for re-login');
    clearSession();
    clearCachedUserData();
    return false;
  }

  try {
    const session = await convex.mutation(api.auth.verifySession, {
      sessionToken: token,
    });
    if (session && session.userId) {
      cachedUserId = session.userId;
      // Cache user data for offline use
      cacheUserData({ _id: session.userId, email: session.email, name: session.name, hasPurchased: session.hasPurchased, trialEndsAt: session.trialEndsAt });
      // Refresh auth.json so disk credentials are always current
      saveCredentialsToDisk();
      return true;
    }
    // Server explicitly confirmed session is invalid — clear stored credentials
    clearSession();
    clearCachedUserData();
    return false;
  } catch {
    // Any exception (network error, timeout, server error, etc.) — do NOT clear
    // credentials. We can't confirm the session is invalid, so preserve auth.json
    // so the next boot can try again.
    const cached = getCachedUserData();
    if (cached) {
      cachedUserId = cached._id;
      return true;
    }
    // No cached data but keep auth.json intact — show login screen
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
      cacheUserData({ _id: result.userId, email, name: (result as any).name, hasPurchased: (result as any).hasPurchased, trialEndsAt: (result as any).trialEndsAt });
      saveCredentialsToDisk(); // fire-and-forget
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
      cacheUserData({ _id: result.userId, email, name, trialEndsAt: (result as any).trialEndsAt });
      saveCredentialsToDisk(); // fire-and-forget
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
  clearCachedUserData();
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<PluginRadarUser | null> {
  const token = getStoredSession();
  if (!token) return null;

  try {
    const session = await convex.mutation(api.auth.verifySession, {
      sessionToken: token,
    });
    if (!session) return null;

    cachedUserId = session.userId;
    const user = {
      _id: session.userId,
      email: session.email,
      name: session.name,
      hasPurchased: session.hasPurchased,
      subscriptionStatus: session.subscriptionStatus,
      trialEndsAt: session.trialEndsAt,
    };
    cacheUserData(user);
    return user;
  } catch {
    // Offline — return cached user data if available
    return getCachedUserData();
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
  const token = getStoredSession();
  if (!token) return { synced: 0, inCatalog: 0, newPlugins: [], error: "Not logged in" };

  try {
    const result = await convex.mutation(api.pluginDirectory.syncScannedPlugins, {
      sessionToken: token,
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
 * Fetch cross-format alias groups for the current user.
 * Returns groups where the same catalog plugin has both AU and VST3 variants.
 */
export async function getCrossFormatAliases(): Promise<Array<{
  catalogId: string;
  variants: Array<{ name: string; manufacturer: string; format: string }>;
}>> {
  return withAuth(async (token) => {
    return await convex.query(api.pluginDirectory.getCrossFormatAliases, {
      sessionToken: token,
    });
  }, []);
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
  // Manufacturer data (populated from manufacturer document)
  manufacturerData?: {
    _id: string;
    name: string;
    slug: string;
    logoUrl?: string;
    resolvedLogoUrl?: string;
  };
}

// Persistent enrichment cache backed by localStorage
const ENRICHMENT_CACHE_KEY = 'pluginradar_enrichment_cache';
const ENRICHMENT_CACHE_TTL = 60 * 60 * 1000; // 1 hour

let enrichedDataCache: Map<string, EnrichedPluginData> = new Map();
let enrichedDataTimestamp: number = 0;

// Restore cache from localStorage on module load
function restoreEnrichmentCache() {
  try {
    const raw = localStorage.getItem(ENRICHMENT_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > ENRICHMENT_CACHE_TTL) {
      localStorage.removeItem(ENRICHMENT_CACHE_KEY);
      return;
    }
    enrichedDataCache = new Map(Object.entries(parsed.data));
    enrichedDataTimestamp = parsed.timestamp;
  } catch {
    // Corrupted cache — ignore
  }
}

function persistEnrichmentCache() {
  try {
    const data: Record<string, EnrichedPluginData> = {};
    enrichedDataCache.forEach((v, k) => { data[k] = v; });
    localStorage.setItem(ENRICHMENT_CACHE_KEY, JSON.stringify({
      timestamp: enrichedDataTimestamp,
      data,
    }));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

restoreEnrichmentCache();

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
      persistEnrichmentCache();
    } catch {
      // Error handled by caller
    }
  }

  return pluginIds
    .map((id) => enrichedDataCache.get(id))
    .filter((d): d is EnrichedPluginData => d !== undefined);
}

/**
 * Fetch manufacturer logos by name (public, no auth required).
 * Returns a map of manufacturer name → resolved logo URL.
 * Used as a fallback when the user is not logged in / has no matched plugins.
 */
export async function fetchManufacturerLogos(
  names: string[]
): Promise<Map<string, string>> {
  if (names.length === 0) return new Map();
  try {
    const results = await convex.query(api.manufacturers.listByNames, { names });
    const map = new Map<string, string>();
    for (const m of results) {
      const url = m.resolvedLogoUrl ?? m.logoUrl;
      if (url) map.set(m.name, url);
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Clear the enrichment cache (e.g., after re-sync).
 */
export function clearEnrichmentCache() {
  enrichedDataCache.clear();
  enrichedDataTimestamp = 0;
  localStorage.removeItem(ENRICHMENT_CACHE_KEY);
}

/**
 * Get user's synced plugins with match data
 */
export async function getScannedPlugins(): Promise<any[]> {
  return withAuth(
    (token) => convex.query(api.pluginDirectory.getUserScannedPlugins, { sessionToken: token }),
    []
  );
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
    targetInputPeakMin?: number;
    targetInputPeakMax?: number;
    treeData?: string;
    signalSnapshot?: {
      inputPeakDb: number;
      inputRmsDb: number;
      inputLufs?: number;
      spectralCentroid?: number;
      crestFactor?: number;
      dynamicRangeDb?: number;
      sampleRate: number;
      capturedAt: number;
    };
    educatorAnnotation?: {
      narrative: string;
      difficulty?: string;
      prerequisites?: string[];
      listenFor?: string;
    };
    sourceInstrument?: string;
    signalType?: string;
    bpm?: number;
    subGenre?: string;
    referenceTrack?: string;
  } = {}
): Promise<{
  chainId?: string;
  slug?: string;
  shareCode?: string;
  error?: string;
}> {
  const token = getStoredSession();
  if (!token) return { error: "Not logged in" };

  // Always cache locally
  const offlineStore = useOfflineStore.getState();
  const localData = { name, slots, options, savedAt: new Date().toISOString() };
  offlineStore.cacheChain(`local:${name}`, localData);

  try {
    const result = await withWriteQueue(
      'saveChain',
      [name, slots, options],
      () => convex.mutation(api.pluginDirectory.saveChain, {
        sessionToken: token,
        name,
        slots,
        category: options.category ?? "mixing",
        tags: options.tags ?? [],
        description: options.description,
        isPublic: options.isPublic ?? false,
        targetInputLufs: options.targetInputLufs,
        targetInputPeakMin: options.targetInputPeakMin,
        targetInputPeakMax: options.targetInputPeakMax,
        useCase: options.useCase,
        treeData: options.treeData,
        signalSnapshot: options.signalSnapshot,
        educatorAnnotation: options.educatorAnnotation,
        sourceInstrument: options.sourceInstrument,
        signalType: options.signalType,
        bpm: options.bpm,
        subGenre: options.subGenre,
        referenceTrack: options.referenceTrack,
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
  formatSubstitutableCount?: number;
  missingCount: number;
  percentage: number;
} | null> {
  return withAuth(
    (token) => convex.query(api.pluginDirectory.checkChainCompatibility, { chainId: asId(chainId), sessionToken: token }),
    null
  );
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
  formatSubstitutableCount?: number;
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
    status: "owned" | "missing" | "format_substitutable";
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
  return withAuth(
    (token) => convex.query(api.pluginDirectory.getDetailedCompatibility, { chainId: asId(chainId), sessionToken: token }),
    null
  );
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
  return withAuth(
    async (token) => {
      await convex.mutation(api.pluginDirectory.downloadChain, { chainId: asId(chainId), sessionToken: token });
      return true;
    },
    false
  );
}

/**
 * Like/unlike a chain
 */
export async function toggleLike(
  chainId: string
): Promise<{ liked: boolean } | null> {
  return withAuth(
    (token) => convex.mutation(api.pluginDirectory.toggleChainLike, { chainId: asId(chainId), sessionToken: token }),
    null
  );
}

// ============================================
// CHAIN MANAGEMENT
// ============================================

export async function renameCloudChain(
  chainId: string,
  newName: string
): Promise<{ success: boolean; slug?: string } | null> {
  return withAuth(
    (token) => convex.mutation(api.pluginDirectory.renameChain, { chainId: asId(chainId), newName, sessionToken: token }),
    null
  );
}

export async function deleteCloudChain(
  chainId: string
): Promise<{ success: boolean } | null> {
  return withAuth(
    (token) => convex.mutation(api.pluginDirectory.deleteChain, { chainId: asId(chainId), sessionToken: token }),
    null
  );
}

export async function updateChainVisibility(
  chainId: string,
  isPublic: boolean
): Promise<{ success: boolean; isPublic?: boolean } | null> {
  return withAuth(
    (token) => convex.mutation(api.pluginDirectory.updateChainVisibility, { chainId: asId(chainId), isPublic, sessionToken: token }),
    null
  );
}

export async function updateChainMetadata(
  chainId: string,
  updates: {
    description?: string;
    category?: string;
    tags?: string[];
    useCase?: string;
    genre?: string;
    targetInputPeakMin?: number;
    targetInputPeakMax?: number;
  }
): Promise<{ success: boolean } | null> {
  return withAuth(
    (token) => convex.mutation(api.pluginDirectory.updateChainMetadata, {
      chainId: asId(chainId),
      sessionToken: token,
      ...updates,
    }),
    null
  );
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
  } catch {
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
  return withAuth(
    async (token) => {
      const result = await convex.mutation(api.social.addComment, {
        sessionToken: token,
        chainId: asId(chainId),
        content,
        parentCommentId: parentCommentId ? asId(parentCommentId) : undefined,
      });
      return result as string;
    },
    null
  );
}

/**
 * Delete a comment
 */
export async function deleteComment(commentId: string): Promise<boolean> {
  return withAuth(
    async (token) => {
      await convex.mutation(api.social.deleteComment, { sessionToken: token, commentId: asId(commentId) });
      return true;
    },
    false
  );
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
  } catch {
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
  return withAuth(
    async (token) => {
      await convex.mutation(api.social.rateChain, { sessionToken: token, chainId: asId(chainId), rating });
      return true;
    },
    false
  );
}

/**
 * Follow a user
 */
export async function followUser(userId: string): Promise<boolean> {
  return withAuth(
    async (token) => {
      await convex.mutation(api.social.followUser, { sessionToken: token, userId: asId(userId) });
      return true;
    },
    false
  );
}

/**
 * Unfollow a user
 */
export async function unfollowUser(userId: string): Promise<boolean> {
  return withAuth(
    async (token) => {
      await convex.mutation(api.social.unfollowUser, { sessionToken: token, userId: asId(userId) });
      return true;
    },
    false
  );
}

/**
 * Check if the current user is following a target user
 */
export async function isFollowing(userId: string): Promise<boolean> {
  return withAuth(
    (token) => convex.query(api.social.isFollowing, { sessionToken: token, userId: asId(userId) }),
    false
  );
}

/**
 * Fork a chain with a new name
 */
export async function forkChain(
  chainId: string,
  newName: string
): Promise<{ chainId: string; slug: string; shareCode: string } | null> {
  return withAuth(
    async (token) => {
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
    },
    null
  );
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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
    return null;
  }
}

/**
 * Use AI to semantically map parameters from a source plugin to a substitute.
 * Fallback when stored parameter maps are missing or confidence is too low.
 */
export async function aiTranslateParameters(params: {
  sourcePluginName: string;
  sourceManufacturer: string;
  sourceCategory: string;
  targetPluginName: string;
  targetManufacturer: string;
  targetCategory: string;
  sourceParams: Array<{ name: string; value: string; semantic?: string; unit?: string }>;
  targetParamDefs: Array<{ name: string; index: number; minValue: number; maxValue: number; semantic?: string }>;
}): Promise<{ params: Array<{ index: number; name: string; value: number; confidence: number }>; confidence: number }> {
  return withAuth(async (token) => {
    return await convex.action(api.aiAssistant.aiTranslateParameters, {
      sessionToken: token,
      ...params,
    });
  }, { params: [], confidence: 0 });
}

/**
 * Ask AI to find a cross-format alias for a plugin that failed to load.
 * Persists confirmed matches to Convex so they become Tier 4 on the next load.
 */
export async function aiSuggestCrossFormatAlias(params: {
  sourceName: string;
  sourceManufacturer: string;
  sourceFormat: string;
  candidates: Array<{ name: string; manufacturer: string; format: string }>;
}): Promise<{ matched: boolean; name?: string; manufacturer?: string; confidence?: number } | null> {
  return withAuth(async (token) => {
    return await convex.action(api.aiAssistant.aiSuggestCrossFormatAlias, {
      sessionToken: token,
      ...params,
    });
  }, null);
}

/**
 * Get parameter map for a plugin
 */
export async function getParameterMap(pluginId: string): Promise<any | null> {
  try {
    return await convex.query(api.parameterTranslation.getParameterMap, {
      pluginId: pluginId as any,
    });
  } catch {
    return null;
  }
}

/**
 * Batch check which plugins already have parameter maps in Convex.
 * Returns a map of pluginId → boolean.
 */
export async function getParameterMapExistence(
  pluginIds: string[]
): Promise<Record<string, boolean>> {
  if (pluginIds.length === 0) return {};

  try {
    return await convex.query(api.parameterTranslation.getParameterMapExistence, {
      pluginIds: pluginIds as any,
    });
  } catch {
    return {};
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
  } catch {
    return null;
  }
}

/**
 * Upload a discovered parameter map to Convex
 */
export async function upsertParameterMap(data: {
  pluginId: string;
  pluginName: string;
  category: string;
  parameters: Array<{
    juceParamId: string;
    juceParamIndex?: number;
    semantic: string;
    physicalUnit: string;
    mappingCurve: string;
    minValue: number;
    maxValue: number;
    defaultValue?: number;
    steps?: Array<{ normalizedValue: number; physicalValue: string }>;
    rangeStart?: number;
    rangeEnd?: number;
    skewFactor?: number;
    symmetricSkew?: boolean;
    interval?: number;
    hasNormalisableRange?: boolean;
    curveSamples?: Array<{ normalized: number; physical: number }>;
    qRepresentation?: string;
  }>;
  eqBandCount?: number;
  eqBandParameterPattern?: string;
  compHasAutoMakeup?: boolean;
  compHasParallelMix?: boolean;
  compHasLookahead?: boolean;
  confidence: number;
  source: string;
}): Promise<string | null> {
  try {
    return await convex.mutation(api.parameterTranslation.upsertParameterMap, {
      plugin: data.pluginId as any,
      pluginName: data.pluginName,
      category: data.category,
      parameters: data.parameters,
      eqBandCount: data.eqBandCount,
      eqBandParameterPattern: data.eqBandParameterPattern,
      compHasAutoMakeup: data.compHasAutoMakeup,
      compHasParallelMix: data.compHasParallelMix,
      compHasLookahead: data.compHasLookahead,
      confidence: data.confidence,
      source: data.source,
    });
  } catch {
    return null;
  }
}

/**
 * Discover and upload parameter map for a loaded plugin
 *
 * This function:
 * 1. Checks if a parameter map already exists in Convex
 * 2. If not, discovers parameters via JUCE
 * 3. Uploads the discovered map to Convex
 *
 * @param nodeId - The chain node ID of the loaded plugin
 * @param matchedPluginId - The Convex plugin ID (from scannedPlugins.matchedPlugin)
 * @param options - Configuration options
 * @returns The discovered map or null if discovery failed
 */
export async function discoverAndUploadParameterMap(
  nodeId: number,
  matchedPluginId: string | null,
  options: {
    force?: boolean; // Force rediscovery even if map exists
    minConfidence?: number; // Minimum confidence to upload (default: 30)
  } = {}
): Promise<{ success: boolean; confidence?: number; error?: string }> {
  const { force = false, minConfidence = 30 } = options;

  // Must have a matched plugin ID to upload
  if (!matchedPluginId) {
    return { success: false, error: 'No matched plugin ID' };
  }

  try {
    // Check if map already exists (unless forcing)
    if (!force) {
      const existing = await getParameterMap(matchedPluginId);
      if (existing) {
        return { success: true, confidence: existing.confidence };
      }
    }

    // Import juceBridge dynamically to avoid circular dependency
    const { juceBridge } = await import('./juce-bridge');

    // Discover parameters via JUCE
    const discovery = await juceBridge.discoverPluginParameters(nodeId);

    if (!discovery.success || !discovery.map) {
      return { success: false, error: discovery.error || 'Discovery failed' };
    }

    const map = discovery.map;

    // Check confidence threshold
    if (map.confidence < minConfidence) {
      return { success: false, error: `Confidence too low: ${map.confidence}%` };
    }

    // Upload to Convex
    await upsertParameterMap({
      pluginId: matchedPluginId,
      pluginName: map.pluginName,
      category: map.category,
      parameters: map.parameters,
      eqBandCount: map.eqBandCount,
      eqBandParameterPattern: map.eqBandParameterPattern,
      compHasAutoMakeup: map.compHasAutoMakeup,
      compHasParallelMix: map.compHasParallelMix,
      compHasLookahead: map.compHasLookahead,
      confidence: map.confidence,
      source: 'juce-scanned',
    });

    return { success: true, confidence: map.confidence };
  } catch (err) {
    return { success: false, error: String(err) };
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
    return { success: false, error: String(err) };
  }
}

// ============================================
// SUBSTITUTION PLAN + CROWDPOOL
// ============================================

/**
 * Fetch a substitution plan for a chain — suggests owned alternatives for missing plugins
 * with combined similarity + parameter translation confidence scoring.
 */
export async function fetchSubstitutionPlan(chainId: string): Promise<{
  slots: Array<{
    slotPosition: number;
    pluginName: string;
    manufacturer: string;
    matchedPluginId?: string;
    status: "owned" | "missing" | "format_substitutable";
    paramMapInfo?: { hasMap: boolean; contributorCount: number; source: string };
    bestSubstitute?: {
      pluginId: string;
      pluginName: string;
      manufacturer: string;
      slug?: string;
      similarityScore: number;
      paramTranslationConfidence: number;
      combinedScore: number;
      reasons: string;
      hasParameterMap: boolean;
    };
    alternates: Array<{
      pluginId: string;
      pluginName: string;
      manufacturer: string;
      slug?: string;
      similarityScore: number;
      paramTranslationConfidence: number;
      combinedScore: number;
      reasons: string;
      hasParameterMap: boolean;
    }>;
  }>;
  overallConfidence: number;
  canAutoSubstitute: boolean;
  missingCount: number;
  ownedCount: number;
} | null> {
  return withAuth(
    (token) => convex.query(api.pluginDirectory.generateSubstitutionPlan, { chainId: asId(chainId), sessionToken: token }),
    null
  );
}

/**
 * Contribute discovered parameter data to the crowdpool.
 * Rate limited to 1 per user per plugin per hour on the backend.
 */
export async function contributeParameterDiscovery(
  pluginId: string,
  discoveredMap: {
    pluginName: string;
    category: string;
    confidence: number;
    matchedCount: number;
    totalCount: number;
    source: string;
    parameters: Array<{
      juceParamId: string;
      juceParamIndex?: number;
      semantic: string;
      physicalUnit: string;
      mappingCurve: string;
      minValue: number;
      maxValue: number;
      defaultValue?: number;
      rangeStart?: number;
      rangeEnd?: number;
      skewFactor?: number;
      symmetricSkew?: boolean;
      interval?: number;
      hasNormalisableRange?: boolean;
      curveSamples?: Array<{ normalized: number; physical: number }>;
      qRepresentation?: string;
    }>;
    eqBandCount?: number;
    eqBandParameterPattern?: string;
    compHasAutoMakeup?: boolean;
    compHasParallelMix?: boolean;
    compHasLookahead?: boolean;
  }
): Promise<{ action: string; contributorCount: number } | null> {
  return withAuth(
    (token) => convex.mutation(api.parameterTranslation.contributeParameterDiscovery, {
      plugin: asId(pluginId),
      sessionToken: token,
      discoveredMap,
    }),
    null
  );
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
    authorName?: string;
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
    return { error: String(err) };
  }
}

/**
 * Remove a chain from the user's collection
 */
export async function removeFromCollection(chainId: string): Promise<boolean> {
  return withAuth(
    async (token) => {
      await convex.mutation(api.pluginDirectory.removeFromCollection, { sessionToken: token, chainId: asId(chainId) });
      return true;
    },
    false
  );
}

/**
 * Get the user's chain collection
 */
export async function getMyCollection(limit?: number): Promise<any[]> {
  return withAuth(
    (token) => convex.query(api.pluginDirectory.getMyCollection, { sessionToken: token, limit }),
    []
  );
}

/**
 * Check if a chain is in the user's collection
 */
export async function isInCollection(chainId: string): Promise<boolean> {
  return withAuth(
    (token) => convex.query(api.pluginDirectory.isInCollection, { sessionToken: token, chainId: asId(chainId) }),
    false
  );
}

// ============================================
// FRIENDS & CHAIN SHARING
// ============================================

/**
 * Get the count of pending received chains (for notification badge)
 */
export async function getPendingChainCount(): Promise<number> {
  return withAuth(
    async (token) => {
      const received = await convex.query(api.privateChains.getReceivedChains, { sessionToken: token });
      return received.length;
    },
    0
  );
}

/**
 * Get the count of pending friend requests (for notification badge)
 */
export async function getPendingFriendRequestCount(): Promise<number> {
  return withAuth(
    async (token) => {
      const requests = await convex.query(api.friends.getPendingRequests, { sessionToken: token });
      return requests.length;
    },
    0
  );
}

// ============================================
// CHAIN LOAD TRACKING
// ============================================

/**
 * Record the result of a chain load in the DAW.
 * Best-effort — never blocks the user or throws.
 */
export async function recordChainLoadResult(params: {
  chainId: string;
  totalSlots: number;
  loadedSlots: number;
  failedSlots: number;
  substitutedSlots: number;
  failures?: Array<{ position: number; pluginName: string; reason: string }>;
  loadTimeMs?: number;
}): Promise<void> {
  const token = getStoredSession();
  if (!token) return;

  try {
    await convex.mutation(api.pluginDirectory.recordChainLoadResult, {
      sessionToken: token,
      chainId: params.chainId as any,
      totalSlots: params.totalSlots,
      loadedSlots: params.loadedSlots,
      failedSlots: params.failedSlots,
      substitutedSlots: params.substitutedSlots,
      failures: params.failures,
      loadTimeMs: params.loadTimeMs,
    });
  } catch (e) {
    console.warn('[recordChainLoadResult] failed:', e);
  }
}

// ============================================
// AI USER PROFILE
// ============================================

/**
 * Get the current user's AI profile.
 * Maps backend schema field names → UI field names.
 */
export async function getAiProfile(): Promise<{
  experienceLevel: string;
  genres: string[];
  processingTargets: string[];
  microphone?: string;
  preferredPeakLevel?: number;
  preferredHeadroom?: number;
  typicalVocalLevel?: number;
  onboardingCompleted: boolean;
} | null> {
  return withAuth(
    async (token) => {
      const raw = await convex.query((api as any).aiUserProfile.getUserAiProfile, { sessionToken: token });
      if (!raw) return null;
      return {
        experienceLevel: raw.proficiencyLevel ?? 'intermediate',
        genres: raw.primaryGenres ?? [],
        processingTargets: raw.primaryUseCases ?? [],
        microphone: raw.microphone,
        preferredPeakLevel: raw.preferredPeakLevel,
        preferredHeadroom: raw.preferredHeadroom,
        typicalVocalLevel: raw.typicalVocalLevel,
        onboardingCompleted: raw.onboardingCompleted ?? false,
      };
    },
    null
  );
}

/**
 * Update the user's AI profile fields.
 * Maps UI field names to backend schema field names.
 */
export async function updateAiProfile(fields: {
  experienceLevel?: string;
  genres?: string[];
  processingTargets?: string[];
  microphone?: string;
  preferredPeakLevel?: number;
  preferredHeadroom?: number;
  typicalVocalLevel?: number;
  onboardingCompleted?: boolean;
}): Promise<boolean> {
  return withAuth(
    async (token) => {
      await convex.mutation((api as any).aiUserProfile.updateUserAiProfile, {
        sessionToken: token,
        ...(fields.experienceLevel !== undefined && { proficiencyLevel: fields.experienceLevel }),
        ...(fields.genres !== undefined && { primaryGenres: fields.genres }),
        ...(fields.processingTargets !== undefined && { primaryUseCases: fields.processingTargets }),
        ...(fields.microphone !== undefined && { microphone: fields.microphone }),
        ...(fields.preferredPeakLevel !== undefined && { preferredPeakLevel: fields.preferredPeakLevel }),
        ...(fields.preferredHeadroom !== undefined && { preferredHeadroom: fields.preferredHeadroom }),
        ...(fields.typicalVocalLevel !== undefined && { typicalVocalLevel: fields.typicalVocalLevel }),
        ...(fields.onboardingCompleted !== undefined && { onboardingCompleted: fields.onboardingCompleted }),
      });
      return true;
    },
    false
  );
}

/**
 * Ensure an AI profile exists for the current user (creates with defaults if needed)
 */
export async function ensureAiProfile(): Promise<boolean> {
  return withAuth(
    async (token) => {
      await convex.mutation((api as any).aiUserProfile.ensureAiProfile, { sessionToken: token });
      return true;
    },
    false
  );
}

// ============================================
// AI CHAT
// ============================================

/**
 * Create a new AI chat thread
 */
export async function createAiThread(chainId?: string): Promise<string | null> {
  return withAuth(
    async (token) => {
      const result = await convex.mutation((api as any).aiChat.createThread, {
        sessionToken: token,
        ...(chainId ? { chainId: asId(chainId) } : {}),
      });
      return result as string;
    },
    null
  );
}

/**
 * Get the user's AI chat threads
 */
export async function getAiThreads(): Promise<any[] | null> {
  return withAuth(
    (token) => convex.query((api as any).aiChat.getThreads, { sessionToken: token }),
    null
  );
}

/**
 * Get messages for an AI chat thread
 */
export async function getAiMessages(threadId: string): Promise<any[] | null> {
  return withAuth(
    (token) => convex.query((api as any).aiChat.getMessages, { sessionToken: token, threadId: asId(threadId) }),
    null
  );
}

/**
 * Send a user message to an AI chat thread
 */
export async function sendAiMessage(threadId: string, content: string): Promise<string | null> {
  return withAuth(
    (token) => convex.mutation((api as any).aiChat.addMessage, {
      sessionToken: token,
      threadId: asId(threadId),
      role: 'user',
      content,
    }) as Promise<string>,
    null
  );
}

/**
 * Mark a chain action as applied
 */
export async function markAiChainActionApplied(messageId: string): Promise<boolean> {
  return withAuth(
    async (token) => {
      await convex.mutation((api as any).aiChat.markChainActionApplied, { sessionToken: token, messageId: asId(messageId) });
      return true;
    },
    false
  );
}

/**
 * Send AI request to HTTP endpoint (triggers AI processing)
 */
export async function sendAiRequest(
  threadId: string,
  message: string,
  currentChain?: any,
  inputLevels?: any
): Promise<boolean> {
  return withAuth(
    async (token) => {
      const response = await fetch(`${CONVEX_URL.replace('.convex.cloud', '.convex.site')}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken: token,
          threadId,
          userMessage: message,
          currentChain: currentChain ? JSON.stringify(currentChain) : undefined,
          inputLevels,
        }),
      });
      return response.ok;
    },
    false
  );
}

// ============================================
// PLUGIN PRESETS (Community)
// ============================================

/**
 * Browse plugin presets with filters and sorting.
 */
export async function browsePresets(
  options: {
    pluginName?: string;
    normalizedKey?: string;
    category?: string;
    useCase?: string;
    search?: string;
    sortBy?: string;
    limit?: number;
    cursor?: number;
  } = {}
): Promise<any[]> {
  try {
    return await convex.query(api.pluginPresets.browsePresets, options);
  } catch {
    return [];
  }
}

/**
 * Get presets for a specific plugin by normalizedKey.
 */
export async function getPresetsForPlugin(
  normalizedKey: string,
  options?: { category?: string; limit?: number }
): Promise<any[]> {
  try {
    return await convex.query(api.pluginPresets.getPresetsForPlugin, {
      normalizedKey,
      category: options?.category,
      limit: options?.limit,
    });
  } catch {
    return [];
  }
}

/**
 * Get full preset data (including base64 presetData) for applying.
 */
export async function getPresetData(
  presetId: string
): Promise<{ _id: string; presetData: string; presetSizeBytes: number; pluginName: string; manufacturer: string; normalizedKey: string } | null> {
  try {
    return await convex.query(api.pluginPresets.getPresetData, {
      presetId: asId(presetId),
    });
  } catch {
    return null;
  }
}

/**
 * Track a preset download (increment counter).
 */
export async function trackPresetDownload(presetId: string): Promise<boolean> {
  try {
    await convex.mutation(api.pluginPresets.trackPresetDownload, {
      presetId: asId(presetId),
    });
    return true;
  } catch {
    return false;
  }
}
