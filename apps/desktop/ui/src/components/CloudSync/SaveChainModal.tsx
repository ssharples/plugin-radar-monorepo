import { useState, useEffect, useCallback, useRef } from 'react';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useSyncStore } from '../../stores/syncStore';
import { useKeyboardStore, ShortcutPriority } from '../../stores/keyboardStore';
import type { ChainSlot, MeterData } from '../../api/types';
import { CascadingDropdown } from '../Dropdown';
import { USE_CASE_GROUPS } from '../../constants/useCaseGroups';
import { juceBridge } from '../../api/juce-bridge';

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

const modalOverlayStyle: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(4px)',
};

const modalPanelStyle: React.CSSProperties = {
  maxWidth: '32rem',
  width: '100%',
  margin: '0 1rem',
  borderRadius: 'var(--radius-xl)',
  padding: 'var(--space-6)',
  border: '1px solid rgba(222, 255, 10, 0.15)',
  maxHeight: '85vh',
  overflowY: 'auto',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: 'var(--tracking-wide)',
  marginBottom: 'var(--space-1)',
};

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
  const [currentAvgPeak, setCurrentAvgPeak] = useState<number | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [savedResult, setSavedResult] = useState<{ slug: string; shareCode: string } | null>(null);
  const meterCleanupRef = useRef<(() => void) | null>(null);

  // Subscribe to meter data for live peak reading
  useEffect(() => {
    const cleanup = juceBridge.onMeterData((data: MeterData) => {
      const avgL = data.inputAvgPeakDbL ?? -100;
      const avgR = data.inputAvgPeakDbR ?? -100;
      const avg = Math.max(avgL, avgR);
      if (avg > -100) setCurrentAvgPeak(Math.round(avg * 10) / 10);
    });
    meterCleanupRef.current = cleanup;
    return () => { cleanup(); };
  }, []);

  const handleCapturePeak = useCallback(() => {
    if (currentAvgPeak == null) return;
    const rounded = Math.round(currentAvgPeak);
    setPeakMin(rounded - 3);
    setPeakMax(rounded + 3);
  }, [currentAvgPeak]);

  // Escape key to close (modal priority)
  useEffect(() => {
    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    return registerShortcut({
      id: 'save-chain-modal-escape',
      key: 'Escape',
      priority: ShortcutPriority.MODAL,
      allowInInputs: true,
      handler: (e) => {
        e.preventDefault();
        onClose();
      }
    });
  }, [onClose]);

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
    });

    if (result.slug && result.shareCode) {
      setSavedResult({ slug: result.slug, shareCode: result.shareCode });
      onSaved?.(result.slug, result.shareCode);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 fade-in" style={modalOverlayStyle} onClick={onClose}>
        <div className="glass scale-in" style={modalPanelStyle} onClick={(e) => e.stopPropagation()}>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-text-primary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', marginBottom: 'var(--space-4)' }}>
            Sign In Required
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
            Connect to ProChain to save and share your chains.
          </p>
          <button onClick={onClose} className="btn btn-primary w-full">Close</button>
        </div>
      </div>
    );
  }

  if (savedResult) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 fade-in" style={modalOverlayStyle} onClick={onClose}>
        <div className="glass scale-in" style={modalPanelStyle} onClick={(e) => e.stopPropagation()}>
          <div className="text-center">
            <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-text-primary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', marginBottom: 'var(--space-2)' }}>
              Chain Saved
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
              Your chain has been saved to ProChain.
            </p>

            <div style={{ background: 'var(--color-bg-input)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)', border: '1px solid var(--color-border-default)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: 'var(--space-1)' }}>
                Share Code
              </div>
              <div style={{ fontSize: 'var(--text-4xl)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-accent-cyan)', letterSpacing: 'var(--tracking-widest)' }}>
                {savedResult.shareCode}
              </div>
            </div>

            {isPublic && (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-4)' }}>
                View at: <span style={{ color: 'var(--color-accent-cyan)' }}>plugin-radar.com/chains/{savedResult.slug}</span>
              </div>
            )}

            <button onClick={onClose} className="btn btn-primary w-full">Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 fade-in" style={modalOverlayStyle} onClick={onClose}>
      <div className="glass scale-in" style={{ ...modalPanelStyle, maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-text-primary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', marginBottom: 'var(--space-4)' }}>
          Save Chain
        </h2>

        {error && (
          <div style={{ background: 'rgba(255, 0, 51, 0.1)', border: '1px solid rgba(255, 0, 51, 0.3)', borderRadius: 'var(--radius-base)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)', color: 'var(--color-status-error)', fontSize: 'var(--text-sm)' }}>
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
              <button
                type="button"
                onClick={handleCapturePeak}
                disabled={currentAvgPeak == null}
                className="btn btn-primary"
                style={{ fontSize: 'var(--text-xs)', padding: '4px 10px', opacity: currentAvgPeak == null ? 0.5 : 1 }}
              >
                Capture
              </button>
              <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                {currentAvgPeak != null ? `${currentAvgPeak.toFixed(1)} dBpk` : 'No signal'}
              </span>
            </div>
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
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>to</span>
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
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>dBpk</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {PEAK_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setPeakMin(p.min); setPeakMax(p.max); }}
                  className="btn"
                  style={{
                    fontSize: '9px',
                    padding: '2px 6px',
                    background: peakMin === p.min && peakMax === p.max ? 'var(--color-accent-cyan)' : undefined,
                    color: peakMin === p.min && peakMax === p.max ? 'var(--color-bg-primary)' : undefined,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-disabled)', marginTop: 'var(--space-1)' }}>
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
            <label htmlFor="isPublic" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              Make this chain public (anyone can find and use it)
            </label>
          </div>

          <div style={{ background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: 'var(--space-2)' }}>Chain Preview</div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
              {slots.length} plugin{slots.length !== 1 ? 's' : ''}:{' '}
              <span style={{ color: 'var(--color-text-tertiary)' }}>
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
    </div>
  );
}
