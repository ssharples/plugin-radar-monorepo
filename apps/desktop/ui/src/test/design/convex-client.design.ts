// Stand-in for src/api/convex-client.ts in the design preview only.
// Returns fixture data and never touches the network.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CLOUD_CHAINS, ENRICHED, SCANNED, PLUGINS, ALTERNATIVES } from './fixtures';

export type { ScannedPlugin, ChainSlot, PluginRadarUser, EnrichedPluginData } from '../../api/convex-client';

const loggedIn = () => !new URLSearchParams(location.search).has('loggedOut');
const wait = <T,>(v: T, ms = 60) => new Promise<T>((r) => setTimeout(() => r(v), ms));

export const convex = {
  query: async () => null,
  mutation: async () => ({ success: true }),
  action: async () => null,
};

export const isOnline = () => true;
export async function executeQueuedWrite() { return true; }
export async function initializeAuth() { return loggedIn(); }
export async function login() { return { success: true }; }
export async function register() { return { success: true }; }
export async function logout() {}
export async function getCurrentUser() { return { _id: 'user_me', name: 'Sam Demo', email: 'demo@example.invalid' }; }
export function getUserId() { return loggedIn() ? 'user_me' : null; }
export async function syncPlugins() { return { synced: PLUGINS.length, inCatalog: PLUGINS.length, newPlugins: [], error: null }; }
export async function fetchEnrichedPluginData(ids: string[]) { return ENRICHED.filter((e) => ids.includes(e._id)); }
export function clearEnrichmentCache() {}
export async function getScannedPlugins() { return SCANNED; }
export async function saveChain() { return { success: true, slug: 'my-chain', shareCode: 'ABC123' }; }
export async function loadChain(slug: string) { return wait(CLOUD_CHAINS.find((c) => c.slug === slug || c.shareCode === slug) ?? null); }

function compatFor(chainId: string) {
  const c = CLOUD_CHAINS.find((x) => x._id === chainId);
  if (!c) return null;
  const owned = c._owned.filter(Boolean).length;
  const total = c.slots.length;
  return { canFullyLoad: owned === total, ownedCount: owned, missingCount: total - owned, percentage: Math.round((owned / total) * 100) };
}
export async function checkChainCompatibility(chainId: string) { return loggedIn() ? compatFor(chainId) : null; }
export async function fetchDetailedCompatibility(chainId: string) {
  const c = CLOUD_CHAINS.find((x) => x._id === chainId);
  const base = compatFor(chainId);
  if (!c || !base || !loggedIn()) return null;
  const slots = c.slots.map((s: any, i: number) => ({
    position: s.position ?? i,
    pluginName: s.pluginName,
    manufacturer: s.manufacturer,
    status: c._owned[i] ? 'owned' : 'missing',
    alternatives: c._owned[i] ? [] : (ALTERNATIVES[s.pluginName] ?? []),
  }));
  return {
    ...base,
    missing: slots.filter((s: any) => s.status === 'missing').map((s: any) => ({ pluginName: s.pluginName, manufacturer: s.manufacturer, suggestion: null })),
    slots,
  };
}
export async function browseChains() { return CLOUD_CHAINS; }
export async function browseChainsPaginated(opts: any = {}) {
  let list = CLOUD_CHAINS.slice();
  if (opts.search) {
    const q = String(opts.search).toLowerCase();
    list = list.filter((c) => c.name.toLowerCase().includes(q) || c.tags.some((t: string) => t.includes(q)) || c.slots.some((s: any) => s.pluginName.toLowerCase().includes(q)));
  }
  if (opts.compatibilityFilter === 'full') list = list.filter((c) => c._owned.every(Boolean));
  if (opts.sortBy === 'downloads') list.sort((a, b) => b.downloads - a.downloads);
  return wait({ chains: list, total: list.length, hasMore: false });
}
export async function downloadChain() {}
export async function toggleLike() { return true; }
export async function getComments() {
  return [
    { _id: 'cm1', chainId: 'chain_1', content: 'Swapped the 1176 for CLA-76 and it still slaps.', authorName: 'kicksnare', userId: 'user_11', createdAt: Date.now() - 3600_000 * 5 },
    { _id: 'cm2', chainId: 'chain_1', content: 'What input level do you aim for?', authorName: 'aurora', userId: 'user_14', createdAt: Date.now() - 3600_000 * 30 },
  ];
}
export async function addComment() { return 'cm_new'; }
export async function deleteComment() { return true; }
export async function getChainRating() { return { average: 4.6, count: 38, userRating: null }; }
export async function rateChain() { return true; }
export async function followUser() { return true; }
export async function unfollowUser() { return true; }
export async function isFollowing() { return false; }
export async function forkChain() { return { chainId: 'chain_fork', slug: 'fork', shareCode: 'FORK1' }; }
export async function getChainsByUser() { return CLOUD_CHAINS.slice(3, 5); }
export async function getUserStats() { return { chainCount: 2, totalDownloads: 120, totalLikes: 30, followerCount: 12, followingCount: 8 }; }
export async function findCompatibleSwaps() { return []; }
export async function getRandomSwap() { return null; }
export async function translateParameters() { return null; }
export async function getParameterMap() { return null; }
export async function getParameterMapByName() { return null; }
export async function uploadDiscoveredParameterMap() { return null; }
export async function addToCollection() { return true; }
export async function removeFromCollection() { return true; }
export async function getMyCollection() { return CLOUD_CHAINS.slice(1, 3).map((chain, i) => ({ _id: `col_${i}`, chain, source: 'desktop', addedAt: Date.now() })); }
export async function isInCollection() { return false; }
export async function getPendingChainCount() { return 1; }
export async function getPendingFriendRequestCount() { return 2; }
