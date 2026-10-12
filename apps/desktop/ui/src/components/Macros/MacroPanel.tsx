import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Knob } from '../Knob';
import { juceBridge } from '../../api/juce-bridge';
import { useMacroStore } from '../../stores/macroStore';

const percent = (value: number) => `${Math.round(value * 100)}%`;

function RangeInput({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(Math.round(value * 100)));
  useEffect(() => setText(String(Math.round(value * 100))), [value]);
  const commit = () => {
    const parsed = Number(text);
    if (Number.isFinite(parsed)) onCommit(Math.max(0, Math.min(100, parsed)) / 100);
    else setText(String(Math.round(value * 100)));
  };
  return (
    <label className="flex items-center gap-1 text-[11px] text-plugin-muted">
      {label}
      <input
        className="num w-10 h-6 rounded border border-plugin-border bg-plugin-surface px-1 text-right text-[11px] text-plugin-text focus:outline-none focus:border-plugin-accent/60"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        aria-label={`${label} percent`}
      />
      %
    </label>
  );
}

export function MacroPanel({ onClose }: { onClose: () => void }) {
  const { macros, selected, error, fetchMacros, select, setValue, setGesture, applyValues, removeLink, setLinkRange, rename } = useMacroStore();
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => {
    fetchMacros();
    const offValues = juceBridge.on<number[]>('macroValues', (values) => applyValues(values));
    const offChain = juceBridge.on('chainChanged', () => fetchMacros());
    return () => { offValues(); offChain(); };
  }, [fetchMacros, applyValues]);

  const current = macros[selected];
  useEffect(() => setNameDraft(current?.name ?? ''), [current?.name, selected]);

  return (
    <div
      role="region"
      aria-label="Macros"
      className="absolute bottom-full left-0 right-0 z-[60] border-t border-plugin-border-bright bg-plugin-surface/[0.98] backdrop-blur px-3 pt-2.5 pb-3 shadow-[0_-12px_32px_-8px_rgba(0,0,0,0.6)] animate-slide-up"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="mb-2 flex items-center gap-3">
        <p className="text-[13px] font-semibold text-plugin-text">Macros</p>
        <p className="text-[11px] text-plugin-dim truncate">One knob, many parameters. Link parameters from a plugin's Auto menu.</p>
        <div className="flex-1" />
        <button className="w-6 h-6 inline-flex items-center justify-center rounded text-plugin-muted hover:text-plugin-text hover:bg-plugin-raised" onClick={onClose} aria-label="Close macros"><X className="h-3.5 w-3.5" /></button>
      </div>

      <div className="grid grid-cols-8 gap-1.5">
        {macros.map((macro) => {
          const isSel = selected === macro.index;
          return (
            <div
              key={macro.index}
              className={`flex flex-col items-center rounded-lg border px-1 pt-1.5 pb-1 cursor-pointer transition-colors ${
                isSel ? 'border-plugin-accent/60 bg-plugin-accent/10' : 'border-plugin-border bg-plugin-surface-alt hover:border-plugin-border-bright'
              }`}
              onClick={() => select(macro.index)}
            >
              <Knob
                value={macro.value}
                min={0}
                max={1}
                defaultValue={0}
                step={0.001}
                size={36}
                formatValue={percent}
                label={macro.name || `M${macro.index + 1}`}
                color={macro.links.length ? '#8b7cff' : '#5d636e'}
                onChange={(value) => setValue(macro.index, value)}
                onDragStart={() => setGesture(macro.index, true)}
                onDragEnd={() => setGesture(macro.index, false)}
                parseValue={(text) => { const n = parseFloat(text.replace('%', '')); return Number.isFinite(n) ? n / 100 : null; }}
              />
              <span className={`text-[10px] ${macro.links.length ? 'text-plugin-accent-bright' : 'text-plugin-dim'}`}>
                {macro.links.length ? `${macro.links.length} link${macro.links.length > 1 ? 's' : ''}` : 'empty'}
              </span>
            </div>
          );
        })}
      </div>

      {current && (
        <div className="mt-2.5 rounded-lg border border-plugin-border bg-plugin-bg/60 p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="num text-[10px] text-plugin-dim">M{current.index + 1}</span>
            <input
              className="w-44 h-7 rounded-md border border-plugin-border bg-plugin-surface px-2 text-xs text-plugin-text focus:outline-none focus:border-plugin-accent/60"
              value={nameDraft}
              maxLength={32}
              placeholder={`Macro ${current.index + 1}`}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => { if (nameDraft !== current.name) rename(current.index, nameDraft); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              aria-label="Macro name"
            />
            <span className="text-[11px] text-plugin-dim">
              {current.links.length} linked parameter{current.links.length === 1 ? '' : 's'}
            </span>
          </div>
          {error && <p className="mb-1 text-[11px] text-red-400">{error}</p>}
          {current.links.length === 0 ? (
            <p className="text-[11px] text-plugin-dim py-1">No parameters linked yet. Open a plugin's <span className="text-plugin-muted">Auto</span> menu and pick this macro.</p>
          ) : (
            <ul className="max-h-28 overflow-y-auto">
              {current.links.map((link, linkIndex) => (
                <li key={`${link.pluginId}:${link.parameterId}:${linkIndex}`} className="flex items-center gap-2 h-7 px-1 rounded text-xs hover:bg-plugin-surface-alt">
                  <span className={`min-w-0 flex-1 truncate ${link.available ? 'text-plugin-text' : 'text-plugin-dim line-through'}`}
                    title={link.available ? undefined : 'This plugin is missing. The link is kept and comes back when the plugin does.'}>
                    <span className="text-plugin-muted">{link.pluginName || 'Missing plugin'}</span> · {link.parameterName}
                  </span>
                  {!link.available && <span className="text-[10px] font-semibold uppercase text-amber-400">missing</span>}
                  <RangeInput label="From" value={link.min} onCommit={(min) => setLinkRange(current.index, linkIndex, min, link.max)} />
                  <RangeInput label="To" value={link.max} onCommit={(max) => setLinkRange(current.index, linkIndex, link.min, max)} />
                  <button className="text-[11px] text-plugin-muted hover:text-red-400 px-1" onClick={() => removeLink(current.index, linkIndex)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
