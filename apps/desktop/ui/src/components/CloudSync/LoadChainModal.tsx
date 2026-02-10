import { useState, useEffect, useCallback } from 'react';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { ChainDetailModal } from './ChainDetailModal';
import { StarRating } from './StarRating';

interface LoadChainModalProps {
  onClose: () => void;
  onLoad: (chainData: unknown) => void;
}

export function LoadChainModal({ onClose, onLoad }: LoadChainModalProps) {
  const {
    chains,
    currentChain,
    loading,
    browseChains,
    loadChain,
  } = useCloudChainStore();

  const [shareCode, setShareCode] = useState('');
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<'popular' | 'recent' | 'downloads' | 'rating'>('popular');
  const [view, setView] = useState<'browse' | 'detail'>('browse');
  const [chainRatings, setChainRatings] = useState<Record<string, { average: number; count: number }>>({});

  // Escape key to close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    browseChains({ category, sortBy });
  }, [category, sortBy, browseChains]);

  // Fetch ratings for visible chains
  const { getChainRating } = useCloudChainStore();
  useEffect(() => {
    if (chains.length === 0) return;
    const fetchRatings = async () => {
      const ratings: Record<string, { average: number; count: number }> = {};
      // Fetch in parallel, limit to first 20
      const subset = chains.slice(0, 20);
      await Promise.all(
        subset.map(async (chain) => {
          const r = await getChainRating(chain._id);
          if (r) {
            ratings[chain._id] = { average: r.average, count: r.count };
          }
        })
      );
      setChainRatings(ratings);
    };
    fetchRatings();
  }, [chains, getChainRating]);

  const handleLoadByCode = async () => {
    if (!shareCode.trim()) return;
    const chain = await loadChain(shareCode.trim());
    if (chain) {
      setView('detail');
    }
  };

  const handleSelectChain = async (slug: string) => {
    await loadChain(slug);
    setView('detail');
  };

  if (view === 'detail' && currentChain) {
    return (
      <ChainDetailModal
        onClose={onClose}
        onLoad={onLoad}
        onBack={() => setView('browse')}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-plugin-surface rounded-propane-lg p-6 max-w-lg w-full mx-4 border border-plugin-accent max-h-[80vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-mono font-bold text-white">Load Chain</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&#x2715;</button>
        </div>

        {/* Share code input */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-2">Have a share code?</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={shareCode}
              onChange={(e) => setShareCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="flex-1 bg-black/30 border border-plugin-border rounded px-3 py-2 text-white font-mono text-center tracking-widest"
            />
            <button
              onClick={handleLoadByCode}
              disabled={shareCode.length < 6}
              className="bg-plugin-accent hover:bg-plugin-accent-bright disabled:bg-gray-600 text-white rounded px-4 py-2 font-mono"
            >
              Load
            </button>
          </div>
        </div>

        <div className="border-t border-plugin-border pt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium">Browse Public Chains</h3>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-black/30 border border-plugin-border rounded px-2 py-1 text-xs text-white"
              >
                <option value="popular">Popular</option>
                <option value="recent">Recent</option>
                <option value="downloads">Downloads</option>
                <option value="rating">Top Rated</option>
              </select>
              <select
                value={category || ''}
                onChange={(e) => setCategory(e.target.value || undefined)}
                className="bg-black/30 border border-plugin-border rounded px-2 py-1 text-xs text-white"
              >
                <option value="">All</option>
                <option value="vocal">Vocal</option>
                <option value="drums">Drums</option>
                <option value="bass">Bass</option>
                <option value="mixing">Mixing</option>
                <option value="mastering">Mastering</option>
                <option value="creative">Creative</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-400">Loading...</div>
          ) : chains.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No chains found</div>
          ) : (
            <div className="space-y-2">
              {chains.map((chain) => {
                const ratingData = chainRatings[chain._id];
                return (
                  <button
                    key={chain._id}
                    onClick={() => handleSelectChain(chain.slug)}
                    className="w-full text-left p-3 bg-black/30 hover:bg-black/50 rounded-lg transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-white font-medium text-sm">{chain.name}</div>
                      <div className="text-xxs text-gray-400">
                        {chain.pluginCount} plugins
                      </div>
                    </div>
                    {chain.author?.name && (
                      <div className="text-xs text-gray-400">by {chain.author.name}</div>
                    )}
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>Likes: {chain.likes}</span>
                        <span>DL: {chain.downloads}</span>
                      </div>
                      {ratingData && ratingData.count > 0 && (
                        <StarRating
                          rating={ratingData.average}
                          count={ratingData.count}
                          size="sm"
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
