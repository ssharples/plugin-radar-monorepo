import { useState, useEffect } from 'react';
import { Cloud } from 'lucide-react';
import { useSyncStore } from '../../stores/syncStore';
import { usePluginStore } from '../../stores/pluginStore';

export function CloudSync() {
  const {
    isLoggedIn,
    isSyncing,
    lastSyncAt,
    syncedCount,
    inCatalog,
    newPlugins,
    error,
    initialize,
    login,
    register,
    logout,
    syncPlugins
  } = useSyncStore();

  const { plugins } = usePluginStore();

  const [showAuth, setShowAuth] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const success = isRegister
      ? await register(email, password, name)
      : await login(email, password);

    if (success) {
      setShowAuth(false);
      setEmail('');
      setPassword('');
      setName('');
    } else {
      setAuthError(error || 'Authentication failed');
    }
  };

  const handleSync = async () => {
    if (plugins.length === 0) return;
    await syncPlugins(plugins);
  };

  // Format last sync time
  const formatLastSync = () => {
    if (!lastSyncAt) return null;
    const diff = Date.now() - lastSyncAt;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return new Date(lastSyncAt).toLocaleTimeString();
  };

  if (!isLoggedIn) {
    if (showAuth) {
      // "Forgot password" view
      if (showForgotPassword) {
        return (
          <div
            className="card"
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
            }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-lg)',
                fontWeight: 700,
                color: '#deff0a',
                marginBottom: 'var(--space-2)',
              }}
            >
              RESET PASSWORD
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
              To reset your password, visit the ProChain website:
            </p>
            <a
              href="https://pluginradar.com/forgot-password"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary w-full mb-2"
              style={{ display: 'flex', justifyContent: 'center', textDecoration: 'none' }}
            >
              Open Reset Page
            </a>
            <button
              type="button"
              onClick={() => setShowForgotPassword(false)}
              className="w-full text-center"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-accent-cyan)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Back to Sign In
            </button>
          </div>
        );
      }

      return (
        <div
          className="glass"
          style={{
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            borderColor: 'var(--color-accent-cyan)',
          }}
        >
          <form onSubmit={handleAuth} className="space-y-3">
            <h3
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-lg)',
                fontWeight: 700,
                color: '#deff0a',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
              }}
            >
              {isRegister ? 'Create Account' : 'Sign In'}
            </h3>

            {authError && (
              <div style={{ color: 'var(--color-status-error)', fontSize: 'var(--text-sm)' }}>{authError}</div>
            )}

            {isRegister && (
              <input
                type="text"
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input w-full"
              />
            )}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input w-full"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input w-full"
            />

            {!isRegister && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-tertiary)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent-cyan)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
                >
                  Forgot password?
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary flex-1">
                {isRegister ? 'Create Account' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => setShowAuth(false)}
                className="btn"
              >
                Cancel
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsRegister(!isRegister)}
              className="w-full text-center"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-accent-cyan)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
            </button>
          </form>
        </div>
      );
    }

    return (
      <button
        onClick={() => setShowAuth(true)}
        className="btn"
        style={{
          borderColor: 'rgba(222, 255, 10, 0.25)',
          color: 'var(--color-accent-cyan)',
          background: 'rgba(222, 255, 10, 0.08)',
          fontSize: 'var(--text-xs)',
        }}
      >
        <Cloud className="w-3.5 h-3.5" style={{ marginRight: '6px' }} />
        Connect
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={isSyncing || plugins.length === 0}
        className={`btn ${isSyncing ? '' : 'btn-primary'}`}
        style={isSyncing ? { opacity: 0.6, cursor: 'wait', color: 'var(--color-accent-cyan)' } : undefined}
      >
        <Cloud className={`w-4 h-4 ${isSyncing ? 'animate-pulse' : ''}`} style={{ marginRight: '6px' }} />
        {isSyncing ? 'Syncing...' : 'Sync to Cloud'}
      </button>

      {lastSyncAt && (
        <div style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
          <span>{syncedCount} synced</span>
          <span className="mx-1">&bull;</span>
          <span style={{ color: 'var(--color-status-active)' }}>{inCatalog} in database</span>
          {newPlugins.length > 0 && (
            <>
              <span className="mx-1">&bull;</span>
              <span style={{ color: 'var(--color-accent-cyan)' }}>+{newPlugins.length} new to catalog</span>
            </>
          )}
          <span className="mx-1">&bull;</span>
          <span>{formatLastSync()}</span>
        </div>
      )}

      <button
        onClick={logout}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wide)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
      >
        Logout
      </button>
    </div>
  );
}
