import { useState, useEffect } from 'react';
import { Bell, Check, X, RefreshCw } from 'lucide-react';
import { convex, getStoredSession } from '../../api/convex-client';
import { api } from '@convex/_generated/api';

interface PendingRequest {
  requestId: string;
  fromUserId: string;
  username: string;
  sentAt: number;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--color-bg-secondary)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-4)',
  border: '1px solid var(--color-border-default)',
};

const headingStyle: React.CSSProperties = {
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 'var(--tracking-wide)',
};

export function FriendRequests() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    const token = getStoredSession();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await convex.query(api.friends.getPendingRequests, {
        sessionToken: token,
      });
      setRequests(res as PendingRequest[]);
    } catch {
      // Error handled silently
    }
    setLoading(false);
  };

  const handleAccept = async (requestId: string) => {
    setProcessing(requestId);
    const token = getStoredSession();
    if (!token) return;

    try {
      await convex.mutation(api.friends.acceptFriendRequest, {
        sessionToken: token,
        requestId: requestId as any,
      });
      setRequests((prev) => prev.filter((r) => r.requestId !== requestId));
    } catch {
      // Error handled silently
    }
    setProcessing(null);
  };

  const handleReject = async (requestId: string) => {
    setProcessing(requestId);
    const token = getStoredSession();
    if (!token) return;

    try {
      await convex.mutation(api.friends.rejectFriendRequest, {
        sessionToken: token,
        requestId: requestId as any,
      });
      setRequests((prev) => prev.filter((r) => r.requestId !== requestId));
    } catch {
      // Error handled silently
    }
    setProcessing(null);
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>Loading requests...</div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell size={18} style={{ color: 'var(--color-accent-cyan)' }} />
          <h3 style={headingStyle}>Friend Requests</h3>
          {requests.length > 0 && (
            <span className="badge badge-cyan" style={{ animation: 'neon-pulse 2s ease-in-out infinite' }}>
              {requests.length}
            </span>
          )}
        </div>
        <button
          onClick={loadRequests}
          style={{ color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {requests.length === 0 ? (
        <div style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-4) 0' }}>
          No pending requests
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => (
            <div
              key={req.requestId}
              className="flex items-center justify-between"
              style={{ background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}
            >
              <div>
                <div style={{ color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{req.username}</div>
                <div style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-xs)' }}>{formatTime(req.sentAt)}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(req.requestId)}
                  disabled={processing === req.requestId}
                  className="btn btn-primary flex items-center gap-1"
                  style={{ fontSize: 'var(--text-sm)' }}
                  title="Accept"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => handleReject(req.requestId)}
                  disabled={processing === req.requestId}
                  className="btn btn-danger flex items-center gap-1"
                  style={{ fontSize: 'var(--text-sm)' }}
                  title="Reject"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
