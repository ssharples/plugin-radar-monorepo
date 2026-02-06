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
            
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded px-3 py-2 text-sm font-medium"
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
              className="text-purple-400 hover:text-purple-300 text-sm w-full text-center"
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
        className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/25 rounded text-purple-300 text-xs transition-colors"
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
            ? 'bg-purple-600/50 text-purple-200 cursor-wait'
            : 'bg-purple-600 hover:bg-purple-700 text-white'
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
              <span className="text-purple-400">+{newPlugins.length} new to catalog</span>
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

