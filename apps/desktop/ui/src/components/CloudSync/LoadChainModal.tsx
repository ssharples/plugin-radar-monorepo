import { useState, useEffect, useCallback } from 'react';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useKeyboardStore, ShortcutPriority } from '../../stores/keyboardStore';
import { ChainDetailModal } from './ChainDetailModal';
import { StarRating } from './StarRating';
import { CustomDropdown } from '../Dropdown';

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

  // Escape key to close (modal priority)
  useEffect(() => {
    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    return registerShortcut({
      id: 'load-chain-modal-escape',
      key: 'Escape',
      priority: ShortcutPriority.MODAL,
      allowInInputs: true,
      handler: (e) => {
        e.preventDefault();
        onClose();
      }
    });
  }, [onClose]);

  useEffect(() => {
    browseChains({ category, sortBy });
  }, [category, sortBy, browseChains]);

  // Fetch ratings for visible chains
  const { getChainRating } = useCloudChainStore();
  useEffect(() => {
    if (chains.length === 0) return;
    const fetchRatings = async () => {
      const ratings: Record<string, { average: number; count: number }> = {};
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
    <div
      className="fixed inset-0 flex items-center justify-center z-50 fade-in"
      style={{ background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="glass scale-in"
        style={{
          maxWidth: '32rem',
          width: '100%',
          margin: '0 1rem',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          border: '1px solid rgba(222, 255, 10, 0.15)',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-3xl)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wider)',
            }}
          >
            Load Chain
          </h2>
          <button
            onClick={onClose}
            style={{
              color: 'var(--color-text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
          >
            &#x2715;
          </button>
        </div>

        {/* Share code input */}
        <div className="mb-6">
          <label
            style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wide)',
              marginBottom: 'var(--space-2)',
            }}
          >
            Have a share code?
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={shareCode}
              onChange={(e) => setShareCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="input flex-1"
              style={{ textAlign: 'center', letterSpacing: 'var(--tracking-widest)' }}
            />
            <button
              onClick={handleLoadByCode}
              disabled={shareCode.length < 6}
              className="btn btn-primary"
            >
              Load
            </button>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border-default)', paddingTop: 'var(--space-4)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
              }}
            >
              Browse Public Chains
            </h3>
            <div className="flex gap-2">
              <div style={{ width: '110px' }}>
                <CustomDropdown
                  value={sortBy}
                  options={[
                    { value: 'popular', label: 'Popular' },
                    { value: 'recent', label: 'Recent' },
                    { value: 'downloads', label: 'Downloads' },
                    { value: 'rating', label: 'Top Rated' },
                  ]}
                  onChange={(val) => setSortBy(val as any)}
                  size="sm"
                />
              </div>
              <div style={{ width: '100px' }}>
                <CustomDropdown
                  value={category || ''}
                  options={[
                    { value: '', label: 'All' },
                    { value: 'vocals', label: 'Vocals' },
                    { value: 'drums', label: 'Drums' },
                    { value: 'bass', label: 'Bass' },
                    { value: 'keys-synths', label: 'Keys & Synths' },
                    { value: 'guitar', label: 'Guitar' },
                    { value: 'fx-creative', label: 'FX & Creative' },
                    { value: 'mixing-mastering', label: 'Mixing & Mastering' },
                  ]}
                  onChange={(val) => setCategory(val || undefined)}
                  size="sm"
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8) 0', color: 'var(--color-text-tertiary)' }}>
              Loading...
            </div>
          ) : chains.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8) 0', color: 'var(--color-text-tertiary)' }}>
              No chains found
            </div>
          ) : (
            <div className="space-y-2 stagger-children">
              {chains.map((chain) => {
                const ratingData = chainRatings[chain._id];
                return (
                  <button
                    key={chain._id}
                    onClick={() => handleSelectChain(chain.slug)}
                    className="w-full text-left fast-snap"
                    style={{
                      padding: 'var(--space-3)',
                      background: 'var(--color-bg-input)',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      transition: 'all var(--duration-fast) var(--ease-snap)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(222, 255, 10, 0.3)';
                      e.currentTarget.style.background = 'var(--color-bg-hover)';
                      e.currentTarget.style.boxShadow = '0 0 8px rgba(222, 255, 10, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
                      e.currentTarget.style.background = 'var(--color-bg-input)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}
                      >
                        {chain.name}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                        {chain.pluginCount} plugins
                      </div>
                    </div>
                    {chain.author?.name && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                        by {chain.author.name}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-3" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-disabled)' }}>
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
