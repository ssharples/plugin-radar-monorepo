import { useState } from 'react';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useSyncStore } from '../../stores/syncStore';
import { useModalEscape } from '../../hooks/useModalEscape';
import type { ChainSlot } from '../../api/types';
import { CascadingDropdown } from '../Dropdown';
import { USE_CASE_GROUPS } from '../../constants/useCaseGroups';
import { formLabelStyle } from '../../constants/styleDefaults';

interface SaveChainModalProps {
  slots: ChainSlot[];
  onClose: () => void;
  onSaved?: (slug: string, shareCode: string) => void;
}

const PEAK_PRESETS = [
  { min: -24, max: -18, label: 'Quiet' },
  { min: -18, max: -12, label: 'Conservative' },
  { min: -12, max: -6, label: 'Standard' },
  { min: -6, max: -3, label: 'Hot' },
];

const SIGNAL_TYPES = [
  { value: 'individual_track', label: 'Individual Track' },
  { value: 'bus', label: 'Bus' },
  { value: 'master', label: 'Master' },
  { value: 'aux_send', label: 'Aux Send' },
];

const SOURCE_SUGGESTIONS = ['Vocal', 'Drums', 'Bass', 'Guitar', 'Keys', 'Synth', 'Master', 'Mix Bus'];

const DIFFICULTY_OPTIONS = ['Beginner', 'Intermediate', 'Advanced'];

const labelStyle: React.CSSProperties = { ...formLabelStyle, marginBottom: 'var(--space-1)' };

export function SaveChainModal({ slots, onClose, onSaved }: SaveChainModalProps) {
  const { isLoggedIn } = useSyncStore();
  const { saveChain, saving, error } = useCloudChainStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [useCaseGroup, setUseCaseGroup] = useState('mixing-mastering');
  const [useCase, setUseCase] = useState('mix-bus');
  const [tags, setTags] = useState('');
  const [peakMin, setPeakMin] = useState(-12);
  const [peakMax, setPeakMax] = useState(-6);
  const [isPublic, setIsPublic] = useState(false);
  const [savedResult, setSavedResult] = useState<{ slug: string; shareCode: string } | null>(null);

  // Context fields (collapsed by default)
  const [showContext, setShowContext] = useState(false);
  const [sourceInstrument, setSourceInstrument] = useState('');
  const [signalType, setSignalType] = useState('');
  const [bpm, setBpm] = useState<number | ''>('');
  const [subGenre, setSubGenre] = useState('');

  // Educator fields
  const [showEducator, setShowEducator] = useState(false);
  const [narrative, setNarrative] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [listenFor, setListenFor] = useState('');

  useModalEscape('save-chain-modal-escape', onClose);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const tagArray = tags.split(',').map(t => t.trim()).filter(Boolean);

    const result = await saveChain(name, slots, {
      description: description || undefined,
      category: useCaseGroup,
      useCase: useCase,
      tags: tagArray,
      targetInputPeakMin: peakMin,
      targetInputPeakMax: peakMax,
      isPublic,
      // Context fields
      sourceInstrument: sourceInstrument || undefined,
      signalType: signalType || undefined,
      bpm: bpm !== '' ? bpm : undefined,
      subGenre: subGenre || undefined,
      // Educator annotation
      educatorAnnotation: showEducator && narrative.trim() ? {
        narrative: narrative.trim(),
        difficulty: difficulty || undefined,
        listenFor: listenFor.trim() || undefined,
      } : undefined,
    });

    if (result.slug && result.shareCode) {
      setSavedResult({ slug: result.slug, shareCode: result.shareCode });
      onSaved?.(result.slug, result.shareCode);
    }
  };

  if (!isLoggedIn) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
        <div
          className="fixed bottom-0 left-0 right-0 z-50 rounded-t-xl animate-panel-slide-in-bottom"
          style={{
            background: 'rgba(15, 15, 15, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(222, 255, 10, 0.15)',
            borderBottom: 'none',
            maxHeight: '80vh',
            overflowY: 'auto',
            padding: 'var(--space-6)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-10 h-1 rounded-full bg-gray-600 mx-auto mb-4" style={{ marginTop: '-0.5rem' }} />
          <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--color-accent-cyan)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', marginBottom: 'var(--space-4)' }}>
            Sign In Required
          </h2>
          <p style={{ color: 'var(--color-text-primary)', fontSize: 'var(--text-title)', marginBottom: 'var(--space-4)' }}>
            Connect to ProChain to save and share your chains.
          </p>
          <button onClick={onClose} className="btn btn-primary w-full">Close</button>
        </div>
      </>
    );
  }

  if (savedResult) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
        <div
          className="fixed bottom-0 left-0 right-0 z-50 rounded-t-xl animate-panel-slide-in-bottom"
          style={{
            background: 'rgba(15, 15, 15, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(222, 255, 10, 0.15)',
            borderBottom: 'none',
            maxHeight: '80vh',
            overflowY: 'auto',
            padding: 'var(--space-6)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-10 h-1 rounded-full bg-gray-600 mx-auto mb-4" style={{ marginTop: '-0.5rem' }} />
          <div className="text-center">
            <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--color-accent-cyan)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', marginBottom: 'var(--space-2)' }}>
              Chain Saved
            </h2>
            <p style={{ color: 'var(--color-text-primary)', fontSize: 'var(--text-title)', marginBottom: 'var(--space-4)' }}>
              Your chain has been saved to ProChain.
            </p>

            <div style={{ background: 'var(--color-bg-input)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)', border: '1px solid var(--color-border-default)' }}>
              <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: 'var(--space-1)' }}>
                Share Code
              </div>
              <div style={{ fontSize: 'var(--text-4xl)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-accent-cyan)', letterSpacing: 'var(--tracking-widest)' }}>
                {savedResult.shareCode}
              </div>
            </div>

            {isPublic && (
              <div style={{ fontSize: 'var(--text-title)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
                View at: <span style={{ color: 'var(--color-accent-cyan)' }}>plugin-radar.com/chains/{savedResult.slug}</span>
              </div>
            )}

            <button onClick={onClose} className="btn btn-primary w-full">Done</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-xl animate-panel-slide-in-bottom glass-card"
        style={{
          borderBottom: 'none',
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: 'var(--space-6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-gray-600 mx-auto mb-4" style={{ marginTop: '-0.5rem' }} />
        <h2 style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--color-accent-cyan)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', marginBottom: 'var(--space-4)' }}>
          Save Chain
        </h2>

        {error && (
          <div style={{ background: 'rgba(255, 0, 51, 0.1)', border: '1px solid rgba(255, 0, 51, 0.3)', borderRadius: 'var(--radius-base)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)', color: 'var(--color-status-error)', fontSize: 'var(--text-title)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label style={labelStyle}>Chain Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Vocal Chain" required className="input w-full" />
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this chain good for?"
              rows={2}
              className="input w-full"
              style={{ resize: 'none' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Use Case</label>
            <CascadingDropdown
              groupValue={useCaseGroup}
              useCaseValue={useCase}
              groups={USE_CASE_GROUPS}
              onGroupChange={(group) => {
                setUseCaseGroup(group);
                const firstCase = USE_CASE_GROUPS.find(g => g.value === group)?.useCases[0];
                if (firstCase) setUseCase(firstCase.value);
              }}
              onUseCaseChange={setUseCase}
            />
          </div>

          <div>
            <label style={labelStyle}>Target Input Peak Range (dB)</label>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="number"
                value={peakMin}
                onChange={(e) => setPeakMin(Number(e.target.value))}
                className="input"
                style={{ width: '80px', textAlign: 'center' }}
                step={1}
                min={-60}
                max={0}
              />
              <span style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)' }}>to</span>
              <input
                type="number"
                value={peakMax}
                onChange={(e) => setPeakMax(Number(e.target.value))}
                className="input"
                style={{ width: '80px', textAlign: 'center' }}
                step={1}
                min={-60}
                max={0}
              />
              <span style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)' }}>dBpk</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {PEAK_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setPeakMin(p.min); setPeakMax(p.max); }}
                  className="btn"
                  style={{
                    fontSize: 'var(--text-body)',
                    padding: '2px 6px',
                    background: peakMin === p.min && peakMax === p.max ? 'var(--color-accent-cyan)' : undefined,
                    color: peakMin === p.min && peakMax === p.max ? 'var(--color-bg-primary)' : undefined,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
              Recommended input peak level for this chain to work as intended
            </p>
          </div>

          <div>
            <label style={labelStyle}>Tags (comma separated)</label>
            <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="warm, punchy, vintage" className="input w-full" />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isPublic"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              style={{ accentColor: 'var(--color-accent-cyan)' }}
            />
            <label htmlFor="isPublic" style={{ fontSize: 'var(--text-title)', color: 'var(--color-text-primary)' }}>
              Make this chain public (anyone can find and use it)
            </label>
          </div>

          {/* Collapsible context section */}
          <div style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setShowContext(!showContext)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-3)',
                background: 'var(--color-bg-secondary)',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--text-xs)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
              }}
            >
              <span>Add Context (optional)</span>
              <span style={{ fontSize: 'var(--text-body)', transition: 'transform 150ms', transform: showContext ? 'rotate(180deg)' : undefined }}>
                &#9662;
              </span>
            </button>
            {showContext && (
              <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div>
                  <label style={labelStyle}>Source Instrument</label>
                  <input
                    type="text"
                    value={sourceInstrument}
                    onChange={(e) => setSourceInstrument(e.target.value)}
                    placeholder="e.g. Vocal, Drums, Bass"
                    className="input w-full"
                    list="source-suggestions"
                  />
                  <datalist id="source-suggestions">
                    {SOURCE_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>
                <div>
                  <label style={labelStyle}>Signal Type</label>
                  <select
                    value={signalType}
                    onChange={(e) => setSignalType(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">-- Select --</option>
                    {SIGNAL_TYPES.map(st => (
                      <option key={st.value} value={st.value}>{st.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3">
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>BPM</label>
                    <input
                      type="number"
                      value={bpm}
                      onChange={(e) => setBpm(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="120"
                      className="input w-full"
                      min={20}
                      max={300}
                    />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={labelStyle}>Sub-genre</label>
                    <input
                      type="text"
                      value={subGenre}
                      onChange={(e) => setSubGenre(e.target.value)}
                      placeholder="e.g. Lo-fi Hip Hop"
                      className="input w-full"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Collapsible educator section */}
          <div style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setShowEducator(!showEducator)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-3)',
                background: 'var(--color-bg-secondary)',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--text-xs)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
              }}
            >
              <span>Educator Notes (optional)</span>
              <span style={{ fontSize: 'var(--text-body)', transition: 'transform 150ms', transform: showEducator ? 'rotate(180deg)' : undefined }}>
                &#9662;
              </span>
            </button>
            {showEducator && (
              <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div>
                  <label style={labelStyle}>Chain Narrative</label>
                  <textarea
                    value={narrative}
                    onChange={(e) => setNarrative(e.target.value)}
                    placeholder="Explain why you built this chain and the thinking behind each plugin choice..."
                    rows={3}
                    className="input w-full"
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">-- Select --</option>
                    {DIFFICULTY_OPTIONS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Listen For</label>
                  <textarea
                    value={listenFor}
                    onChange={(e) => setListenFor(e.target.value)}
                    placeholder="What should the listener pay attention to when A/B-ing this chain?"
                    rows={2}
                    className="input w-full"
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div style={{ background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: 'var(--space-2)' }}>Chain Preview</div>
            <div style={{ fontSize: 'var(--text-title)', color: 'var(--color-text-primary)' }}>
              {slots.length} plugin{slots.length !== 1 ? 's' : ''}:{' '}
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {slots.map(s => s.name).join(' → ')}
              </span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn flex-1">Cancel</button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className={`btn flex-1 ${saving ? '' : 'btn-primary'}`}
              style={saving ? { opacity: 0.6, cursor: 'wait', color: 'var(--color-accent-cyan)' } : undefined}
            >
              {saving ? 'Saving...' : 'Save Chain'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
