import { useState, useCallback } from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Save, Cloud, Globe, X } from 'lucide-react';
import { useChainStore } from '../../stores/chainStore';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { usePresetStore } from '../../stores/presetStore';
import { useSyncStore } from '../../stores/syncStore';
import { juceBridge } from '../../api/juce-bridge';
import { CustomDropdown } from '../Dropdown';
import type { DropdownOption } from '../Dropdown';
import type { MeterData } from '../../api/types';

const USE_CASE_GROUPS = [
  { value: 'vocals', label: 'Vocals', useCases: [
    { value: 'rap-vocals', label: 'Rap Vocals' },
    { value: 'female-vocals', label: 'Female Vocals' },
    { value: 'male-vocals', label: 'Male Vocals' },
    { value: 'backings', label: 'Backings' },
    { value: 'adlibs', label: 'Adlibs' },
    { value: 'harmonies', label: 'Harmonies' },
    { value: 'spoken-word', label: 'Spoken Word' },
  ]},
  { value: 'drums', label: 'Drums', useCases: [
    { value: 'kick', label: 'Kick' },
    { value: 'snare', label: 'Snare' },
    { value: 'hats', label: 'Hats' },
    { value: 'drum-bus', label: 'Drum Bus' },
    { value: 'overheads', label: 'Overheads' },
    { value: 'toms', label: 'Toms' },
    { value: 'percussion', label: 'Percussion' },
  ]},
  { value: 'bass', label: 'Bass', useCases: [
    { value: 'bass-guitar', label: 'Bass Guitar' },
    { value: 'sub-bass', label: 'Sub Bass' },
    { value: '808', label: '808' },
    { value: 'synth-bass', label: 'Synth Bass' },
  ]},
  { value: 'keys-synths', label: 'Keys & Synths', useCases: [
    { value: 'piano', label: 'Piano' },
    { value: 'pads', label: 'Pads' },
    { value: 'leads', label: 'Leads' },
    { value: 'organs', label: 'Organs' },
    { value: 'strings', label: 'Strings' },
  ]},
  { value: 'guitar', label: 'Guitar', useCases: [
    { value: 'electric-guitar', label: 'Electric Guitar' },
    { value: 'acoustic-guitar', label: 'Acoustic Guitar' },
    { value: 'guitar-bus', label: 'Guitar Bus' },
  ]},
  { value: 'fx-creative', label: 'FX & Creative', useCases: [
    { value: 'experimental', label: 'Experimental' },
    { value: 'sound-design', label: 'Sound Design' },
    { value: 'ambient', label: 'Ambient' },
    { value: 'risers-impacts', label: 'Risers & Impacts' },
  ]},
  { value: 'mixing-mastering', label: 'Mixing & Mastering', useCases: [
    { value: 'mix-bus', label: 'Mix Bus' },
    { value: 'master-chain', label: 'Master Chain' },
    { value: 'stem-mixing', label: 'Stem Mixing' },
    { value: 'live-performance', label: 'Live Performance' },
  ]},
];

const PEAK_PRESETS = [
  { min: -24, max: -18, label: 'Quiet (-24 to -18)' },
  { min: -18, max: -12, label: 'Conservative (-18 to -12)' },
  { min: -12, max: -6, label: 'Standard (-12 to -6)' },
  { min: -6, max: -3, label: 'Hot (-6 to -3)' },
];

const SUGGESTED_TAGS = ['warm', 'punchy', 'vintage', 'modern', 'clean', 'aggressive', 'subtle', 'transparent', 'thick', 'airy'];

/* Shared styles */
const glassPanel: React.CSSProperties = {
  background: 'rgba(15, 15, 15, 0.9)',
  backdropFilter: 'blur(12px)',
  border: '1px solid var(--color-border-default)',
  boxShadow: 'var(--shadow-elevated)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-xs)',
  fontFamily: 'var(--font-mono)',
  color: 'var(--color-text-secondary)',
  textTransform: 'uppercase' as const,
  letterSpacing: 'var(--tracking-wide)',
  marginBottom: '4px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-bg-input)',
  border: '1px solid var(--color-border-default)',
  borderRadius: 'var(--radius-base)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-primary)',
  padding: '6px 10px',
  outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
};

interface SaveDropdownProps {
  onClose: () => void;
}

export function SaveDropdown({ onClose }: SaveDropdownProps) {
  const { chainName, slots, targetInputPeakMin, targetInputPeakMax, setTargetInputPeakRange, setChainName } = useChainStore();
  const { saveChain, saving, error } = useCloudChainStore();
  const { savePreset } = usePresetStore();
  const { isLoggedIn } = useSyncStore();

  const [name, setName] = useState(chainName || 'Untitled Chain');
  const [description, setDescription] = useState('');
  const [useCaseGroup, setUseCaseGroup] = useState('mixing-mastering');
  const [useCase, setUseCase] = useState('mix-bus');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [peakMin, setPeakMin] = useState(targetInputPeakMin ?? -12);
  const [peakMax, setPeakMax] = useState(targetInputPeakMax ?? -6);
  const [savedResult, setSavedResult] = useState<{ slug: string; shareCode: string; isPublic?: boolean } | null>(null);
  const [localSaved, setLocalSaved] = useState(false);
  const [currentAvgPeak, setCurrentAvgPeak] = useState(-100);

  // Subscribe to meter data for "Capture" feature
  useEffect(() => {
    const unsub = juceBridge.onMeterData((data: MeterData) => {
      const avg = Math.max(data.inputAvgPeakDbL ?? -100, data.inputAvgPeakDbR ?? -100);
      setCurrentAvgPeak(avg);
    });
    return unsub;
  }, []);

  const handleCapturePeak = useCallback(() => {
    if (currentAvgPeak > -60) {
      const rounded = Math.round(currentAvgPeak);
      setPeakMin(rounded - 3);
      setPeakMax(rounded + 3);
    }
  }, [currentAvgPeak]);

  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  }, [tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleSaveLocal = async () => {
    if (!name.trim()) return;
    const success = await savePreset(name.trim(), useCaseGroup);
    if (success) {
      setChainName(name.trim());
      setTargetInputPeakRange(peakMin, peakMax);
      setLocalSaved(true);
      setTimeout(() => onClose(), 1200);
    }
  };

  const handleSaveGlobal = async () => {
    if (!name.trim() || !isLoggedIn) return;

    const result = await saveChain(name.trim(), slots, {
      description: description || undefined,
      category: useCaseGroup,
      useCase,
      tags,
      isPublic: true,
      targetInputPeakMin: peakMin,
      targetInputPeakMax: peakMax,
    });

    if (result.slug && result.shareCode) {
      setChainName(name.trim());
      setTargetInputPeakRange(peakMin, peakMax);
      setSavedResult({ slug: result.slug, shareCode: result.shareCode, isPublic: true });
    }
  };

  const handleSaveAndGetCode = async () => {
    if (!name.trim() || !isLoggedIn) return;

    const result = await saveChain(name.trim(), slots, {
      description: description || undefined,
      category: useCaseGroup,
      useCase,
      tags,
      isPublic: false,
      targetInputPeakMin: peakMin,
      targetInputPeakMax: peakMax,
    });

    if (result.slug && result.shareCode) {
      setChainName(name.trim());
      setTargetInputPeakRange(peakMin, peakMax);
      setSavedResult({ slug: result.slug, shareCode: result.shareCode, isPublic: false });
    }
  };

  // Success states
  if (localSaved) {
    return (
      <div className="w-80 rounded-md p-5 scale-in" style={glassPanel}>
        <div className="text-center">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
            style={{ background: 'rgba(0, 255, 136, 0.15)', border: '1px solid rgba(0, 255, 136, 0.3)' }}
          >
            <Save className="w-5 h-5" style={{ color: 'var(--color-status-active)' }} />
          </div>
          <p style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Saved locally
          </p>
        </div>
      </div>
    );
  }

  if (savedResult) {
    return (
      <div className="w-80 rounded-md p-5 scale-in" style={glassPanel}>
        <div className="text-center">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
            style={{ background: 'rgba(222, 255, 10, 0.15)', border: '1px solid rgba(222, 255, 10, 0.3)' }}
          >
            <Cloud className="w-5 h-5" style={{ color: 'var(--color-accent-cyan)' }} />
          </div>
          <p className="mb-3" style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Chain saved
          </p>
          <div
            className="rounded-md p-3 mb-3"
            style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border-default)' }}
          >
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: '4px' }}>
              Share Code
            </div>
            <div style={{ fontSize: 'var(--text-3xl)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-accent-cyan)', letterSpacing: 'var(--tracking-widest)' }}>
              {savedResult.shareCode}
            </div>
          </div>
          {savedResult.isPublic && (
            <p className="mb-3" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              plugin-radar.com/chains/{savedResult.slug}
            </p>
          )}
          <button
            onClick={onClose}
            className="btn"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  const hasPlugins = slots.length > 0;

  return (
    <div className="w-80 rounded-md scale-in" style={glassPanel}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
        <div className="flex items-center gap-2">
          <Save className="w-3.5 h-3.5" style={{ color: 'var(--color-accent-cyan)' }} />
          <span style={{
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-extended)',
            fontWeight: 900,
            color: 'var(--color-text-primary)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wider)',
          }}>
            Save Chain
          </span>
        </div>
        <button
          onClick={onClose}
          className="transition-colors duration-150"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {!hasPlugins ? (
        <div className="p-4 text-center" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
          Add plugins to your chain before saving.
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {error && (
            <div
              className="rounded px-2 py-1.5"
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-status-error)',
                background: 'rgba(255, 0, 51, 0.1)',
                border: '1px solid rgba(255, 0, 51, 0.2)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Vocal Chain"
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-cyan)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--color-accent-cyan)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this chain good for?"
              rows={2}
              style={{ ...inputStyle, resize: 'none' } as React.CSSProperties}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-cyan)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
            />
          </div>

          {/* Use Case */}
          <div>
            <label style={labelStyle}>Use Case</label>
            <div className="flex gap-1.5">
              <div className="flex-1">
                <CustomDropdown
                  value={useCaseGroup}
                  options={USE_CASE_GROUPS.map((g) => ({ value: g.value, label: g.label }))}
                  onChange={(val) => {
                    const group = USE_CASE_GROUPS.find((g) => g.value === val);
                    setUseCaseGroup(val);
                    if (group?.useCases[0]) setUseCase(group.useCases[0].value);
                  }}
                  size="sm"
                />
              </div>
              <div className="flex-1">
                <CustomDropdown
                  value={useCase}
                  options={(USE_CASE_GROUPS.find((g) => g.value === useCaseGroup)?.useCases ?? []).map((uc) => ({ value: uc.value, label: uc.label }))}
                  onChange={setUseCase}
                  size="sm"
                />
              </div>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label style={labelStyle}>Tags</label>
            <div className="flex flex-wrap gap-1 mb-1.5">
              {tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => removeTag(tag)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-colors duration-150"
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-accent-cyan)',
                    background: 'rgba(222, 255, 10, 0.1)',
                    border: '1px solid rgba(222, 255, 10, 0.2)',
                  }}
                  title="Remove tag"
                >
                  {tag}
                  <X className="w-2.5 h-2.5" />
                </button>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && tagInput.trim()) {
                      e.preventDefault();
                      addTag(tagInput);
                    }
                  }}
                  placeholder={tags.length === 0 ? 'Add tag...' : '+'}
                  style={{
                    width: '64px',
                    background: 'transparent',
                    border: 'none',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-secondary)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
            {/* Suggested tags */}
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_TAGS.filter((t) => !tags.includes(t))
                .slice(0, 6)
                .map((t) => (
                  <button
                    key={t}
                    onClick={() => addTag(t)}
                    className="px-1.5 py-0.5 rounded transition-colors duration-150"
                    style={{
                      fontSize: '9px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-text-tertiary)',
                      background: 'var(--color-bg-elevated)',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    + {t}
                  </button>
                ))}
            </div>
          </div>

          {/* Target Input Peak Range */}
          <div>
            <label style={labelStyle}>Target Input Peak (dBpk)</label>
            <div className="flex items-center gap-2 mb-1.5">
              <button
                onClick={handleCapturePeak}
                disabled={currentAvgPeak <= -60}
                className="flex items-center gap-1 rounded transition-all duration-150"
                style={{
                  padding: '4px 8px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: currentAvgPeak > -60 ? 'var(--color-accent)' : '#666',
                  background: currentAvgPeak > -60 ? 'rgba(137, 87, 42, 0.15)' : 'transparent',
                  border: `1px solid ${currentAvgPeak > -60 ? 'var(--color-accent)' : '#333'}`,
                  cursor: currentAvgPeak > -60 ? 'pointer' : 'not-allowed',
                }}
                title={currentAvgPeak > -60 ? `Capture current avg peak (${currentAvgPeak.toFixed(1)} dB) ±3 dB` : 'Play audio to capture peak level'}
              >
                Capture {currentAvgPeak > -60 ? `(${currentAvgPeak.toFixed(0)} dB)` : ''}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>Min</span>
                <input
                  type="number"
                  value={peakMin}
                  onChange={(e) => setPeakMin(Number(e.target.value))}
                  style={{ ...inputStyle, padding: '4px 8px', fontSize: '11px' }}
                  step={1}
                />
              </div>
              <span style={{ color: 'var(--color-text-tertiary)', marginTop: '14px' }}>—</span>
              <div className="flex-1">
                <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>Max</span>
                <input
                  type="number"
                  value={peakMax}
                  onChange={(e) => setPeakMax(Number(e.target.value))}
                  style={{ ...inputStyle, padding: '4px 8px', fontSize: '11px' }}
                  step={1}
                />
              </div>
            </div>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {PEAK_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => { setPeakMin(p.min); setPeakMax(p.max); }}
                  className="rounded transition-all duration-150"
                  style={{
                    padding: '2px 6px',
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    color: peakMin === p.min && peakMax === p.max ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                    background: peakMin === p.min && peakMax === p.max ? 'rgba(255,255,255,0.08)' : 'transparent',
                    border: `1px solid ${peakMin === p.min && peakMax === p.max ? 'var(--color-border-default)' : 'transparent'}`,
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-1" style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              Recommended input peak level for this chain to work as intended
            </p>
          </div>

          {/* Chain preview */}
          <div
            className="rounded-md p-2"
            style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border-subtle)' }}
          >
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              {slots.length} plugin{slots.length !== 1 ? 's' : ''}
            </div>
            <div className="truncate" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {slots.map((s) => s.name).join(' → ')}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-1.5 pt-1">
            <button
              onClick={handleSaveLocal}
              disabled={saving || !name.trim()}
              className="w-full flex items-center justify-center gap-1.5 rounded transition-all duration-150"
              style={{
                padding: '6px 12px',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-default)',
                background: 'transparent',
                opacity: saving || !name.trim() ? 0.4 : 1,
                cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              <Save className="w-3 h-3" />
              Save Local
            </button>
            {isLoggedIn ? (
              <>
                <button
                  onClick={handleSaveGlobal}
                  disabled={saving || !name.trim()}
                  className="btn btn-primary w-full"
                  style={{ opacity: saving || !name.trim() ? 0.4 : 1 }}
                >
                  {saving ? 'Saving...' : (
                    <span className="flex items-center justify-center gap-1.5">
                      <Globe className="w-3 h-3" />
                      Save Global
                    </span>
                  )}
                </button>
                <button
                  onClick={handleSaveAndGetCode}
                  disabled={saving || !name.trim()}
                  className="w-full flex items-center justify-center gap-1.5 rounded transition-all duration-150"
                  style={{
                    padding: '6px 12px',
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-wide)',
                    color: 'var(--color-accent-cyan)',
                    border: '1px solid rgba(222, 255, 10, 0.3)',
                    background: 'transparent',
                    opacity: saving || !name.trim() ? 0.4 : 1,
                    cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Cloud className="w-3 h-3" />
                  Save & Get Code
                </button>
              </>
            ) : (
              <p className="text-center" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                Log in to save to cloud
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
