import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Heart,
  GitFork,
  Bookmark,
  BookmarkCheck,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowLeftRight,
} from 'lucide-react';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useChainStore } from '../../stores/chainStore';
import { useSyncStore } from '../../stores/syncStore';
import { usePluginStore } from '../../stores/pluginStore';
import { getCategoryColor } from '../../constants/categoryColors';
import { loadChainWithSubstitutions, type SubstitutionEntry } from '../../utils/loadChainWithSubstitutions';
import { EditChainModal } from './EditChainModal';
import type { BrowseChainResult } from '../../api/types';
import { TopologyDiagram } from './TopologyDiagram';

interface ChainBrowserDetailProps {
  chain: BrowseChainResult;
  onBack: () => void;
  onClose: () => void;
  isInCollection: boolean;
  onToggleCollection: () => void;
  onAuthorClick?: (authorName: string) => void;
  onChainLoaded?: (chain: BrowseChainResult) => void;
}

interface AlternativeEntry {
  pluginId?: string;
  name: string;
  manufacturer: string;
  originalMatchedPluginId?: string;
  combinedScore?: number;
}

export function ChainBrowserDetail({
  chain,
  onBack,
  onClose,
  isInCollection,
  onToggleCollection,
  onAuthorClick,
  onChainLoaded,
}: ChainBrowserDetailProps) {
  const { compatibility, detailedCompatibility, substitutionPlan, downloadChain, forkChain, deleteChain } =
    useCloudChainStore();
  const { setChainName, setTargetInputPeakRange } = useChainStore();
  const { isLoggedIn, userId } = useSyncStore();
  const getEnrichedDataForPlugin = usePluginStore((s) => s.getEnrichedDataForPlugin);

  const [forkName, setForkName] = useState('');
  const [showForkInput, setShowForkInput] = useState(false);
  const [forking, setForking] = useState(false);
  const [expandedSlotIdx, setExpandedSlotIdx] = useState<number | null>(null);

  // Loading / error state
  const [loadingChain, setLoadingChain] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Owner actions
  const isOwner = isLoggedIn && userId && (chain as any).user === userId;
  const [showEditModal, setShowEditModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Substitution state
  const [substitutions, setSubstitutions] = useState<Map<number, SubstitutionEntry>>(new Map());
  const [altIndexBySlot, setAltIndexBySlot] = useState<Map<number, number>>(new Map());

  // Auto-populate substitutions from the substitution plan
  useEffect(() => {
    if (!substitutionPlan || !chain) return;

    const newSubs = new Map<number, SubstitutionEntry>();
    const newAltIdx = new Map<number, number>();

    for (const slot of substitutionPlan.slots) {
      if (
        slot.status === 'missing' &&
        slot.bestSubstitute &&
        slot.bestSubstitute.combinedScore >= 50
      ) {
        newSubs.set(slot.slotPosition, {
          originalName: slot.pluginName,
          altName: slot.bestSubstitute.pluginName,
          altManufacturer: slot.bestSubstitute.manufacturer,
          matchedPluginId: slot.bestSubstitute.pluginId,
          originalMatchedPluginId: slot.matchedPluginId,
        });
        const bestIdx = slot.alternates.findIndex(
          (a) => a.pluginId === slot.bestSubstitute!.pluginId
        );
        newAltIdx.set(slot.slotPosition, bestIdx >= 0 ? bestIdx : 0);
      }
    }

    if (newSubs.size > 0) {
      setSubstitutions(newSubs);
      setAltIndexBySlot(newAltIdx);
    }
  }, [substitutionPlan, chain]);

  // Build merged alternatives per slot
  const alternativesBySlot = useMemo(() => {
    const result = new Map<number, AlternativeEntry[]>();

    if (substitutionPlan) {
      for (const slot of substitutionPlan.slots) {
        if (slot.status === 'missing' && slot.alternates.length > 0) {
          result.set(
            slot.slotPosition,
            slot.alternates.map((a) => ({
              pluginId: a.pluginId,
              name: a.pluginName,
              manufacturer: a.manufacturer,
              originalMatchedPluginId: slot.matchedPluginId,
              combinedScore: a.combinedScore,
            }))
          );
        }
      }
    }

    if (detailedCompatibility?.slots) {
      for (const slot of detailedCompatibility.slots) {
        if (slot.status === 'missing' && slot.alternatives.length > 0 && !result.has(slot.position)) {
          result.set(
            slot.position,
            slot.alternatives.map((a) => ({
              pluginId: a.id,
              name: a.name,
              manufacturer: a.manufacturer,
            }))
          );
        }
      }
    }

    return result;
  }, [substitutionPlan, detailedCompatibility]);

  const handleCycleAlt = useCallback(
    (slotPosition: number, direction: 1 | -1) => {
      const alts = alternativesBySlot.get(slotPosition);
      if (!alts || alts.length === 0) return;

      const currentIdx = altIndexBySlot.get(slotPosition) ?? 0;
      const newIdx = (currentIdx + direction + alts.length) % alts.length;
      const alt = alts[newIdx];

      const slotData = chain.slots?.find((s) => (s.position ?? chain.slots.indexOf(s)) === slotPosition);
      const originalName = slotData?.pluginName ?? '';

      setAltIndexBySlot((prev) => new Map(prev).set(slotPosition, newIdx));
      setSubstitutions((prev) => {
        const next = new Map(prev);
        next.set(slotPosition, {
          originalName,
          altName: alt.name,
          altManufacturer: alt.manufacturer,
          matchedPluginId: alt.pluginId,
          originalMatchedPluginId: alt.originalMatchedPluginId,
        });
        return next;
      });
    },
    [alternativesBySlot, altIndexBySlot, chain]
  );

  const handleClearSubstitution = useCallback((slotPosition: number) => {
    setSubstitutions((prev) => {
      const next = new Map(prev);
      next.delete(slotPosition);
      return next;
    });
    setAltIndexBySlot((prev) => {
      const next = new Map(prev);
      next.delete(slotPosition);
      return next;
    });
  }, []);

  const handleLoadChain = useCallback(async () => {
    if (loadingChain) return;
    setLoadingChain(true);
    setLoadError(null);

    try {
      downloadChain(chain._id);

      if (!chain.slots || chain.slots.length === 0) {
        setLoadError('Chain has no plugin slots');
        setLoadingChain(false);
        return;
      }

      const result = await loadChainWithSubstitutions({
        chainId: chain._id,
        slots: chain.slots,
        substitutions,
      });

      if (result.success) {
        setChainName(chain.name);
        if (chain.targetInputPeakMin != null && chain.targetInputPeakMax != null) {
          setTargetInputPeakRange(chain.targetInputPeakMin, chain.targetInputPeakMax);
        } else if (chain.targetInputLufs != null) {
          setTargetInputPeakRange(chain.targetInputLufs, chain.targetInputLufs + 6);
        } else {
          setTargetInputPeakRange(null, null);
        }
        onChainLoaded?.(chain);
        onClose();
      } else {
        const failedCount = result.failedSlots ?? 0;
        const errorMsg = result.error
          || (failedCount > 0 ? `Failed to load ${failedCount} plugin${failedCount !== 1 ? 's' : ''}` : 'Failed to load chain');
        setLoadError(errorMsg);
        useChainStore.getState().showToast(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load chain';
      setLoadError(errorMsg);
      useChainStore.getState().showToast(errorMsg);
    } finally {
      setLoadingChain(false);
    }
  }, [chain, substitutions, loadingChain, downloadChain, setChainName, setTargetInputPeakRange, onClose, onChainLoaded]);

  const handleFork = useCallback(async () => {
    if (!forkName.trim()) return;
    setForking(true);
    await forkChain(chain._id, forkName.trim());
    setForking(false);
    setShowForkInput(false);
    setForkName('');
  }, [chain, forkChain, forkName]);

  const loadButtonText = compatibility?.canFullyLoad
    ? 'Load Chain'
    : substitutions.size > 0
      ? `Load \u00b7 ${substitutions.size} swap${substitutions.size > 1 ? 's' : ''}`
      : 'Load Chain';

  const slotCount = chain.slots?.length ?? 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Header hero ── */}
        <div style={{ padding: '16px 20px 12px' }}>
          {/* Back row */}
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 mb-3"
            style={{
              color: 'rgba(255,255,255,0.35)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontSize: 'var(--text-body)',
              fontFamily: 'var(--font-system)',
              fontWeight: 500,
              transition: 'color 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-cyan)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
          >
            <ChevronLeft style={{ width: 14, height: 14 }} />
            Back
          </button>

          {/* Chain name */}
          <h2 style={{
            fontSize: 'var(--text-title)',
            fontWeight: 800,
            color: '#fff',
            fontFamily: 'var(--font-system)',
            lineHeight: 1.15,
            marginBottom: '4px',
            letterSpacing: '-0.01em',
          }}>
            {chain.name}
          </h2>

          {/* Author */}
          {chain.author?.name && (
            <span
              onClick={() => onAuthorClick?.(chain.author!.name!)}
              style={{
                fontSize: 'var(--text-title)',
                color: 'var(--color-accent-cyan)',
                cursor: 'pointer',
                fontFamily: 'var(--font-system)',
                fontWeight: 500,
                transition: 'opacity 120ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              @{chain.author.name}
            </span>
          )}

          {/* Stats row — directly under author */}
          <div className="flex items-center gap-4 mt-2" style={{ fontSize: 'var(--text-body)', color: 'rgba(255,255,255,0.3)' }}>
            <span className="flex items-center gap-1.5">
              <Download style={{ width: 13, height: 13 }} /> {chain.downloads}
            </span>
            <span className="flex items-center gap-1.5">
              <Heart style={{ width: 13, height: 13 }} /> {chain.likes}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>
              {slotCount} plugin{slotCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ── Description ── */}
        {chain.description && (
          <div style={{ padding: '0 20px 12px' }}>
            <p style={{
              fontSize: 'var(--text-title)',
              color: 'rgba(255,255,255,0.45)',
              lineHeight: 1.6,
              fontFamily: 'var(--font-system)',
            }}>
              {chain.description}
            </p>
          </div>
        )}

        {/* ── Tags ── */}
        {chain.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5" style={{ padding: '0 20px 14px' }}>
            {chain.tags.map((tag: string) => (
              <span
                key={tag}
                style={{
                  fontSize: 'var(--text-body)',
                  color: 'var(--color-accent-cyan)',
                  background: 'rgba(222, 255, 10, 0.06)',
                  padding: '3px 8px',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  border: '1px solid rgba(222, 255, 10, 0.12)',
                  fontWeight: 600,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* ── Target Input Peak Range ── */}
        {(chain.targetInputPeakMin != null || chain.targetInputLufs != null) && (
          <div className="flex items-center gap-2" style={{ padding: '0 20px 14px' }}>
            <span style={{
              fontSize: 'var(--text-body)',
              color: 'rgba(255,255,255,0.3)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontFamily: 'var(--font-system)',
              fontWeight: 600,
            }}>
              Target
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: 'var(--color-accent-cyan)',
              fontSize: 'var(--text-body)',
            }}>
              {chain.targetInputPeakMin != null && chain.targetInputPeakMax != null
                ? `${chain.targetInputPeakMin} to ${chain.targetInputPeakMax} dBpk`
                : chain.targetInputLufs != null
                  ? `${chain.targetInputLufs} to ${chain.targetInputLufs + 6} dBpk`
                  : ''}
            </span>
          </div>
        )}

        {/* ── Compatibility bar ── */}
        {compatibility && (
          <div style={{ padding: '0 20px 14px' }}>
            <div
              style={{
                padding: '10px 14px',
                background: compatibility.canFullyLoad ? 'rgba(222, 255, 10, 0.03)' : 'rgba(255, 0, 51, 0.04)',
                borderLeft: `3px solid ${compatibility.canFullyLoad ? 'var(--color-accent-cyan)' : '#ff0033'}`,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5" style={{
                  fontSize: 'var(--text-body)',
                  color: compatibility.canFullyLoad ? 'var(--color-accent-cyan)' : '#ff0033',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 700,
                  fontFamily: 'var(--font-system)',
                }}>
                  {compatibility.canFullyLoad
                    ? <><CheckCircle2 style={{ width: 13, height: 13 }} /> All plugins available</>
                    : <><AlertTriangle style={{ width: 13, height: 13 }} /> Missing {compatibility.missingCount} plugin{compatibility.missingCount !== 1 ? 's' : ''}</>}
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  color: '#fff',
                  fontSize: 'var(--text-title)',
                }}>
                  {compatibility.percentage}%
                </span>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${compatibility.percentage}%`,
                  background: compatibility.canFullyLoad ? 'var(--color-accent-cyan)' : '#ff0033',
                  transition: 'width 300ms ease',
                  borderRadius: '2px',
                }} />
              </div>
            </div>
          </div>
        )}

        {/* ── Topology diagram (full) ── */}
        {chain.treeData && (
          <div style={{ padding: '0 20px 10px' }}>
            <TopologyDiagram treeData={chain.treeData} />
          </div>
        )}

        {/* ── Plugin slots ── */}
        <div style={{ padding: '0 20px 14px' }}>
          <h4 style={{
            fontSize: 'var(--text-body)',
            fontFamily: 'var(--font-system)',
            color: 'rgba(255,255,255,0.3)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 700,
            marginBottom: '8px',
          }}>
            Signal Chain
          </h4>
          <div className="flex flex-col" style={{ gap: '2px' }}>
            {chain.slots?.map((slot, idx: number) => {
              const slotPosition = slot.position ?? idx;
              const isMissing = detailedCompatibility?.missing?.some(
                (m) => m.pluginName.toLowerCase() === slot.pluginName.toLowerCase()
              );
              const paramCount = slot.parameters?.length ?? 0;
              const isExpanded = expandedSlotIdx === idx;
              const sub = substitutions.get(slotPosition);
              const alts = alternativesBySlot.get(slotPosition);
              const altIdx = altIndexBySlot.get(slotPosition) ?? 0;
              const hasAlts = alts && alts.length > 0;

              return (
                <div key={idx}>
                  <div
                    className="flex items-center justify-between"
                    style={{
                      padding: '7px 12px',
                      fontSize: 'var(--text-title)',
                      background: sub
                        ? 'rgba(0, 255, 136, 0.04)'
                        : isMissing
                          ? 'rgba(255, 0, 51, 0.04)'
                          : isExpanded
                            ? 'rgba(222, 255, 10, 0.04)'
                            : 'rgba(255,255,255,0.02)',
                      borderLeft: sub
                        ? '3px solid rgba(0, 255, 136, 0.5)'
                        : isMissing
                          ? '3px solid rgba(255, 0, 51, 0.5)'
                          : isExpanded
                            ? '3px solid rgba(222,255,10,0.3)'
                            : '3px solid transparent',
                      cursor: paramCount > 0 && !sub ? 'pointer' : 'default',
                      transition: 'background 100ms',
                    }}
                    onClick={() => {
                      if (paramCount > 0 && !sub) {
                        setExpandedSlotIdx(isExpanded ? null : idx);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {(() => {
                        const enriched = slot.uid ? getEnrichedDataForPlugin(slot.uid) : null;
                        const catColor = enriched?.category ? getCategoryColor(enriched.category) : null;
                        return catColor ? (
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: catColor, flexShrink: 0 }} />
                        ) : null;
                      })()}
                      <span style={{
                        color: 'rgba(255,255,255,0.15)',
                        width: '18px',
                        textAlign: 'right',
                        flexShrink: 0,
                        fontSize: 'var(--text-body)',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                      }}>
                        {slotPosition + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate" style={{
                            color: sub ? '#00ff88' : isMissing ? 'rgba(255,255,255,0.4)' : 'var(--color-text-primary)',
                            fontFamily: 'var(--font-system)',
                            fontWeight: 600,
                            fontSize: 'var(--text-title)',
                          }}>
                            {sub ? sub.altName : slot.pluginName}
                          </span>
                          <span className="truncate" style={{
                            color: 'rgba(255,255,255,0.2)',
                            fontSize: 'var(--text-body)',
                            fontFamily: 'var(--font-system)',
                          }}>
                            {sub ? sub.altManufacturer : slot.manufacturer}
                          </span>
                        </div>
                        {sub && (
                          <div className="flex items-center gap-1" style={{ fontSize: 'var(--text-body)', color: 'rgba(255,255,255,0.2)', marginTop: '2px' }}>
                            <ArrowLeftRight style={{ width: 10, height: 10 }} />
                            replaces {sub.originalName}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      {isMissing && hasAlts && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleCycleAlt(slotPosition, -1)}
                            style={{
                              width: 20,
                              height: 20,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: 'rgba(255,255,255,0.4)',
                              cursor: 'pointer',
                              fontSize: 'var(--text-body)',
                              padding: 0,
                            }}
                          >
                            &#9664;
                          </button>
                          <span style={{
                            fontSize: 'var(--text-body)',
                            color: 'rgba(255,255,255,0.3)',
                            fontFamily: 'var(--font-mono)',
                            minWidth: '28px',
                            textAlign: 'center',
                            fontWeight: 600,
                          }}>
                            {sub ? altIdx + 1 : 0}/{alts!.length}
                          </span>
                          <button
                            onClick={() => handleCycleAlt(slotPosition, 1)}
                            style={{
                              width: 20,
                              height: 20,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: 'rgba(255,255,255,0.4)',
                              cursor: 'pointer',
                              fontSize: 'var(--text-body)',
                              padding: 0,
                            }}
                          >
                            &#9654;
                          </button>
                        </div>
                      )}
                      {paramCount > 0 && !sub && (
                        <span className="flex items-center gap-0.5" style={{ fontSize: 'var(--text-body)', color: 'rgba(222,255,10,0.5)', fontWeight: 600 }}>
                          {paramCount}p {isExpanded ? <ChevronDown style={{ width: 12, height: 12 }} /> : <ChevronRight style={{ width: 12, height: 12 }} />}
                        </span>
                      )}
                      {sub ? (
                        <span className="flex items-center gap-1">
                          <span style={{
                            color: '#00ff88',
                            fontSize: 'var(--text-body)',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            fontFamily: 'var(--font-system)',
                          }}>Swap</span>
                          <button
                            onClick={() => handleClearSubstitution(slotPosition)}
                            style={{
                              width: 18,
                              height: 18,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'none',
                              border: 'none',
                              color: 'rgba(255,255,255,0.25)',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            <X style={{ width: 12, height: 12 }} />
                          </button>
                        </span>
                      ) : isMissing ? (
                        <span style={{
                          color: '#ff0033',
                          fontSize: 'var(--text-body)',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          fontFamily: 'var(--font-system)',
                        }}>Missing</span>
                      ) : (
                        <span style={{
                          color: 'var(--color-status-active)',
                          fontSize: 'var(--text-body)',
                          fontWeight: 700,
                          fontFamily: 'var(--font-system)',
                        }}>OK</span>
                      )}
                    </div>
                  </div>

                  {isExpanded && !sub && slot.parameters && (
                    <div style={{ marginLeft: '33px', marginTop: '1px', marginBottom: '4px' }}>
                      {slot.parameters.map((param, pIdx) => (
                        <div
                          key={pIdx}
                          className="flex items-center justify-between"
                          style={{
                            padding: '3px 10px',
                            background: 'rgba(222, 255, 10, 0.02)',
                            fontSize: 'var(--text-body)',
                            fontFamily: 'var(--font-system)',
                          }}
                        >
                          <span style={{ color: 'rgba(255,255,255,0.3)' }}>{param.name}</span>
                          <span style={{ color: 'rgba(222,255,10,0.7)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                            {param.value}{param.unit ? ` ${param.unit}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Owner actions ── */}
        {isOwner && (
          <div className="flex items-center gap-2" style={{ padding: '0 20px 14px' }}>
            <button
              onClick={() => setShowEditModal(true)}
              style={{
                fontSize: 'var(--text-body)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '6px 12px',
                color: 'var(--color-accent-cyan)',
                background: 'rgba(222,255,10,0.06)',
                border: '1px solid rgba(222,255,10,0.15)',
                cursor: 'pointer',
                fontFamily: 'var(--font-system)',
              }}
            >
              Edit Details
            </button>
            <button
              onClick={async () => {
                if (!confirmDelete) { setConfirmDelete(true); return; }
                setDeleting(true);
                const success = await deleteChain(chain._id);
                setDeleting(false);
                if (success) {
                  useChainStore.getState().showToast('Chain deleted');
                  onBack();
                } else {
                  useChainStore.getState().showToast('Failed to delete chain');
                }
                setConfirmDelete(false);
              }}
              disabled={deleting}
              style={{
                fontSize: 'var(--text-body)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '6px 12px',
                color: confirmDelete ? '#fff' : 'rgba(255,255,255,0.35)',
                background: confirmDelete ? 'rgba(255, 0, 51, 0.2)' : 'rgba(255,255,255,0.03)',
                border: confirmDelete ? '1px solid rgba(255, 0, 51, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                cursor: deleting ? 'wait' : 'pointer',
                fontFamily: 'var(--font-system)',
              }}
            >
              {deleting ? '...' : confirmDelete ? 'Confirm Delete' : 'Delete'}
            </button>
          </div>
        )}

        {/* ── Fork input ── */}
        {showForkInput && (
          <div className="flex gap-2" style={{ padding: '0 20px 14px' }}>
            <input
              type="text"
              value={forkName}
              onChange={(e) => setForkName(e.target.value)}
              placeholder="Fork name..."
              className="input flex-1"
              style={{ fontSize: 'var(--text-body)', padding: '6px 10px', fontFamily: 'var(--font-system)' }}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleFork(); if (e.key === 'Escape') setShowForkInput(false); }}
            />
            <button
              onClick={handleFork}
              disabled={forking || !forkName.trim()}
              style={{
                fontSize: 'var(--text-body)',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '6px 14px',
                background: 'var(--color-accent-cyan)',
                color: '#000',
                border: 'none',
                cursor: forking || !forkName.trim() ? 'not-allowed' : 'pointer',
                opacity: forking || !forkName.trim() ? 0.4 : 1,
                fontFamily: 'var(--font-system)',
              }}
            >
              {forking ? '...' : 'Fork'}
            </button>
            <button
              onClick={() => setShowForkInput(false)}
              style={{
                padding: '6px 10px',
                fontSize: 'var(--text-body)',
                color: 'rgba(255,255,255,0.35)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-system)',
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ── Error bar ── */}
      {loadError && (
        <div
          className="flex-shrink-0"
          style={{
            padding: '8px 20px',
            background: 'rgba(255, 0, 51, 0.06)',
            borderTop: '1px solid rgba(255, 0, 51, 0.15)',
            fontSize: 'var(--text-body)',
            color: '#ff0033',
            fontFamily: 'var(--font-system)',
            fontWeight: 500,
          }}
        >
          {loadError}
        </div>
      )}

      {/* ── Action bar ── */}
      <div
        className="flex-shrink-0 flex items-center gap-2"
        style={{
          padding: '12px 20px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: '#0a0a0a',
        }}
      >
        <button
          onClick={handleLoadChain}
          disabled={loadingChain}
          className="flex-1 flex items-center justify-center gap-2"
          style={{
            fontSize: 'var(--text-title)',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: '#000',
            background: 'var(--color-accent-cyan)',
            border: 'none',
            padding: '10px 16px',
            cursor: loadingChain ? 'wait' : 'pointer',
            letterSpacing: '0.06em',
            transition: 'opacity 100ms',
            opacity: loadingChain ? 0.6 : 1,
            fontFamily: 'var(--font-system)',
          }}
          onMouseEnter={(e) => { if (!loadingChain) e.currentTarget.style.opacity = '0.9'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = loadingChain ? '0.6' : '1'; }}
        >
          {loadingChain ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Download style={{ width: 14, height: 14 }} />}
          {loadingChain ? 'Loading...' : loadButtonText}
        </button>
        <button
          onClick={onToggleCollection}
          className="flex items-center gap-1.5"
          style={{
            fontSize: 'var(--text-body)',
            textTransform: 'uppercase',
            fontWeight: 700,
            padding: '10px 14px',
            background: isInCollection ? 'rgba(222, 255, 10, 0.08)' : 'rgba(255,255,255,0.03)',
            color: isInCollection ? 'var(--color-accent-cyan)' : 'rgba(255,255,255,0.4)',
            border: `1px solid ${isInCollection ? 'rgba(222,255,10,0.3)' : 'rgba(255,255,255,0.06)'}`,
            cursor: 'pointer',
            transition: 'all 150ms',
            letterSpacing: '0.06em',
            fontFamily: 'var(--font-system)',
          }}
          onMouseEnter={(e) => {
            if (!isInCollection) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#fff'; }
          }}
          onMouseLeave={(e) => {
            if (!isInCollection) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }
          }}
        >
          {isInCollection ? <BookmarkCheck style={{ width: 14, height: 14 }} /> : <Bookmark style={{ width: 14, height: 14 }} />}
          {isInCollection ? 'Saved' : 'Save'}
        </button>
        {isLoggedIn && !showForkInput && (
          <button
            onClick={() => {
              setForkName(`${chain.name} (fork)`);
              setShowForkInput(true);
            }}
            className="flex items-center gap-1.5"
            style={{
              fontSize: 'var(--text-body)',
              textTransform: 'uppercase',
              fontWeight: 700,
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.03)',
              color: 'rgba(255,255,255,0.4)',
              border: '1px solid rgba(255,255,255,0.06)',
              cursor: 'pointer',
              transition: 'all 150ms',
              letterSpacing: '0.06em',
              fontFamily: 'var(--font-system)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
          >
            <GitFork style={{ width: 14, height: 14 }} />
            Fork
          </button>
        )}
      </div>

      {showEditModal && (
        <EditChainModal
          chain={chain}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
}
