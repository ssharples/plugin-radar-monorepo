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
import { useKeyboardStore, ShortcutPriority } from '../../stores/keyboardStore';
import { juceBridge } from '../../api/juce-bridge';
import { recordChainLoadResult } from '../../api/convex-client';
import { autoDiscoverAllPlugins } from '../../stores/chainStore';
import { CustomDropdown } from '../Dropdown';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'vocals', label: 'Vocals' },
  { value: 'drums', label: 'Drums' },
  { value: 'bass', label: 'Bass' },
  { value: 'keys-synths', label: 'Keys & Synths' },
  { value: 'guitar', label: 'Guitar' },
  { value: 'fx-creative', label: 'FX & Creative' },
  { value: 'mixing-mastering', label: 'Mixing & Mastering' },
];

const SORT_OPTIONS = [
  { value: 'popular', label: 'Popular' },
  { value: 'recent', label: 'Recent' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'rating', label: 'Top Rated' },
];

const PAGE_SIZE = 10;

const glassPanel: React.CSSProperties = {
  background: 'rgba(15, 15, 15, 0.95)',
  backdropFilter: 'blur(16px)',
  border: '1px solid var(--color-border-default)',
  boxShadow: 'var(--shadow-elevated)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-bg-input)',
  border: '1px solid var(--color-border-default)',
  borderRadius: 'var(--radius-base)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-primary)',
  padding: '6px 10px',
  paddingLeft: '28px',
  outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
};

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

  const { setChainName, setTargetInputPeakRange } = useChainStore();
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

  // Escape closes (modal priority)
  useEffect(() => {
    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    return registerShortcut({
      id: 'browse-modal-escape',
      key: 'Escape',
      priority: ShortcutPriority.MODAL,
      allowInInputs: true,
      handler: (e) => {
        e.preventDefault();
        if (previewChain) {
          setPreviewChain(null);
        } else {
          onClose();
        }
      }
    });
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
      downloadChain(chain._id);

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
            parameters: (!sub && slot.parameters) ? slot.parameters.map((p: any) => ({
              name: p.name || '',
              semantic: p.semantic || '',
              unit: p.unit || '',
              value: String(p.value ?? ''),
              normalizedValue: p.normalizedValue ?? 0,
            })) : [],
          };
        }),
      };

      const loadStart = performance.now();
      const result = await juceBridge.importChain(chainData);
      const loadTimeMs = Math.round(performance.now() - loadStart);

      // Report load result (best-effort)
      recordChainLoadResult({
        chainId: chain._id,
        totalSlots: (result as any).totalSlots ?? chain.slots.length,
        loadedSlots: (result as any).loadedSlots ?? chain.slots.length,
        failedSlots: (result as any).failedSlots ?? 0,
        substitutedSlots: substitutions.size,
        failures: (result as any).failures,
        loadTimeMs,
      });

      if (result.success) {
        setChainName(chain.name);
        // Set peak range (with fallback from legacy LUFS)
        if (chain.targetInputPeakMin != null && chain.targetInputPeakMax != null) {
          setTargetInputPeakRange(chain.targetInputPeakMin, chain.targetInputPeakMax);
        } else if (chain.targetInputLufs != null) {
          // Legacy fallback: LUFS → estimated peak range [lufs, lufs+6]
          setTargetInputPeakRange(chain.targetInputLufs, chain.targetInputLufs + 6);
        } else {
          setTargetInputPeakRange(null, null);
        }
        // Fire-and-forget: crowdpool parameter discovery for all plugins in chain
        if (result.chainState?.nodes) {
          autoDiscoverAllPlugins(result.chainState.nodes).catch(() => {});
        }
        onClose();
      }
    },
    [downloadChain, setChainName, setTargetInputPeakRange, onClose, substitutions]
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

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 fade-in"
      style={{ background: 'rgba(0, 0, 0, 0.75)' }}
      onClick={onClose}
    >
      <div
        className="rounded-md w-[640px] max-w-[95vw] max-h-[85vh] flex flex-col scale-in"
        style={glassPanel}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4" style={{ color: 'var(--color-accent-cyan)' }} />
            <span style={{
              fontSize: 'var(--text-base)',
              fontFamily: 'var(--font-extended)',
              fontWeight: 900,
              color: 'var(--color-text-primary)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wider)',
            }}>
              Community Chains
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded transition-all duration-150"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters bar */}
        <div className="flex items-center gap-2 px-5 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--color-text-tertiary)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search chains..."
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-cyan)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--color-accent-cyan)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Category */}
          <div style={{ width: '120px' }}>
            <CustomDropdown
              value={category}
              options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
              onChange={setCategory}
              size="sm"
            />
          </div>

          {/* Sort */}
          <div style={{ width: '120px' }}>
            <CustomDropdown
              value={sortBy}
              options={SORT_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
              onChange={(val) => setSortBy(val as any)}
              size="sm"
            />
          </div>
        </div>

        {/* Preview panel */}
        {previewChain ? (
          <div className="flex-1 overflow-y-auto p-5 scrollbar-cyber">
            <button
              onClick={() => setPreviewChain(null)}
              className="flex items-center gap-1 mb-3 transition-colors duration-150"
              style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}
            >
              <ChevronLeft className="w-3 h-3" /> Back
            </button>

            <h3 style={{
              fontSize: 'var(--text-2xl)',
              fontFamily: 'var(--font-extended)',
              fontWeight: 900,
              color: 'var(--color-text-primary)',
              marginBottom: '4px',
            }}>
              "{previewChain.name}"
            </h3>
            {previewChain.author?.name && (
              <p className="mb-2" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                by @{previewChain.author.name}
              </p>
            )}
            {previewChain.description && (
              <p className="mb-3" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {previewChain.description}
              </p>
            )}

            {/* Tags */}
            {previewChain.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {previewChain.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="badge badge-cyan"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Target Input Peak Range */}
            {(previewChain.targetInputPeakMin != null && previewChain.targetInputPeakMax != null) ? (
              <div className="flex items-center gap-2 mb-3">
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>Target:</span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {previewChain.targetInputPeakMin} to {previewChain.targetInputPeakMax} dBpk
                </span>
              </div>
            ) : previewChain.targetInputLufs != null ? (
              <div className="flex items-center gap-2 mb-3">
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>Target:</span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {previewChain.targetInputLufs} to {previewChain.targetInputLufs + 6} dBpk
                </span>
              </div>
            ) : null}

            {/* Compatibility */}
            {compatibility && (
              <div
                className="rounded-md p-3 mb-3"
                style={{
                  background: compatibility.canFullyLoad ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 170, 0, 0.08)',
                  border: `1px solid ${compatibility.canFullyLoad ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 170, 0, 0.2)'}`,
                }}
              >
                <div className="flex items-center justify-between mb-1.5" style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: compatibility.canFullyLoad ? 'var(--color-status-active)' : 'var(--color-status-warning)' }}>
                    {compatibility.canFullyLoad
                      ? 'All plugins available'
                      : `Missing ${compatibility.missingCount} plugins`}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {compatibility.percentage}%
                  </span>
                </div>
                <div className="w-full h-1 rounded-full" style={{ background: 'rgba(0,0,0,0.3)' }}>
                  <div
                    className="h-1 rounded-full transition-all duration-300"
                    style={{
                      width: `${compatibility.percentage}%`,
                      background: compatibility.canFullyLoad ? 'var(--color-status-active)' : 'var(--color-status-warning)',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Plugin slots */}
            <div className="mb-4">
              <h4 className="mb-2" style={{
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wider)',
              }}>
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
                      className="px-3 py-2 rounded"
                      style={{
                        fontSize: 'var(--text-sm)',
                        fontFamily: 'var(--font-mono)',
                        background: isMissing && !sub ? 'rgba(255, 0, 51, 0.05)' : sub ? 'rgba(0, 255, 136, 0.05)' : 'var(--color-bg-elevated)',
                        border: `1px solid ${isMissing && !sub ? 'rgba(255, 0, 51, 0.1)' : sub ? 'rgba(0, 255, 136, 0.1)' : 'var(--color-border-subtle)'}`,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span style={{ color: 'var(--color-text-primary)' }}>{slot.pluginName}</span>
                          <span className="ml-1.5" style={{ color: 'var(--color-text-tertiary)' }}>{slot.manufacturer}</span>
                        </div>
                        {sub ? (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-status-active)' }}>OK {sub.altName}</span>
                        ) : isMissing ? (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-status-error)' }}>Missing</span>
                        ) : (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-status-active)' }}>OK</span>
                        )}
                      </div>
                      {isMissing && !sub && missingSlot?.alternatives?.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {missingSlot.alternatives.map((alt, j) => (
                            <button
                              key={j}
                              onClick={() => handleSubstitute(slot.position ?? idx, slot.pluginName, alt)}
                              className="badge badge-cyan"
                              style={{ cursor: 'pointer' }}
                            >
                              Use {alt.name}
                            </button>
                          ))}
                        </div>
                      ) : sub ? (
                        <button
                          onClick={() => handleUndoSubstitute(slot.position ?? idx)}
                          className="mt-0.5 underline transition-colors duration-150"
                          style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}
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
            <div className="flex items-center gap-4 mb-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
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
                className="btn btn-primary flex-1"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  {substitutions.size > 0
                    ? `Load with ${substitutions.size} swap${substitutions.size > 1 ? 's' : ''}`
                    : 'Load Chain'}
                </span>
              </button>
              {isLoggedIn && (
                <button
                  onClick={() => {
                    setForkName(`${previewChain.name} (fork)`);
                    setShowForkInput(true);
                  }}
                  className="btn"
                >
                  <span className="flex items-center gap-1.5">
                    <GitFork className="w-3.5 h-3.5" />
                    Fork
                  </span>
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
                  style={{ ...inputStyle, paddingLeft: '10px', flex: 1 }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-cyan)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
                  autoFocus
                />
                <button
                  onClick={() => handleFork(previewChain)}
                  disabled={forking || !forkName.trim()}
                  className="btn btn-primary"
                  style={{ opacity: forking || !forkName.trim() ? 0.4 : 1 }}
                >
                  {forking ? '...' : 'Fork'}
                </button>
                <button
                  onClick={() => setShowForkInput(false)}
                  className="btn"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Chain list */
          <div className="flex-1 overflow-y-auto scrollbar-cyber">
            {loading ? (
              <div className="py-12 text-center" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                Loading...
              </div>
            ) : filteredChains.length === 0 ? (
              <div className="py-12 text-center">
                <Globe className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-text-tertiary)', opacity: 0.3 }} />
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>No chains found</p>
              </div>
            ) : (
              <div className="stagger-children">
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
                    isLoggedIn={isLoggedIn}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {!previewChain && filteredChains.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-2.5 flex-shrink-0" style={{ borderTop: '1px solid var(--color-border-default)' }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 transition-colors duration-150"
              style={{
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-mono)',
                color: page === 0 ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                cursor: page === 0 ? 'not-allowed' : 'pointer',
                background: 'none',
                border: 'none',
              }}
            >
              <ChevronLeft className="w-3 h-3" /> Prev
            </button>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 transition-colors duration-150"
              style={{
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-mono)',
                color: page >= totalPages - 1 ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                background: 'none',
                border: 'none',
              }}
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
  isLoggedIn,
}: {
  chain: any;
  onLoad: () => void;
  onPreview: () => void;
  onFork: () => void;
  isLoggedIn: boolean;
}) {
  const pluginPreview = chain.slots
    ?.slice(0, 4)
    .map((s: any) => s.pluginName)
    .join(' > ');
  const pluginCount = chain.slots?.length ?? chain.pluginCount;

  return (
    <div
      className="px-5 py-3 transition-all duration-150"
      style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(222, 255, 10, 0.03)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Title row */}
      <div className="flex items-start justify-between mb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span style={{
              fontSize: 'var(--text-base)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
            }} className="truncate">
              "{chain.name}"
            </span>
          </div>
          {chain.author?.name && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              by @{chain.author.name}
            </span>
          )}
        </div>
      </div>

      {/* Plugin preview */}
      <div className="mb-1.5 truncate" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
        {pluginPreview}
        {pluginCount > 4 ? ` ... (${pluginCount} plugins)` : ` (${pluginCount} plugins)`}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 mb-2">
        {(chain.targetInputPeakMin != null && chain.targetInputPeakMax != null) ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent-cyan)', fontFamily: 'var(--font-mono)' }}>
            {chain.targetInputPeakMin} to {chain.targetInputPeakMax} dBpk
          </span>
        ) : chain.targetInputLufs != null ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent-cyan)', fontFamily: 'var(--font-mono)' }}>
            {chain.targetInputLufs}→{chain.targetInputLufs + 6} dBpk
          </span>
        ) : null}
        <span className="flex items-center gap-0.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          <Download className="w-2.5 h-2.5" /> {chain.downloads}
        </span>
        <span className="flex items-center gap-0.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          <Heart className="w-2.5 h-2.5" /> {chain.likes}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <button onClick={onLoad} className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 'var(--text-xs)' }}>
          Load
        </button>
        <button onClick={onPreview} className="btn" style={{ padding: '4px 10px', fontSize: 'var(--text-xs)' }}>
          Preview
        </button>
        {isLoggedIn && (
          <button onClick={onFork} className="btn" style={{ padding: '4px 10px', fontSize: 'var(--text-xs)' }}>
            Fork
          </button>
        )}
      </div>
    </div>
  );
}
