import { useOnboardingStore } from '../../stores/onboardingStore'
import type { BlacklistedPlugin, ScanFailureReason } from '../../stores/onboardingTypes'

const reasonConfig: Record<ScanFailureReason, { label: string; bg: string; border: string; color: string; description: string }> = {
  crash: {
    label: 'Crashed',
    bg: 'rgba(255, 0, 51, 0.1)',
    border: 'rgba(255, 0, 51, 0.2)',
    color: 'var(--color-status-error)',
    description: 'Crashed during scanning and was blacklisted',
  },
  'scan-failure': {
    label: 'Authorization Required',
    bg: 'rgba(255, 170, 0, 0.1)',
    border: 'rgba(255, 170, 0, 0.2)',
    color: 'var(--color-status-warning)',
    description: 'May need authorization (iLok) or a valid license',
  },
  timeout: {
    label: 'Timed Out',
    bg: 'var(--color-bg-input)',
    border: 'var(--color-border-default)',
    color: 'var(--color-text-disabled)',
    description: 'Took too long — may have been waiting for a license dialog',
  },
}

function groupByReason(plugins: BlacklistedPlugin[]) {
  const groups: Partial<Record<ScanFailureReason, BlacklistedPlugin[]>> = {}
  for (const p of plugins) {
    if (!groups[p.reason]) groups[p.reason] = []
    groups[p.reason]!.push(p)
  }
  return groups
}

export function ScanResults() {
  const { scanResult, continueFromResults, rescan } = useOnboardingStore()

  if (!scanResult) return null

  const durationSec = (scanResult.scanDurationMs / 1000).toFixed(1)
  const grouped = groupByReason(scanResult.blacklistedPlugins)
  const hasIssues = scanResult.totalBlacklisted > 0

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-md px-6 animate-fade-in">
      {/* Headline */}
      <h2
        className="crt-text mb-1"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', color: '#deff0a', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)' }}
      >
        Found {scanResult.totalDiscovered} Plugins
      </h2>
      <p style={{ color: 'var(--color-text-disabled)', fontSize: '10px', fontFamily: 'var(--font-mono)', marginBottom: '1.5rem' }}>
        Completed in {durationSec}s
      </p>

      {/* Issues section */}
      {hasIssues && (
        <div className="w-full mb-6">
          <h3 style={{ color: '#deff0a', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', marginBottom: '12px' }}>
            {scanResult.totalBlacklisted} {scanResult.totalBlacklisted === 1 ? 'issue' : 'issues'} found
          </h3>

          {(Object.keys(grouped) as ScanFailureReason[]).map((reason) => {
            const config = reasonConfig[reason]
            const plugins = grouped[reason]!
            return (
              <div key={reason} style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', padding: '8px 12px', borderRadius: 'var(--radius-base)', border: `1px solid ${config.border}`, background: config.bg, color: config.color, marginBottom: '4px' }}>
                  <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{config.label}</span>
                  <span style={{ marginLeft: '8px', opacity: 0.7 }}>{config.description}</span>
                </div>
                {plugins.map((p, i) => (
                  <div
                    key={i}
                    className="truncate"
                    style={{ color: 'var(--color-text-disabled)', fontSize: '10px', fontFamily: 'var(--font-mono)', paddingLeft: '16px', paddingTop: '2px', paddingBottom: '2px' }}
                  >
                    {p.name}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col w-full gap-2">
        <button
          onClick={continueFromResults}
          className="btn btn-primary w-full"
        >
          Continue to Propane
        </button>
        <button
          onClick={rescan}
          className="btn w-full"
        >
          Rescan All
        </button>
      </div>
    </div>
  )
}
