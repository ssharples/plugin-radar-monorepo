import { useEffect, useState } from 'react';
import { ScanSearch, X } from 'lucide-react';
import { usePluginStore } from '../stores/pluginStore';

export function NewPluginsToast() {
  const newPluginsDetected = usePluginStore((s) => s.newPluginsDetected);
  const dismissNewPlugins = usePluginStore((s) => s.dismissNewPlugins);
  const startScan = usePluginStore((s) => s.startScan);
  const [visible, setVisible] = useState(false);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    if (newPluginsDetected && newPluginsDetected.count > 0) {
      setVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setEntering(true)));
      return;
    }

    setEntering(false);
    const timeout = setTimeout(() => setVisible(false), 200);
    return () => clearTimeout(timeout);
  }, [newPluginsDetected]);

  if (!visible) return null;

  const count = newPluginsDetected?.count ?? 0;

  const handleScanNow = () => {
    startScan(false);
    dismissNewPlugins();
  };

  const handleDismiss = () => {
    setEntering(false);
    setTimeout(() => dismissNewPlugins(), 200);
  };

  return (
    <div
      className="fixed bottom-6 right-4 z-[9998]"
      style={{
        transform: entering ? 'translateY(0)' : 'translateY(12px)',
        opacity: entering ? 1 : 0,
        transition: 'opacity 200ms ease, transform 200ms ease',
      }}
    >
      <div
        className="flex items-center gap-3 rounded-lg px-3 py-2.5"
        style={{
          background: '#111',
          border: '1px solid rgba(222, 255, 10, 0.25)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          minWidth: 220,
          maxWidth: 280,
        }}
      >
        <ScanSearch className="w-4 h-4 shrink-0" style={{ color: 'var(--color-accent-cyan)' }} />
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-accent-cyan)' }}>
            New plugins found
          </p>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            {count} plugin{count === 1 ? '' : 's'} available to rescan
          </p>
        </div>
        <button
          onClick={handleScanNow}
          className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider"
          style={{
            background: 'rgba(222, 255, 10, 0.12)',
            color: 'var(--color-accent-cyan)',
            border: '1px solid rgba(222, 255, 10, 0.2)',
          }}
        >
          Scan
        </button>
        <button
          onClick={handleDismiss}
          className="shrink-0"
          style={{ color: 'var(--color-text-tertiary)' }}
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
