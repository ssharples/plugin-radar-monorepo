import { create } from 'zustand';
import * as convexClient from '../api/convex-client';
import { juceBridge } from '../api/juce-bridge';
import type { ChainSlot } from '../api/types';

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
  slots: any[];
  author?: { name?: string; avatarUrl?: string };
  authorId?: string;
  forkedFrom?: string;
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
  } | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

interface CloudChainActions {
  browseChains: (options?: { category?: string; sortBy?: "popular" | "recent" | "downloads" | "rating" }) => Promise<void>;
  loadChain: (slugOrCode: string) => Promise<CloudChain | null>;
  checkCompatibility: (chainId: string) => Promise<void>;
  saveChain: (
    name: string,
    slots: ChainSlot[],
    options?: {
      description?: string;
      category?: string;
      tags?: string[];
      isPublic?: boolean;
    }
  ) => Promise<{ slug?: string; shareCode?: string; error?: string }>;
  fetchDetailedCompatibility: (chainId: string) => Promise<void>;
  downloadChain: (chainId: string) => Promise<void>;
  toggleLike: (chainId: string) => Promise<boolean | null>;
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
}

const initialState: CloudChainState = {
  chains: [],
  currentChain: null,
  compatibility: null,
  detailedCompatibility: null,
  loading: false,
  saving: false,
  error: null,
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

  loadChain: async (slugOrCode: string) => {
    set({ loading: true, error: null, currentChain: null, compatibility: null, detailedCompatibility: null });
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
    } catch (err) {
      console.error("Failed to check compatibility:", err);
    }
  },

  saveChain: async (name, _slots, options = {}) => {
    set({ saving: true, error: null });

    try {
      // Export chain with preset data from JUCE
      const exported = await juceBridge.exportChain();

      // Map the exported data to our format
      const mappedSlots = exported.slots.map((slot) => ({
        position: slot.index,
        pluginName: slot.name,
        manufacturer: slot.manufacturer,
        format: slot.format,
        uid: slot.uid,
        version: slot.version,
        fileOrIdentifier: slot.fileOrIdentifier,
        bypassed: slot.bypassed,
        presetData: slot.presetData,
        presetSizeBytes: slot.presetSizeBytes,
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

  fetchDetailedCompatibility: async (_chainId: string) => {
    // Not yet deployed on backend — will be added with social features
    set({ detailedCompatibility: null });
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
}));
