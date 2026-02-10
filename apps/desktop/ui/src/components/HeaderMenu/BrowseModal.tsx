import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Globe,
  Search,
  X,
  Download,
  Heart,
  GitFork,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useChainStore } from '../../stores/chainStore';
import { useSyncStore } from '../../stores/syncStore';
import { juceBridge } from '../../api/juce-bridge';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'vocal', label: '🎤 Vocal' },
  { value: 'drums', label: '🥁 Drums' },
  { value: 'bass', label: '🎸 Bass' },
  { value: 'guitar', label: '🎸 Guitar' },
  { value: 'keys', label: '🎹 Keys' },
  { value: 'mixing', label: '🎚️ Mixing' },
  { value: 'mastering', label: '🏆 Mastering' },
  { value: 'creative', label: '✨ Creative' },
  { value: 'live', label: '🎤 Live' },
];

const SORT_OPTIONS = [
  { value: 'popular', label: 'Popular' },
  { value: 'recent', label: 'Recent' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'rating', label: 'Top Rated' },
];

const PAGE_SIZE = 10;

interface BrowseModalProps {
  onClose: () => void;
}

export function BrowseModal({ onClose }: BrowseModalProps) {
  const {
    chains,
    compatibility,
    detailedCompatibility,
    loading,
    browseChains,
    loadChain,
    checkCompatibility,
    fetchDetailedCompatibility,
    downloadChain,
    forkChain,
  } = useCloudChainStore();

  const { setChainName, setTargetInputLufs } = useChainStore();
  const { isLoggedIn } = useSyncStore();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState<'popular' | 'recent' | 'downloads' | 'rating'>('popular');
  const [page, setPage] = useState(0);
  const [previewChain, setPreviewChain] = useState<any | null>(null);
  const [forkName, setForkName] = useState('');
  const [showForkInput, setShowForkInput] = useState(false);
  const [forking, setForking] = useState(false);
  const [substitutions, setSubstitutions] = useState<Map<number, {
    originalName: string;
    altName: string;
    altManufacturer: string;
  }>>(new Map());

  // Fetch chains on filter change
  useEffect(() => {
    browseChains({
      category: category || undefined,
      sortBy,
    });
    setPage(0);
  }, [category, sortBy, browseChains]);

  // Escape closes
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewChain) {
          setPreviewChain(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, previewChain]);

  // Filter by search
  const filteredChains = useMemo(() => {
    if (!search.trim()) return chains;
    const q = search.toLowerCase();
    return chains.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.author?.name?.toLowerCase().includes(q) ||
        c.tags?.some((t: string) => t.toLowerCase().includes(q))
    );
  }, [chains, search]);

  const totalPages = Math.max(1, Math.ceil(filteredChains.length / PAGE_SIZE));
  const pageChains = filteredChains.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSubstitute = useCallback((position: number, originalName: string, alt: { name: string; manufacturer: string }) => {
    setSubstitutions((prev) => {
      const next = new Map(prev);
      next.set(position, { originalName, altName: alt.name, altManufacturer: alt.manufacturer });
      return next;
    });
  }, []);

  const handleUndoSubstitute = useCallback((position: number) => {
    setSubstitutions((prev) => {
      const next = new Map(prev);
      next.delete(position);
      return next;
    });
  }, []);

  const handleLoadChain = useCallback(
    async (chain: any) => {
      // Record download
      downloadChain(chain._id);

      // Build import data — apply substitutions
      const chainData = {
        version: 1,
        numSlots: chain.slots.length,
        slots: chain.slots.map((slot: any, idx: number) => {
          const sub = substitutions.get(slot.position ?? idx);
          return {
            type: 'plugin',
            id: idx + 1,
            index: slot.position ?? idx,
            name: sub ? sub.altName : slot.pluginName,
            manufacturer: sub ? sub.altManufacturer : slot.manufacturer,
            format: slot.format || 'VST3',
            uid: sub ? 0 : (slot.uid || 0),
            fileOrIdentifier: sub ? '' : (slot.fileOrIdentifier || ''),
            version: slot.version || '',
            bypassed: slot.bypassed ?? false,
            presetData: sub ? '' : (slot.presetData || ''),
            presetSizeBytes: sub ? 0 : (slot.presetSizeBytes || 0),
          };
        }),
      };

      const result = await juceBridge.importChain(chainData);
      if (result.success) {
        setChainName(chain.name);
        setTargetInputLufs(chain.targetInputLufs ?? null);
        onClose();
      }
    },
    [downloadChain, setChainName, setTargetInputLufs, onClose, substitutions]
  );

  const handlePreview = useCallback(
    async (chain: any) => {
      setSubstitutions(new Map());
      const full = await loadChain(chain.slug);
      if (full) {
        setPreviewChain(full);
        if (isLoggedIn) {
          checkCompatibility(full._id);
          fetchDetailedCompatibility(full._id);
        }
      }
    },
    [loadChain, checkCompatibility, fetchDetailedCompatibility, isLoggedIn]
  );

  const handleFork = useCallback(
    async (chain: any) => {
      if (!forkName.trim()) return;
      setForking(true);
      const result = await forkChain(chain._id, forkName.trim());
      setForking(false);
      if (result) {
        setShowForkInput(false);
        setForkName('');
      }
    },
    [forkChain, forkName]
  );

  const getCategoryIcon = (cat: string) => {
    const icons: Record<string, string> = {
      vocal: '🎤',
      drums: '🥁',
      bass: '🎸',
      guitar: '🎸',
      keys: '🎹',
      mixing: '🎚️',
      mastering: '🏆',
      creative: '✨',
      live: '🎤',
    };
    return icons[cat] || '🔗';
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-plugin-surface rounded-propane-lg w-[640px] max-w-[95vw] max-h-[85vh] flex flex-col border border-plugin-border shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-plugin-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-plugin-accent" />
            <span className="text-sm font-mono uppercase font-bold text-plugin-text">Community Chains</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-plugin-dim hover:text-plugin-text rounded hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters bar */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-plugin-border flex-shrink-0">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-plugin-dim" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search chains..."
              className="w-full bg-black/40 border border-plugin-border rounded-propane font-mono pl-7 pr-2.5 py-1.5 text-xs text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:ring-1 focus:ring-plugin-accent"
            />
          </div>

          {/* Category */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-black/40 border border-plugin-border rounded-propane font-mono px-2.5 py-1.5 text-xs text-plugin-text focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-black/40 border border-plugin-border rounded-propane font-mono px-2.5 py-1.5 text-xs text-plugin-text focus:outline-none"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Preview panel */}
        {previewChain ? (
          <div className="flex-1 overflow-y-auto p-5">
            <button
              onClick={() => setPreviewChain(null)}
              className="flex items-center gap-1 text-xs text-plugin-muted hover:text-plugin-text mb-3"
            >
              <ChevronLeft className="w-3 h-3" /> Back to Browse
            </button>

            <h3 className="text-lg font-bold text-plugin-text mb-1">
              {getCategoryIcon(previewChain.category)} "{previewChain.name}"
            </h3>
            {previewChain.author?.name && (
              <p className="text-xs text-plugin-muted mb-2">
                by @{previewChain.author.name}
              </p>
            )}
            {previewChain.description && (
              <p className="text-xs text-plugin-muted mb-3">{previewChain.description}</p>
            )}

            {/* Tags */}
            {previewChain.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {previewChain.tags.map((tag: string) => (
                  <span key={tag} className="px-1.5 py-0.5 bg-plugin-accent/15 text-plugin-accent rounded text-[10px]">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Target LUFS */}
            {previewChain.targetInputLufs != null && (
              <div className="flex items-center gap-2 mb-3 text-xs">
                <span className="text-plugin-muted">🎚️ Target:</span>
                <span className="font-mono font-medium text-plugin-accent">
                  {previewChain.targetInputLufs} LUFS
                </span>
              </div>
            )}

            {/* Compatibility */}
            {compatibility && (
              <div
                className={`rounded-lg p-3 mb-3 ${
                  compatibility.canFullyLoad
                    ? 'bg-green-500/10 border border-green-500/20'
                    : 'bg-yellow-500/10 border border-yellow-500/20'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className={compatibility.canFullyLoad ? 'text-green-400' : 'text-yellow-400'}>
                    {compatibility.canFullyLoad
                      ? '✅ All plugins available'
                      : `⚠️ Missing ${compatibility.missingCount} plugins`}
                  </span>
                  <span className="font-mono font-bold text-plugin-text">
                    {compatibility.percentage}%
                  </span>
                </div>
                <div className="w-full bg-black/30 rounded-full h-1">
                  <div
                    className={`h-1 rounded-full ${
                      compatibility.canFullyLoad ? 'bg-green-500' : 'bg-yellow-500'
                    }`}
                    style={{ width: `${compatibility.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Plugin slots */}
            <div className="mb-4">
              <h4 className="text-[10px] font-mono text-plugin-dim uppercase tracking-wider mb-2">
                Plugins ({previewChain.slots?.length ?? 0})
              </h4>
              <div className="space-y-1">
                {previewChain.slots?.map((slot: any, idx: number) => {
                  const isMissing = detailedCompatibility?.missing?.some(
                    (m) =>
                      m.pluginName.toLowerCase() === slot.pluginName.toLowerCase()
                  );
                  const missingSlot = isMissing
                    ? detailedCompatibility?.slots?.find(
                        (s) => s.pluginName.toLowerCase() === slot.pluginName.toLowerCase() && s.status === 'missing'
                      )
                    : undefined;
                  const sub = substitutions.get(slot.position ?? idx);
                  return (
                    <div
                      key={idx}
                      className={`px-3 py-2 rounded text-xs ${
                        isMissing && !sub ? 'bg-red-500/5 border border-red-500/10' : sub ? 'bg-green-500/5 border border-green-500/10' : 'bg-white/3'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-plugin-text">{slot.pluginName}</span>
                          <span className="text-plugin-dim ml-1.5">{slot.manufacturer}</span>
                        </div>
                        {sub ? (
                          <span className="text-green-400 text-[10px]">✓ {sub.altName}</span>
                        ) : isMissing ? (
                          <span className="text-red-400 text-[10px]">Missing</span>
                        ) : (
                          <span className="text-green-400 text-[10px]">✓</span>
                        )}
                      </div>
                      {isMissing && !sub && missingSlot?.alternatives?.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {missingSlot.alternatives.map((alt, j) => (
                            <button
                              key={j}
                              onClick={() => handleSubstitute(slot.position ?? idx, slot.pluginName, alt)}
                              className="px-1.5 py-0.5 bg-plugin-accent/20 text-plugin-accent
                                         hover:bg-plugin-accent/30 rounded text-[10px] transition-colors"
                            >
                              Use {alt.name}
                            </button>
                          ))}
                        </div>
                      ) : sub ? (
                        <button
                          onClick={() => handleUndoSubstitute(slot.position ?? idx)}
                          className="mt-0.5 text-plugin-muted hover:text-white text-[10px] underline"
                        >
                          undo
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-xs text-plugin-muted mb-4">
              <span className="flex items-center gap-1">
                <Download className="w-3 h-3" /> {previewChain.downloads}
              </span>
              <span className="flex items-center gap-1">
                <Heart className="w-3 h-3" /> {previewChain.likes}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => handleLoadChain(previewChain)}
                className="flex-1 flex items-center justify-center gap-1.5 bg-plugin-accent hover:bg-plugin-accent-dim text-black rounded-lg px-4 py-2 text-xs font-mono uppercase font-bold transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {substitutions.size > 0
                  ? `Load with ${substitutions.size} swap${substitutions.size > 1 ? 's' : ''}`
                  : 'Load Chain'}
              </button>
              {isLoggedIn && (
                <button
                  onClick={() => {
                    setForkName(`${previewChain.name} (fork)`);
                    setShowForkInput(true);
                  }}
                  className="flex items-center gap-1.5 border border-plugin-border hover:border-plugin-accent/40 text-plugin-muted hover:text-plugin-text rounded-lg px-4 py-2 text-xs font-mono uppercase transition-colors"
                >
                  <GitFork className="w-3.5 h-3.5" />
                  Fork
                </button>
              )}
            </div>

            {/* Fork input */}
            {showForkInput && (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={forkName}
                  onChange={(e) => setForkName(e.target.value)}
                  placeholder="Fork name..."
                  className="flex-1 bg-black/40 border border-plugin-border rounded font-mono px-2.5 py-1.5 text-xs text-plugin-text focus:outline-none focus:ring-1 focus:ring-plugin-accent"
                  autoFocus
                />
                <button
                  onClick={() => handleFork(previewChain)}
                  disabled={forking || !forkName.trim()}
                  className="px-3 py-1.5 bg-plugin-accent hover:bg-plugin-accent-dim text-black rounded text-xs font-mono uppercase font-bold disabled:opacity-40"
                >
                  {forking ? '...' : 'Fork'}
                </button>
                <button
                  onClick={() => setShowForkInput(false)}
                  className="px-2 text-xs text-plugin-dim hover:text-plugin-text"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Chain list */
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-12 text-center text-xs text-plugin-muted">Loading...</div>
            ) : filteredChains.length === 0 ? (
              <div className="py-12 text-center text-xs text-plugin-muted">
                <Globe className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No chains found
              </div>
            ) : (
              <div className="divide-y divide-plugin-border/50">
                {pageChains.map((chain) => (
                  <ChainCard
                    key={chain._id}
                    chain={chain}
                    onLoad={() => handleLoadChain(chain)}
                    onPreview={() => handlePreview(chain)}
                    onFork={() => {
                      setPreviewChain(chain);
                      setForkName(`${chain.name} (fork)`);
                      setShowForkInput(true);
                    }}
                    getCategoryIcon={getCategoryIcon}
                    isLoggedIn={isLoggedIn}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {!previewChain && filteredChains.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-2.5 border-t border-plugin-border flex-shrink-0">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 text-xs text-plugin-muted hover:text-plugin-text disabled:text-plugin-dim disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3 h-3" /> Prev
            </button>
            <span className="text-[10px] text-plugin-dim">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 text-xs text-plugin-muted hover:text-plugin-text disabled:text-plugin-dim disabled:cursor-not-allowed"
            >
              Next <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Individual chain card in the browse list */
function ChainCard({
  chain,
  onLoad,
  onPreview,
  onFork,
  getCategoryIcon,
  isLoggedIn,
}: {
  chain: any;
  onLoad: () => void;
  onPreview: () => void;
  onFork: () => void;
  getCategoryIcon: (cat: string) => string;
  isLoggedIn: boolean;
}) {
  const pluginPreview = chain.slots
    ?.slice(0, 4)
    .map((s: any) => s.pluginName)
    .join(' → ');
  const pluginCount = chain.slots?.length ?? chain.pluginCount;

  return (
    <div className="px-5 py-3 hover:bg-white/2 transition-colors">
      {/* Title row */}
      <div className="flex items-start justify-between mb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{getCategoryIcon(chain.category)}</span>
            <span className="text-sm font-medium text-plugin-text truncate">
              "{chain.name}"
            </span>
          </div>
          {chain.author?.name && (
            <span className="text-[10px] text-plugin-dim ml-6">
              by @{chain.author.name}
            </span>
          )}
        </div>
      </div>

      {/* Plugin preview */}
      <div className="text-[11px] text-plugin-muted mb-1.5 ml-6 truncate">
        {pluginPreview}
        {pluginCount > 4 ? ` ... (${pluginCount} plugins)` : ` (${pluginCount} plugins)`}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 ml-6 mb-2">
        {chain.targetInputLufs != null && (
          <span className="text-[10px] text-plugin-accent font-mono">
            🎚️ {chain.targetInputLufs} LUFS
          </span>
        )}
        <span className="flex items-center gap-0.5 text-[10px] text-plugin-dim">
          <Download className="w-2.5 h-2.5" /> {chain.downloads}
        </span>
        <span className="flex items-center gap-0.5 text-[10px] text-plugin-dim">
          <Heart className="w-2.5 h-2.5" /> {chain.likes}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 ml-6">
        <button
          onClick={onLoad}
          className="px-2.5 py-1 bg-plugin-accent hover:bg-plugin-accent-dim text-black rounded text-[10px] font-mono uppercase font-bold transition-colors"
        >
          Load
        </button>
        <button
          onClick={onPreview}
          className="px-2.5 py-1 border border-plugin-border hover:border-plugin-accent/30 text-plugin-muted hover:text-plugin-text rounded text-[10px] font-mono uppercase transition-colors"
        >
          Preview
        </button>
        {isLoggedIn && (
          <button
            onClick={onFork}
            className="px-2.5 py-1 border border-plugin-border hover:border-plugin-accent/30 text-plugin-muted hover:text-plugin-text rounded text-[10px] font-mono uppercase transition-colors"
          >
            Fork
          </button>
        )}
      </div>
    </div>
  );
}
