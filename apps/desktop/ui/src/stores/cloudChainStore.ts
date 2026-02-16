import { create } from 'zustand';
import * as convexClient from '../api/convex-client';
import { juceBridge } from '../api/juce-bridge';
import type { ChainSlot, BrowseChainSlot } from '../api/types';
import { captureSlotParameters } from '../utils/captureParameters';

interface CloudChain {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  category: string;
  tags: string[];
  pluginCount: number;
  downloads: number;
  likes: number;
  isPublic: boolean;
  shareCode?: string;
  slots: BrowseChainSlot[];
  author?: { name?: string; avatarUrl?: string };
  authorId?: string;
  forkedFrom?: string;
  targetInputLufs?: number;
  targetInputPeakMin?: number;
  targetInputPeakMax?: number;
  useCase?: string;
  useCaseGroup?: string;
  pluginIds?: string[];
  createdAt?: number;
  forks?: number;
  views?: number;
  genre?: string;
  averageRating?: number;
  updatedAt?: number;
}

interface CollectionItem {
  _id: string;
  chain: CloudChain;
  addedAt: number;
  source: string;
  notes?: string;
}

interface CloudChainState {
  chains: CloudChain[];
  currentChain: CloudChain | null;
  compatibility: {
    canFullyLoad: boolean;
    ownedCount: number;
    missingCount: number;
    percentage: number;
  } | null;
  detailedCompatibility: {
    percentage: number;
    ownedCount: number;
    missingCount: number;
    missing: Array<{
      pluginName: string;
      manufacturer: string;
      suggestion: string | null;
    }>;
    slots?: Array<{
      position: number;
      pluginName: string;
      manufacturer: string;
      status: "owned" | "missing";
      alternatives: Array<{
        id: string;
        name: string;
        manufacturer: string;
        slug?: string;
      }>;
    }>;
  } | null;
  substitutionPlan: {
    slots: Array<{
      slotPosition: number;
      pluginName: string;
      manufacturer: string;
      matchedPluginId?: string;
      status: "owned" | "missing";
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
  } | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  // Enhanced browsing
  browseTotal: number;
  browseHasMore: boolean;
  // Collection
  collection: CollectionItem[];
  collectionLoading: boolean;
  // User's own chains
  myChains: CloudChain[];
  myChainsLoading: boolean;
  // Owned plugin IDs (from scanned + matched plugins)
  ownedPluginIds: Set<string>;
}

interface CloudChainActions {
  browseChains: (options?: { category?: string; sortBy?: "popular" | "recent" | "downloads" | "rating" }) => Promise<void>;
  browseChainsPaginated: (options?: {
    useCaseGroup?: string;
    useCase?: string;
    search?: string;
    sortBy?: "popular" | "recent" | "downloads" | "rating";
    compatibilityFilter?: "all" | "full" | "close";
    limit?: number;
    offset?: number;
  }) => Promise<void>;
  loadChain: (slugOrCode: string) => Promise<CloudChain | null>;
  checkCompatibility: (chainId: string) => Promise<void>;
  saveChain: (
    name: string,
    slots: ChainSlot[],
    options?: {
      description?: string;
      category?: string;
      useCase?: string;
      tags?: string[];
      isPublic?: boolean;
      targetInputLufs?: number;
      targetInputPeakMin?: number;
      targetInputPeakMax?: number;
    }
  ) => Promise<{ chainId?: string; slug?: string; shareCode?: string; error?: string }>;
  fetchDetailedCompatibility: (chainId: string) => Promise<void>;
  fetchSubstitutionPlan: (chainId: string) => Promise<void>;
  downloadChain: (chainId: string) => Promise<void>;
  toggleLike: (chainId: string) => Promise<boolean | null>;
  // Collection
  fetchCollection: () => Promise<void>;
  addToCollection: (chainId: string) => Promise<boolean>;
  removeFromCollection: (chainId: string) => Promise<boolean>;
  // My chains
  fetchMyChains: () => Promise<void>;
  // Owned plugins
  fetchOwnedPluginIds: () => Promise<void>;
  // Social actions
  getChainRating: (chainId: string) => Promise<{ average: number; count: number; userRating: number | null } | null>;
  rateChain: (chainId: string, rating: number) => Promise<boolean>;
  getComments: (chainId: string) => Promise<any[]>;
  addComment: (chainId: string, content: string, parentCommentId?: string) => Promise<string | null>;
  deleteComment: (commentId: string) => Promise<boolean>;
  followAuthor: (chainId: string) => Promise<boolean>;
  unfollowAuthor: (chainId: string) => Promise<boolean>;
  isFollowingAuthor: (chainId: string) => Promise<boolean>;
  forkChain: (chainId: string, newName: string) => Promise<{ chainId: string; slug: string; shareCode: string } | null>;
  // Chain management
  renameChain: (chainId: string, newName: string) => Promise<boolean>;
  deleteChain: (chainId: string) => Promise<boolean>;
  updateVisibility: (chainId: string, isPublic: boolean) => Promise<boolean>;
}

const initialState: CloudChainState = {
  chains: [],
  currentChain: null,
  compatibility: null,
  detailedCompatibility: null,
  substitutionPlan: null,
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
};

export const useCloudChainStore = create<CloudChainState & CloudChainActions>((set, get) => ({
  ...initialState,

  browseChains: async (options = {}) => {
    set({ loading: true, error: null });
    try {
      const chains = await convexClient.browseChains(options);
      set({ chains, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  browseChainsPaginated: async (options = {}) => {
    set({ loading: true, error: null });
    try {
      const result = await convexClient.browseChainsPaginated(options);
      set({
        chains: result.chains,
        browseTotal: result.total,
        browseHasMore: result.hasMore,
        loading: false,
      });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  loadChain: async (slugOrCode: string) => {
    set({ loading: true, error: null, currentChain: null, compatibility: null, detailedCompatibility: null, substitutionPlan: null });
    try {
      const chain = await convexClient.loadChain(slugOrCode);
      set({ currentChain: chain, loading: false });

      if (chain?._id) {
        // Auto-check compatibility
        get().checkCompatibility(chain._id);
      }

      return chain;
    } catch (err) {
      set({ error: String(err), loading: false });
      return null;
    }
  },

  checkCompatibility: async (chainId: string) => {
    try {
      const compat = await convexClient.checkChainCompatibility(chainId);
      set({ compatibility: compat });
    } catch (_err) {
      // Silently ignored — compatibility check is non-critical
    }
  },

  saveChain: async (name, _slots, options = {}) => {
    set({ saving: true, error: null });

    try {
      // Export chain with preset data from JUCE
      const exported = await juceBridge.exportChain();

      // Capture semantically-filtered parameters for each slot
      const paramsByPosition = await captureSlotParameters(exported.slots);

      // Map the exported data to our format
      const mappedSlots = exported.slots.map((slot, i) => ({
        position: slot.index,
        pluginName: slot.name,
        manufacturer: slot.manufacturer,
        format: slot.format,
        uid: slot.uid,
        version: slot.version,
        bypassed: slot.bypassed,
        presetData: slot.presetData,
        presetSizeBytes: slot.presetSizeBytes,
        ...(paramsByPosition.has(i) ? { parameters: paramsByPosition.get(i) } : {}),
      }));

      const result = await convexClient.saveChain(name, mappedSlots, options);
      set({ saving: false });

      if (result.error) {
        set({ error: result.error });
      }

      return result;
    } catch (err) {
      set({ saving: false, error: String(err) });
      return { error: String(err) };
    }
  },

  fetchDetailedCompatibility: async (chainId: string) => {
    try {
      const result = await convexClient.fetchDetailedCompatibility(chainId);
      set({ detailedCompatibility: result });
    } catch (err) {
      set({ detailedCompatibility: null });
    }
  },

  fetchSubstitutionPlan: async (chainId: string) => {
    try {
      const result = await convexClient.fetchSubstitutionPlan(chainId);
      set({ substitutionPlan: result });
    } catch {
      set({ substitutionPlan: null });
    }
  },

  downloadChain: async (chainId: string) => {
    await convexClient.downloadChain(chainId);
  },

  toggleLike: async (chainId: string) => {
    const result = await convexClient.toggleLike(chainId);

    // Update local state if we have the chain
    if (result && get().currentChain?._id === chainId) {
      set((state) => ({
        currentChain: state.currentChain
          ? {
              ...state.currentChain,
              likes: state.currentChain.likes + (result.liked ? 1 : -1)
            }
          : null,
      }));
    }

    return result?.liked ?? null;
  },

  // ── Collection Actions ──

  fetchCollection: async () => {
    set({ collectionLoading: true });
    try {
      const items = await convexClient.getMyCollection();
      set({ collection: items as CollectionItem[], collectionLoading: false });
    } catch (err) {
      set({ collectionLoading: false });
    }
  },

  addToCollection: async (chainId: string) => {
    const result = await convexClient.addToCollection(chainId, "desktop");
    if (!result.error) {
      // Refresh collection
      get().fetchCollection();
      return true;
    }
    return false;
  },

  removeFromCollection: async (chainId: string) => {
    const success = await convexClient.removeFromCollection(chainId);
    if (success) {
      // Remove from local state immediately
      set((state) => ({
        collection: state.collection.filter((c) => c.chain._id !== chainId),
      }));
    }
    return success;
  },

  // ── My Chains ──

  fetchMyChains: async () => {
    set({ myChainsLoading: true });
    try {
      const userId = convexClient.getUserId();
      if (userId) {
        const chains = await convexClient.getChainsByUser(userId);
        set({ myChains: chains, myChainsLoading: false });
      } else {
        set({ myChainsLoading: false });
      }
    } catch (err) {
      set({ myChainsLoading: false });
    }
  },

  fetchOwnedPluginIds: async () => {
    try {
      const scanned = await convexClient.getScannedPlugins();
      const ids = new Set<string>();
      for (const sp of scanned) {
        if (sp.matchedPlugin) {
          ids.add(sp.matchedPlugin.toString());
        }
      }
      set({ ownedPluginIds: ids });
    } catch (_err) {
      // Silently ignored — owned plugin IDs are best-effort
    }
  },

  // ── Social Actions ──

  getChainRating: async (chainId: string) => {
    return await convexClient.getChainRating(chainId);
  },

  rateChain: async (chainId: string, rating: number) => {
    return await convexClient.rateChain(chainId, rating);
  },

  getComments: async (chainId: string) => {
    return await convexClient.getComments(chainId);
  },

  addComment: async (chainId: string, content: string, parentCommentId?: string) => {
    return await convexClient.addComment(chainId, content, parentCommentId);
  },

  deleteComment: async (commentId: string) => {
    return await convexClient.deleteComment(commentId);
  },

  followAuthor: async (chainId: string) => {
    const chain = get().currentChain;
    const authorId = chain?._id === chainId ? chain?.authorId : undefined;
    if (!authorId) return false;
    return await convexClient.followUser(authorId);
  },

  unfollowAuthor: async (chainId: string) => {
    const chain = get().currentChain;
    const authorId = chain?._id === chainId ? chain?.authorId : undefined;
    if (!authorId) return false;
    return await convexClient.unfollowUser(authorId);
  },

  isFollowingAuthor: async (chainId: string) => {
    const chain = get().currentChain;
    const authorId = chain?._id === chainId ? chain?.authorId : undefined;
    if (!authorId) return false;
    return await convexClient.isFollowing(authorId);
  },

  forkChain: async (chainId: string, newName: string) => {
    return await convexClient.forkChain(chainId, newName);
  },

  renameChain: async (chainId: string, newName: string) => {
    try {
      const result = await convexClient.renameCloudChain(chainId, newName);
      if (result?.success) {
        // Update local state optimistically
        set((state) => ({
          myChains: state.myChains.map((c) =>
            c._id === chainId ? { ...c, name: newName, slug: result.slug ?? c.slug } : c
          ),
        }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  deleteChain: async (chainId: string) => {
    try {
      const result = await convexClient.deleteCloudChain(chainId);
      if (result?.success) {
        // Remove from local state
        set((state) => ({
          myChains: state.myChains.filter((c) => c._id !== chainId),
        }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  updateVisibility: async (chainId: string, isPublic: boolean) => {
    try {
      const result = await convexClient.updateChainVisibility(chainId, isPublic);
      if (result?.success) {
        // Update local state
        set((state) => ({
          myChains: state.myChains.map((c) =>
            c._id === chainId ? { ...c, isPublic } : c
          ),
        }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
}));
