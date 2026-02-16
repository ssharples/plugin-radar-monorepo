import { useState, useEffect, useRef } from 'react';
import {
  X,
  FolderPlus,
  Trash2,
  Lock,
  Clock,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { usePluginStore } from '../../stores/pluginStore';

const AUTO_SCAN_INTERVALS = [
  { value: 60000, label: '1 min' },
  { value: 300000, label: '5 min' },
  { value: 900000, label: '15 min' },
  { value: 1800000, label: '30 min' },
] as const;

const FORMAT_OPTIONS = ['VST3', 'AudioUnit', 'All'] as const;

export function ScanSettings({ onClose }: { onClose: () => void }) {
  const {
    customScanPaths,
    autoScanState,
    addCustomScanPath,
    removeCustomScanPath,
    enableAutoScan,
    disableAutoScan,
    checkForNewPlugins,
    loadCustomScanPaths,
    loadAutoScanState,
  } = usePluginStore();

  const [newPath, setNewPath] = useState('');
  const [newFormat, setNewFormat] = useState<string>('All');
  const [addError, setAddError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load data on mount
  useEffect(() => {
    loadCustomScanPaths();
    loadAutoScanState();
  }, [loadCustomScanPaths, loadAutoScanState]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleAddPath = async () => {
    if (!newPath.trim()) return;
    setAddError(null);
    const success = await addCustomScanPath(newPath.trim(), newFormat);
    if (success) {
      setNewPath('');
    } else {
      setAddError('Failed to add path');
    }
  };

  const handleRemovePath = async (path: string, format: string) => {
    await removeCustomScanPath(path, format);
  };

  const handleToggleAutoScan = () => {
    if (autoScanState.enabled) {
      disableAutoScan();
    } else {
      enableAutoScan(autoScanState.intervalMs || 300000);
    }
  };

  const handleIntervalChange = (intervalMs: number) => {
    enableAutoScan(intervalMs);
  };

  const formatLastCheckTime = (timestamp: number): string => {
    if (!timestamp) return 'Never';
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const defaultPaths = customScanPaths.filter((p) => p.isDefault);
  const userPaths = customScanPaths.filter((p) => !p.isDefault);

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-1 z-50 w-80 slide-in"
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-strong)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-elevated), 0 0 20px rgba(0, 0, 0, 0.6)',
        maxHeight: '480px',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 sticky top-0"
        style={{
          background: 'var(--color-bg-elevated)',
          borderBottom: '1px solid var(--color-border-default)',
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wider)',
            color: 'var(--color-accent-cyan)',
          }}
        >
          Scan Settings
        </span>
        <button
          onClick={onClose}
          className="p-0.5 rounded fast-snap"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-accent-cyan)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-tertiary)';
          }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-4">
        {/* Scan Locations */}
        <div>
          <label
            style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wider)',
              color: 'var(--color-text-tertiary)',
              marginBottom: '6px',
            }}
          >
            Scan Locations
          </label>

          {/* Default paths */}
          {defaultPaths.map((p) => (
            <div
              key={`${p.path}-${p.format}`}
              className="flex items-center gap-2 px-2 py-1 mb-1 rounded"
              style={{
                background: 'var(--color-bg-input)',
                border: '1px solid var(--color-border-default)',
                borderRadius: 'var(--radius-base)',
              }}
            >
              <Lock
                className="w-3 h-3 flex-shrink-0"
                style={{ color: 'var(--color-text-tertiary)' }}
              />
              <span
                className="flex-1 truncate"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {p.path}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  color: 'var(--color-text-tertiary)',
                  flexShrink: 0,
                }}
              >
                {p.format}
              </span>
            </div>
          ))}

          {/* User paths */}
          {userPaths.map((p) => (
            <div
              key={`${p.path}-${p.format}`}
              className="flex items-center gap-2 px-2 py-1 mb-1 rounded"
              style={{
                background: 'var(--color-bg-input)',
                border: '1px solid var(--color-border-default)',
                borderRadius: 'var(--radius-base)',
              }}
            >
              <FolderPlus
                className="w-3 h-3 flex-shrink-0"
                style={{ color: 'var(--color-accent-cyan)' }}
              />
              <span
                className="flex-1 truncate"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--color-text-primary)',
                }}
              >
                {p.path}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  color: 'var(--color-text-tertiary)',
                  flexShrink: 0,
                  marginRight: '4px',
                }}
              >
                {p.format}
              </span>
              <button
                onClick={() => handleRemovePath(p.path, p.format)}
                className="p-0.5 rounded fast-snap flex-shrink-0"
                style={{ color: 'var(--color-text-tertiary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-accent-magenta)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--color-text-tertiary)';
                }}
                title="Remove path"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}

          {/* Add new path */}
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-1">
              <input
                type="text"
                placeholder="/path/to/plugins"
                value={newPath}
                onChange={(e) => {
                  setNewPath(e.target.value);
                  setAddError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddPath();
                }}
                className="input flex-1 px-2 py-1"
                style={{ fontSize: '10px' }}
              />
              <select
                value={newFormat}
                onChange={(e) => setNewFormat(e.target.value)}
                className="input px-1.5 py-1"
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  width: '70px',
                  background: 'var(--color-bg-input)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-base)',
                  appearance: 'none',
                }}
              >
                {FORMAT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddPath}
                className="p-1 rounded fast-snap"
                style={{
                  background: 'var(--color-accent-cyan)',
                  color: 'var(--color-bg-primary)',
                  borderRadius: 'var(--radius-base)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 0 8px rgba(222, 255, 10, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
                title="Add scan path"
              >
                <FolderPlus className="w-3 h-3" />
              </button>
            </div>
            {addError && (
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  color: 'var(--color-accent-magenta)',
                }}
              >
                {addError}
              </p>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--color-border-default)' }} />

        {/* Auto-Scan */}
        <div>
          <label
            style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wider)',
              color: 'var(--color-text-tertiary)',
              marginBottom: '6px',
            }}
          >
            Auto-Detect New Plugins
          </label>

          {/* Toggle */}
          <div className="flex items-center justify-between mb-2">
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                color: autoScanState.enabled
                  ? 'var(--color-text-primary)'
                  : 'var(--color-text-tertiary)',
              }}
            >
              {autoScanState.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <button
              onClick={handleToggleAutoScan}
              className="fast-snap"
              style={{ color: autoScanState.enabled ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)' }}
            >
              {autoScanState.enabled ? (
                <ToggleRight className="w-6 h-6" />
              ) : (
                <ToggleLeft className="w-6 h-6" />
              )}
            </button>
          </div>

          {/* Interval selector */}
          {autoScanState.enabled && (
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    color: 'var(--color-text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-wide)',
                    flexShrink: 0,
                  }}
                >
                  Interval:
                </span>
                <div className="flex gap-0.5">
                  {AUTO_SCAN_INTERVALS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleIntervalChange(opt.value)}
                      className="fast-snap"
                      style={{
                        padding: '2px 6px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '9px',
                        fontWeight: 700,
                        borderRadius: 'var(--radius-base)',
                        border: '1px solid',
                        ...(autoScanState.intervalMs === opt.value
                          ? {
                              background: 'var(--color-accent-cyan)',
                              color: 'var(--color-bg-primary)',
                              borderColor: 'var(--color-accent-cyan)',
                              boxShadow: '0 0 6px rgba(222, 255, 10, 0.3)',
                            }
                          : {
                              background: 'var(--color-bg-input)',
                              color: 'var(--color-text-secondary)',
                              borderColor: 'var(--color-border-default)',
                            }),
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Last check time */}
              <div className="flex items-center gap-1">
                <Clock
                  className="w-3 h-3"
                  style={{ color: 'var(--color-text-tertiary)' }}
                />
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  Last check: {formatLastCheckTime(autoScanState.lastCheckTime)}
                </span>
              </div>
            </div>
          )}

          {/* Check Now button */}
          <button
            onClick={() => checkForNewPlugins()}
            className="flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded fast-snap"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wide)',
              color: 'var(--color-accent-cyan)',
              background: 'rgba(222, 255, 10, 0.08)',
              border: '1px solid rgba(222, 255, 10, 0.3)',
              borderRadius: 'var(--radius-base)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(222, 255, 10, 0.15)';
              e.currentTarget.style.boxShadow = '0 0 8px rgba(222, 255, 10, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(222, 255, 10, 0.08)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <RefreshCw className="w-3 h-3" />
            Check Now
          </button>
        </div>
      </div>
    </div>
  );
}
