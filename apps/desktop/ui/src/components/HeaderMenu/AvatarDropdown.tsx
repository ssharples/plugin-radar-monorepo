import { useState, useEffect, useCallback, useRef } from 'react';
import { User, LogOut, Mail, Lock, UserPlus, ChevronDown, Inbox, Bell, Settings } from 'lucide-react';
import { useSyncStore } from '../../stores/syncStore';
import * as convexClient from '../../api/convex-client';
const { getStoredSession } = convexClient;
import { ReceivedChains } from '../ChainSharing/ReceivedChains';
import { FriendRequests } from '../Friends/FriendRequests';
import { AddFriend } from '../Friends/AddFriend';
import { api } from '@convex/_generated/api';

/* Shared glass panel style */
const glassPanel: React.CSSProperties = {
  background: 'rgba(15, 15, 15, 0.9)',
  backdropFilter: 'blur(12px)',
  border: '1px solid var(--color-border-default)',
  boxShadow: 'var(--shadow-elevated)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontFamily: 'var(--font-mono)',
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: 'var(--tracking-wide)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-bg-input)',
  border: '1px solid var(--color-border-default)',
  borderRadius: 'var(--radius-base)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-primary)',
  padding: '6px 10px',
  outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
};

interface AvatarDropdownProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function AvatarDropdown({ isOpen, onToggle, onClose }: AvatarDropdownProps) {
  const { isLoggedIn } = useSyncStore();
  const [badgeCount, setBadgeCount] = useState(0);

  // Poll for notification counts
  useEffect(() => {
    if (!isLoggedIn) {
      setBadgeCount(0);
      return;
    }

    const poll = async () => {
      try {
        const [chainCount, friendCount] = await Promise.all([
          convexClient.getPendingChainCount(),
          convexClient.getPendingFriendRequestCount(),
        ]);
        setBadgeCount(chainCount + friendCount);
      } catch {
        // Silently ignore polling errors
      }
    };

    poll();
    const interval = setInterval(poll, 60000);
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  return (
    <div className="relative flex items-center gap-1.5 mr-1">
      <button
        onClick={onToggle}
        className="relative w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150"
        title={isLoggedIn ? 'Profile & Notifications' : 'Log in'}
        style={{
          border: isOpen ? '1px solid var(--color-accent-cyan)' : '1px solid transparent',
          boxShadow: isOpen ? '0 0 8px rgba(222, 255, 10, 0.3)' : 'none',
        }}
      >
        {isLoggedIn ? (
          <LoggedInAvatar />
        ) : (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border-default)',
            }}
          >
            <User className="w-3 h-3" style={{ color: 'var(--color-text-secondary)' }} />
          </div>
        )}
        {badgeCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full animate-pulse"
            style={{
              background: 'var(--color-accent-magenta)',
              border: '1px solid var(--color-bg-primary)',
            }}
          />
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5">
          {isLoggedIn ? (
            <LoggedInPanel onClose={onClose} onBadgeUpdate={setBadgeCount} />
          ) : (
            <LoginPanel onClose={onClose} />
          )}
        </div>
      )}
    </div>
  );
}

function LoggedInAvatar() {
  const [initial, setInitial] = useState('?');

  useEffect(() => {
    loadInitial();
  }, []);

  const loadInitial = async () => {
    try {
      const user = await convexClient.getCurrentUser();
      if (user?.name) {
        setInitial(user.name.charAt(0).toUpperCase());
      } else if (user?.email) {
        setInitial(user.email.charAt(0).toUpperCase());
      }
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, var(--color-accent-cyan), var(--color-accent-purple))',
      }}
    >
      <span
        style={{
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          color: 'var(--color-bg-primary)',
          lineHeight: 1,
        }}
      >
        {initial}
      </span>
    </div>
  );
}

// ─── Login/Register Panel ─────────────────────────────

function LoginPanel({ onClose }: { onClose: () => void }) {
  const { login, register, error } = useSyncStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setSubmitting(true);

    let success: boolean;
    if (mode === 'login') {
      success = await login(email, password);
    } else {
      if (!name.trim()) {
        setLocalError('Name is required');
        setSubmitting(false);
        return;
      }
      success = await register(email, password, name.trim());
    }

    setSubmitting(false);
    if (!success) {
      setLocalError(error || (mode === 'login' ? 'Login failed' : 'Registration failed'));
    }
    // If success, parent re-renders with LoggedInPanel
  };

  const displayError = localError || error;

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    fontSize: 'var(--text-xs)',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 'var(--tracking-wide)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-base)',
    color: isActive ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
    background: isActive ? 'rgba(222, 255, 10, 0.1)' : 'transparent',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 150ms',
  });

  return (
    <div className="w-80 rounded-md scale-in" style={glassPanel}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
        <div className="flex gap-2">
          <button onClick={() => setMode('login')} style={tabStyle(mode === 'login')}>
            Login
          </button>
          <button onClick={() => setMode('register')} style={tabStyle(mode === 'register')}>
            Register
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-2.5">
        {displayError && (
          <div
            className="rounded px-2 py-1.5"
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-status-error)',
              background: 'rgba(255, 0, 51, 0.1)',
              border: '1px solid rgba(255, 0, 51, 0.2)',
            }}
          >
            {displayError}
          </div>
        )}

        {mode === 'register' && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            style={inputStyle}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent-cyan)';
              e.currentTarget.style.boxShadow = '0 0 0 1px var(--color-accent-cyan)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-default)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        )}

        <div className="relative">
          <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--color-text-tertiary)' }} />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            style={{ ...inputStyle, paddingLeft: '28px' }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent-cyan)';
              e.currentTarget.style.boxShadow = '0 0 0 1px var(--color-accent-cyan)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-default)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        <div className="relative">
          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--color-text-tertiary)' }} />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            style={{ ...inputStyle, paddingLeft: '28px' }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent-cyan)';
              e.currentTarget.style.boxShadow = '0 0 0 1px var(--color-accent-cyan)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-default)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !email || !password}
          className="btn btn-primary w-full"
          style={{ opacity: submitting || !email || !password ? 0.4 : 1 }}
        >
          {submitting ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
        </button>
      </form>
    </div>
  );
}

// ─── Logged-In Panel (Account + Inbox) ────────────────

function LoggedInPanel({ onClose, onBadgeUpdate }: { onClose: () => void; onBadgeUpdate: (count: number) => void }) {
  const { logout } = useSyncStore();
  const [tab, setTab] = useState<'account' | 'inbox'>('account');
  const [inboxCount, setInboxCount] = useState(0);
  const [chainBadge, setChainBadge] = useState(0);
  const [friendBadge, setFriendBadge] = useState(0);
  const [showAddFriend, setShowAddFriend] = useState(false);

  // Track inbox badge from child components
  const handleChainBadge = useCallback((count: number) => {
    setChainBadge(count);
  }, []);

  useEffect(() => {
    // Friend requests — poll once to get initial count
    convexClient.getPendingFriendRequestCount().then(setFriendBadge).catch(() => {});
  }, []);

  useEffect(() => {
    const total = chainBadge + friendBadge;
    setInboxCount(total);
    onBadgeUpdate(total);
  }, [chainBadge, friendBadge, onBadgeUpdate]);

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  const tabBtnStyle = (isActive: boolean): React.CSSProperties => ({
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 12px',
    fontSize: 'var(--text-xs)',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 'var(--tracking-wide)',
    color: isActive ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
    borderBottom: isActive ? '2px solid var(--color-accent-cyan)' : '2px solid transparent',
    background: 'transparent',
    border: 'none',
    borderBottomStyle: 'solid',
    borderBottomWidth: '2px',
    borderBottomColor: isActive ? 'var(--color-accent-cyan)' : 'transparent',
    cursor: 'pointer',
    transition: 'all 150ms',
  });

  return (
    <div
      className="w-80 rounded-md scale-in max-h-[70vh] flex flex-col"
      style={glassPanel}
    >
      {/* Tab bar */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
        <button onClick={() => setTab('account')} style={tabBtnStyle(tab === 'account')}>
          <User className="w-3 h-3" />
          Account
        </button>
        <button
          onClick={() => setTab('inbox')}
          style={{ ...tabBtnStyle(tab === 'inbox'), position: 'relative' }}
        >
          <Inbox className="w-3 h-3" />
          Inbox
          {inboxCount > 0 && (
            <span
              className="rounded-full flex items-center justify-center"
              style={{
                background: 'var(--color-accent-magenta)',
                color: '#fff',
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                padding: '0 4px',
                minWidth: '14px',
                height: '14px',
                lineHeight: 1,
              }}
            >
              {inboxCount}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-cyber">
        {tab === 'account' ? (
          <AccountTab onLogout={handleLogout} />
        ) : (
          <InboxTab
            onChainBadge={handleChainBadge}
            showAddFriend={showAddFriend}
            onToggleAddFriend={() => setShowAddFriend(!showAddFriend)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Account Tab ──────────────────────────────────────

function AccountTab({ onLogout }: { onLogout: () => void }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const token = getStoredSession();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const profile = await convexClient.convex.query(api.userProfiles.getProfile, {
        sessionToken: token,
      });
      if (profile) {
        setUsername(profile.username || '');
        setEmail(profile.email || '');
        setPhoneNumber(profile.phoneNumber || '');
        setInstagramHandle(profile.instagramHandle || '');
      }
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setError('');
    setSuccess(false);
    setSaving(true);

    const token = getStoredSession();
    if (!token) {
      setError('Not logged in');
      setSaving(false);
      return;
    }

    try {
      await convexClient.convex.mutation(api.userProfiles.upsertProfile, {
        sessionToken: token,
        username: username.trim(),
        email: email.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        instagramHandle: instagramHandle.trim() || undefined,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || String(err));
    }

    setSaving(false);
  };

  return (
    <div className="p-4 space-y-3">
      {/* Username display */}
      <div className="flex items-center justify-between">
        <div>
          <div
            style={{
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
            }}
          >
            {loading ? '...' : username || 'No username set'}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{email}</div>
        </div>
      </div>

      {/* Edit profile toggle */}
      <button
        onClick={() => setShowProfile(!showProfile)}
        className="w-full flex items-center justify-between rounded px-2.5 py-1.5 transition-all duration-150"
        style={{
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-secondary)',
          border: '1px solid var(--color-border-default)',
          background: 'transparent',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wide)',
        }}
      >
        <span className="flex items-center gap-1.5">
          <Settings className="w-3 h-3" />
          Edit Profile
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${showProfile ? 'rotate-180' : ''}`} />
      </button>

      {showProfile && (
        <div className="space-y-2 pl-1">
          {error && (
            <div
              className="rounded px-2 py-1"
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-status-error)',
                background: 'rgba(255, 0, 51, 0.1)',
                border: '1px solid rgba(255, 0, 51, 0.2)',
              }}
            >
              {error}
            </div>
          )}
          {success && (
            <div
              className="rounded px-2 py-1"
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-status-active)',
                background: 'rgba(0, 255, 136, 0.1)',
                border: '1px solid rgba(0, 255, 136, 0.2)',
              }}
            >
              Profile saved!
            </div>
          )}
          <div>
            <label className="block mb-0.5" style={labelStyle}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your_username"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-cyan)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
            />
          </div>
          <div>
            <label className="block mb-0.5" style={labelStyle}>Phone</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1 555-0123"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-cyan)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
            />
          </div>
          <div>
            <label className="block mb-0.5" style={labelStyle}>Instagram</label>
            <input
              type="text"
              value={instagramHandle}
              onChange={(e) => setInstagramHandle(e.target.value)}
              placeholder="@yourhandle"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-cyan)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !username.trim()}
            className="btn btn-primary w-full"
            style={{ opacity: saving || !username.trim() ? 0.4 : 1 }}
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      )}

      {/* Logout */}
      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-1.5 rounded px-2.5 py-1.5 transition-all duration-150"
        style={{
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wide)',
          color: 'var(--color-status-error)',
          border: '1px solid rgba(255, 0, 51, 0.2)',
          background: 'transparent',
        }}
      >
        <LogOut className="w-3 h-3" />
        Log Out
      </button>
    </div>
  );
}

// ─── Inbox Tab ────────────────────────────────────────

function InboxTab({
  onChainBadge,
  showAddFriend,
  onToggleAddFriend,
}: {
  onChainBadge: (count: number) => void;
  showAddFriend: boolean;
  onToggleAddFriend: () => void;
}) {
  return (
    <div className="p-3 space-y-3">
      {/* Received Chains */}
      <div className="[&>div]:border-0 [&>div]:p-0 [&>div]:bg-transparent">
        <ReceivedChains onBadgeCount={onChainBadge} />
      </div>

      {/* Friend Requests */}
      <div className="[&>div]:border-0 [&>div]:p-0 [&>div]:bg-transparent">
        <FriendRequests />
      </div>

      {/* Add Friend expandable */}
      <div>
        <button
          onClick={onToggleAddFriend}
          className="w-full flex items-center justify-between rounded px-2.5 py-1.5 transition-all duration-150"
          style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-default)',
            background: 'transparent',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wide)',
          }}
        >
          <span className="flex items-center gap-1.5">
            <UserPlus className="w-3 h-3" />
            Add Friend
          </span>
          <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${showAddFriend ? 'rotate-180' : ''}`} />
        </button>
        {showAddFriend && (
          <div className="mt-2 [&>div]:border-0 [&>div]:p-0 [&>div]:bg-transparent">
            <AddFriend />
          </div>
        )}
      </div>
    </div>
  );
}
