import { useMemo } from 'react';
import type { PresetInfo, BrowseChainResult, UnifiedChainItem } from '../../api/types';

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Merges local presets with cloud chains into a unified list.
 * Name-based matching: if local preset name matches cloud chain name, shown as one synced item.
 * Sorted by most recent first.
 */
export function useUnifiedChains(
  localPresets: PresetInfo[],
  cloudChains: BrowseChainResult[],
  searchQuery: string = ''
): UnifiedChainItem[] {
  return useMemo(() => {
    // Build a map of normalized cloud chain names for matching
    const cloudByNormalizedName = new Map<string, BrowseChainResult>();
    for (const chain of cloudChains) {
      cloudByNormalizedName.set(normalizeName(chain.name), chain);
    }

    const matchedCloudIds = new Set<string>();
    const items: UnifiedChainItem[] = [];

    // Process local presets first
    for (const preset of localPresets) {
      const normalizedLocal = normalizeName(preset.name);
      const matchedCloud = cloudByNormalizedName.get(normalizedLocal);

      if (matchedCloud) {
        matchedCloudIds.add(matchedCloud._id);
        items.push({
          source: 'both',
          localData: preset,
          cloudData: matchedCloud,
        });
      } else {
        items.push({
          source: 'local',
          data: preset,
        });
      }
    }

    // Add unmatched cloud chains
    for (const chain of cloudChains) {
      if (!matchedCloudIds.has(chain._id)) {
        items.push({
          source: 'cloud',
          data: chain,
        });
      }
    }

    // Filter by search query
    let filtered = items;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = items.filter((item) => {
        const name =
          item.source === 'both'
            ? item.localData.name
            : item.source === 'local'
              ? item.data.name
              : item.data.name;
        return name.toLowerCase().includes(q);
      });
    }

    // Sort: 'both' first (synced), then by recency
    filtered.sort((a, b) => {
      // Synced items first
      if (a.source === 'both' && b.source !== 'both') return -1;
      if (b.source === 'both' && a.source !== 'both') return 1;

      // Then by timestamp (most recent first)
      const getTime = (item: UnifiedChainItem): number => {
        if (item.source === 'both') {
          return item.cloudData.updatedAt ?? item.cloudData.createdAt ?? 0;
        }
        if (item.source === 'cloud') {
          return item.data.updatedAt ?? item.data.createdAt ?? 0;
        }
        // Local presets use lastModified ISO string
        return new Date(item.data.lastModified).getTime() || 0;
      };

      return getTime(b) - getTime(a);
    });

    return filtered;
  }, [localPresets, cloudChains, searchQuery]);
}
