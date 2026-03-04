import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

function AddNodeComponent(_props: NodeProps) {
  return (
    <div
      className="flex items-center justify-center cursor-pointer transition-all duration-150 hover:bg-white/10 hover:scale-110"
      style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
        lineHeight: 1,
      }}
    >
      +
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: 'transparent', width: 0, height: 0, border: 'none' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: 'transparent', width: 0, height: 0, border: 'none' }}
      />
    </div>
  );
}

export const AddNode = memo(AddNodeComponent);
