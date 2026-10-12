import { useState, useRef, useEffect, useCallback } from 'react';
import { Save, FolderOpen, Settings, Check, X, Share2, Pencil, Workflow, Library } from 'lucide-react';
import { SaveDropdown } from './SaveDropdown';
import { LoadDropdown } from './LoadDropdown';
import { AvatarDropdown } from './AvatarDropdown';
import { QuickSharePanel } from './QuickSharePanel';
import { ProChainMark } from '../Brand/ProChainMark';
import { useChainStore } from '../../stores/chainStore';
import { usePresetStore } from '../../stores/presetStore';

type ActiveDropdown = 'save' | 'load' | 'share' | 'settings' | 'avatar' | null;

export type AppView = 'chain' | 'library';

interface HeaderMenuProps {
  /** Which main view is showing */
  view?: AppView;
  /** Switch between the chain editor and the chain library */
  onViewChange?: (view: AppView) => void;
}

/**
 * App top bar: brand, Chain/Library switch, chain name, and chain actions
 * (save, open, share, settings) plus the account menu.
 */
export function HeaderMenu({ view = 'chain', onViewChange }: HeaderMenuProps = {}) {
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

  // Close dropdowns on outside click
  useEffect(() => {
    if (!active) return;
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
    'h-8 inline-flex items-center gap-1.5 px-2.5 text-xs font-semibold rounded-md transition-colors relative';
  const btnInactive =
    'text-plugin-muted hover:text-plugin-text hover:bg-plugin-raised';
  const btnActive = 'text-plugin-text bg-plugin-raised';

  const tab = (id: AppView, label: string, Icon: typeof Workflow) => (
    <button
      onClick={() => onViewChange?.(id)}
      className={`h-7 inline-flex items-center gap-1.5 px-3 rounded-md text-xs font-semibold transition-colors ${
        view === id
          ? 'bg-plugin-raised text-plugin-text shadow-card'
          : 'text-plugin-muted hover:text-plugin-text'
      }`}
      aria-pressed={view === id}
    >
      <Icon className={`w-3.5 h-3.5 ${view === id ? 'text-plugin-accent' : ''}`} />
      {label}
    </button>
  );

  return (
    <div ref={headerRef} className="relative z-40">
      <div className="flex items-center gap-2 h-11 pl-3 pr-2 bg-plugin-surface border-b border-plugin-border">
        {/* Brand */}
        <ProChainMark className="flex-shrink-0" />

        {/* View switch */}
        <div className="flex items-center p-0.5 rounded-lg bg-plugin-bg border border-plugin-border ml-1">
          {tab('chain', 'Chain', Workflow)}
          {tab('library', 'Library', Library)}
        </div>

        <div className="w-px h-5 bg-plugin-border mx-1" />

        {/* Chain name */}
        {isEditingName ? (
          <div className="flex items-center gap-1 flex-1 min-w-0 max-w-[360px]">
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
              className="flex-1 min-w-0 h-7 px-2 bg-plugin-bg border border-plugin-accent/60 rounded-md text-[13px] text-plugin-text font-semibold focus:outline-none"
              maxLength={64}
            />
            <button onClick={commitName} className="w-6 h-6 inline-flex items-center justify-center rounded text-green-400 hover:bg-green-500/10" title="Confirm">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={cancelEditName} className="w-6 h-6 inline-flex items-center justify-center rounded text-red-400 hover:bg-red-500/10" title="Cancel">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={startEditingName}
            className="group min-w-0 flex items-center gap-1.5 h-7 px-1.5 -ml-0.5 rounded-md hover:bg-plugin-raised transition-colors"
            title="Click to rename chain"
          >
            <span className="truncate text-[13px] font-semibold text-plugin-text">{chainName}</span>
            <Pencil className="w-3 h-3 text-plugin-dim opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            {targetInputLufs !== null && (
              <span className="num flex-shrink-0 text-[10px] text-plugin-muted px-1.5 py-0.5 rounded bg-plugin-bg border border-plugin-border">
                {targetInputLufs} LUFS
              </span>
            )}
          </button>
        )}

        <div className="flex-1" />

        {/* Chain actions */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => toggle('save')}
            className={`${btnBase} ${active === 'save' ? btnActive : btnInactive}`}
            title="Save chain"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Save</span>
          </button>
          <button
            onClick={() => toggle('load')}
            className={`${btnBase} ${active === 'load' ? btnActive : btnInactive}`}
            title="Open a saved chain"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Open</span>
          </button>
          <button
            onClick={() => toggle('share')}
            className={`${btnBase} ${active === 'share' ? btnActive : btnInactive}`}
            title="Share chain"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Share</span>
          </button>
          <button
            onClick={() => toggle('settings')}
            className={`${btnBase} !px-2 ${active === 'settings' ? btnActive : btnInactive}`}
            title="Chain settings"
            aria-label="Chain settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="w-px h-5 bg-plugin-border mx-1" />

        {/* Account */}
        <AvatarDropdown isOpen={active === 'avatar'} onToggle={() => toggle('avatar')} onClose={close} />
      </div>

      {/* Dropdown panels */}
      {active === 'save' && (
        <div className="absolute right-2 top-full z-50 mt-1">
          <SaveDropdown onClose={close} />
        </div>
      )}

      {active === 'load' && (
        <div className="absolute right-2 top-full z-50 mt-1">
          <LoadDropdown onClose={close} />
        </div>
      )}

      {active === 'share' && (
        <div className="absolute right-2 top-full z-50 mt-1">
          <QuickSharePanel onClose={close} />
        </div>
      )}

      {active === 'settings' && (
        <div className="absolute right-2 top-full z-50 mt-1">
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
    <div className="w-72 bg-plugin-raised border border-plugin-border-bright rounded-lg shadow-panel p-4 animate-slide-up">
      <h3 className="text-[13px] font-semibold text-plugin-text mb-3">
        Chain settings
      </h3>

      {/* Target LUFS */}
      <div className="mb-3">
        <label className="block text-xs  text-plugin-muted mb-1.5">
          Target input loudness (LUFS)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={lufsValue}
            onChange={(e) => setLufsValue(Number(e.target.value))}
            min={-40}
            max={0}
            step={1}
            className="w-16 bg-plugin-bg border border-plugin-border rounded px-2 py-1 text-xs text-plugin-text  text-center focus:outline-none focus:ring-1 focus:ring-plugin-accent"

          />
          <span className="text-[11px] text-plugin-dim">dB</span>
          <select
            value={lufsValue}
            onChange={(e) => setLufsValue(Number(e.target.value))}
            className="flex-1 bg-plugin-bg border border-plugin-border rounded px-2 py-1 text-xs  text-plugin-muted focus:outline-none"
          >
            {LUFS_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[11px] text-plugin-dim mt-1">
          Recommended input level for this chain
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={clearLufs}
          className="flex-1 text-xs text-plugin-muted hover:text-plugin-text border border-plugin-border rounded px-2 py-1.5 transition-colors"
        >
          Clear Target
        </button>
        <button
          onClick={applyLufs}
          className="flex-1 text-xs text-plugin-on-accent bg-plugin-accent hover:bg-plugin-accent-bright rounded-md px-2 py-1.5 font-semibold transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
