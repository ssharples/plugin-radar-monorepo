import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { GroupHeaderNodeData } from '../../hooks/useChainToReactFlow';

const MODE_COLORS: Record<string, string> = {
  parallel: '#5a7842',
  midside: '#5a7842',
  serial: '#c9944a',
  fxselector: '#c9944a',
};

const MODE_ICONS: Record<string, string> = {
  parallel: '\u2443',   // ⑃
  midside: '\u2443',
  serial: '\u2261',     // ≡
  fxselector: '\u25C7', // ◇
};

function GroupHeaderNodeComponent({ data }: NodeProps) {
  const d = data as GroupHeaderNodeData;
  const color = MODE_COLORS[d.mode] ?? '#c9944a';
  const icon = MODE_ICONS[d.mode] ?? '≡';

  return (
    <div
      className="font-mono"
      style={{
        width: 220,
        height: 40,
        background: `linear-gradient(135deg, ${color}18, ${color}08)`,
        border: `1px solid ${color}60`,
        borderRadius: 6,
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: color, width: 6, height: 6 }} />

      <span style={{ fontSize: 14, color, lineHeight: 1 }}>{icon}</span>
      <span
        className="uppercase tracking-wider truncate"
        style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}
      >
        {d.name}
      </span>

      {d.bypassed && (
        <span className="px-1 py-px rounded text-[8px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 ml-auto flex-shrink-0">
          BYP
        </span>
      )}

      {d.dryWet < 1.0 && !d.bypassed && (
        <span
          className="ml-auto text-[8px] flex-shrink-0"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          {Math.round(d.dryWet * 100)}%
        </span>
      )}

      {/* Source handles: one per branch for parallel, single for serial */}
      {(d.mode === 'parallel' || d.mode === 'midside') && d.branchCount > 1 ? (
        Array.from({ length: d.branchCount }, (_, i) => {
          const offset = (i + 1) / (d.branchCount + 1) * 100;
          return (
            <Handle
              key={`branch-${i}`}
              type="source"
              position={Position.Bottom}
              id={`branch-${i}`}
              style={{
                background: color,
                width: 5,
                height: 5,
                left: `${offset}%`,
              }}
            />
          );
        })
      ) : (
        <Handle type="source" position={Position.Bottom} style={{ background: color, width: 6, height: 6 }} />
      )}
    </div>
  );
}

export const GroupHeaderNode = memo(GroupHeaderNodeComponent);
