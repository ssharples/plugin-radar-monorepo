import { useState } from 'react';
import { Search, UserPlus, CheckCircle, AlertCircle } from 'lucide-react';
import * as convexClient from '../../api/convex-client';
import { api } from '@convex/_generated/api';

interface SearchResult {
  _id: string;
  userId: string;
  username: string;
  matchedOn: string;
}

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

    const token = localStorage.getItem('pluginradar_session');
    if (!token) {
      setError('Not logged in');
      setSearching(false);
      return;
    }

    try {
      const res = await convexClient.convex.query(api.userProfiles.searchUsers, {
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

    const token = localStorage.getItem('pluginradar_session');
    if (!token) return;

    try {
      const result = await convexClient.convex.mutation(api.friends.sendFriendRequest, {
        sessionToken: token,
        friendId: userId as any,
      });
      if (result.status === 'accepted') {
        setSuccess(`You and ${username} are now friends!`);
      } else {
        setSuccess(`Friend request sent to ${username}`);
      }
      // Remove from results
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
    <div className="bg-plugin-surface rounded-lg p-4 border border-plugin-border">
      <div className="flex items-center gap-2 mb-4">
        <UserPlus size={18} className="text-plugin-accent" />
        <h3 className="text-white font-mono font-medium">Add Friend</h3>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by username, email, phone, or @instagram"
          className="flex-1 bg-black/30 border border-plugin-border rounded px-3 py-2 text-white text-sm"
        />
        <button
          onClick={handleSearch}
          disabled={searching || query.trim().length < 2}
          className="bg-plugin-accent hover:bg-plugin-accent-bright disabled:bg-plugin-accent/50 text-white rounded px-3 py-2"
        >
          <Search size={16} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm mb-3">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-green-400 text-sm mb-3">
          <CheckCircle size={14} />
          {success}
        </div>
      )}

      {searching && (
        <div className="text-gray-400 text-sm">Searching...</div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((user) => (
            <div
              key={user.userId}
              className="flex items-center justify-between bg-black/20 rounded p-3"
            >
              <div>
                <div className="text-white text-sm font-medium">{user.username}</div>
                <div className="text-gray-500 text-xs">
                  Found by {user.matchedOn}
                </div>
              </div>
              <button
                onClick={() => handleSendRequest(user.userId, user.username)}
                disabled={sending === user.userId}
                className={`flex items-center gap-1 text-sm rounded px-3 py-1 ${
                  sending === user.userId
                    ? 'bg-plugin-accent/50 text-plugin-accent cursor-wait'
                    : 'bg-plugin-accent hover:bg-plugin-accent-bright text-white'
                }`}
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
