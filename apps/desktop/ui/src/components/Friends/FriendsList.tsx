import { useState, useEffect } from 'react';
import { Users, UserMinus, RefreshCw } from 'lucide-react';
import { convex, getStoredSession } from '../../api/convex-client';
import { api } from '@convex/_generated/api';

interface Friend {
  friendshipId: string;
  userId: string;
  username: string;
  acceptedAt?: number;
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

export function FriendsList() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  useEffect(() => {
    loadFriends();
  }, []);

  const loadFriends = async () => {
    const token = getStoredSession();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await convex.query(api.friends.getFriends, {
        sessionToken: token,
      });
      setFriends(res as Friend[]);
    } catch {
      // Failed to load friends
    }
    setLoading(false);
  };

  const handleRemove = async (userId: string) => {
    setRemoving(userId);
    setConfirmRemoveId(null);
    const token = getStoredSession();
    if (!token) return;

    try {
      await convex.mutation(api.friends.removeFriend, {
        sessionToken: token,
        friendId: userId as any,
      });
      setFriends((prev) => prev.filter((f) => f.userId !== userId));
    } catch {
      // Failed to remove friend
    }
    setRemoving(null);
  };

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>Loading friends...</div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={18} style={{ color: 'var(--color-accent-cyan)' }} />
          <h3 style={headingStyle}>Friends</h3>
          <span style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>({friends.length})</span>
        </div>
        <button
          onClick={loadFriends}
          style={{ color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {friends.length === 0 ? (
        <div style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-4) 0' }}>
          No friends yet. Search for users to add!
        </div>
      ) : (
        <div className="space-y-2">
          {friends.map((friend) => (
            <div
              key={friend.userId}
              className="flex items-center justify-between"
              style={{ background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}
            >
              <div style={{ color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{friend.username}</div>
              {confirmRemoveId === friend.userId ? (
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Remove?</span>
                  <button
                    onClick={() => handleRemove(friend.userId)}
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--color-status-error)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmRemoveId(null)}
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmRemoveId(friend.userId)}
                  disabled={removing === friend.userId}
                  style={{
                    color: 'var(--color-text-disabled)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    opacity: removing === friend.userId ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-status-error)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-disabled)')}
                  title="Remove friend"
                >
                  <UserMinus size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
