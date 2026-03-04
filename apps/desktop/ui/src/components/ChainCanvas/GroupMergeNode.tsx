import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { GroupMergeNodeData } from '../../hooks/useChainToReactFlow';

const MODE_COLORS: Record<string, string> = {
  parallel: '#5a7842',
  midside: '#5a7842',
  serial: '#c9944a',
  fxselector: '#c9944a',
};

function GroupMergeNodeComponent({ data }: NodeProps) {
  const d = data as GroupMergeNodeData;
  const color = MODE_COLORS[d.mode] ?? '#c9944a';
  const branchCount = (d.mode === 'parallel' || d.mode === 'midside') ? 2 : 1;

  return (
    <div
      style={{
        width: 24,
        height: 12,
        background: `${color}30`,
        border: `1px solid ${color}50`,
        borderRadius: 6,
      }}
    >
      {/* Target handles: one per branch for parallel, single for serial */}
      {(d.mode === 'parallel' || d.mode === 'midside') ? (
        // We don't know exact branch count here, but dagre handles the edges.
        // Use a single wide target handle.
        <>
          {Array.from({ length: branchCount }, (_, i) => (
            <Handle
              key={`branch-${i}`}
              type="target"
              position={Position.Top}
              id={`branch-${i}`}
              style={{
                background: color,
                width: 4,
                height: 4,
                left: `${(i + 1) / (branchCount + 1) * 100}%`,
              }}
            />
          ))}
        </>
      ) : (
        <Handle type="target" position={Position.Top} style={{ background: color, width: 4, height: 4 }} />
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: color, width: 4, height: 4 }} />
    </div>
  );
}

export const GroupMergeNode = memo(GroupMergeNodeComponent);
