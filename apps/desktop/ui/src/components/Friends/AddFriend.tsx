import { useState } from 'react';
import { Search, UserPlus, CheckCircle, AlertCircle } from 'lucide-react';
import { convex, getStoredSession } from '../../api/convex-client';
import { api } from '@convex/_generated/api';

interface SearchResult {
  _id: string;
  userId: string;
  username: string;
  matchedOn: string;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--color-bg-secondary)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-4)',
  border: '1px solid var(--color-border-default)',
};

const headingStyle: React.CSSProperties = {
  color: '#deff0a',
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 'var(--tracking-wide)',
};

export function AddFriend() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    setError('');
    setResults([]);

    const token = getStoredSession();
    if (!token) {
      setError('Not logged in');
      setSearching(false);
      return;
    }

    try {
      const res = await convex.query(api.userProfiles.searchUsers, {
        sessionToken: token,
        query: query.trim(),
      });
      setResults(res as SearchResult[]);
      if (res.length === 0) {
        setError('No users found');
      }
    } catch (err: any) {
      setError(err.message || 'Search failed');
    }

    setSearching(false);
  };

  const handleSendRequest = async (userId: string, username: string) => {
    setSending(userId);
    setError('');
    setSuccess('');

    const token = getStoredSession();
    if (!token) return;

    try {
      const result = await convex.mutation(api.friends.sendFriendRequest, {
        sessionToken: token,
        friendId: userId as any,
      });
      if (result.status === 'accepted') {
        setSuccess(`You and ${username} are now friends!`);
      } else {
        setSuccess(`Friend request sent to ${username}`);
      }
      setResults((prev) => prev.filter((r) => r.userId !== userId));
    } catch (err: any) {
      setError(err.message || 'Failed to send request');
    }

    setSending(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div style={cardStyle}>
      <div className="flex items-center gap-2 mb-4">
        <UserPlus size={18} style={{ color: 'var(--color-accent-cyan)' }} />
        <h3 style={headingStyle}>Add Friend</h3>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by username, email, phone, or @instagram"
          className="input flex-1"
        />
        <button
          onClick={handleSearch}
          disabled={searching || query.trim().length < 2}
          className="btn btn-primary"
        >
          <Search size={16} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--color-status-error)', fontSize: 'var(--text-sm)' }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--color-status-active)', fontSize: 'var(--text-sm)' }}>
          <CheckCircle size={14} />
          {success}
        </div>
      )}

      {searching && (
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>Searching...</div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((user) => (
            <div
              key={user.userId}
              className="flex items-center justify-between"
              style={{ background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}
            >
              <div>
                <div style={{ color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{user.username}</div>
                <div style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-xs)' }}>
                  Found by {user.matchedOn}
                </div>
              </div>
              <button
                onClick={() => handleSendRequest(user.userId, user.username)}
                disabled={sending === user.userId}
                className={`btn flex items-center gap-1 ${sending === user.userId ? '' : 'btn-primary'}`}
                style={sending === user.userId ? { opacity: 0.6, cursor: 'wait' } : { fontSize: 'var(--text-sm)' }}
              >
                <UserPlus size={14} />
                {sending === user.userId ? 'Sending...' : 'Add'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
