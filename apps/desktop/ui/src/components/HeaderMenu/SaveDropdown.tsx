import { useState, useCallback } from 'react';
import { Save, Cloud, Globe, X } from 'lucide-react';
import { useChainStore } from '../../stores/chainStore';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { usePresetStore } from '../../stores/presetStore';
import { useSyncStore } from '../../stores/syncStore';

const USE_CASE_GROUPS = [
  { value: 'vocals', label: '🎤 Vocals', useCases: [
    { value: 'rap-vocals', label: 'Rap Vocals' },
    { value: 'female-vocals', label: 'Female Vocals' },
    { value: 'male-vocals', label: 'Male Vocals' },
    { value: 'backings', label: 'Backings' },
    { value: 'adlibs', label: 'Adlibs' },
    { value: 'harmonies', label: 'Harmonies' },
    { value: 'spoken-word', label: 'Spoken Word' },
  ]},
  { value: 'drums', label: '🥁 Drums', useCases: [
    { value: 'kick', label: 'Kick' },
    { value: 'snare', label: 'Snare' },
    { value: 'hats', label: 'Hats' },
    { value: 'drum-bus', label: 'Drum Bus' },
    { value: 'overheads', label: 'Overheads' },
    { value: 'toms', label: 'Toms' },
    { value: 'percussion', label: 'Percussion' },
  ]},
  { value: 'bass', label: '🎸 Bass', useCases: [
    { value: 'bass-guitar', label: 'Bass Guitar' },
    { value: 'sub-bass', label: 'Sub Bass' },
    { value: '808', label: '808' },
    { value: 'synth-bass', label: 'Synth Bass' },
  ]},
  { value: 'keys-synths', label: '🎹 Keys & Synths', useCases: [
    { value: 'piano', label: 'Piano' },
    { value: 'pads', label: 'Pads' },
    { value: 'leads', label: 'Leads' },
    { value: 'organs', label: 'Organs' },
    { value: 'strings', label: 'Strings' },
  ]},
  { value: 'guitar', label: '🎸 Guitar', useCases: [
    { value: 'electric-guitar', label: 'Electric Guitar' },
    { value: 'acoustic-guitar', label: 'Acoustic Guitar' },
    { value: 'guitar-bus', label: 'Guitar Bus' },
  ]},
  { value: 'fx-creative', label: '✨ FX & Creative', useCases: [
    { value: 'experimental', label: 'Experimental' },
    { value: 'sound-design', label: 'Sound Design' },
    { value: 'ambient', label: 'Ambient' },
    { value: 'risers-impacts', label: 'Risers & Impacts' },
  ]},
  { value: 'mixing-mastering', label: '🎚️ Mixing & Mastering', useCases: [
    { value: 'mix-bus', label: 'Mix Bus' },
    { value: 'master-chain', label: 'Master Chain' },
    { value: 'stem-mixing', label: 'Stem Mixing' },
    { value: 'live-performance', label: 'Live Performance' },
  ]},
];

const LUFS_PRESETS = [
  { value: -24, label: '-24 (Quiet)' },
  { value: -18, label: '-18 (Conservative)' },
  { value: -14, label: '-14 (Moderate)' },
  { value: -12, label: '-12 (Standard)' },
  { value: -8, label: '-8 (Hot)' },
];

const SUGGESTED_TAGS = ['warm', 'punchy', 'vintage', 'modern', 'clean', 'aggressive', 'subtle', 'transparent', 'thick', 'airy'];

interface SaveDropdownProps {
  onClose: () => void;
}

export function SaveDropdown({ onClose }: SaveDropdownProps) {
  const { chainName, slots, targetInputLufs, setTargetInputLufs, setChainName } = useChainStore();
  const { saveChain, saving, error } = useCloudChainStore();
  const { savePreset } = usePresetStore();
  const { isLoggedIn } = useSyncStore();

  const [name, setName] = useState(chainName || 'Untitled Chain');
  const [description, setDescription] = useState('');
  const [useCaseGroup, setUseCaseGroup] = useState('mixing-mastering');
  const [useCase, setUseCase] = useState('mix-bus');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [lufsTarget, setLufsTarget] = useState(targetInputLufs ?? -12);
  const [savedResult, setSavedResult] = useState<{ slug: string; shareCode: string; isPublic?: boolean } | null>(null);
  const [localSaved, setLocalSaved] = useState(false);

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
      setTargetInputLufs(lufsTarget);
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
      targetInputLufs: lufsTarget,
    });

    if (result.slug && result.shareCode) {
      setChainName(name.trim());
      setTargetInputLufs(lufsTarget);
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
      targetInputLufs: lufsTarget,
    });

    if (result.slug && result.shareCode) {
      setChainName(name.trim());
      setTargetInputLufs(lufsTarget);
      setSavedResult({ slug: result.slug, shareCode: result.shareCode, isPublic: false });
    }
  };

  // Success states
  if (localSaved) {
    return (
      <div className="w-80 bg-plugin-surface border border-plugin-border rounded-lg shadow-xl p-5 animate-slide-up">
        <div className="text-center">
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm text-plugin-text font-medium">Saved locally!</p>
        </div>
      </div>
    );
  }

  if (savedResult) {
    return (
      <div className="w-80 bg-plugin-surface border border-plugin-border rounded-lg shadow-xl p-5 animate-slide-up">
        <div className="text-center">
          <div className="text-3xl mb-2">🎉</div>
          <p className="text-sm text-plugin-text font-medium mb-3">Chain saved!</p>
          <div className="bg-black/30 rounded-lg p-3 mb-3">
            <div className="text-[10px] text-plugin-muted mb-1">Share Code</div>
            <div className="text-xl font-mono font-bold text-plugin-accent tracking-widest">
              {savedResult.shareCode}
            </div>
          </div>
          {savedResult.isPublic && (
            <p className="text-[10px] text-plugin-dim mb-3">
              Public at: plugin-radar.com/chains/{savedResult.slug}
            </p>
          )}
          <button
            onClick={onClose}
            className="text-xs text-plugin-muted hover:text-plugin-text"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  const hasPlugins = slots.length > 0;

  return (
    <div className="w-80 bg-plugin-surface border border-plugin-border rounded-lg shadow-xl animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-plugin-border">
        <div className="flex items-center gap-2">
          <Save className="w-3.5 h-3.5 text-plugin-accent" />
          <span className="text-xs font-mono uppercase font-semibold text-plugin-text">Save Chain</span>
        </div>
        <button onClick={onClose} className="text-plugin-dim hover:text-plugin-text">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {!hasPlugins ? (
        <div className="p-4 text-center text-xs text-plugin-muted">
          Add plugins to your chain before saving.
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {error && (
            <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-plugin-muted mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Vocal Chain"
              className="w-full bg-black/40 border border-plugin-border rounded font-mono px-2.5 py-1.5 text-xs text-plugin-text focus:outline-none focus:ring-1 focus:ring-plugin-accent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-plugin-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this chain good for?"
              rows={2}
              className="w-full bg-black/40 border border-plugin-border rounded font-mono px-2.5 py-1.5 text-xs text-plugin-text resize-none focus:outline-none focus:ring-1 focus:ring-plugin-accent"
            />
          </div>

          {/* Use Case */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-plugin-muted mb-1">Use Case</label>
            <div className="flex gap-1.5">
              <select
                value={useCaseGroup}
                onChange={(e) => {
                  const group = USE_CASE_GROUPS.find((g) => g.value === e.target.value);
                  setUseCaseGroup(e.target.value);
                  if (group?.useCases[0]) setUseCase(group.useCases[0].value);
                }}
                className="flex-1 bg-black/40 border border-plugin-border rounded font-mono px-2 py-1.5 text-xs text-plugin-text focus:outline-none"
              >
                {USE_CASE_GROUPS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
              <select
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                className="flex-1 bg-black/40 border border-plugin-border rounded font-mono px-2 py-1.5 text-xs text-plugin-text focus:outline-none"
              >
                {USE_CASE_GROUPS.find((g) => g.value === useCaseGroup)?.useCases.map((uc) => (
                  <option key={uc.value} value={uc.value}>{uc.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-plugin-muted mb-1">Tags</label>
            <div className="flex flex-wrap gap-1 mb-1.5">
              {tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => removeTag(tag)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 bg-plugin-accent/20 text-plugin-accent rounded text-[10px] hover:bg-plugin-danger/20 hover:text-plugin-danger transition-colors"
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
                  className="w-16 bg-transparent font-mono text-[10px] text-plugin-muted focus:outline-none placeholder:text-plugin-dim"
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
                    className="px-1.5 py-0.5 bg-white/5 text-plugin-dim rounded text-[9px] hover:bg-white/10 hover:text-plugin-muted transition-colors"
                  >
                    + {t}
                  </button>
                ))}
            </div>
          </div>

          {/* Target LUFS */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-plugin-muted mb-1">
              🎚️ Target Input LUFS
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={lufsTarget}
                onChange={(e) => setLufsTarget(Number(e.target.value))}
                min={-40}
                max={0}
                step={1}
                className="w-14 bg-black/40 border border-plugin-border rounded px-2 py-1 font-mono text-xs text-plugin-text text-center focus:outline-none focus:ring-1 focus:ring-plugin-accent"
              />
              <span className="text-[10px] text-plugin-dim">dB</span>
              <select
                value={lufsTarget}
                onChange={(e) => setLufsTarget(Number(e.target.value))}
                className="flex-1 bg-black/40 border border-plugin-border rounded px-2 py-1 font-mono text-[10px] text-plugin-muted focus:outline-none"
              >
                {LUFS_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <p className="text-[9px] text-plugin-dim mt-0.5">
              Recommended input level for this chain to work as intended
            </p>
          </div>

          {/* Chain preview */}
          <div className="bg-black/20 rounded p-2">
            <div className="text-[10px] text-plugin-dim mb-1">
              {slots.length} plugin{slots.length !== 1 ? 's' : ''}
            </div>
            <div className="text-[10px] text-plugin-muted truncate">
              {slots.map((s) => s.name).join(' → ')}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-1.5 pt-1">
            <button
              onClick={handleSaveLocal}
              disabled={saving || !name.trim()}
              className="w-full flex items-center justify-center gap-1.5 border border-plugin-border text-plugin-muted hover:text-plugin-text hover:border-plugin-accent/40 rounded px-3 py-1.5 text-[11px] font-mono uppercase font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="w-3 h-3" />
              Save Local
            </button>
            {isLoggedIn ? (
              <>
                <button
                  onClick={handleSaveGlobal}
                  disabled={saving || !name.trim()}
                  className="w-full flex items-center justify-center gap-1.5 bg-plugin-accent hover:bg-plugin-accent-dim text-black rounded px-3 py-1.5 text-[11px] font-mono uppercase font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : (
                    <>
                      <Globe className="w-3 h-3" />
                      Save Global
                    </>
                  )}
                </button>
                <button
                  onClick={handleSaveAndGetCode}
                  disabled={saving || !name.trim()}
                  className="w-full flex items-center justify-center gap-1.5 border border-plugin-accent/40 text-plugin-accent hover:text-plugin-text hover:bg-plugin-accent/10 rounded px-3 py-1.5 text-[11px] font-mono uppercase font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Cloud className="w-3 h-3" />
                  Save & Get Code
                </button>
              </>
            ) : (
              <p className="text-[10px] text-plugin-dim text-center">Log in to save to cloud</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
