import { CheckCircle2 } from 'lucide-react'
import { useOnboardingStore } from '../../stores/onboardingStore'
import type { BlacklistedPlugin, ScanFailureReason } from '../../stores/onboardingTypes'

const reasonConfig: Record<ScanFailureReason, { label: string; color: string; description: string }> = {
  crash: {
    label: 'Crashed',
    color: 'text-red-300 bg-red-500/10 border-red-500/20',
    description: 'Crashed during scanning and was blacklisted',
  },
  'scan-failure': {
    label: 'Authorization Required',
    color: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20',
    description: 'May need authorization (iLok) or a valid license',
  },
  timeout: {
    label: 'Timed Out',
    color: 'text-plugin-muted bg-plugin-surface-alt border-plugin-border',
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
    <div className="flex flex-col w-full max-w-[420px] px-6 animate-fade-in">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-full bg-green-500/15 text-green-400 inline-flex items-center justify-center">
          <CheckCircle2 className="w-4.5 h-4.5" />
        </span>
        <div>
          <h2 className="text-xl font-semibold text-plugin-text tracking-tight leading-tight">
            Found {scanResult.totalDiscovered} Plugins
          </h2>
          <p className="num text-plugin-dim text-xs">Completed in {durationSec}s</p>
        </div>
      </div>

      {hasIssues ? (
        <div className="w-full mt-5 rounded-lg border border-plugin-border bg-plugin-surface p-3 max-h-[240px] overflow-y-auto">
          <h3 className="section-label mb-2">
            {scanResult.totalBlacklisted} {scanResult.totalBlacklisted === 1 ? 'issue' : 'issues'} found
          </h3>

          {(Object.keys(grouped) as ScanFailureReason[]).map((reason) => {
            const config = reasonConfig[reason]
            const plugins = grouped[reason]!
            return (
              <div key={reason} className="mb-2.5 last:mb-0">
                <div className={`text-xs px-2.5 py-1.5 rounded-md border ${config.color}`}>
                  <span className="font-semibold">{config.label}</span>
                  <span className="ml-2 opacity-75">{config.description}</span>
                </div>
                {plugins.map((p, i) => (
                  <div key={i} className="text-plugin-muted text-xs pl-3 pt-1 truncate">
                    {p.name}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-[13px] text-plugin-muted mt-4">Every plugin scanned cleanly.</p>
      )}

      <div className="flex flex-col w-full gap-2 mt-5">
        <button
          onClick={continueFromResults}
          className="w-full h-10 bg-plugin-accent hover:bg-plugin-accent-bright text-plugin-on-accent text-sm font-semibold rounded-md transition-colors"
        >
          Continue to ProChain
        </button>
        <button
          onClick={rescan}
          className="w-full h-9 bg-transparent border border-plugin-border hover:border-plugin-border-bright text-plugin-muted hover:text-plugin-text text-xs font-semibold rounded-md transition-colors"
        >
          Rescan All
        </button>
      </div>
    </div>
  )
}
