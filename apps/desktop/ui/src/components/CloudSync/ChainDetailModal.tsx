import { useState, useEffect, useCallback } from 'react';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useSyncStore } from '../../stores/syncStore';
import { useKeyboardStore, ShortcutPriority } from '../../stores/keyboardStore';
import { translateParameters, recordChainLoadResult } from '../../api/convex-client';
import { juceBridge } from '../../api/juce-bridge';
import type { ChainImportResult } from '../../api/types';
import { autoDiscoverAllPlugins } from '../../stores/chainStore';
import { StarRating } from './StarRating';
import { CommentSection } from './CommentSection';
import type { Comment } from './CommentSection';

interface ChainDetailModalProps {
  onClose: () => void;
  onLoad: (chainData: unknown) => void;
  onBack: () => void;
}

const modalOverlayStyle: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(4px)',
};

const modalPanelStyle: React.CSSProperties = {
  maxWidth: '32rem',
  width: '100%',
  margin: '0 1rem',
  borderRadius: 'var(--radius-xl)',
  padding: 'var(--space-6)',
  border: '1px solid rgba(222, 255, 10, 0.15)',
  maxHeight: '85vh',
  overflowY: 'auto',
};

export function ChainDetailModal({ onClose, onLoad, onBack }: ChainDetailModalProps) {
  const {
    currentChain,
    compatibility,
    detailedCompatibility,
    substitutionPlan,
    toggleLike,
    downloadChain,
    fetchDetailedCompatibility,
    fetchSubstitutionPlan,
    getChainRating,
    getComments,
    addComment,
    deleteComment,
    rateChain,
    forkChain,
    isFollowingAuthor,
    followAuthor,
    unfollowAuthor,
  } = useCloudChainStore();

  const { isLoggedIn, userId } = useSyncStore();

  const [rating, setRating] = useState<{ average: number; count: number; userRating: number | null }>({
    average: 0,
    count: 0,
    userRating: null,
  });
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [following, setFollowing] = useState(false);
  const [showForkDialog, setShowForkDialog] = useState(false);
  const [forkName, setForkName] = useState('');
  const [forking, setForking] = useState(false);
  const [substitutions, setSubstitutions] = useState<Map<number, {
    originalName: string;
    altName: string;
    altManufacturer: string;
  }>>(new Map());

  const chainId = currentChain?._id;

  useEffect(() => {
    if (!chainId) return;

    getChainRating(chainId).then((r) => {
      if (r) setRating(r);
    });

    setCommentsLoading(true);
    getComments(chainId).then((c) => {
      setComments(c);
      setCommentsLoading(false);
    });

    if (isLoggedIn) {
      fetchDetailedCompatibility(chainId);
      fetchSubstitutionPlan(chainId);
      if (currentChain?.author) {
        isFollowingAuthor(chainId).then(setFollowing);
      }
    }
  }, [chainId, isLoggedIn]);

  useEffect(() => {
    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    return registerShortcut({
      id: 'chain-detail-modal-escape',
      key: 'Escape',
      priority: ShortcutPriority.MODAL,
      allowInInputs: true,
      handler: (e) => {
        e.preventDefault();
        onClose();
      }
    });
  }, [onClose]);

  // Auto-populate substitutions from the substitution plan
  useEffect(() => {
    if (!substitutionPlan || !currentChain) return;

    const newSubs = new Map<number, {
      originalName: string;
      altName: string;
      altManufacturer: string;
      matchedPluginId?: string;
      originalMatchedPluginId?: string;
    }>();

    for (const slot of substitutionPlan.slots) {
      if (
        slot.status === "missing" &&
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
      }
    }

    if (newSubs.size > 0) {
      setSubstitutions(newSubs as any);
    }
  }, [substitutionPlan, currentChain]);

  if (!currentChain) return null;

  const handleRate = async (value: number) => {
    await rateChain(currentChain._id, value);
    const updated = await getChainRating(currentChain._id);
    if (updated) setRating(updated);
  };

  const handleAddComment = async (content: string, parentId?: string) => {
    await addComment(currentChain._id, content, parentId);
    const updated = await getComments(currentChain._id);
    setComments(updated);
  };

  const handleDeleteComment = async (commentId: string) => {
    await deleteComment(commentId);
    const updated = await getComments(currentChain._id);
    setComments(updated);
  };

  const handleFollow = async () => {
    if (following) {
      await unfollowAuthor(currentChain._id);
      setFollowing(false);
    } else {
      await followAuthor(currentChain._id);
      setFollowing(true);
    }
  };

  const handleFork = async () => {
    if (!forkName.trim()) return;
    setForking(true);
    const result = await forkChain(currentChain._id, forkName.trim());
    setForking(false);
    if (result) {
      setShowForkDialog(false);
    }
  };

  const handleSubstitute = (position: number, originalName: string, alt: { name: string; manufacturer: string }) => {
    setSubstitutions((prev) => {
      const next = new Map(prev);
      next.set(position, { originalName, altName: alt.name, altManufacturer: alt.manufacturer });
      return next;
    });
  };

  const handleUndoSubstitute = (position: number) => {
    setSubstitutions((prev) => {
      const next = new Map(prev);
      next.delete(position);
      return next;
    });
  };

  const handleLoadChain = async () => {
    downloadChain(currentChain._id);

    // Build substitution metadata for param translation
    const subMeta = new Map<number, { originalMatchedPluginId?: string; matchedPluginId?: string }>();
    substitutions.forEach((sub: any, pos: number) => {
      if (sub.matchedPluginId && sub.originalMatchedPluginId) {
        subMeta.set(pos, {
          originalMatchedPluginId: sub.originalMatchedPluginId,
          matchedPluginId: sub.matchedPluginId,
        });
      }
    });

    const chainData = {
      version: 1,
      numSlots: currentChain.slots.length,
      slots: currentChain.slots.map((slot: any, idx: number) => {
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
    const importResult = await juceBridge.importChain(chainData) as ChainImportResult;
    const loadTimeMs = Math.round(performance.now() - loadStart);

    // Also call the parent onLoad for backward compat (e.g. setting chain name)
    onLoad(chainData);

    // Report load result to Convex (best-effort)
    recordChainLoadResult({
      chainId: currentChain._id,
      totalSlots: importResult.totalSlots ?? currentChain.slots.length,
      loadedSlots: importResult.loadedSlots ?? currentChain.slots.length,
      failedSlots: importResult.failedSlots ?? 0,
      substitutedSlots: substitutions.size,
      failures: importResult.failures,
      loadTimeMs,
    });

    // After the chain is loaded, apply parameter translation for substituted slots
    // and trigger crowdpool discovery. This is best-effort — don't block the close.
    (async () => {
      try {
        // Wait a moment for the chain to load in JUCE
        await new Promise((r) => setTimeout(r, 500));

        // Get the current chain state to find node IDs
        const state = await juceBridge.getChainState();
        if (!state?.nodes) return;

        // Apply param translation for substituted slots
        for (const [position, meta] of subMeta.entries()) {
          if (!meta.originalMatchedPluginId || !meta.matchedPluginId) continue;

          // Find the node at this position in the loaded chain
          const flatPlugins: Array<{ id: number; index: number }> = [];
          function flatten(nodes: any[]) {
            for (const n of nodes) {
              if (n.type === 'plugin') flatPlugins.push({ id: n.id, index: flatPlugins.length });
              if (n.children) flatten(n.children);
            }
          }
          flatten(state.nodes);

          const targetNode = flatPlugins.find((p) => p.index === position);
          if (!targetNode) continue;

          // Get source plugin's current parameters
          const paramResult = await juceBridge.readPluginParameters(targetNode.id);
          if (!paramResult?.success || !paramResult.parameters?.length) continue;
          const sourceParams = paramResult.parameters;

          // Translate parameters
          const translation = await translateParameters(
            meta.originalMatchedPluginId,
            meta.matchedPluginId,
            sourceParams.map((p: any) => ({
              paramId: p.name,
              paramIndex: p.index,
              normalizedValue: p.normalizedValue,
            }))
          );

          if (translation?.targetParams?.length) {
            await juceBridge.applyPluginParameters(
              targetNode.id,
              translation.targetParams.map((tp) => ({
                paramIndex: tp.paramIndex ?? 0,
                value: tp.value,
              }))
            );
          }
        }

        // Fire-and-forget: crowdpool discovery for all plugins
        autoDiscoverAllPlugins(state.nodes).catch(() => {});
      } catch {
        // Best-effort — silently ignored
      }
    })();

    onClose();
  };

  const handleLike = async () => {
    await toggleLike(currentChain._id);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 fade-in" style={modalOverlayStyle} onClick={onClose}>
      <div className="glass scale-in scrollbar-cyber" style={modalPanelStyle} onClick={(e) => e.stopPropagation()}>
        {/* Back button */}
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent-cyan)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
        >
          &larr; Back to Browse
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xl)', fontWeight: 700, color: '#deff0a', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)' }}>
            {currentChain.name}
          </h2>
          {currentChain.forkedFrom && (
            <span className="badge badge-cyan" style={{ fontSize: 'var(--text-xs)' }}>fork</span>
          )}
        </div>

        {/* Author + follow */}
        {currentChain.author?.name && (
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
              by {currentChain.author.name}
            </span>
            {isLoggedIn && currentChain.authorId !== userId && (
              <button
                onClick={handleFollow}
                className="btn"
                style={{
                  fontSize: 'var(--text-xs)',
                  padding: '2px var(--space-2)',
                  ...(following ? {
                    borderColor: 'rgba(222, 255, 10, 0.4)',
                    color: 'var(--color-accent-cyan)',
                    background: 'rgba(222, 255, 10, 0.08)',
                  } : {}),
                }}
              >
                {following ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        )}

        {/* Description */}
        {currentChain.description && (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>{currentChain.description}</p>
        )}

        {/* Tags */}
        {currentChain.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {currentChain.tags.map((tag: string) => (
              <span key={tag} className="badge badge-cyan">{tag}</span>
            ))}
          </div>
        )}

        {/* Rating */}
        <div className="mb-4">
          <StarRating
            rating={rating.average}
            count={rating.count}
            interactive={isLoggedIn}
            onRate={handleRate}
          />
          {rating.userRating && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-1)' }}>
              Your rating: {rating.userRating}/5
            </div>
          )}
        </div>

        {/* Compatibility */}
        {compatibility && (
          <div style={{
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-3)',
            marginBottom: 'var(--space-4)',
            background: compatibility.canFullyLoad ? 'rgba(0, 255, 136, 0.06)' : 'rgba(255, 170, 0, 0.06)',
            border: `1px solid ${compatibility.canFullyLoad ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 170, 0, 0.2)'}`,
          }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: compatibility.canFullyLoad ? 'var(--color-status-active)' : 'var(--color-status-warning)' }}>
                {compatibility.canFullyLoad
                  ? 'All plugins available'
                  : `Missing ${compatibility.missingCount} of ${compatibility.ownedCount + compatibility.missingCount} plugins`}
              </span>
              <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: compatibility.canFullyLoad ? 'var(--color-status-active)' : 'var(--color-status-warning)' }}>
                {compatibility.percentage}%
              </span>
            </div>
            <div className="meter">
              <div
                className="meter-fill"
                style={{
                  width: `${compatibility.percentage}%`,
                  background: compatibility.canFullyLoad ? 'var(--color-status-active)' : 'var(--color-status-warning)',
                }}
              />
            </div>
            {detailedCompatibility && detailedCompatibility.missing.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {detailedCompatibility.missing.map((m, i) => {
                  const slot = detailedCompatibility.slots?.find(
                    (s) => s.pluginName.toLowerCase() === m.pluginName.toLowerCase() && s.status === 'missing'
                  );
                  const sub = substitutions.get(slot?.position ?? -1);
                  return (
                    <div key={i} style={{ fontSize: 'var(--text-xs)' }}>
                      <span style={{ color: 'var(--color-status-warning)' }}>{m.pluginName}</span>
                      <span style={{ color: 'var(--color-text-tertiary)' }}> by {m.manufacturer}</span>
                      {sub ? (
                        <span className="ml-1.5 inline-flex items-center gap-1">
                          <span style={{ padding: '2px 6px', background: 'rgba(0, 255, 136, 0.15)', color: 'var(--color-status-active)', borderRadius: 'var(--radius-sm)', fontSize: '10px' }}>
                            Using {sub.altName}
                          </span>
                          <button
                            onClick={() => handleUndoSubstitute(slot?.position ?? -1)}
                            style={{ color: 'var(--color-text-tertiary)', fontSize: '10px', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
                          >
                            undo
                          </button>
                        </span>
                      ) : (
                        slot?.alternatives?.map((alt, j) => (
                          <span key={j} className="inline-flex flex-col ml-1">
                            <button
                              onClick={() => handleSubstitute(slot.position, m.pluginName, alt)}
                              style={{
                                padding: '2px 6px',
                                background: 'rgba(222, 255, 10, 0.1)',
                                color: 'var(--color-accent-cyan)',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '10px',
                                border: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              Use {alt.name}
                            </button>
                            {alt.similarityReasons && (
                              <span style={{ fontSize: '9px', color: 'var(--color-text-disabled)', marginLeft: '2px', marginTop: '2px' }} className="truncate max-w-[180px]">
                                {alt.similarityReasons}
                              </span>
                            )}
                          </span>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Plugin list */}
        <div className="mb-4">
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
            Plugins ({currentChain.slots.length})
          </div>
          <div className="space-y-1">
            {currentChain.slots.map((slot: any, idx: number) => {
              const missingInfo = detailedCompatibility?.missing.find(
                (m) =>
                  m.pluginName.toLowerCase() === slot.pluginName.toLowerCase() &&
                  m.manufacturer.toLowerCase() === slot.manufacturer.toLowerCase()
              );
              const isOwned = !missingInfo;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between"
                  style={{
                    padding: 'var(--space-2)',
                    borderRadius: 'var(--radius-base)',
                    fontSize: 'var(--text-sm)',
                    background: isOwned ? 'rgba(0, 255, 136, 0.04)' : 'var(--color-bg-input)',
                    border: `1px solid ${isOwned ? 'rgba(0, 255, 136, 0.1)' : 'var(--color-border-subtle)'}`,
                  }}
                >
                  <div className="min-w-0">
                    <div style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }} className="truncate">{slot.pluginName}</div>
                    <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>{slot.manufacturer}</div>
                  </div>
                  {isOwned ? (
                    <span style={{ color: 'var(--color-status-active)', fontSize: 'var(--text-xs)' }} className="shrink-0 ml-2">Owned</span>
                  ) : (
                    <span style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-xs)' }} className="shrink-0 ml-2">Missing</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mb-4" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          <span>Likes: {currentChain.likes}</span>
          <span>Downloads: {currentChain.downloads}</span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mb-6">
          <button onClick={handleLike} className="btn">Like</button>
          {isLoggedIn && (
            <button
              onClick={() => { setForkName(`${currentChain.name} (fork)`); setShowForkDialog(true); }}
              className="btn"
            >
              Fork
            </button>
          )}
          <button onClick={handleLoadChain} className="btn btn-primary flex-1">
            {compatibility?.canFullyLoad
              ? 'Load Chain'
              : substitutions.size > 0
                ? `Load with ${substitutions.size} swap${substitutions.size > 1 ? 's' : ''}`
                : 'Load Available Plugins'}
          </button>
        </div>

        {/* Fork dialog */}
        {showForkDialog && (
          <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--color-bg-input)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-2)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Fork this chain</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={forkName}
                onChange={(e) => setForkName(e.target.value)}
                placeholder="New chain name"
                className="input flex-1"
                autoFocus
              />
              <button onClick={handleFork} disabled={forking || !forkName.trim()} className="btn btn-primary">
                {forking ? '...' : 'Fork'}
              </button>
              <button onClick={() => setShowForkDialog(false)} className="btn">Cancel</button>
            </div>
          </div>
        )}

        {/* Divider + Comments */}
        <div style={{ borderTop: '1px solid var(--color-border-default)', paddingTop: 'var(--space-4)' }}>
          <CommentSection
            comments={comments}
            currentUserId={userId}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
            loading={commentsLoading}
          />
        </div>
      </div>
    </div>
  );
}
