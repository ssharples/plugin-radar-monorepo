import { useEffect } from 'react';
import { Search, RefreshCw, Filter } from 'lucide-react';
import { usePluginStore } from '../../stores/pluginStore';
import { useChainStore } from '../../stores/chainStore';
import { PluginItem } from './PluginItem';
import { PluginFilters } from './PluginFilters';

export function PluginBrowser() {
  const {
    filteredPlugins,
    searchQuery,
    formatFilter,
    scanning,
    scanProgress,
    currentlyScanning,
    loading,
    fetchPlugins,
    startScan,
    setSearchQuery,
    setFormatFilter,
  } = usePluginStore();

  const { addPlugin } = useChainStore();

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  const formats = ['VST3', 'AudioUnit'];

  const handleAddPlugin = async (pluginId: string) => {
    await addPlugin(pluginId);
  };

  return (
    <div className="flex flex-col h-full bg-plugin-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-plugin-border">
        <h2 className="text-xs font-semibold text-plugin-text uppercase tracking-wider">Plugins</h2>
        <button
          onClick={() => startScan(false)}
          disabled={scanning}
          className="p-1 rounded hover:bg-plugin-border-bright text-plugin-muted hover:text-plugin-accent transition-colors disabled:opacity-40"
          title="Rescan plugins"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin text-plugin-accent' : ''}`} />
        </button>
      </div>

      {/* Search and filters */}
      <div className="px-2.5 py-2 space-y-1.5 border-b border-plugin-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-plugin-dim" />
          <input
            type="text"
            placeholder="Search plugins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-3 py-1 bg-plugin-bg rounded text-xs text-plugin-text placeholder:text-plugin-dim border border-plugin-border focus:outline-none focus:border-plugin-accent/50 transition-colors"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3 h-3 text-plugin-dim" />
            <div className="flex gap-0.5">
              <button
                onClick={() => setFormatFilter(null)}
                className={`px-2 py-0.5 text-xxs rounded transition-all ${
                  formatFilter === null
                    ? 'bg-plugin-accent text-black font-semibold'
                    : 'bg-plugin-bg text-plugin-muted hover:text-plugin-text border border-plugin-border'
                }`}
              >
                All
              </button>
              {formats.map((format) => (
                <button
                  key={format}
                  onClick={() => setFormatFilter(format)}
                  className={`px-2 py-0.5 text-xxs rounded transition-all ${
                    formatFilter === format
                      ? 'bg-plugin-accent text-black font-semibold'
                      : 'bg-plugin-bg text-plugin-muted hover:text-plugin-text border border-plugin-border'
                  }`}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>
          <PluginFilters />
        </div>
      </div>

      {/* Scan progress */}
      {scanning && (
        <div className="px-2.5 py-1.5 bg-plugin-bg border-b border-plugin-border">
          <div className="flex items-center justify-between text-xxs text-plugin-muted mb-1">
            <span className="text-plugin-accent font-medium">Scanning...</span>
            <span className="font-mono">{Math.round(scanProgress * 100)}%</span>
          </div>
          <div className="h-0.5 bg-plugin-border rounded overflow-hidden">
            <div
              className="h-full bg-plugin-accent transition-all duration-300"
              style={{ width: `${scanProgress * 100}%` }}
            />
          </div>
          {currentlyScanning && (
            <p className="text-[9px] text-plugin-dim mt-0.5 truncate font-mono">
              {currentlyScanning}
            </p>
          )}
        </div>
      )}

      {/* Plugin list */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {loading && !scanning ? (
          <div className="flex items-center justify-center h-24 text-plugin-muted text-xs">
            Loading...
          </div>
        ) : filteredPlugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-plugin-muted text-xs">
            <p>No plugins found</p>
            {!scanning && (
              <button
                onClick={() => startScan(true)}
                className="mt-2 text-plugin-accent hover:underline text-xxs"
              >
                Scan for plugins
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-px">
            {filteredPlugins.map((plugin) => (
              <PluginItem
                key={plugin.id}
                plugin={plugin}
                onAdd={() => handleAddPlugin(plugin.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer count */}
      <div className="px-3 py-1 border-t border-plugin-border text-xxs text-plugin-dim font-mono">
        {filteredPlugins.length} plugin{filteredPlugins.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
