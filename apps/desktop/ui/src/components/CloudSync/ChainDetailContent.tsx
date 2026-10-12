import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  X,
  Heart,
  Download,
  GitFork,
  Bookmark,
  BookmarkCheck,
  Check,
  AlertCircle,
  ExternalLink,
  Undo2,
  UserPlus,
  UserCheck,
  Gauge,
} from 'lucide-react';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useSyncStore } from '../../stores/syncStore';
import { StarRating } from './StarRating';
import { CommentSection } from './CommentSection';
import type { Comment } from './CommentSection';
import { pluginPageUrl, pluginSearchUrl } from '../../constants/links';

export interface ChainDetailContentProps {
  /** Full chain record (from cloudChainStore.loadChain) */
  chain: any;
  /** Receives JUCE import data (with any plugin swaps applied) */
  onLoad: (chainData: unknown) => void | Promise<void>;
  onBack?: () => void;
  onClose?: () => void;
  backLabel?: string;
  isInCollection?: boolean;
  onToggleCollection?: () => void;
}

export interface Substitution {
  originalName: string;
  altName: string;
  altManufacturer: string;
}

/** Why the server thinks an alternative is close (field may be absent). */
function reasonsOf(alt: unknown): string | undefined {
  const r = (alt as { similarityReasons?: unknown } | undefined)?.similarityReasons;
  return typeof r === 'string' && r ? r : Array.isArray(r) ? r.join(', ') : undefined;
}

/** Turn a cloud chain into the JSON juceBridge.importChain expects, applying any swaps. */
export function buildImportData(chain: any, substitutions: Map<number, Substitution> = new Map()) {
  const slots: any[] = chain?.slots ?? [];
  return {
    version: 1,
    numSlots: slots.length,
    slots: slots.map((slot: any, idx: number) => {
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
}

/**
 * Everything about one cloud chain: who made it, rating, what you own,
 * swap suggestions for what you don't, store links, load/fork/like/save,
 * and comments. Used by the Library side panel and by ChainDetailModal.
 */
export function ChainDetailContent({
  chain,
  onLoad,
  onBack,
  onClose,
  backLabel = 'Back',
  isInCollection,
  onToggleCollection,
}: ChainDetailContentProps) {
  const {
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
  const [forked, setForked] = useState(false);
  const [liked, setLiked] = useState(false);
  const [loadingChain, setLoadingChain] = useState(false);
  const [substitutions, setSubstitutions] = useState<Map<number, Substitution>>(new Map());

  const chainId = chain?._id;

  useEffect(() => {
    if (!chainId) return;
    setSubstitutions(new Map());
    setShowForkDialog(false);
    setForked(false);

    getChainRating(chainId).then((r) => {
      if (r) setRating(r);
    });

    setCommentsLoading(true);
    getComments(chainId).then((c) => {
      setComments(c ?? []);
      setCommentsLoading(false);
    });

    if (isLoggedIn) {
      fetchDetailedCompatibility(chainId);
      if (chain?.author) {
        isFollowingAuthor(chainId).then(setFollowing);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, isLoggedIn]);

  if (!chain) return null;

  const slots: any[] = chain.slots ?? [];
  const tags: string[] = chain.tags ?? [];

  const handleRate = async (value: number) => {
    await rateChain(chain._id, value);
    const updated = await getChainRating(chain._id);
    if (updated) setRating(updated);
  };

  const handleAddComment = async (content: string, parentId?: string) => {
    await addComment(chain._id, content, parentId);
    setComments(await getComments(chain._id));
  };

  const handleDeleteComment = async (commentId: string) => {
    await deleteComment(commentId);
    setComments(await getComments(chain._id));
  };

  const handleFollow = async () => {
    if (following) {
      await unfollowAuthor(chain._id);
      setFollowing(false);
    } else {
      await followAuthor(chain._id);
      setFollowing(true);
    }
  };

  const handleFork = async () => {
    if (!forkName.trim()) return;
    setForking(true);
    const result = await forkChain(chain._id, forkName.trim());
    setForking(false);
    if (result) {
      setShowForkDialog(false);
      setForked(true);
    }
  };

  const handleLike = async () => {
    setLiked((v) => !v);
    await toggleLike(chain._id);
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
    downloadChain(chain._id);
    const chainData = buildImportData(chain, substitutions);
    setLoadingChain(true);
    try {
      await onLoad(chainData);
    } finally {
      setLoadingChain(false);
    }
  };

  // Per-slot ownership: prefer detailed per-position data, fall back to the missing list
  const slotStatus = (slot: any, idx: number) => {
    const position = slot.position ?? idx;
    const detail =
      detailedCompatibility?.slots?.find((s) => s.position === position) ??
      detailedCompatibility?.slots?.find((s) => s.pluginName.toLowerCase() === String(slot.pluginName).toLowerCase());
    const inMissing = detailedCompatibility?.missing?.some(
      (m) => m.pluginName.toLowerCase() === String(slot.pluginName).toLowerCase(),
    );
    const status: 'owned' | 'missing' | 'unknown' = detail
      ? detail.status
      : detailedCompatibility
        ? (inMissing ? 'missing' : 'owned')
        : 'unknown';
    return { position, status, alternatives: detail?.alternatives ?? [] };
  };

  const total = compatibility ? compatibility.ownedCount + compatibility.missingCount : slots.length;
  const pct = compatibility?.percentage ?? null;
  const loadLabel = compatibility?.canFullyLoad || !compatibility
    ? 'Load Chain'
    : substitutions.size > 0
      ? `Load with ${substitutions.size} swap${substitutions.size > 1 ? 's' : ''}`
      : 'Load Available Plugins';

  const tone = pct == null ? 'muted' : pct === 100 ? 'ok' : pct >= 60 ? 'warn' : 'bad';
  const toneText = { ok: 'text-green-400', warn: 'text-yellow-400', bad: 'text-red-400', muted: 'text-plugin-muted' }[tone];
  const toneBar = { ok: 'bg-green-500', warn: 'bg-yellow-500', bad: 'bg-red-500', muted: 'bg-plugin-dim' }[tone];

  const authorName: string | undefined = chain.author?.name;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header bar */}
      <div className="flex items-center gap-1 h-10 px-2 border-b border-plugin-border flex-shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="h-7 inline-flex items-center gap-1 px-1.5 rounded-md text-xs text-plugin-muted hover:text-plugin-text hover:bg-plugin-raised"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {backLabel}
          </button>
        )}
        <div className="flex-1" />
        {onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-plugin-muted hover:text-plugin-text hover:bg-plugin-raised"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Title block */}
        <div className="px-4 pt-3 pb-3">
          <div className="flex items-start gap-2">
            <h2 className="text-lg font-semibold text-plugin-text leading-tight flex-1 min-w-0">{chain.name}</h2>
            {chain.forkedFrom && (
              <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide bg-plugin-accent/15 text-plugin-accent-bright px-1.5 py-0.5 rounded">
                <GitFork className="w-3 h-3" /> fork
              </span>
            )}
          </div>

          {authorName && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="w-5 h-5 rounded-full bg-plugin-raised border border-plugin-border text-[10px] font-semibold text-plugin-muted inline-flex items-center justify-center">
                {authorName.charAt(0).toUpperCase()}
              </span>
              <span className="text-[13px] text-plugin-muted">by <span className="text-plugin-text">{authorName}</span></span>
              {isLoggedIn && chain.authorId !== userId && (
                <button
                  onClick={handleFollow}
                  className={`h-6 inline-flex items-center gap-1 text-[11px] font-semibold px-2 rounded-md border transition-colors ${
                    following
                      ? 'border-plugin-accent/50 text-plugin-accent-bright bg-plugin-accent/10'
                      : 'border-plugin-border text-plugin-muted hover:text-plugin-text hover:border-plugin-border-bright'
                  }`}
                >
                  {following ? <UserCheck className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                  {following ? 'Following' : 'Follow'}
                </button>
              )}
            </div>
          )}

          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2.5">
            <StarRating
              rating={rating.average}
              count={rating.count}
              interactive={isLoggedIn}
              onRate={handleRate}
              size="sm"
            />
            <span className="inline-flex items-center gap-1 text-xs text-plugin-muted">
              <Heart className="w-3 h-3" /> <span className="num">{chain.likes ?? 0}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-plugin-muted">
              <Download className="w-3 h-3" /> <span className="num">{chain.downloads ?? 0}</span>
            </span>
            {chain.targetInputLufs != null && (
              <span className="inline-flex items-center gap-1 text-xs text-plugin-muted" title="Target input loudness">
                <Gauge className="w-3 h-3" /> <span className="num">{chain.targetInputLufs} LUFS</span>
              </span>
            )}
          </div>
          {rating.userRating && (
            <div className="text-[11px] text-plugin-dim mt-1">Your rating: {rating.userRating}/5</div>
          )}

          {chain.description && (
            <p className="text-[13px] text-plugin-muted leading-snug mt-2.5">{chain.description}</p>
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2.5">
              {tags.map((tag: string) => (
                <span key={tag} className="px-1.5 py-0.5 rounded bg-plugin-raised border border-plugin-border text-[11px] text-plugin-muted">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Compatibility */}
        <div className="px-4 pb-3">
          {compatibility ? (
            <div className="rounded-lg border border-plugin-border bg-plugin-bg/60 p-3">
              <div className="flex items-baseline justify-between">
                <span className={`text-[13px] font-semibold ${toneText}`}>
                  {compatibility.canFullyLoad
                    ? 'You own every plugin'
                    : `Missing ${compatibility.missingCount} of ${total} plugins`}
                </span>
                <span className={`num text-sm font-medium ${toneText}`}>{compatibility.percentage}%</span>
              </div>
              <div className="w-full bg-plugin-raised rounded-full h-1.5 mt-2">
                <div className={`h-1.5 rounded-full transition-all ${toneBar}`} style={{ width: `${compatibility.percentage}%` }} />
              </div>
              {!compatibility.canFullyLoad && (
                <p className="text-[11px] text-plugin-dim mt-2">
                  Pick a swap for each missing plugin, or load the chain without them.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-plugin-border p-3 text-xs text-plugin-muted">
              {isLoggedIn ? 'Checking which plugins you own…' : 'Log in to see which of these plugins you own.'}
            </div>
          )}
        </div>

        {/* Plugin list */}
        <div className="px-4 pb-3">
          <p className="section-label mb-1.5">Signal chain · {slots.length} plugin{slots.length === 1 ? '' : 's'}</p>
          <ol className="rounded-lg border border-plugin-border overflow-hidden divide-y divide-plugin-border">
            {slots.map((slot: any, idx: number) => {
              const { position, status, alternatives } = slotStatus(slot, idx);
              const sub = substitutions.get(position);
              const missing = status === 'missing';
              return (
                <li key={idx} className={`px-2.5 py-2 ${missing && !sub ? 'bg-red-500/[0.04]' : 'bg-plugin-surface-alt/40'}`}>
                  <div className="flex items-center gap-2">
                    <span className="num text-[10px] text-plugin-dim w-4 text-right">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] truncate ${missing && !sub ? 'text-plugin-muted' : 'text-plugin-text'} ${sub ? 'line-through decoration-plugin-dim' : ''}`}>
                        {slot.pluginName}
                      </div>
                      <div className="text-[11px] text-plugin-dim truncate">{slot.manufacturer}</div>
                    </div>
                    {status === 'owned' && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-green-400 flex-shrink-0">
                        <Check className="w-3 h-3" /> Owned
                      </span>
                    )}
                    {missing && !sub && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-red-400 flex-shrink-0">
                        <AlertCircle className="w-3 h-3" /> Missing
                      </span>
                    )}
                    {missing && (
                      <a
                        href={pluginSearchUrl(slot.pluginName)}
                        target="_blank"
                        rel="noreferrer"
                        className="w-6 h-6 inline-flex items-center justify-center rounded text-plugin-dim hover:text-plugin-text hover:bg-plugin-raised flex-shrink-0"
                        title={`Find ${slot.pluginName} on ProChain (prices and stores)`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  {missing && (
                    <div className="pl-6 mt-1.5">
                      {sub ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 bg-green-500/15 text-green-400 rounded text-[11px] font-medium">
                            Using {sub.altName}
                          </span>
                          <button
                            onClick={() => handleUndoSubstitute(position)}
                            className="inline-flex items-center gap-0.5 text-plugin-muted hover:text-plugin-text text-[11px] underline"
                          >
                            <Undo2 className="w-3 h-3" />undo
                          </button>
                        </span>
                      ) : alternatives.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-plugin-dim">You own a close match</span>
                          <div className="flex flex-wrap gap-1">
                            {alternatives.map((alt, j) => (
                              <span key={j} className="inline-flex items-center rounded-md border border-plugin-accent/30 bg-plugin-accent/10 overflow-hidden" title={reasonsOf(alt) || `${alt.name} by ${alt.manufacturer}`}>
                                <button
                                  onClick={() => handleSubstitute(position, slot.pluginName, alt)}
                                  className="px-1.5 py-0.5 text-plugin-accent-bright hover:bg-plugin-accent/20 text-[11px] font-medium transition-colors"
                                >
                                  Use {alt.name}
                                </button>
                                {alt.slug && (
                                  <a
                                    href={pluginPageUrl(alt.slug)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-1 py-0.5 border-l border-plugin-accent/20 text-plugin-accent/70 hover:text-plugin-accent-bright"
                                    title={`About ${alt.name}`}
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </span>
                            ))}
                          </div>
                          {reasonsOf(alternatives[0]) && (
                            <span className="text-[10px] text-plugin-dim truncate">{reasonsOf(alternatives[0])}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-plugin-dim">No close match in your plugins</span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Fork dialog */}
        {showForkDialog && (
          <div className="mx-4 mb-3 p-3 rounded-lg border border-plugin-border bg-plugin-bg/60">
            <div className="text-[13px] font-semibold text-plugin-text mb-2">Fork this chain</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={forkName}
                onChange={(e) => setForkName(e.target.value)}
                placeholder="New chain name"
                className="flex-1 h-8 bg-plugin-surface border border-plugin-border rounded-md px-2 text-[13px] text-plugin-text focus:outline-none focus:border-plugin-accent/60"
                autoFocus
              />
              <button
                onClick={handleFork}
                disabled={forking || !forkName.trim()}
                className="h-8 px-3 text-xs bg-plugin-accent hover:bg-plugin-accent-bright disabled:opacity-40 text-plugin-on-accent rounded-md font-semibold"
              >
                {forking ? '…' : 'Fork'}
              </button>
              <button
                onClick={() => setShowForkDialog(false)}
                className="h-8 px-2 text-xs text-plugin-muted hover:text-plugin-text"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {forked && (
          <p className="mx-4 mb-3 text-xs text-green-400">Forked. You'll find it under My chains.</p>
        )}

        {/* Comments */}
        <div className="px-4 pt-3 pb-4 border-t border-plugin-border">
          <CommentSection
            comments={comments}
            currentUserId={userId}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
            loading={commentsLoading}
          />
        </div>
      </div>

      {/* Sticky actions */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-t border-plugin-border bg-plugin-surface flex-shrink-0">
        <button
          onClick={handleLoadChain}
          disabled={loadingChain}
          className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 bg-plugin-accent hover:bg-plugin-accent-bright disabled:opacity-60 text-plugin-on-accent rounded-md px-3 text-[13px] font-semibold transition-colors"
        >
          <Download className="w-4 h-4" />
          {loadLabel}
        </button>
        <button
          onClick={handleLike}
          className={`h-9 w-9 inline-flex items-center justify-center rounded-md border transition-colors ${
            liked ? 'border-pink-500/40 text-pink-400 bg-pink-500/10' : 'border-plugin-border text-plugin-muted hover:text-plugin-text hover:border-plugin-border-bright'
          }`}
          title="Like"
          aria-label="Like"
        >
          <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
        </button>
        {onToggleCollection && (
          <button
            onClick={onToggleCollection}
            className={`h-9 w-9 inline-flex items-center justify-center rounded-md border transition-colors ${
              isInCollection ? 'border-plugin-accent/50 text-plugin-accent bg-plugin-accent/10' : 'border-plugin-border text-plugin-muted hover:text-plugin-text hover:border-plugin-border-bright'
            }`}
            title={isInCollection ? 'Remove from saved' : 'Save to your collection'}
            aria-label={isInCollection ? 'Remove from saved' : 'Save to collection'}
          >
            {isInCollection ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          </button>
        )}
        {isLoggedIn && (
          <button
            onClick={() => {
              setForkName(`${chain.name} (fork)`);
              setShowForkDialog(true);
            }}
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-plugin-border text-plugin-muted hover:text-plugin-text hover:border-plugin-border-bright transition-colors"
            title="Fork: save your own editable copy"
            aria-label="Fork"
          >
            <GitFork className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
