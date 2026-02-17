import { useMemo } from 'react';
import { useChainStore, useChainActions } from '../stores/chainStore';
import { Knob } from './Knob/Knob';

// Convert linear to dB
function linearToDb(linear: number): number {
  if (linear <= 0.00001) return -60;
  return 20 * Math.log10(linear);
}

function formatDb(db: number): string {
  if (db <= -60) return '-\u221E';
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)}`;
}

function formatGain(v: number): string {
  if (v >= 0) return `+${v.toFixed(1)}`;
  return v.toFixed(1);
}

const NEON = '#deff0a';

export function InlineEditorToolbar() {
  const inlineEditorNodeId = useChainStore(s => s.inlineEditorNodeId);
  const nodes = useChainStore(s => s.nodes);
  const snapshots = useChainStore(s => s.snapshots);
  const activeSnapshot = useChainStore(s => s.activeSnapshot);
  const nodeMeterData = useChainStore(s => s.nodeMeterData);
  const {
    saveSnapshot, recallSnapshot,
    setNodeInputGain, setNodeOutputGain, setNodeDryWet,
    setNodeMidSideMode,
    _endContinuousGesture,
  } = useChainActions();

  // Find the current node in the tree
  const currentNode = useMemo(() => {
    if (inlineEditorNodeId == null) return null;
    const find = (list: typeof nodes): typeof nodes[number] | null => {
      for (const n of list) {
        if (n.id === inlineEditorNodeId) return n;
        if (n.type === 'group') {
          const found = find(n.children);
          if (found) return found;
        }
      }
      return null;
    };
    return find(nodes);
  }, [nodes, inlineEditorNodeId]);

  if (!currentNode || currentNode.type !== 'plugin') return null;

  const node = currentNode;
  const id = node.id;
  const meterData = nodeMeterData[String(id)];

  // Peak I/O values
  const inputPeakDb = meterData
    ? Math.max(linearToDb(meterData.inputPeakL), linearToDb(meterData.inputPeakR))
    : -60;
  const outputPeakDb = meterData
    ? Math.max(linearToDb(meterData.peakL), linearToDb(meterData.peakR))
    : -60;

  return (
    <div
      className="flex items-center h-[44px] bg-[#0a0a0a] border-t border-white/5 px-2 gap-2"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* A/B/C/D Snapshots */}
      <div className="flex gap-0.5 shrink-0">
        {[0, 1, 2, 3].map((i) => {
          const label = ['A', 'B', 'C', 'D'][i];
          const snapshot = snapshots[i];
          const isActive = activeSnapshot === i && snapshot != null;
          return (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                if (e.shiftKey) {
                  saveSnapshot(i);
                } else if (snapshot) {
                  recallSnapshot(i);
                } else {
                  saveSnapshot(i);
                }
              }}
              className="w-7 h-7 rounded text-[10px] font-bold font-mono"
              style={{
                transition: 'all 150ms ease',
                background: isActive
                  ? NEON
                  : snapshot
                    ? 'rgba(222, 255, 10, 0.12)'
                    : 'rgba(255,255,255,0.05)',
                color: isActive
                  ? '#000'
                  : snapshot
                    ? NEON
                    : 'var(--color-text-disabled, #555)',
                border: snapshot && !isActive
                  ? `1px solid rgba(222, 255, 10, 0.3)`
                  : '1px solid rgba(255,255,255,0.08)',
                boxShadow: isActive
                  ? `0 0 8px rgba(222, 255, 10, 0.4)`
                  : 'none',
              }}
              title={
                snapshot
                  ? `${isActive ? 'Active' : 'Recall'} ${label} \u2022 Shift+click to overwrite \u2022 \u2318\u2325${i + 1}`
                  : `Save snapshot ${label} \u2022 \u2318\u2325\u21E7${i + 1}`
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-white/10 shrink-0" />

      {/* Peak I/O values */}
      <div className="flex gap-3 shrink-0">
        <div className="flex items-baseline gap-1">
          <span className="text-[8px] font-mono text-white tracking-wider">IN</span>
          <span className={`text-[10px] font-mono tabular-nums ${inputPeakDb > -3 ? 'text-red-400' : inputPeakDb > -12 ? 'text-yellow-400' : 'text-green-400'}`}>
            {formatDb(inputPeakDb)}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-[8px] font-mono text-white tracking-wider">OUT</span>
          <span className={`text-[10px] font-mono tabular-nums ${outputPeakDb > -3 ? 'text-red-400' : outputPeakDb > -12 ? 'text-yellow-400' : 'text-green-400'}`}>
            {formatDb(outputPeakDb)}
          </span>
        </div>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-white/10 shrink-0" />

      {/* Knobs: IN, OUT, DRY/WET — horizontal layout with value on right */}
      <div className="flex items-center gap-2 shrink-0">
        {/* IN knob */}
        <div className="flex items-center gap-0.5">
          <Knob
            value={node.inputGainDb}
            min={-24}
            max={24}
            defaultValue={0}
            size={20}
            hideValue
            hideLabel
            onChange={(v) => setNodeInputGain(id, v)}
            onDragEnd={_endContinuousGesture}
          />
          <div className="flex flex-col leading-none">
            <span className="text-[7px] font-mono text-white tracking-wider">IN</span>
            <span className="text-[9px] font-mono tabular-nums text-plugin-foreground/70">
              {formatGain(node.inputGainDb)}
            </span>
          </div>
        </div>

        {/* OUT knob */}
        <div className="flex items-center gap-0.5">
          <Knob
            value={node.outputGainDb}
            min={-24}
            max={24}
            defaultValue={0}
            size={20}
            hideValue
            hideLabel
            onChange={(v) => setNodeOutputGain(id, v)}
            onDragEnd={_endContinuousGesture}
          />
          <div className="flex flex-col leading-none">
            <span className="text-[7px] font-mono text-white tracking-wider">OUT</span>
            <span className="text-[9px] font-mono tabular-nums text-plugin-foreground/70">
              {formatGain(node.outputGainDb)}
            </span>
          </div>
        </div>

        {/* DRY/WET knob */}
        <div className="flex items-center gap-0.5">
          <Knob
            value={node.pluginDryWet * 100}
            min={0}
            max={100}
            defaultValue={100}
            size={20}
            hideValue
            hideLabel
            onChange={(v) => setNodeDryWet(id, v / 100)}
            onDragEnd={_endContinuousGesture}
          />
          <div className="flex flex-col leading-none">
            <span className="text-[7px] font-mono text-white tracking-wider">D/W</span>
            <span className="text-[9px] font-mono tabular-nums text-plugin-foreground/70">
              {Math.round(node.pluginDryWet * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-white/10 shrink-0" />

      {/* M/S Mode — neon yellow branding */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[8px] font-mono text-white tracking-wider">M/S</span>
        <div
          className="flex rounded overflow-hidden"
          style={{
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(0,0,0,0.3)',
          }}
        >
          {(['L/R', 'MID', 'SIDE', 'M/S'] as const).map((label, idx) => {
            const isActive = (node.midSideMode ?? 0) === idx;
            return (
              <button
                key={label}
                onClick={() => setNodeMidSideMode(id, idx)}
                className="px-1 py-0.5 text-[8px] font-bold font-mono"
                style={{
                  background: isActive ? 'rgba(222, 255, 10, 0.15)' : 'transparent',
                  color: isActive ? NEON : 'var(--color-text-tertiary)',
                  transition: 'all 150ms ease',
                  minWidth: '24px',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
