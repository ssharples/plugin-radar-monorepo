import { useState, useEffect, useCallback, useRef } from 'react';
import { User, LogOut, Mail, Lock, UserPlus, ChevronDown, Inbox, Bell, Settings } from 'lucide-react';
import { useSyncStore } from '../../stores/syncStore';
import * as convexClient from '../../api/convex-client';
import { ReceivedChains } from '../ChainSharing/ReceivedChains';
import { FriendRequests } from '../Friends/FriendRequests';
import { AddFriend } from '../Friends/AddFriend';
import { api } from '@convex/_generated/api';

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
        className="relative w-6 h-6 rounded-full flex items-center justify-center transition-all"
        title={isLoggedIn ? 'Profile & Notifications' : 'Log in'}
      >
        {isLoggedIn ? (
          <LoggedInAvatar />
        ) : (
          <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
            <User className="w-3 h-3 text-plugin-muted" />
          </div>
        )}
        {badgeCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-plugin-surface animate-pulse" />
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
    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-plugin-accent to-plugin-accent-dim flex items-center justify-center">
      <span className="text-[10px] font-bold text-white leading-none">{initial}</span>
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

  return (
    <div className="w-72 bg-plugin-surface border border-plugin-border rounded-lg shadow-xl animate-slide-up">
      <div className="px-4 py-3 border-b border-plugin-border">
        <div className="flex gap-2">
          <button
            onClick={() => setMode('login')}
            className={`text-[11px] font-mono uppercase font-semibold px-2 py-0.5 rounded transition-colors ${
              mode === 'login' ? 'text-plugin-text bg-white/10' : 'text-plugin-dim hover:text-plugin-muted'
            }`}
          >
            Login
          </button>
          <button
            onClick={() => setMode('register')}
            className={`text-[11px] font-mono uppercase font-semibold px-2 py-0.5 rounded transition-colors ${
              mode === 'register' ? 'text-plugin-text bg-white/10' : 'text-plugin-dim hover:text-plugin-muted'
            }`}
          >
            Register
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-2.5">
        {displayError && (
          <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
            {displayError}
          </div>
        )}

        {mode === 'register' && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full bg-black/40 border border-plugin-border rounded font-mono px-2.5 py-1.5 text-xs text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:ring-1 focus:ring-plugin-accent"
          />
        )}

        <div className="relative">
          <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-plugin-dim" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full bg-black/40 border border-plugin-border rounded font-mono pl-7 pr-2.5 py-1.5 text-xs text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:ring-1 focus:ring-plugin-accent"
          />
        </div>

        <div className="relative">
          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-plugin-dim" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full bg-black/40 border border-plugin-border rounded font-mono pl-7 pr-2.5 py-1.5 text-xs text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:ring-1 focus:ring-plugin-accent"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !email || !password}
          className="w-full bg-plugin-accent hover:bg-plugin-accent-dim text-black rounded px-3 py-1.5 text-[11px] font-mono uppercase font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

  return (
    <div className="w-80 bg-plugin-surface border border-plugin-border rounded-lg shadow-xl animate-slide-up max-h-[70vh] flex flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-plugin-border flex-shrink-0">
        <button
          onClick={() => setTab('account')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-mono uppercase font-semibold transition-colors ${
            tab === 'account' ? 'text-plugin-text border-b-2 border-plugin-accent' : 'text-plugin-dim hover:text-plugin-muted'
          }`}
        >
          <User className="w-3 h-3" />
          Account
        </button>
        <button
          onClick={() => setTab('inbox')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-mono uppercase font-semibold transition-colors relative ${
            tab === 'inbox' ? 'text-plugin-text border-b-2 border-plugin-accent' : 'text-plugin-dim hover:text-plugin-muted'
          }`}
        >
          <Inbox className="w-3 h-3" />
          Inbox
          {inboxCount > 0 && (
            <span className="bg-red-500 text-white text-[9px] rounded-full px-1 min-w-[14px] h-[14px] flex items-center justify-center leading-none">
              {inboxCount}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
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
    const token = localStorage.getItem('pluginradar_session');
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

    const token = localStorage.getItem('pluginradar_session');
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
          <div className="text-xs font-mono text-plugin-text font-medium">
            {loading ? '...' : username || 'No username set'}
          </div>
          <div className="text-[10px] text-plugin-dim">{email}</div>
        </div>
      </div>

      {/* Edit profile toggle */}
      <button
        onClick={() => setShowProfile(!showProfile)}
        className="w-full flex items-center justify-between text-[11px] font-mono text-plugin-muted hover:text-plugin-text border border-plugin-border rounded px-2.5 py-1.5 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Settings className="w-3 h-3" />
          Edit Profile
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${showProfile ? 'rotate-180' : ''}`} />
      </button>

      {showProfile && (
        <div className="space-y-2 pl-1">
          {error && (
            <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
              {error}
            </div>
          )}
          {success && (
            <div className="text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 rounded px-2 py-1">
              Profile saved!
            </div>
          )}
          <div>
            <label className="block text-[10px] font-mono text-plugin-dim mb-0.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your_username"
              className="w-full bg-black/40 border border-plugin-border rounded font-mono px-2 py-1 text-xs text-plugin-text focus:outline-none focus:ring-1 focus:ring-plugin-accent"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-plugin-dim mb-0.5">Phone</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1 555-0123"
              className="w-full bg-black/40 border border-plugin-border rounded font-mono px-2 py-1 text-xs text-plugin-text focus:outline-none focus:ring-1 focus:ring-plugin-accent"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-plugin-dim mb-0.5">Instagram</label>
            <input
              type="text"
              value={instagramHandle}
              onChange={(e) => setInstagramHandle(e.target.value)}
              placeholder="@yourhandle"
              className="w-full bg-black/40 border border-plugin-border rounded font-mono px-2 py-1 text-xs text-plugin-text focus:outline-none focus:ring-1 focus:ring-plugin-accent"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !username.trim()}
            className="w-full bg-plugin-accent hover:bg-plugin-accent-dim text-black rounded px-2 py-1 text-[10px] font-mono uppercase font-bold transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      )}

      {/* Logout */}
      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-1.5 text-[11px] font-mono text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded px-2.5 py-1.5 transition-colors"
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
          className="w-full flex items-center justify-between text-[11px] font-mono text-plugin-muted hover:text-plugin-text border border-plugin-border rounded px-2.5 py-1.5 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <UserPlus className="w-3 h-3" />
            Add Friend
          </span>
          <ChevronDown className={`w-3 h-3 transition-transform ${showAddFriend ? 'rotate-180' : ''}`} />
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
