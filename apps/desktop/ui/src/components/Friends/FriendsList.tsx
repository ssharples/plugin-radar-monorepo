import { useState, useEffect } from 'react';
import { Users, UserMinus, RefreshCw } from 'lucide-react';
import * as convexClient from '../../api/convex-client';
import { api } from '@convex/_generated/api';

interface Friend {
  friendshipId: string;
  userId: string;
  username: string;
  acceptedAt?: number;
}

export function FriendsList() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    loadFriends();
  }, []);

  const loadFriends = async () => {
    const token = localStorage.getItem('pluginradar_session');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await convexClient.convex.query(api.friends.getFriends, {
        sessionToken: token,
      });
      setFriends(res as Friend[]);
    } catch (err) {
      console.error('Failed to load friends:', err);
    }
    setLoading(false);
  };

  const handleRemove = async (userId: string, username: string) => {
    if (!confirm(`Remove ${username} from friends?`)) return;

    setRemoving(userId);
    const token = localStorage.getItem('pluginradar_session');
    if (!token) return;

    try {
      await convexClient.convex.mutation(api.friends.removeFriend, {
        sessionToken: token,
        friendId: userId as any,
      });
      setFriends((prev) => prev.filter((f) => f.userId !== userId));
    } catch (err) {
      console.error('Failed to remove friend:', err);
    }
    setRemoving(null);
  };

  if (loading) {
    return (
      <div className="bg-plugin-surface rounded-lg p-4 border border-plugin-border">
        <div className="text-plugin-muted text-sm">Loading friends...</div>
      </div>
    );
  }

  return (
    <div className="bg-plugin-surface rounded-lg p-4 border border-plugin-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-plugin-accent" />
          <h3 className="text-plugin-text  font-medium">Friends</h3>
          <span className="text-plugin-dim text-xs">({friends.length})</span>
        </div>
        <button
          onClick={loadFriends}
          className="text-plugin-muted hover:text-plugin-text p-1"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {friends.length === 0 ? (
        <div className="text-plugin-dim text-sm text-center py-4">
          No friends yet. Search for users to add!
        </div>
      ) : (
        <div className="space-y-2">
          {friends.map((friend) => (
            <div
              key={friend.userId}
              className="flex items-center justify-between bg-black/20 rounded p-3"
            >
              <div className="text-plugin-text text-sm font-medium">{friend.username}</div>
              <button
                onClick={() => handleRemove(friend.userId, friend.username)}
                disabled={removing === friend.userId}
                className="text-plugin-dim hover:text-red-400 disabled:opacity-50 p-1"
                title="Remove friend"
              >
                <UserMinus size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
