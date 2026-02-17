import { X, AudioLines } from 'lucide-react';
import { useChainActions } from '../../stores/chainStore';
import type { PluginNodeUI } from '../../api/types';

interface DryPathSlotProps {
  node: PluginNodeUI;
}

export function DryPathSlot({ node }: DryPathSlotProps) {
  const { removeNode } = useChainActions();

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{
        background: 'linear-gradient(135deg, rgba(90, 120, 66, 0.15) 0%, rgba(0,0,0,0.4) 100%)',
        border: '1px solid rgba(90, 120, 66, 0.3)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 p-1 rounded"
        style={{
          background: 'rgba(90, 120, 66, 0.2)',
          color: '#5a7842',
        }}
      >
        <AudioLines className="w-3.5 h-3.5" />
      </div>

      {/* Label */}
      <span
        className="text-xs font-bold flex-1"
        style={{
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase' as const,
          letterSpacing: 'var(--tracking-wider)',
          color: 'var(--color-text-primary)',
        }}
      >
        DRY PATH
      </span>

      {/* Passthrough indicator */}
      <span
        className="text-xxs"
        style={{
          fontFamily: 'var(--font-mono)',
          color: 'rgba(90, 120, 66, 0.8)',
          letterSpacing: 'var(--tracking-wide)',
        }}
      >
        THRU
      </span>

      {/* Remove button */}
      <button
        onClick={() => removeNode(node.id)}
        className="p-1 rounded flex-shrink-0"
        style={{
          color: 'var(--color-text-secondary)',
          transition: 'all var(--duration-fast) var(--ease-snap)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--color-status-error)';
          e.currentTarget.style.background = 'rgba(255, 0, 51, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--color-text-secondary)';
          e.currentTarget.style.background = 'transparent';
        }}
        title="Remove dry path"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
