import { RefreshCw, X } from 'lucide-react';
import { usePluginStore } from '../../stores/pluginStore';

export function NewPluginsBanner() {
  const newPluginsDetected = usePluginStore((s) => s.newPluginsDetected);
  const dismissNewPlugins = usePluginStore((s) => s.dismissNewPlugins);
  const startScan = usePluginStore((s) => s.startScan);

  if (!newPluginsDetected || newPluginsDetected.count === 0) return null;

  return (
    <div
      className="mx-2.5 my-1.5 px-3 py-2 rounded flex items-center justify-between gap-2"
      style={{
        background: 'rgba(222, 255, 10, 0.06)',
        border: '1px solid rgba(222, 255, 10, 0.25)',
        borderRadius: 'var(--radius-md)',
        animation: 'pulse-border 2s ease-in-out infinite',
      }}
    >
      <div className="flex-1 min-w-0">
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            color: 'var(--color-accent-cyan)',
          }}
        >
          {newPluginsDetected.count} new plugin{newPluginsDetected.count !== 1 ? 's' : ''} found
        </p>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => {
            startScan(false);
            dismissNewPlugins();
          }}
          className="flex items-center gap-1 px-2 py-0.5 rounded fast-snap"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wide)',
            background: 'var(--color-accent-cyan)',
            color: 'var(--color-bg-primary)',
            borderRadius: 'var(--radius-base)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 0 10px rgba(222, 255, 10, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <RefreshCw className="w-3 h-3" />
          Scan
        </button>
        <button
          onClick={dismissNewPlugins}
          className="p-0.5 rounded fast-snap"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-text-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-tertiary)';
          }}
          title="Dismiss"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
