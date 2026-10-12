import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useOnboardingStore } from '../../stores/onboardingStore'
import { juceBridge } from '../../api/juce-bridge'
import type { BlacklistedPlugin } from '../../stores/onboardingTypes'

export function ScanStep() {
  const {
    scanActive,
    scanProgress,
    currentPluginName,
    pluginsDiscovered,
    blacklistedPlugins,
    scanError,
    startScan,
    skipScan,
    handleScanProgress,
    handlePluginDiscovered,
    handlePluginBlacklisted,
    handleScanComplete,
    handleScanError,
  } = useOnboardingStore()

  useEffect(() => {
    // Start the scan
    startScan()

    // Subscribe to scan events
    const unsubProgress = juceBridge.onScanProgress((data) => {
      handleScanProgress(data.progress, data.currentPlugin)
    })

    const unsubPluginList = juceBridge.onPluginListChanged((plugins) => {
      handlePluginDiscovered(Array.isArray(plugins) ? plugins.length : undefined)
    })

    const unsubBlacklisted = juceBridge.onPluginBlacklisted((data) => {
      handlePluginBlacklisted({
        path: data.path,
        name: data.name,
        reason: (data.reason as BlacklistedPlugin['reason']) || 'crash',
      })
    })

    // Trigger the actual native scan
    juceBridge.startScan(false).catch((err) => {
      handleScanError(String(err))
    })

    // Listen for scan completion via progress reaching 1.0
    const unsubComplete = juceBridge.onScanProgress((data) => {
      if (!data.scanning && data.progress >= 1.0) {
        handleScanComplete()
      }
    })

    return () => {
      unsubProgress()
      unsubPluginList()
      unsubBlacklisted()
      unsubComplete()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const progressPercent = Math.round(scanProgress * 100)
  const truncatedName = currentPluginName
    ? currentPluginName.split('/').pop()?.replace(/\.(component|vst3)$/i, '') || currentPluginName
    : ''

  return (
    <div className="flex flex-col w-full max-w-[420px] px-6 animate-fade-in">
      <h2 className="text-xl font-semibold text-plugin-text tracking-tight">Scanning Your Plugins</h2>
      <p className="text-plugin-muted text-[13px] mt-1 mb-6 leading-snug">
        Finding all AU & VST3 plugins on your system. Plugins that crash or need authorization will be noted.
      </p>

      {scanError ? (
        <div className="w-full">
          <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/25 rounded-md px-3 py-2.5 mb-3" role="alert">
            {scanError}
          </div>
          <button
            onClick={() => {
              startScan()
              juceBridge.startScan(false).catch((err) => handleScanError(String(err)))
            }}
            className="w-full h-10 bg-plugin-accent hover:bg-plugin-accent-bright text-plugin-on-accent text-sm font-semibold rounded-md transition-colors"
          >
            Retry Scan
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-plugin-border bg-plugin-surface p-4">
            <div className="flex items-baseline justify-between mb-2">
              <span className="num text-3xl font-medium text-plugin-text">{progressPercent}%</span>
              <span className="num text-xs text-plugin-muted">{pluginsDiscovered} plugins found</span>
            </div>
            <div className="w-full h-1.5 bg-plugin-raised rounded-full overflow-hidden" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="h-full bg-plugin-accent rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="h-4 mt-2 text-[11px] text-plugin-dim truncate">
              {scanActive && truncatedName ? truncatedName : null}
            </div>
          </div>

          {blacklistedPlugins.length > 0 && (
            <div className="w-full max-h-28 overflow-y-auto mt-3 space-y-1">
              {blacklistedPlugins.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-md px-3 py-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{p.name}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={skipScan}
            className="self-start text-plugin-muted text-xs hover:text-plugin-text underline underline-offset-2 transition-colors mt-4"
          >
            Skip for now
          </button>
        </>
      )}
    </div>
  )
}
