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
    <div className={depth > 0 ? 'ml-4 border-l border-plugin-border pl-3' : ''}>
      <div className="py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono font-medium text-plugin-text">
            {comment.authorName}
          </span>
          <span className="text-xxs text-plugin-muted">
            {formatRelativeTime(comment.createdAt)}
          </span>
        </div>
        <p className="text-sm font-mono text-gray-300 whitespace-pre-wrap break-words">
          {comment.content}
        </p>
        <div className="flex items-center gap-3 mt-1">
          {currentUserId && depth < 2 && (
            <button
              onClick={() => setShowReply(!showReply)}
              className="text-xxs text-plugin-muted hover:text-plugin-text transition-colors"
            >
              Reply
            </button>
          )}
          {isOwn && (
            <button
              onClick={() => onDeleteComment(comment._id)}
              className="text-xxs text-plugin-muted hover:text-red-400 transition-colors"
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
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleReply()}
              placeholder="Write a reply..."
              className="flex-1 bg-black/30 border border-plugin-border rounded px-2 py-1 text-sm text-white"
              autoFocus
            />
            <button
              onClick={handleReply}
              disabled={submitting || !replyText.trim()}
              className="px-2 py-1 text-xs font-mono bg-plugin-accent hover:bg-plugin-accent-bright disabled:bg-gray-600 text-white rounded"
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
      <h4 className="text-sm font-mono font-medium text-plugin-text mb-3">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h4>

      {currentUserId && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Add a comment..."
            className="flex-1 bg-black/30 border border-plugin-border rounded px-3 py-1.5 text-sm text-white"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !newComment.trim()}
            className="px-3 py-1.5 text-xs font-mono bg-plugin-accent hover:bg-plugin-accent-bright disabled:bg-gray-600 text-white rounded font-medium"
          >
            {submitting ? '...' : 'Post'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-plugin-muted py-4 text-center">Loading comments...</div>
      ) : topLevel.length === 0 ? (
        <div className="text-sm text-plugin-muted py-4 text-center">
          No comments yet. Be the first!
        </div>
      ) : (
        <div className="divide-y divide-plugin-border">
          {topLevel.map((comment) => (
            <CommentItem
              key={comment._id}
              comment={comment}
              replies={repliesMap.get(comment._id) ?? []}
              currentUserId={currentUserId}
              onAddComment={onAddComment}
              onDeleteComment={onDeleteComment}
              depth={0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
