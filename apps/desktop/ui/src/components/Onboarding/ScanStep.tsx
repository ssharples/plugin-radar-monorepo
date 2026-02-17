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
    <div className="flex flex-col items-center justify-center w-full max-w-md px-6 animate-fade-in">
      <h2
        className="crt-text mb-2"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', color: '#deff0a', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)' }}
      >
        Scanning Your Plugins
      </h2>
      <p style={{ color: 'var(--color-text-disabled)', fontSize: '10px', fontFamily: 'var(--font-mono)', textAlign: 'center', marginBottom: '2rem', maxWidth: '20rem', lineHeight: 1.6 }}>
        Finding all AU & VST3 plugins on your system. Plugins that crash or need authorization will be noted.
      </p>

      {scanError ? (
        <div className="w-full">
          <div style={{ color: 'var(--color-status-error)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', background: 'rgba(255, 0, 51, 0.1)', border: '1px solid rgba(255, 0, 51, 0.2)', borderRadius: 'var(--radius-base)', padding: '12px 16px', marginBottom: '16px' }}>
            {scanError}
          </div>
          <button
            onClick={() => {
              startScan()
              juceBridge.startScan(false).catch((err) => handleScanError(String(err)))
            }}
            className="btn btn-primary w-full"
          >
            Retry Scan
          </button>
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="meter w-full mb-3" style={{ height: '8px' }}>
            <div
              className="meter-fill"
              style={{ width: `${progressPercent}%`, background: 'var(--color-accent-cyan)', transition: 'width 0.3s ease' }}
            />
          </div>

          {/* Percentage */}
          <div style={{ fontSize: '1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--color-accent-cyan)', marginBottom: '8px' }}>
            {progressPercent}%
          </div>

          {/* Currently scanning */}
          {scanActive && truncatedName && (
            <div className="truncate max-w-full" style={{ color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)', fontSize: '10px', marginBottom: '16px' }}>
              {truncatedName}
            </div>
          )}

          {/* Discovered counter */}
          <div style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', marginBottom: '16px' }}>
            {pluginsDiscovered} plugins found
          </div>

          {/* Blacklisted warnings */}
          {blacklistedPlugins.length > 0 && (
            <div className="w-full max-h-24 overflow-y-auto scrollbar-cyber mb-4">
              {blacklistedPlugins.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 truncate"
                  style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-status-warning)', background: 'rgba(255, 170, 0, 0.1)', border: '1px solid rgba(255, 170, 0, 0.2)', borderRadius: 'var(--radius-base)', padding: '6px 12px', marginBottom: '4px' }}
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
            style={{ color: 'var(--color-text-disabled)', fontSize: '10px', fontFamily: 'var(--font-mono)', background: 'none', border: 'none', cursor: 'pointer', marginTop: '8px', transition: 'color var(--duration-fast)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-disabled)')}
          >
            Skip for now
          </button>
        </>
      )}
    </div>
  )
}
