import { useState, useEffect, useCallback } from 'react';
import { Search, FolderOpen } from 'lucide-react';
import { usePresetStore } from '../../stores/presetStore';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useSyncStore } from '../../stores/syncStore';
import { useChainStore } from '../../stores/chainStore';
import { useUnifiedChains } from './useUnifiedChains';
import { UnifiedChainCard } from './UnifiedChainCard';
import type { UnifiedChainItem, BrowseChainResult } from '../../api/types';

interface MyChainsListProps {
  onClose: () => void;
  onPreview: (chain: BrowseChainResult) => void;
}

export function MyChainsList({ onClose, onPreview }: MyChainsListProps) {
  const { presets, loading: presetsLoading, fetchPresets, loadPreset, renamePreset, deletePreset } = usePresetStore();
  const {
    myChains,
    myChainsLoading,
    fetchMyChains,
    renameChain,
    deleteChain,
    updateVisibility,
  } = useCloudChainStore();
  const { isLoggedIn } = useSyncStore();
  const { setChainName } = useChainStore();

  const [searchQuery, setSearchQuery] = useState('');

  // Fetch data on mount
  useEffect(() => {
    fetchPresets();
    if (isLoggedIn) {
      fetchMyChains();
    }
  }, [fetchPresets, fetchMyChains, isLoggedIn]);

  const unifiedChains = useUnifiedChains(presets, isLoggedIn ? myChains as BrowseChainResult[] : [], searchQuery);

  const loading = presetsLoading || (isLoggedIn && myChainsLoading);

  const handleLoad = useCallback(
    async (item: UnifiedChainItem) => {
      if (item.source === 'local') {
        const success = await loadPreset(item.data.path);
        if (success) {
          setChainName(item.data.name);
          onClose();
        }
      } else if (item.source === 'cloud') {
        onPreview(item.data);
      } else {
        // 'both' — load local version (faster)
        const success = await loadPreset(item.localData.path);
        if (success) {
          setChainName(item.localData.name);
          onClose();
        }
      }
    },
    [loadPreset, setChainName, onClose, onPreview]
  );

  const handleRename = useCallback(
    async (item: UnifiedChainItem, newName: string) => {
      let success = true;

      if (item.source === 'local' || item.source === 'both') {
        const localPath = item.source === 'local' ? item.data.path : item.localData.path;
        success = await renamePreset(localPath, newName);
      }

      if ((item.source === 'cloud' || item.source === 'both') && success) {
        const chainId = item.source === 'cloud' ? item.data._id : item.cloudData._id;
        success = await renameChain(chainId, newName);
      }

      return success;
    },
    [renamePreset, renameChain]
  );

  const handleDelete = useCallback(
    async (item: UnifiedChainItem) => {
      let success = true;

      if (item.source === 'local' || item.source === 'both') {
        const localPath = item.source === 'local' ? item.data.path : item.localData.path;
        success = await deletePreset(localPath);
      }

      if ((item.source === 'cloud' || item.source === 'both') && success) {
        const chainId = item.source === 'cloud' ? item.data._id : item.cloudData._id;
        success = await deleteChain(chainId);
      }

      return success;
    },
    [deletePreset, deleteChain]
  );

  const handleToggleVisibility = useCallback(
    async (item: UnifiedChainItem) => {
      const cloudData = item.source === 'cloud' ? item.data : item.source === 'both' ? item.cloudData : null;
      if (!cloudData) return false;
      return await updateVisibility(cloudData._id, !cloudData.isPublic);
    },
    [updateVisibility]
  );

  if (loading && unifiedChains.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          Loading chains...
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Search */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--color-text-disabled)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your chains..."
            className="input w-full"
            style={{ paddingLeft: '28px', fontSize: 'var(--text-xs)' }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-cyber px-3 py-2">
        {unifiedChains.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {unifiedChains.map((item) => {
              const key =
                item.source === 'both'
                  ? `both-${item.localData.path}`
                  : item.source === 'local'
                    ? `local-${item.data.path}`
                    : `cloud-${item.data._id}`;

              const isCloud = item.source === 'cloud' || item.source === 'both';

              return (
                <UnifiedChainCard
                  key={key}
                  item={item}
                  onLoad={() => handleLoad(item)}
                  onRename={(newName) => handleRename(item, newName)}
                  onDelete={() => handleDelete(item)}
                  onToggleVisibility={isCloud ? () => handleToggleVisibility(item) : undefined}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <FolderOpen className="w-8 h-8" style={{ color: 'var(--color-text-disabled)', opacity: 0.3 }} />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              {searchQuery ? 'No chains match your search' : 'No chains yet'}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--color-text-disabled)' }}>
              Save a chain locally or to the cloud to see it here
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
