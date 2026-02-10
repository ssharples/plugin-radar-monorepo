import { useState, useRef, useEffect, useCallback } from 'react';
import { Save, FolderOpen, Globe, Settings, Check, X, Share2 } from 'lucide-react';
import { SaveDropdown } from './SaveDropdown';
import { LoadDropdown } from './LoadDropdown';
import { AvatarDropdown } from './AvatarDropdown';
import { QuickSharePanel } from './QuickSharePanel';
import { ChainBrowser } from '../ChainBrowser';
import { useChainStore } from '../../stores/chainStore';
import { usePresetStore } from '../../stores/presetStore';

type ActiveDropdown = 'save' | 'load' | 'browse' | 'share' | 'settings' | 'avatar' | null;

export function HeaderMenu() {
  const [active, setActive] = useState<ActiveDropdown>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const { chainName, setChainName, targetInputLufs } = useChainStore();
  const { loadPreset } = usePresetStore();

  const toggle = useCallback((dropdown: ActiveDropdown) => {
    setActive((prev) => (prev === dropdown ? null : dropdown));
  }, []);

  const close = useCallback(() => {
    setActive(null);
  }, []);

  // Handle sharePreset event from LoadDropdown
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.name && detail?.path) {
        loadPreset(detail.path).then((success) => {
          if (success) {
            setChainName(detail.name);
            setActive('share');
          }
        });
      }
    };
    window.addEventListener('sharePreset', handler);
    return () => window.removeEventListener('sharePreset', handler);
  }, [loadPreset, setChainName]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditingName) {
          setIsEditingName(false);
        } else {
          close();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [close, isEditingName]);

  // Close dropdowns on outside click (but not for browse modal)
  useEffect(() => {
    if (!active || active === 'browse') return;
    const handler = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    // Delay to avoid closing on the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [active, close]);

  // Auto-focus name input
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const startEditingName = () => {
    setEditName(chainName);
    setIsEditingName(true);
    setActive(null);
  };

  const commitName = () => {
    const trimmed = editName.trim();
    if (trimmed) {
      setChainName(trimmed);
    }
    setIsEditingName(false);
  };

  const cancelEditName = () => {
    setIsEditingName(false);
  };

  const btnBase =
    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase font-medium rounded transition-all relative';
  const btnInactive =
    'text-plugin-muted hover:text-plugin-text hover:bg-white/5';
  const btnActive = 'text-plugin-text bg-white/8 shadow-sm';

  return (
    <div ref={headerRef} className="relative">
      {/* Header bar */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-plugin-surface border-b border-plugin-border">
        {/* Avatar / Profile */}
        <AvatarDropdown isOpen={active === 'avatar'} onToggle={() => toggle('avatar')} onClose={close} />
        <div className="w-px h-5 bg-plugin-border mr-1" />

        {/* Save */}
        <button
          onClick={() => toggle('save')}
          className={`${btnBase} ${active === 'save' ? btnActive : btnInactive}`}
          title="Save chain"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save</span>
        </button>

        {/* Load */}
        <button
          onClick={() => toggle('load')}
          className={`${btnBase} ${active === 'load' ? btnActive : btnInactive}`}
          title="Load chain"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Load</span>
        </button>

        {/* Browse */}
        <button
          onClick={() => toggle('browse')}
          className={`${btnBase} ${active === 'browse' ? btnActive : btnInactive}`}
          title="Browse community chains"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Browse</span>
        </button>

        {/* Share */}
        <button
          onClick={() => toggle('share')}
          className={`${btnBase} ${active === 'share' ? btnActive : btnInactive}`}
          title="Share chain"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Share</span>
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-plugin-border mx-1" />

        {/* Chain Name */}
        {isEditingName ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              ref={nameInputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') cancelEditName();
              }}
              onBlur={commitName}
              className="flex-1 min-w-0 px-2 py-0.5 bg-black/40 border border-plugin-accent/50 rounded font-mono text-xs text-plugin-text font-medium focus:outline-none focus:ring-1 focus:ring-plugin-accent"
              maxLength={64}
            />
            <button
              onClick={commitName}
              className="p-0.5 text-green-400 hover:text-green-300"
              title="Confirm"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={cancelEditName}
              className="p-0.5 text-red-400 hover:text-red-300"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={startEditingName}
            className="flex-1 min-w-0 px-2 py-0.5 text-left text-xs font-medium text-plugin-text hover:text-plugin-accent truncate transition-colors group"
            title="Click to rename chain"
          >
            <span className="group-hover:underline decoration-dotted underline-offset-2">
              {chainName}
            </span>
            {targetInputLufs !== null && (
              <span className="ml-2 text-[10px] text-plugin-muted font-normal">
                🎚️ {targetInputLufs} LUFS
              </span>
            )}
          </button>
        )}

        {/* Settings */}
        <button
          onClick={() => toggle('settings')}
          className={`${btnBase} ${active === 'settings' ? btnActive : btnInactive}`}
          title="Chain settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Dropdown panels */}
      {active === 'save' && (
        <div className="absolute left-0 top-full z-50 mt-0.5">
          <SaveDropdown onClose={close} />
        </div>
      )}

      {active === 'load' && (
        <div className="absolute left-0 top-full z-50 mt-0.5">
          <LoadDropdown onClose={close} />
        </div>
      )}

      {active === 'share' && (
        <div className="absolute left-0 top-full z-50 mt-0.5">
          <QuickSharePanel onClose={close} />
        </div>
      )}

      {active === 'browse' && (
        <ChainBrowser onClose={close} />
      )}

      {active === 'settings' && (
        <div className="absolute right-0 top-full z-50 mt-0.5">
          <SettingsDropdown onClose={close} />
        </div>
      )}
    </div>
  );
}

/** Quick settings dropdown for chain-level metadata */
function SettingsDropdown({ onClose }: { onClose: () => void }) {
  const { targetInputLufs, setTargetInputLufs } = useChainStore();
  const [lufsValue, setLufsValue] = useState(targetInputLufs ?? -12);

  const LUFS_PRESETS = [
    { value: -24, label: '-24 (Quiet)' },
    { value: -18, label: '-18 (Conservative)' },
    { value: -14, label: '-14 (Moderate)' },
    { value: -12, label: '-12 (Standard)' },
    { value: -8, label: '-8 (Hot)' },
  ];

  const applyLufs = () => {
    setTargetInputLufs(lufsValue);
    onClose();
  };

  const clearLufs = () => {
    setTargetInputLufs(null);
    onClose();
  };

  return (
    <div className="w-72 bg-plugin-surface border border-plugin-border rounded-lg shadow-xl p-4 animate-slide-up">
      <h3 className="text-xs font-mono font-semibold text-plugin-text mb-3 uppercase tracking-wider">
        Chain Settings
      </h3>

      {/* Target LUFS */}
      <div className="mb-3">
        <label className="block text-[11px] font-mono text-plugin-muted mb-1.5">
          🎚️ Target Input LUFS
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={lufsValue}
            onChange={(e) => setLufsValue(Number(e.target.value))}
            min={-40}
            max={0}
            step={1}
            className="w-16 bg-black/40 border border-plugin-border rounded px-2 py-1 text-xs text-plugin-text font-mono text-center focus:outline-none focus:ring-1 focus:ring-plugin-accent"

          />
          <span className="text-[10px] text-plugin-dim">dB</span>
          <select
            value={lufsValue}
            onChange={(e) => setLufsValue(Number(e.target.value))}
            className="flex-1 bg-black/40 border border-plugin-border rounded px-2 py-1 text-[11px] font-mono text-plugin-muted focus:outline-none"
          >
            {LUFS_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[10px] text-plugin-dim mt-1">
          Recommended input level for this chain
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={clearLufs}
          className="flex-1 text-[11px] text-plugin-muted hover:text-plugin-text border border-plugin-border rounded px-2 py-1.5 transition-colors"
        >
          Clear Target
        </button>
        <button
          onClick={applyLufs}
          className="flex-1 text-[11px] text-white bg-plugin-accent hover:bg-plugin-accent/80 rounded px-2 py-1.5 font-medium transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
