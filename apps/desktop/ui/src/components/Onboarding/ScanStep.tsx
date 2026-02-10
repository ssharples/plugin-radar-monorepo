import { useEffect } from 'react'
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

    const unsubPluginList = juceBridge.onPluginListChanged(() => {
      handlePluginDiscovered()
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
    <div className="flex flex-col items-center justify-center w-full max-w-md px-6 animate-fade-in">
      <h2 className="font-mono text-lg text-plugin-text crt-text uppercase tracking-wider mb-2">
        Scanning Your Plugins
      </h2>
      <p className="text-plugin-dim text-xxs font-mono text-center mb-8 max-w-xs leading-relaxed">
        Finding all AU & VST3 plugins on your system. Plugins that crash or need authorization will be noted.
      </p>

      {scanError ? (
        <div className="w-full">
          <div className="text-red-400 text-xs font-mono bg-red-500/10 border border-red-500/20 rounded-propane px-4 py-3 mb-4">
            {scanError}
          </div>
          <button
            onClick={() => {
              startScan()
              juceBridge.startScan(false).catch((err) => handleScanError(String(err)))
            }}
            className="w-full py-2 bg-plugin-accent hover:bg-plugin-accent-bright text-black font-mono text-xs uppercase rounded-propane transition-colors"
          >
            Retry Scan
          </button>
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="w-full h-2 bg-plugin-border rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-plugin-accent rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Percentage */}
          <div className="text-2xl font-mono text-plugin-accent mb-2">
            {progressPercent}%
          </div>

          {/* Currently scanning */}
          {scanActive && truncatedName && (
            <div className="text-plugin-dim font-mono text-xxs truncate max-w-full mb-4">
              {truncatedName}
            </div>
          )}

          {/* Discovered counter */}
          <div className="text-plugin-muted font-mono text-xs mb-4">
            {pluginsDiscovered} plugins found
          </div>

          {/* Blacklisted warnings */}
          {blacklistedPlugins.length > 0 && (
            <div className="w-full max-h-24 overflow-y-auto mb-4">
              {blacklistedPlugins.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xxs font-mono text-plugin-warning bg-plugin-warning/10 border border-plugin-warning/20 rounded-propane px-3 py-1.5 mb-1"
                >
                  <span className="shrink-0">!</span>
                  <span className="truncate">{p.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Skip link */}
          <button
            onClick={skipScan}
            className="text-plugin-dim text-xxs font-mono hover:text-plugin-muted transition-colors mt-2"
          >
            Skip for now
          </button>
        </>
      )}
    </div>
  )
}
