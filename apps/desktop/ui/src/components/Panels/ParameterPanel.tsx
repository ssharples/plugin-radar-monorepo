import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, RotateCcw } from 'lucide-react';
import { useChainStore } from '../../stores/chainStore';
import { juceBridge } from '../../api/juce-bridge';

interface PluginParameter {
  name: string;
  index: number;
  normalizedValue: number;
  label: string;
  text: string;
  numSteps: number;
}

export function ParameterPanel() {
  const inlineEditorNodeId = useChainStore(s => s.inlineEditorNodeId);
  const [parameters, setParameters] = useState<PluginParameter[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchParams = useCallback(async () => {
    if (inlineEditorNodeId == null) return;
    try {
      const result = await juceBridge.readPluginParameters(inlineEditorNodeId);
      if (result.success && result.parameters) {
        setParameters(result.parameters);
      }
    } catch {
      // Silently ignore — will retry on next poll
    }
  }, [inlineEditorNodeId]);

  // Initial fetch + polling for live values
  useEffect(() => {
    if (inlineEditorNodeId == null) {
      setParameters([]);
      return;
    }
    setLoading(true);
    fetchParams().finally(() => setLoading(false));

    // Poll every 500ms for parameter value changes
    pollRef.current = setInterval(fetchParams, 500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [inlineEditorNodeId, fetchParams]);

  const filtered = useMemo(() => {
    if (!search.trim()) return parameters;
    const q = search.toLowerCase();
    return parameters.filter(p => p.name.toLowerCase().includes(q));
  }, [parameters, search]);

  const handleParamChange = useCallback(async (paramIndex: number, value: number) => {
    if (inlineEditorNodeId == null) return;
    try {
      await juceBridge.applyPluginParameters(inlineEditorNodeId, [{ paramIndex, value }]);
    } catch {
      // Ignore
    }
  }, [inlineEditorNodeId]);

  if (inlineEditorNodeId == null) {
    return (
      <div className="flex items-center justify-center h-full text-[10px] font-sans text-white">
        No plugin selected
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-white/5 shrink-0">
        <Search size={10} className="text-white" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter parameters..."
          className="
            flex-1 bg-transparent text-[10px] font-sans text-white
            placeholder:text-white/20 outline-none
          "
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-white hover:text-plugin-accent">
            <RotateCcw size={9} />
          </button>
        )}
      </div>

      {/* Count */}
      <div className="px-2 py-0.5 text-[8px] font-sans text-white border-b border-white/5 shrink-0">
        {filtered.length} / {parameters.length} params
      </div>

      {/* Parameter list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && parameters.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-[10px] font-sans text-white">
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-[10px] font-sans text-white">
            {search ? 'No matches' : 'No parameters'}
          </div>
        ) : (
          filtered.map(param => (
            <ParameterRow
              key={param.index}
              param={param}
              onChange={handleParamChange}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================
// Individual parameter row
// ============================================

interface ParameterRowProps {
  param: PluginParameter;
  onChange: (index: number, value: number) => void;
}

function ParameterRow({ param, onChange }: ParameterRowProps) {
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    startY.current = e.clientY;
    startVal.current = param.normalizedValue;

    const onMove = (ev: PointerEvent) => {
      const dy = startY.current - ev.clientY;
      const sensitivity = ev.shiftKey ? 0.001 : 0.005;
      const newVal = Math.max(0, Math.min(1, startVal.current + dy * sensitivity));
      onChange(param.index, newVal);
    };

    const onUp = () => {
      setDragging(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [param.normalizedValue, param.index, onChange]);

  // Double-click to reset to 0.5 (center)
  const handleDoubleClick = useCallback(() => {
    onChange(param.index, 0.5);
  }, [param.index, onChange]);

  const percent = param.normalizedValue * 100;

  return (
    <div
      className={`
        flex items-center gap-1.5 px-2 py-[3px] border-b border-white/[0.03]
        hover:bg-white/[0.03] transition-colors cursor-ns-resize
        ${dragging ? 'bg-white/[0.05]' : ''}
      `}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      title={`${param.name}: ${param.text} ${param.label}\nDrag up/down to adjust. Shift for fine. Double-click to center.`}
    >
      {/* Name */}
      <span className="text-[9px] font-sans text-white truncate flex-1 min-w-0">
        {param.name}
      </span>

      {/* Mini bar */}
      <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden shrink-0">
        <div
          className="h-full rounded-full transition-[width] duration-75"
          style={{
            width: `${percent}%`,
            background: percent > 95
              ? '#deff0a'
              : `rgba(222, 255, 10, ${0.4 + percent * 0.006})`,
          }}
        />
      </div>

      {/* Value text */}
      <span className="text-[8px] font-mono text-white tabular-nums w-10 text-right shrink-0">
        {param.text || `${percent.toFixed(0)}%`}
      </span>
    </div>
  );
}
