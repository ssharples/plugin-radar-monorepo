import { useState, useEffect, useCallback } from 'react';
import { Send, Users, CheckCircle, AlertCircle } from 'lucide-react';
import * as convexClient from '../../api/convex-client';
import { api } from '@convex/_generated/api';

interface ShareChainModalProps {
  chainId: string;
  chainName: string;
  onClose: () => void;
}

interface Friend {
  userId: string;
  username: string;
}

export function ShareChainModal({ chainId, chainName, onClose }: ShareChainModalProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Escape key to close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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
      setFriends(res.map((f: any) => ({ userId: f.userId, username: f.username })));
    } catch (err) {
      console.error('Failed to load friends:', err);
    }
    setLoading(false);
  };

  const handleSend = async () => {
    if (!selectedFriend) return;

    setSending(true);
    setError('');
    setSuccess('');

    const token = localStorage.getItem('pluginradar_session');
    if (!token) {
      setError('Not logged in');
      setSending(false);
      return;
    }

    const friend = friends.find((f) => f.userId === selectedFriend);

    try {
      await convexClient.convex.mutation(api.privateChains.sendChain, {
        sessionToken: token,
        recipientIdentifier: friend?.username ?? selectedFriend,
        chainId: chainId as any,
      });
      setSuccess(`Chain sent to ${friend?.username ?? 'friend'}!`);
    } catch (err: any) {
      setError(err.message || 'Failed to send chain');
    }

    setSending(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-plugin-surface rounded-propane-lg p-6 max-w-md w-full mx-4 border border-plugin-accent animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Send size={18} className="text-plugin-accent" />
          <h2 className="text-xl font-mono font-bold text-white">Share Chain</h2>
        </div>

        <div className="bg-black/20 rounded p-3 mb-4">
          <div className="text-sm text-gray-400">Sharing</div>
          <div className="text-white font-medium">{chainName}</div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded p-3 mb-4 text-red-400 text-sm">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {success ? (
          <div className="text-center py-4">
            <CheckCircle size={40} className="text-green-400 mx-auto mb-3" />
            <div className="text-green-400 font-medium mb-4">{success}</div>
            <button
              onClick={onClose}
              className="w-full bg-plugin-accent hover:bg-plugin-accent-bright text-white rounded px-4 py-2"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {loading ? (
              <div className="text-gray-400 text-sm py-4 text-center">Loading friends...</div>
            ) : friends.length === 0 ? (
              <div className="text-gray-500 text-sm py-4 text-center">
                <Users size={24} className="mx-auto mb-2 opacity-50" />
                No friends yet. Add friends to share chains!
              </div>
            ) : (
              <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                <label className="block text-sm text-gray-400 mb-2">Select a friend</label>
                {friends.map((friend) => (
                  <button
                    key={friend.userId}
                    onClick={() => setSelectedFriend(friend.userId)}
                    className={`w-full flex items-center gap-3 p-3 rounded text-left transition-colors ${
                      selectedFriend === friend.userId
                        ? 'bg-plugin-accent/20 border border-plugin-accent/50'
                        : 'bg-black/20 border border-transparent hover:border-plugin-border'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-plugin-accent/30 flex items-center justify-center text-plugin-accent text-sm font-bold">
                      {friend.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-white text-sm">{friend.username}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 border border-plugin-border text-gray-400 hover:text-white rounded px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !selectedFriend}
                className={`flex-1 flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium ${
                  sending || !selectedFriend
                    ? 'bg-plugin-accent/50 text-plugin-accent cursor-not-allowed'
                    : 'bg-plugin-accent hover:bg-plugin-accent-bright text-white'
                }`}
              >
                <Send size={14} />
                {sending ? 'Sending...' : 'Send Chain'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
