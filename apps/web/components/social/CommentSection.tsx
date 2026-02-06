"use client";

import { useState } from "react";

export interface Comment {
  _id: string;
  authorName: string;
  userId: string;
  content: string;
  createdAt: number;
  parentCommentId?: string;
}

interface CommentSectionProps {
  comments: Comment[];
  currentUserId: string | null;
  onAddComment: (content: string, parentId?: string) => Promise<void>;
  onDeleteComment: (id: string) => Promise<void>;
  loading?: boolean;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
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
  onDeleteComment: (id: string) => Promise<void>;
  depth: number;
}) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      await onAddComment(replyText.trim(), comment._id);
      setReplyText("");
      setShowReply(false);
    } finally {
      setSubmitting(false);
    }
  };

  const isOwn = currentUserId && comment.userId === currentUserId;

  return (
    <div className={depth > 0 ? "ml-4 border-l border-white/[0.06] pl-3" : ""}>
      <div className="py-2.5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-stone-300">
            {comment.authorName}
          </span>
          <span className="text-xs text-stone-500">
            {formatRelativeTime(comment.createdAt)}
          </span>
        </div>
        <p className="text-sm text-stone-200 whitespace-pre-wrap break-words">
          {comment.content}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          {currentUserId && depth < 2 && (
            <button
              onClick={() => setShowReply(!showReply)}
              className="text-xs text-stone-400 hover:text-stone-200 transition-colors"
            >
              Reply
            </button>
          )}
          {isOwn && (
            <button
              onClick={() => onDeleteComment(comment._id)}
              className="text-xs text-stone-400 hover:text-red-400 transition-colors"
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
              onKeyDown={(e) => e.key === "Enter" && handleReply()}
              placeholder="Write a reply..."
              className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-amber-500 focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleReply}
              disabled={submitting || !replyText.trim()}
              className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-900 font-medium rounded-lg transition-colors"
            >
              {submitting ? "..." : "Reply"}
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
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      await onAddComment(newComment.trim());
      setNewComment("");
    } finally {
      setSubmitting(false);
    }
  };

  // Build thread tree from flat list
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
      <h3
        className="text-lg font-semibold text-stone-100 mb-4"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Comments {comments.length > 0 && `(${comments.length})`}
      </h3>

      {currentUserId && (
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Add a comment..."
            className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-500 focus:border-amber-500 focus:outline-none"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !newComment.trim()}
            className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-900 font-semibold rounded-lg transition-colors shadow-lg shadow-amber-500/20"
          >
            {submitting ? "..." : "Comment"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-stone-500 py-6 text-center">
          Loading comments...
        </div>
      ) : topLevel.length === 0 ? (
        <div className="text-sm text-stone-500 py-6 text-center">
          No comments yet. Be the first!
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
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
