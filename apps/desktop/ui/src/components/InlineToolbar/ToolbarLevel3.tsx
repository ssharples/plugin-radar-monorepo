import { useChainStore, useChainActions } from '../../stores/chainStore';
import { ToolbarKnob } from './ToolbarKnob';
import type { PluginNodeUI } from '../../api/types';
import { collectPlugins } from '../../utils/chainHelpers';

interface ToolbarLevel3Props {
  node: PluginNodeUI;
}

const NEON = '#deff0a';

export function ToolbarLevel3({ node }: ToolbarLevel3Props) {
  const nodes = useChainStore(s => s.nodes);
  const { setNodeSidechainSource, _endContinuousGesture } = useChainActions();
  const id = node.id;

  // Build sidechain source options: other plugins in the chain
  const plugins = collectPlugins(nodes);
  const sidechainOptions = [
    { value: -1, label: 'None' },
    ...plugins
      .filter(p => p.id !== id)
      .map((p, i) => ({ value: p.id, label: `${i + 1}: ${p.name}` })),
  ];

  const latencyMs = node.latency != null ? (node.latency / 44100 * 1000).toFixed(1) : null;

  return (
    <div className="flex items-start gap-4 h-full py-1">
      {/* Sidechain source */}
      {node.hasSidechain && (
        <div className="flex flex-col gap-1">
          <span className="text-[7px] font-mono text-white tracking-wider uppercase">Sidechain</span>
          <select
            value={node.sidechainSource ?? -1}
            onChange={(e) => setNodeSidechainSource(id, Number(e.target.value))}
            className="text-[9px] font-mono bg-black/40 text-white border border-white/10 rounded px-1.5 py-0.5 outline-none focus:border-[#deff0a]/30"
            style={{ maxWidth: 140 }}
          >
            {sidechainOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Latency info */}
      <div className="flex flex-col gap-1">
        <span className="text-[7px] font-mono text-white tracking-wider uppercase">Latency</span>
        <div className="flex items-baseline gap-1">
          <span className="text-[10px] font-mono text-white tabular-nums">
            {node.latency != null ? `${node.latency} smp` : '—'}
          </span>
          {latencyMs && (
            <span className="text-[8px] font-mono text-white tabular-nums">
              ({latencyMs} ms)
            </span>
          )}
        </div>
      </div>

      {/* Plugin info */}
      <div className="flex flex-col gap-1">
        <span className="text-[7px] font-mono text-white tracking-wider uppercase">Format</span>
        <span className="text-[10px] font-mono text-white">{node.format}</span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[7px] font-mono text-white tracking-wider uppercase">Manufacturer</span>
        <span className="text-[10px] font-mono text-white truncate max-w-[100px]" title={node.manufacturer}>
          {node.manufacturer}
        </span>
      </div>
    </div>
  );
}
