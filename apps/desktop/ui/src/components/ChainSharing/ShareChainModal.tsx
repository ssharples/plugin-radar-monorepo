import { useState, useEffect, useCallback } from 'react';
import { Send, Users, CheckCircle, AlertCircle } from 'lucide-react';
import { convex, getStoredSession } from '../../api/convex-client';
import { api } from '@convex/_generated/api';
import { useKeyboardStore, ShortcutPriority } from '../../stores/keyboardStore';

interface ShareChainModalProps {
  chainId: string;
  chainName: string;
  onClose: () => void;
}

interface Friend {
  userId: string;
  username: string;
}

const modalOverlayStyle: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(4px)',
};

const modalPanelStyle: React.CSSProperties = {
  maxWidth: '28rem',
  width: '100%',
  margin: '0 1rem',
  borderRadius: 'var(--radius-xl)',
  padding: 'var(--space-6)',
  border: '1px solid rgba(222, 255, 10, 0.15)',
};

export function ShareChainModal({ chainId, chainName, onClose }: ShareChainModalProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Escape key to close (modal priority)
  useEffect(() => {
    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    return registerShortcut({
      id: 'share-chain-modal-escape',
      key: 'Escape',
      priority: ShortcutPriority.MODAL,
      allowInInputs: true,
      handler: (e) => {
        e.preventDefault();
        onClose();
      }
    });
  }, [onClose]);

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
      setFriends(res.map((f: any) => ({ userId: f.userId, username: f.username })));
    } catch {
      // Failed to load friends
    }
    setLoading(false);
  };

  const handleSend = async () => {
    if (!selectedFriend) return;

    setSending(true);
    setError('');
    setSuccess('');

    const token = getStoredSession();
    if (!token) {
      setError('Not logged in');
      setSending(false);
      return;
    }

    const friend = friends.find((f) => f.userId === selectedFriend);

    try {
      await convex.mutation(api.privateChains.sendChain, {
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
    <div className="fixed inset-0 flex items-center justify-center z-50 fade-in" style={modalOverlayStyle} onClick={onClose}>
      <div className="glass scale-in" style={modalPanelStyle} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Send size={18} style={{ color: 'var(--color-accent-cyan)' }} />
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xl)', fontWeight: 700, color: '#deff0a', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)' }}>
            Share Chain
          </h2>
        </div>

        <div style={{ background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)', border: '1px solid var(--color-border-subtle)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Sharing</div>
          <div style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{chainName}</div>
        </div>

        {error && (
          <div className="flex items-center gap-2" style={{ background: 'rgba(255, 0, 51, 0.1)', border: '1px solid rgba(255, 0, 51, 0.3)', borderRadius: 'var(--radius-base)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)', color: 'var(--color-status-error)', fontSize: 'var(--text-sm)' }}>
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {success ? (
          <div className="text-center" style={{ padding: 'var(--space-4) 0' }}>
            <CheckCircle size={40} style={{ color: 'var(--color-status-active)', margin: '0 auto var(--space-3)' }} />
            <div style={{ color: 'var(--color-status-active)', fontWeight: 600, marginBottom: 'var(--space-4)', fontFamily: 'var(--font-mono)' }}>{success}</div>
            <button onClick={onClose} className="btn btn-primary w-full">Done</button>
          </div>
        ) : (
          <>
            {loading ? (
              <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', padding: 'var(--space-4) 0', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>Loading friends...</div>
            ) : friends.length === 0 ? (
              <div style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-sm)', padding: 'var(--space-4) 0', textAlign: 'center' }}>
                <Users size={24} style={{ margin: '0 auto 8px', opacity: 0.5, color: 'var(--color-text-disabled)' }} />
                No friends yet. Add friends to share chains!
              </div>
            ) : (
              <div className="space-y-2 mb-4 max-h-60 overflow-y-auto scrollbar-cyber">
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: '8px' }}>Select a friend</label>
                {friends.map((friend) => (
                  <button
                    key={friend.userId}
                    onClick={() => setSelectedFriend(friend.userId)}
                    className="w-full flex items-center gap-3 fast-snap"
                    style={{
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      textAlign: 'left',
                      background: selectedFriend === friend.userId ? 'rgba(222, 255, 10, 0.1)' : 'var(--color-bg-input)',
                      border: selectedFriend === friend.userId ? '1px solid rgba(222, 255, 10, 0.4)' : '1px solid transparent',
                      cursor: 'pointer',
                      transition: 'all var(--duration-fast)',
                    }}
                  >
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(222, 255, 10, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent-cyan)', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
                      {friend.username.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>{friend.username}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="btn flex-1">Cancel</button>
              <button
                onClick={handleSend}
                disabled={sending || !selectedFriend}
                className={`btn flex-1 flex items-center justify-center gap-2 ${sending || !selectedFriend ? '' : 'btn-primary'}`}
                style={sending || !selectedFriend ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
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
