import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ChevronDown, Clock } from 'lucide-react';
import { useChainStore } from '../../stores/chainStore';
import { useMeterStore } from '../../stores/meterStore';
import { juceBridge } from '../../api/juce-bridge';
import type { ChainNodeUI, PluginNodeUI } from '../../api/types';

/**
 * Unified LatencyDisplay -- combines:
 * - Per-plugin latency breakdown popup on click (Team 2)
 * - Store-based total latency, color thresholds, warning icon (Team 4)
 * - Budget bar showing latency as % of buffer size (Team 10)
 *
 * Uses Tailwind animate-pulse for warning animation (no custom keyframes).
 */
export function LatencyDisplay() {
  const totalLatencySamples = useChainStore(s => s.totalLatencySamples);
  const sampleRate = useChainStore(s => s.sampleRate);
  const latencyWarning = useChainStore(s => s.latencyWarning);
  const nodes = useChainStore(s => s.nodes);
  const nodeMeterData = useMeterStore(s => s.nodeMeterData);

  const [expanded, setExpanded] = useState(false);
  const [bufferSize, setBufferSize] = useState<number>(512);

  // Fetch buffer size once on mount (Team 10)
  useEffect(() => {
    juceBridge.getBufferSize().then(setBufferSize).catch(() => {});
  }, []);

  const latencyMs = sampleRate > 0 ? (totalLatencySamples * 1000) / sampleRate : 0;

  // Color coding (Team 4)
  const getColor = useCallback(() => {
    if (latencyMs >= 50) return 'var(--color-status-error)';
    if (latencyMs >= 20) return '#ff8c00';
    if (latencyMs >= 5) return 'var(--color-accent-yellow)';
    return 'var(--color-text-tertiary)';
  }, [latencyMs]);

  // Budget percentage (Team 10)
  const budgetPercent = bufferSize > 0
    ? Math.min(100, (totalLatencySamples / bufferSize) * 100)
    : 0;

  // Collect per-plugin latency data for breakdown (Team 2)
  const pluginLatencies = useCallback(() => {
    const result: Array<{ name: string; latencyMs: number; nodeId: number }> = [];
    function walk(nodeList: ChainNodeUI[]) {
      for (const node of nodeList) {
        if (node.type === 'plugin') {
          const meterData = nodeMeterData[String(node.id)];
          const pluginNode = node as PluginNodeUI;
          const lat = meterData?.latencyMs ?? (pluginNode.latency != null && sampleRate > 0
            ? (pluginNode.latency * 1000) / sampleRate
            : 0);
          if (lat > 0.05) {
            result.push({ name: node.name, latencyMs: lat, nodeId: node.id });
          }
        }
        if (node.type === 'group') {
          walk(node.children);
        }
      }
    }
    walk(nodes);
    return result.sort((a, b) => b.latencyMs - a.latencyMs);
  }, [nodes, nodeMeterData, sampleRate]);

  if (totalLatencySamples === 0) return null;

  const color = getColor();
  const showWarning = latencyWarning != null;

  return (
    <div className="relative" style={{ userSelect: 'none' }}>
      {/* Compact badge */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1"
        style={{
          padding: '2px 6px',
          borderRadius: 'var(--radius-base)',
          fontSize: '10px',
          fontFamily: 'var(--font-system)',
          color,
          background: showWarning ? 'rgba(255, 0, 51, 0.08)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          transition: 'all var(--duration-fast)',
        }}
        title={`Chain latency: ${latencyMs.toFixed(1)}ms (${totalLatencySamples} samples)`}
      >
        {showWarning && (
          <AlertTriangle
            className={`w-3 h-3${latencyMs >= 50 ? ' animate-pulse' : ''}`}
            style={{ color: 'var(--color-status-error)' }}
          />
        )}
        {!showWarning && <Clock className="w-3 h-3" style={{ opacity: 0.5 }} />}
        <span>{latencyMs.toFixed(1)}ms</span>
        <ChevronDown
          className="w-3 h-3"
          style={{
            opacity: 0.4,
            transform: expanded ? 'rotate(180deg)' : undefined,
            transition: 'transform var(--duration-fast)',
          }}
        />
      </button>

      {/* Expanded breakdown popup */}
      {expanded && (
        <div
          className="absolute top-full right-0 z-50 mt-1"
          style={{
            minWidth: '220px',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-default)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-system)',
          }}
        >
          {/* Total */}
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-2)', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Total Latency</span>
            <span style={{ color, fontWeight: 700 }}>
              {latencyMs.toFixed(1)}ms ({totalLatencySamples} smp)
            </span>
          </div>

          {/* Budget bar (Team 10) */}
          <div style={{ marginBottom: 'var(--space-2)', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: '4px' }}>
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: '10px' }}>Buffer Budget</span>
              <span style={{ color: budgetPercent > 100 ? 'var(--color-status-error)' : 'var(--color-text-secondary)', fontSize: '10px' }}>
                {budgetPercent.toFixed(0)}% of {bufferSize} smp
              </span>
            </div>
            <div style={{ height: '4px', borderRadius: '2px', background: 'var(--color-bg-input)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, budgetPercent)}%`,
                  borderRadius: '2px',
                  background: budgetPercent > 100
                    ? 'var(--color-status-error)'
                    : budgetPercent > 50
                      ? '#ff8c00'
                      : 'var(--color-accent-cyan)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {/* Per-plugin breakdown (Team 2) */}
          {pluginLatencies().length > 0 ? (
            <div className="grid gap-1">
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Per-Plugin Breakdown
              </span>
              {pluginLatencies().map((p) => (
                <div key={p.nodeId} className="flex items-center justify-between" style={{ padding: '1px 0' }}>
                  <span className="truncate" style={{ color: 'var(--color-text-secondary)', maxWidth: '140px' }}>{p.name}</span>
                  <span style={{ color: p.latencyMs >= 10 ? '#ff8c00' : 'var(--color-text-tertiary)', fontWeight: p.latencyMs >= 10 ? 600 : 400 }}>
                    {p.latencyMs.toFixed(1)}ms
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span style={{ color: 'var(--color-text-disabled)', fontSize: '10px' }}>No individual plugin latency detected</span>
          )}

          {/* Warning message */}
          {latencyWarning && (
            <div style={{ marginTop: 'var(--space-2)', padding: 'var(--space-2)', borderRadius: 'var(--radius-base)', background: 'rgba(255, 0, 51, 0.08)', color: 'var(--color-status-error)', fontSize: '10px' }}>
              {latencyWarning.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
