import { useState, useEffect, useCallback } from 'react';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useSyncStore } from '../../stores/syncStore';
import { StarRating } from './StarRating';
import { CommentSection } from './CommentSection';
import type { Comment } from './CommentSection';

interface ChainDetailModalProps {
  onClose: () => void;
  onLoad: (chainData: unknown) => void;
  onBack: () => void;
}

export function ChainDetailModal({ onClose, onLoad, onBack }: ChainDetailModalProps) {
  const {
    currentChain,
    compatibility,
    detailedCompatibility,
    toggleLike,
    downloadChain,
    fetchDetailedCompatibility,
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

  // Load rating and comments
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
      if (currentChain?.author) {
        isFollowingAuthor(chainId).then(setFollowing);
      }
    }
  }, [chainId, isLoggedIn]);

  // Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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

  const handleLoadChain = () => {
    downloadChain(currentChain._id);

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
        };
      }),
    };

    onLoad(chainData);
    onClose();
  };

  const handleLike = async () => {
    await toggleLike(currentChain._id);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-plugin-surface rounded-propane-lg p-6 max-w-lg w-full mx-4 border border-plugin-accent max-h-[85vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Back button */}
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white text-sm mb-4 flex items-center gap-1"
        >
          &larr; Back to Browse
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <h2 className="text-xl font-bold text-white">{currentChain.name}</h2>
          {currentChain.forkedFrom && (
            <span className="text-xxs bg-plugin-accent/20 text-plugin-accent px-1.5 py-0.5 rounded">
              fork
            </span>
          )}
        </div>

        {/* Author + follow */}
        {currentChain.author?.name && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm text-gray-400">
              by {currentChain.author.name}
            </span>
            {isLoggedIn && currentChain.authorId !== userId && (
              <button
                onClick={handleFollow}
                className={`text-xxs px-2 py-0.5 rounded border transition-colors ${
                  following
                    ? 'border-plugin-accent/50 text-plugin-accent bg-plugin-accent/10'
                    : 'border-plugin-border text-plugin-muted hover:text-white hover:border-plugin-accent/50'
                }`}
              >
                {following ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        )}

        {/* Description */}
        {currentChain.description && (
          <p className="text-gray-300 text-sm mb-3">{currentChain.description}</p>
        )}

        {/* Tags */}
        {currentChain.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {currentChain.tags.map((tag: string) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-plugin-accent/20 text-plugin-accent rounded text-xxs"
              >
                {tag}
              </span>
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
            <div className="text-xxs text-plugin-muted mt-1">
              Your rating: {rating.userRating}/5
            </div>
          )}
        </div>

        {/* Compatibility */}
        {compatibility && (
          <div
            className={`rounded-lg p-3 mb-4 ${
              compatibility.canFullyLoad
                ? 'bg-green-500/10 border border-green-500/30'
                : 'bg-yellow-500/10 border border-yellow-500/30'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className={`text-sm font-medium ${
                  compatibility.canFullyLoad ? 'text-green-400' : 'text-yellow-400'
                }`}
              >
                {compatibility.canFullyLoad
                  ? 'All plugins available'
                  : `Missing ${compatibility.missingCount} of ${
                      compatibility.ownedCount + compatibility.missingCount
                    } plugins`}
              </span>
              <span
                className={`text-sm font-mono font-bold ${
                  compatibility.canFullyLoad ? 'text-green-400' : 'text-yellow-400'
                }`}
              >
                {compatibility.percentage}%
              </span>
            </div>
            <div className="w-full bg-black/30 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  compatibility.canFullyLoad ? 'bg-green-500' : 'bg-yellow-500'
                }`}
                style={{ width: `${compatibility.percentage}%` }}
              />
            </div>
            {/* Missing plugin suggestions with actionable swap buttons */}
            {detailedCompatibility && detailedCompatibility.missing.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {detailedCompatibility.missing.map((m, i) => {
                  const slot = detailedCompatibility.slots?.find(
                    (s) => s.pluginName.toLowerCase() === m.pluginName.toLowerCase() && s.status === 'missing'
                  );
                  const sub = substitutions.get(slot?.position ?? -1);
                  return (
                    <div key={i} className="text-xxs">
                      <span className="text-yellow-400">{m.pluginName}</span>
                      <span className="text-plugin-muted"> by {m.manufacturer}</span>
                      {sub ? (
                        <span className="ml-1.5 inline-flex items-center gap-1">
                          <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px]">
                            Using {sub.altName}
                          </span>
                          <button
                            onClick={() => handleUndoSubstitute(slot?.position ?? -1)}
                            className="text-plugin-muted hover:text-white text-[10px] underline"
                          >
                            undo
                          </button>
                        </span>
                      ) : (
                        slot?.alternatives?.map((alt, j) => (
                          <span key={j} className="inline-flex flex-col ml-1">
                            <button
                              onClick={() => handleSubstitute(slot.position, m.pluginName, alt)}
                              className="px-1.5 py-0.5 bg-plugin-accent/20 text-plugin-accent
                                         hover:bg-plugin-accent/30 rounded text-[10px] transition-colors"
                            >
                              Use {alt.name}
                            </button>
                            {alt.similarityReasons && (
                              <span className="text-[9px] text-plugin-dim ml-0.5 mt-0.5 truncate max-w-[180px]">
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
          <div className="text-xs text-plugin-muted mb-2">
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
                  className={`flex items-center justify-between p-2 rounded text-sm ${
                    isOwned ? 'bg-green-500/5' : 'bg-black/20'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-white text-sm truncate">{slot.pluginName}</div>
                    <div className="text-plugin-muted text-xxs">{slot.manufacturer}</div>
                  </div>
                  {isOwned ? (
                    <span className="text-green-400 text-xxs shrink-0 ml-2">Owned</span>
                  ) : (
                    <span className="text-plugin-dim text-xxs shrink-0 ml-2">Missing</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-plugin-muted mb-4">
          <span>Likes: {currentChain.likes}</span>
          <span>Downloads: {currentChain.downloads}</span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={handleLike}
            className="px-3 py-1.5 border border-plugin-border rounded text-sm text-gray-400 hover:text-white hover:border-pink-500/50 transition-colors"
          >
            Like
          </button>
          {isLoggedIn && (
            <button
              onClick={() => {
                setForkName(`${currentChain.name} (fork)`);
                setShowForkDialog(true);
              }}
              className="px-3 py-1.5 border border-plugin-border rounded text-sm text-gray-400 hover:text-white hover:border-plugin-accent/50 transition-colors"
            >
              Fork
            </button>
          )}
          <button
            onClick={handleLoadChain}
            className="flex-1 bg-plugin-accent hover:bg-plugin-accent-bright text-white rounded px-4 py-1.5 text-sm font-medium"
          >
            {compatibility?.canFullyLoad
              ? 'Load Chain'
              : substitutions.size > 0
                ? `Load with ${substitutions.size} swap${substitutions.size > 1 ? 's' : ''}`
                : 'Load Available Plugins'}
          </button>
        </div>

        {/* Fork dialog */}
        {showForkDialog && (
          <div className="mb-4 p-3 bg-black/20 border border-plugin-border rounded-lg">
            <div className="text-sm text-white mb-2">Fork this chain</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={forkName}
                onChange={(e) => setForkName(e.target.value)}
                placeholder="New chain name"
                className="flex-1 bg-black/30 border border-plugin-border rounded px-2 py-1.5 text-sm text-white"
                autoFocus
              />
              <button
                onClick={handleFork}
                disabled={forking || !forkName.trim()}
                className="px-3 py-1.5 text-xs bg-plugin-accent hover:bg-plugin-accent-bright disabled:bg-gray-600 text-white rounded font-medium"
              >
                {forking ? '...' : 'Fork'}
              </button>
              <button
                onClick={() => setShowForkDialog(false)}
                className="px-2 py-1.5 text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-plugin-border pt-4">
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
