import { useState } from 'react';

export interface Comment {
  _id: string;
  chainId: string;
  userId: string;
  authorName: string;
  content: string;
  createdAt: number;
  parentCommentId?: string;
}

interface CommentSectionProps {
  comments: Comment[];
  currentUserId: string | null;
  onAddComment: (content: string, parentId?: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  loading?: boolean;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function CommentItem({
  comment,
  replies,
  currentUserId,
  onAddComment,
  onDeleteComment,
  depth,
}: {
  comment: Comment;
  replies: Comment[];
  currentUserId: string | null;
  onAddComment: (content: string, parentId?: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  depth: number;
}) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    await onAddComment(replyText.trim(), comment._id);
    setReplyText('');
    setShowReply(false);
    setSubmitting(false);
  };

  const isOwn = currentUserId && comment.userId === currentUserId;

  return (
    <div
      className={depth > 0 ? 'ml-4 pl-3' : ''}
      style={depth > 0 ? { borderLeft: '1px solid var(--color-border-default)' } : undefined}
    >
      <div className="py-2">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-xs font-medium"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}
          >
            {comment.authorName}
          </span>
          <span
            className="text-[10px]"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {formatRelativeTime(comment.createdAt)}
          </span>
        </div>
        <p
          className="text-sm whitespace-pre-wrap break-words"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}
        >
          {comment.content}
        </p>
        <div className="flex items-center gap-3 mt-1">
          {currentUserId && depth < 2 && (
            <button
              onClick={() => setShowReply(!showReply)}
              className="text-[10px] transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent-cyan)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
            >
              Reply
            </button>
          )}
          {isOwn && (
            <button
              onClick={() => onDeleteComment(comment._id)}
              className="text-[10px] transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-status-error)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
            >
              Delete
            </button>
          )}
        </div>

        {showReply && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value.slice(0, 2000))}
              onKeyDown={(e) => e.key === 'Enter' && handleReply()}
              placeholder="Write a reply..."
              maxLength={2000}
              className="input flex-1"
              style={{ fontSize: 'var(--text-sm)' }}
              autoFocus
            />
            <button
              onClick={handleReply}
              disabled={submitting || !replyText.trim()}
              className="btn btn-primary"
              style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-2) var(--space-3)' }}
            >
              {submitting ? '...' : 'Reply'}
            </button>
          </div>
        )}
      </div>

      {replies.length > 0 && (
        <div>
          {replies.map((reply) => (
            <CommentItem
              key={reply._id}
              comment={reply}
              replies={[]}
              currentUserId={currentUserId}
              onAddComment={onAddComment}
              onDeleteComment={onDeleteComment}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CommentSection({
  comments,
  currentUserId,
  onAddComment,
  onDeleteComment,
  loading,
}: CommentSectionProps) {
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    await onAddComment(newComment.trim());
    setNewComment('');
    setSubmitting(false);
  };

  // Build thread tree: top-level comments + their replies
  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesMap = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parentCommentId) {
      const existing = repliesMap.get(c.parentCommentId) ?? [];
      existing.push(c);
      repliesMap.set(c.parentCommentId, existing);
    }
  }

  return (
    <div>
      <h4
        className="text-sm font-medium mb-3"
        style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-primary)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wide)',
        }}
      >
        Comments {comments.length > 0 && `(${comments.length})`}
      </h4>

      {currentUserId && (
        <div className="mb-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value.slice(0, 2000))}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Add a comment..."
              maxLength={2000}
              className="input flex-1"
              style={{ fontSize: 'var(--text-sm)' }}
            />
            <button
              onClick={handleSubmit}
              disabled={submitting || !newComment.trim()}
              className="btn btn-primary"
              style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-2) var(--space-3)' }}
            >
              {submitting ? '...' : 'Post'}
            </button>
          </div>
          {newComment.length > 1800 && (
            <div style={{ fontSize: '10px', color: newComment.length >= 2000 ? 'var(--color-status-error)' : 'var(--color-text-tertiary)', textAlign: 'right', marginTop: '2px' }}>
              {newComment.length}/2000
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div
          className="text-sm py-4 text-center"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          Loading comments...
        </div>
      ) : topLevel.length === 0 ? (
        <div
          className="text-sm py-4 text-center"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          No comments yet. Be the first!
        </div>
      ) : (
        <div style={{ borderTop: 'none' }}>
          {topLevel.map((comment, idx) => (
            <div
              key={comment._id}
              style={idx > 0 ? { borderTop: '1px solid var(--color-border-default)' } : undefined}
            >
              <CommentItem
                comment={comment}
                replies={repliesMap.get(comment._id) ?? []}
                currentUserId={currentUserId}
                onAddComment={onAddComment}
                onDeleteComment={onDeleteComment}
                depth={0}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
