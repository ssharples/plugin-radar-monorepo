import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { PluginNodeData } from '../../hooks/useChainToReactFlow';
import { getCategoryColor, getCategoryLabel } from '../../constants/categoryColors';

function PluginNodeComponent({ data, selected }: NodeProps) {
  const d = data as PluginNodeData;
  const categoryColor = d.category ? getCategoryColor(d.category) : undefined;
  const categoryLabel = d.category ? getCategoryLabel(d.category) : undefined;

  return (
    <div
      className="relative font-mono"
      style={{
        width: 200,
        background: 'rgba(15, 15, 15, 0.95)',
        border: `1px solid ${selected ? 'rgba(0, 200, 255, 0.6)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 6,
        padding: '8px 10px',
        opacity: d.isGhost ? 0.4 : 1,
        borderStyle: d.isGhost ? 'dashed' : 'solid',
        boxShadow: selected ? '0 0 12px rgba(0, 200, 255, 0.15)' : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'rgba(255,255,255,0.2)', width: 6, height: 6 }} />

      {/* Plugin name */}
      <div
        className="uppercase tracking-wider truncate"
        style={{ fontSize: 11, lineHeight: '14px', color: 'rgba(255,255,255,0.9)' }}
      >
        {d.name}
      </div>

      {/* Manufacturer */}
      <div
        className="truncate"
        style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}
      >
        {d.manufacturer}
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-1 mt-1" style={{ minHeight: 16 }}>
        {categoryLabel && categoryColor && (
          <span
            className="px-1.5 py-px rounded text-[8px] font-medium uppercase tracking-wider"
            style={{
              background: `${categoryColor}20`,
              color: categoryColor,
              border: `1px solid ${categoryColor}40`,
            }}
          >
            {categoryLabel}
          </span>
        )}
        {d.bypassed && (
          <span className="px-1 py-px rounded text-[8px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
            BYP
          </span>
        )}
        {d.muted && (
          <span className="px-1 py-px rounded text-[8px] bg-red-500/20 text-red-400 border border-red-500/30">
            M
          </span>
        )}
        {d.isGhost && (
          <span className="px-1 py-px rounded text-[8px] bg-purple-500/20 text-purple-400 border border-purple-500/30">
            AI
          </span>
        )}
        {d.latency != null && d.latency > 0 && (
          <span
            className="ml-auto text-[8px]"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          >
            {d.latency > 1000 ? `${(d.latency / 1000).toFixed(1)}k` : d.latency} smp
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: 'rgba(255,255,255,0.2)', width: 6, height: 6 }} />
    </div>
  );
}

export const PluginNode = memo(PluginNodeComponent);
