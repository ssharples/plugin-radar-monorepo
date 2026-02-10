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
      // "Forgot password" view — directs user to web app
      if (showForgotPassword) {
        return (
          <div className="bg-plugin-surface rounded-lg p-4 border border-plugin-border">
            <h3 className="text-white font-medium mb-2">Reset Password</h3>
            <p className="text-gray-400 text-sm mb-3">
              To reset your password, visit the PluginRadar website:
            </p>
            <a
              href="https://pluginradar.com/forgot-password"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-plugin-accent hover:bg-plugin-accent-bright text-white rounded px-3 py-2 text-sm font-mono font-medium text-center mb-2"
            >
              Open Reset Page ↗
            </a>
            <button
              type="button"
              onClick={() => setShowForgotPassword(false)}
              className="text-plugin-accent hover:text-plugin-accent-bright text-sm font-mono w-full text-center"
            >
              Back to Sign In
            </button>
          </div>
        );
      }

      return (
        <div className="bg-plugin-surface rounded-lg p-4 border border-plugin-border">
          <form onSubmit={handleAuth} className="space-y-3">
            <h3 className="text-white font-medium">
              {isRegister ? 'Create Account' : 'Sign In'}
            </h3>
            
            {authError && (
              <div className="text-red-400 text-sm">{authError}</div>
            )}
            
            {isRegister && (
              <input
                type="text"
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-black/30 border border-plugin-border rounded px-3 py-2 text-white text-sm"
              />
            )}
            
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-black/30 border border-plugin-border rounded px-3 py-2 text-white text-sm"
            />
            
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-black/30 border border-plugin-border rounded px-3 py-2 text-white text-sm"
            />
            
            {!isRegister && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-gray-400 hover:text-plugin-accent text-xs font-mono transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}
            
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-plugin-accent hover:bg-plugin-accent-bright text-white rounded px-3 py-2 text-sm font-mono font-medium"
              >
                {isRegister ? 'Create Account' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => setShowAuth(false)}
                className="px-3 py-2 text-gray-400 hover:text-white text-sm"
              >
                Cancel
              </button>
            </div>
            
            <button
              type="button"
              onClick={() => setIsRegister(!isRegister)}
              className="text-plugin-accent hover:text-plugin-accent-bright text-sm font-mono w-full text-center"
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
        className="flex items-center gap-1.5 px-2.5 py-1 bg-plugin-accent/15 hover:bg-plugin-accent/25 border border-plugin-accent/25 rounded text-plugin-accent text-xs font-mono transition-colors"
      >
        <Cloud className="w-3.5 h-3.5" />
        <span>Connect</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={isSyncing || plugins.length === 0}
        className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
          isSyncing
            ? 'bg-plugin-accent/50 text-plugin-accent cursor-wait'
            : 'bg-plugin-accent hover:bg-plugin-accent-bright text-white'
        }`}
      >
        <Cloud className={`w-4 h-4 ${isSyncing ? 'animate-pulse' : ''}`} />
        <span>
          {isSyncing ? 'Syncing...' : 'Sync to Cloud'}
        </span>
      </button>
      
      {lastSyncAt && (
        <div className="text-xs text-gray-400">
          <span>{syncedCount} synced</span>
          <span className="mx-1">&bull;</span>
          <span className="text-green-400">{inCatalog} in database</span>
          {newPlugins.length > 0 && (
            <>
              <span className="mx-1">&bull;</span>
              <span className="text-plugin-accent">+{newPlugins.length} new to catalog</span>
            </>
          )}
          <span className="mx-1">&bull;</span>
          <span>{formatLastSync()}</span>
        </div>
      )}
      
      <button
        onClick={logout}
        className="text-gray-400 hover:text-white text-xs"
      >
        Logout
      </button>
    </div>
  );
}

