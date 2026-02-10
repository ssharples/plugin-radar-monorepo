import { useOnboardingStore } from '../../stores/onboardingStore'
import type { BlacklistedPlugin, ScanFailureReason } from '../../stores/onboardingTypes'

const reasonConfig: Record<ScanFailureReason, { label: string; color: string; description: string }> = {
  crash: {
    label: 'Crashed',
    color: 'text-red-400 bg-red-500/10 border-red-500/20',
    description: 'Crashed during scanning and was blacklisted',
  },
  'scan-failure': {
    label: 'Authorization Required',
    color: 'text-plugin-warning bg-plugin-warning/10 border-plugin-warning/20',
    description: 'May need authorization (iLok) or a valid license',
  },
  timeout: {
    label: 'Timed Out',
    color: 'text-plugin-dim bg-plugin-surface-alt border-plugin-border',
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
      <h2 className="font-mono text-lg text-plugin-text crt-text uppercase tracking-wider mb-1">
        Found {scanResult.totalDiscovered} Plugins
      </h2>
      <p className="text-plugin-dim text-xxs font-mono mb-6">
        Completed in {durationSec}s
      </p>

      {/* Issues section */}
      {hasIssues && (
        <div className="w-full mb-6">
          <h3 className="text-plugin-muted text-xs font-mono uppercase tracking-wider mb-3">
            {scanResult.totalBlacklisted} {scanResult.totalBlacklisted === 1 ? 'issue' : 'issues'} found
          </h3>

          {(Object.keys(grouped) as ScanFailureReason[]).map((reason) => {
            const config = reasonConfig[reason]
            const plugins = grouped[reason]!
            return (
              <div key={reason} className="mb-3">
                <div className={`text-xxs font-mono px-3 py-2 rounded-propane border ${config.color} mb-1`}>
                  <span className="uppercase font-bold">{config.label}</span>
                  <span className="ml-2 opacity-70">{config.description}</span>
                </div>
                {plugins.map((p, i) => (
                  <div
                    key={i}
                    className="text-plugin-dim text-xxs font-mono pl-4 py-0.5 truncate"
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
          className="w-full py-2.5 bg-plugin-accent hover:bg-plugin-accent-bright text-black font-mono text-sm uppercase tracking-wider rounded-propane transition-colors"
        >
          Continue to Propane
        </button>
        <button
          onClick={rescan}
          className="w-full py-2 bg-transparent border border-plugin-border hover:border-plugin-accent text-plugin-muted hover:text-plugin-text font-mono text-xs uppercase tracking-wider rounded-propane transition-colors"
        >
          Rescan All
        </button>
      </div>
    </div>
  )
}
