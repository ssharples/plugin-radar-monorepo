import { useChainStore } from '../../stores/chainStore';
import { useMeterStore } from '../../stores/meterStore';
import type { PluginNodeUI } from '../../api/types';

interface ToolbarLevel3Props {
  node: PluginNodeUI;
}

export function ToolbarLevel3({ node }: ToolbarLevel3Props) {
  const meterData = useMeterStore((s) => s.nodeMeterData[String(node.id)]);
  const sampleRate = useChainStore((s) => s.sampleRate) || 44100;

  // Prefer meterData latency (live), fall back to node.latency (static)
  const latMs = meterData?.latencyMs ?? (node.latency != null && sampleRate > 0
    ? (node.latency * 1000) / sampleRate
    : null);

  // Color coding for latency
  const latColor = latMs != null && latMs >= 50 ? 'var(--color-status-error)'
    : latMs != null && latMs >= 20 ? '#ff8c00'
    : latMs != null && latMs >= 5 ? 'var(--color-accent-yellow)'
    : undefined;

  return (
    <div className="flex items-start gap-4 h-full py-1">
      {/* Latency info */}
      <div className="flex flex-col gap-1">
        <span className="text-nano text-white/60 tracking-wider">Latency</span>
        <div className="flex items-baseline gap-1">
          <span className="text-[10px] font-mono text-white/80 tabular-nums">
            {node.latency != null ? `${node.latency} smp` : '\u2014'}
          </span>
          {latMs != null && latMs > 0.05 && (
            <span
              className="text-pico font-mono tabular-nums"
              style={{ color: latColor ?? 'rgba(255,255,255,0.5)' }}
            >
              ({latMs.toFixed(1)} ms)
            </span>
          )}
        </div>
      </div>

      {/* Plugin info */}
      <div className="flex flex-col gap-1">
        <span className="text-nano text-white/60 tracking-wider">Format</span>
        <span className="text-[10px] text-white/80">{node.format}</span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-nano text-white/60 tracking-wider">Manufacturer</span>
        <span className="text-[10px] text-white/80 truncate max-w-[100px]" title={node.manufacturer}>
          {node.manufacturer}
        </span>
      </div>
    </div>
  );
}
