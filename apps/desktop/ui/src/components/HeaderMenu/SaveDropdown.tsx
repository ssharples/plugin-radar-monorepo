import { useState, useCallback } from 'react';
import { Save, Cloud, X } from 'lucide-react';
import { useChainStore } from '../../stores/chainStore';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { usePresetStore } from '../../stores/presetStore';
import { useSyncStore } from '../../stores/syncStore';

const CATEGORIES = [
  { value: 'vocal', label: '🎤 Vocal' },
  { value: 'drums', label: '🥁 Drums' },
  { value: 'bass', label: '🎸 Bass' },
  { value: 'guitar', label: '🎸 Guitar' },
  { value: 'keys', label: '🎹 Keys/Synth' },
  { value: 'mixing', label: '🎚️ Mixing' },
  { value: 'mastering', label: '🏆 Mastering' },
  { value: 'creative', label: '✨ Creative/FX' },
  { value: 'live', label: '🎤 Live' },
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
  const [category, setCategory] = useState('mixing');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [lufsTarget, setLufsTarget] = useState(targetInputLufs ?? -12);
  const [shareGlobally, setShareGlobally] = useState(false);
  const [savedResult, setSavedResult] = useState<{ slug: string; shareCode: string } | null>(null);
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
    const success = await savePreset(name.trim(), category);
    if (success) {
      setChainName(name.trim());
      setTargetInputLufs(lufsTarget);
      setLocalSaved(true);
      setTimeout(() => onClose(), 1200);
    }
  };

  const handleSaveAndShare = async () => {
    if (!name.trim() || !isLoggedIn) return;

    const result = await saveChain(name.trim(), slots, {
      description: description || undefined,
      category,
      tags,
      isPublic: shareGlobally,
      targetInputLufs: lufsTarget,
    });

    if (result.slug && result.shareCode) {
      setChainName(name.trim());
      setTargetInputLufs(lufsTarget);
      setSavedResult({ slug: result.slug, shareCode: result.shareCode });
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
            <div className="text-xl font-mono font-bold text-purple-400 tracking-widest">
              {savedResult.shareCode}
            </div>
          </div>
          {shareGlobally && (
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
          <span className="text-xs font-semibold text-plugin-text">Save Chain</span>
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
            <label className="block text-[11px] text-plugin-muted mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Vocal Chain"
              className="w-full bg-black/40 border border-plugin-border rounded px-2.5 py-1.5 text-xs text-plugin-text focus:outline-none focus:ring-1 focus:ring-plugin-accent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] text-plugin-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this chain good for?"
              rows={2}
              className="w-full bg-black/40 border border-plugin-border rounded px-2.5 py-1.5 text-xs text-plugin-text resize-none focus:outline-none focus:ring-1 focus:ring-plugin-accent"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-[11px] text-plugin-muted mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-black/40 border border-plugin-border rounded px-2.5 py-1.5 text-xs text-plugin-text focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[11px] text-plugin-muted mb-1">Tags</label>
            <div className="flex flex-wrap gap-1 mb-1.5">
              {tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => removeTag(tag)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded text-[10px] hover:bg-red-500/20 hover:text-red-300 transition-colors"
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
                  className="w-16 bg-transparent text-[10px] text-plugin-muted focus:outline-none placeholder:text-plugin-dim"
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
            <label className="block text-[11px] text-plugin-muted mb-1">
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
                className="w-14 bg-black/40 border border-plugin-border rounded px-2 py-1 text-xs text-plugin-text font-mono text-center focus:outline-none focus:ring-1 focus:ring-plugin-accent"
              />
              <span className="text-[10px] text-plugin-dim">dB</span>
              <select
                value={lufsTarget}
                onChange={(e) => setLufsTarget(Number(e.target.value))}
                className="flex-1 bg-black/40 border border-plugin-border rounded px-2 py-1 text-[10px] text-plugin-muted focus:outline-none"
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

          {/* Share globally */}
          {isLoggedIn && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="shareGlobally"
                checked={shareGlobally}
                onChange={(e) => setShareGlobally(e.target.checked)}
                className="rounded accent-purple-500"
              />
              <label htmlFor="shareGlobally" className="text-[11px] text-plugin-muted">
                Share globally (community)
              </label>
            </div>
          )}

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
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSaveLocal}
              disabled={saving || !name.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 border border-plugin-border text-plugin-muted hover:text-plugin-text hover:border-plugin-accent/40 rounded px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="w-3 h-3" />
              Save Local
            </button>
            {isLoggedIn && (
              <button
                onClick={handleSaveAndShare}
                disabled={saving || !name.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? (
                  'Saving...'
                ) : (
                  <>
                    <Cloud className="w-3 h-3" />
                    Save & Share
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
