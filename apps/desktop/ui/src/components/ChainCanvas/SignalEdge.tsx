import { memo } from 'react';
import { getSmoothStepPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

function SignalEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  return (
    <path
      id={id}
      d={edgePath}
      fill="none"
      stroke="rgba(255,255,255,0.12)"
      strokeWidth={1.5}
      style={style}
    />
  );
}

export const SignalEdge = memo(SignalEdgeComponent);
