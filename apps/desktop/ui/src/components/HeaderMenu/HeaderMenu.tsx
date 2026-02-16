import { useState, useRef, useEffect, useCallback } from 'react';
import { Save, FolderOpen, Settings, X, Send, HelpCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { SaveDropdown } from './SaveDropdown';
import { AvatarDropdown } from './AvatarDropdown';
import { QuickSharePanel } from './QuickSharePanel';
import { ChainBrowser } from '../ChainBrowser';
import { CustomDropdown } from '../Dropdown';
import { useChainStore } from '../../stores/chainStore';
import { usePresetStore } from '../../stores/presetStore';
import type { PresetInfo } from '../../api/types';
import { useKeyboardStore, ShortcutPriority } from '../../stores/keyboardStore';
import { juceBridge } from '../../api/juce-bridge';
import prochainLogo from '../../assets/prochain-logo.png';

type ActiveDropdown = 'save' | 'browse' | 'share' | 'settings' | 'avatar' | null;

export function HeaderMenu() {
  const [active, setActive] = useState<ActiveDropdown>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const { chainName, setChainName, targetInputPeakMin, targetInputPeakMax } = useChainStore();
  const { presets, currentPreset, loadPreset } = usePresetStore();

  const navigatePreset = useCallback((direction: -1 | 1) => {
    if (presets.length === 0) return;
    const currentIdx = currentPreset
      ? presets.findIndex((p: PresetInfo) => p.path === currentPreset.path)
      : -1;
    let nextIdx: number;
    if (currentIdx === -1) {
      nextIdx = direction === 1 ? 0 : presets.length - 1;
    } else {
      nextIdx = (currentIdx + direction + presets.length) % presets.length;
    }
    loadPreset(presets[nextIdx].path);
  }, [presets, currentPreset, loadPreset]);

  const toggle = useCallback((dropdown: ActiveDropdown) => {
    setActive((prev) => (prev === dropdown ? null : dropdown));
  }, []);

  const close = useCallback(() => {
    setActive(null);
  }, []);

  // Handle sharePreset event from LocalTab
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

  // Close on Escape (component priority)
  useEffect(() => {
    const registerShortcut = useKeyboardStore.getState().registerShortcut;
    return registerShortcut({
      id: 'header-menu-escape',
      key: 'Escape',
      priority: ShortcutPriority.COMPONENT,
      allowInInputs: true, // Allow Escape when editing name
      handler: (e) => {
        if (isEditingName) {
          e.preventDefault();
          setIsEditingName(false);
        } else if (active) {
          e.preventDefault();
          close();
        }
      }
    });
  }, [close, isEditingName, active]);

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

  const commitNameAndSave = () => {
    const trimmed = editName.trim();
    if (trimmed) {
      setChainName(trimmed);
    }
    setIsEditingName(false);
    setActive('save');
  };

  const cancelEditName = () => {
    setIsEditingName(false);
  };

  const btnBase =
    'flex items-center justify-center w-7 h-7 rounded transition-all duration-150 relative';
  const btnInactive =
    'text-[var(--color-text-secondary)] hover:text-[var(--color-accent-cyan)] hover:bg-[rgba(0,240,255,0.08)]';
  const btnActive = 'text-[var(--color-accent-cyan)] bg-[rgba(0,240,255,0.12)] shadow-[0_0_8px_rgba(0,240,255,0.2)]';

  return (
    <div ref={headerRef} className="relative">
      {/* Header bar — cyber command bar */}
      <div
        className="flex items-center gap-1 px-3 py-1.5"
        style={{
          background: 'var(--color-bg-primary)',
          borderBottom: '1px solid var(--color-border-default)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {/* Logo */}
        <img src={prochainLogo} alt="ProChain" className="h-5 mr-2 opacity-80" />

        {/* Avatar / Profile */}
        <AvatarDropdown isOpen={active === 'avatar'} onToggle={() => toggle('avatar')} onClose={close} />
        <div className="w-px h-5 mx-1" style={{ background: 'var(--color-border-default)' }} />

        {/* Browse (includes local chains) */}
        <button
          onClick={() => toggle('browse')}
          className={`${btnBase} ${active === 'browse' ? btnActive : btnInactive}`}
          title="Browse chains"
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </button>

        {/* Share */}
        <button
          onClick={() => toggle('share')}
          className={`${btnBase} ${active === 'share' ? btnActive : btnInactive}`}
          title="Share chain"
        >
          <Send className="w-3.5 h-3.5" />
        </button>

        {/* Divider */}
        <div className="w-px h-5 mx-1" style={{ background: 'var(--color-border-default)' }} />

        {/* Chain Name */}
        {isEditingName ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              ref={nameInputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitNameAndSave();
                if (e.key === 'Escape') cancelEditName();
              }}
              onBlur={commitName} /* blur just saves name, doesn't open modal */
              className="flex-1 min-w-0 px-2 py-0.5 rounded text-xs font-medium focus:outline-none"
              style={{
                background: 'var(--color-bg-input)',
                border: '1px solid var(--color-accent-cyan)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-mono)',
                boxShadow: '0 0 8px rgba(222, 255, 10, 0.2)',
              }}
              maxLength={64}
            />
            <button
              onClick={commitNameAndSave}
              className="p-0.5 transition-colors duration-150"
              style={{ color: 'var(--color-accent-cyan)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-accent-cyan)'; }}
              title="Save chain"
            >
              <Save className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={cancelEditName}
              className="p-0.5 transition-colors duration-150"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-status-error)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={startEditingName}
            className="flex-1 min-w-0 px-2 py-0.5 text-left truncate transition-colors duration-150 group"
            style={{
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              letterSpacing: 'var(--tracking-wide)',
              color: 'var(--color-text-primary)',
            }}
            title="Click to rename chain"
          >
            <span className="group-hover:underline decoration-dotted underline-offset-2" style={{ textDecorationColor: 'var(--color-accent-cyan)' }}>
              {chainName}
            </span>
            {targetInputPeakMin !== null && targetInputPeakMax !== null && (
              <span
                className="ml-2"
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-tertiary)',
                  fontWeight: 400,
                }}
              >
                {targetInputPeakMin} to {targetInputPeakMax} dBpk
              </span>
            )}
          </button>
        )}

        {/* Preset prev/next */}
        {presets.length > 0 && (
          <div className="flex items-center -space-x-0.5">
            <button
              onClick={() => navigatePreset(-1)}
              className={`${btnBase} ${btnInactive}`}
              title="Previous preset"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => navigatePreset(1)}
              className={`${btnBase} ${btnInactive}`}
              title="Next preset"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Keyboard Shortcuts Help */}
        <button
          onClick={() => window.dispatchEvent(new Event('showKeyboardShortcuts'))}
          className={`${btnBase} ${btnInactive}`}
          title="Keyboard shortcuts (?)"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>

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
  const { targetInputPeakMin, targetInputPeakMax, setTargetInputPeakRange } = useChainStore();
  const [peakMin, setPeakMin] = useState(targetInputPeakMin ?? -12);
  const [peakMax, setPeakMax] = useState(targetInputPeakMax ?? -6);
  const [oversamplingFactor, setOversamplingFactor] = useState(0);
  const [oversamplingLatencyMs, setOversamplingLatencyMs] = useState(0);
  const [isChangingOS, setIsChangingOS] = useState(false);

  // Fetch current oversampling state on mount
  useEffect(() => {
    juceBridge.getOversamplingFactor().then(setOversamplingFactor).catch(() => {});
    juceBridge.getOversamplingLatencyMs().then(setOversamplingLatencyMs).catch(() => {});
  }, []);

  const handleOversamplingChange = async (factor: number) => {
    if (isChangingOS || factor === oversamplingFactor) return;
    setIsChangingOS(true);
    try {
      const result = await juceBridge.setOversamplingFactor(factor);
      if (result.success) {
        setOversamplingFactor(result.factor ?? factor);
        setOversamplingLatencyMs(result.latencyMs ?? 0);
      }
    } catch {
      // Silently handle — plugin may not support it yet
    } finally {
      setIsChangingOS(false);
    }
  };

  const PEAK_PRESETS = [
    { min: -24, max: -18, label: 'Quiet' },
    { min: -18, max: -12, label: 'Conservative' },
    { min: -12, max: -6, label: 'Standard' },
    { min: -6, max: -3, label: 'Hot' },
  ];

  const OS_OPTIONS = [
    { value: 0, label: 'Off' },
    { value: 1, label: '2x' },
    { value: 2, label: '4x' },
  ];

  const applyPeakRange = () => {
    setTargetInputPeakRange(peakMin, peakMax);
    onClose();
  };

  const clearPeakRange = () => {
    setTargetInputPeakRange(null, null);
    onClose();
  };

  return (
    <div
      className="w-80 rounded-md shadow-xl p-4 scale-in"
      style={{
        background: 'rgba(15, 15, 15, 0.9)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--color-border-default)',
        boxShadow: 'var(--shadow-elevated)',
      }}
    >
      <h3
        className="mb-3"
        style={{
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-extended)',
          fontWeight: 900,
          color: 'var(--color-text-primary)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wider)',
        }}
      >
        Chain Settings
      </h3>

      {/* Target Input Peak Range */}
      <div className="mb-3">
        <label
          className="block mb-1.5"
          style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wide)',
          }}
        >
          Target Input Peak (dBpk)
        </label>
        <div className="flex items-center gap-2 mb-1.5">
          <input
            type="number"
            value={peakMin}
            onChange={(e) => setPeakMin(Number(e.target.value))}
            min={-60}
            max={0}
            step={1}
            className="w-16 rounded px-2 py-1 text-center focus:outline-none"
            style={{
              background: 'var(--color-bg-input)',
              border: '1px solid var(--color-border-default)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
            }}
          />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>to</span>
          <input
            type="number"
            value={peakMax}
            onChange={(e) => setPeakMax(Number(e.target.value))}
            min={-60}
            max={0}
            step={1}
            className="w-16 rounded px-2 py-1 text-center focus:outline-none"
            style={{
              background: 'var(--color-bg-input)',
              border: '1px solid var(--color-border-default)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
            }}
          />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>dBpk</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {PEAK_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => { setPeakMin(p.min); setPeakMax(p.max); }}
              className="rounded px-2 py-0.5 transition-all duration-150"
              style={{
                fontSize: '10px',
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
        <p className="mt-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          Recommended input peak level for this chain
        </p>
      </div>

      {/* Oversampling */}
      <div className="mb-3">
        <label
          className="block mb-1.5"
          style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wide)',
          }}
        >
          Oversampling
        </label>
        <div
          className="flex rounded overflow-hidden"
          style={{
            border: '1px solid var(--color-border-default)',
          }}
        >
          {OS_OPTIONS.map((opt) => {
            const isActive = oversamplingFactor === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleOversamplingChange(opt.value)}
                disabled={isChangingOS}
                className="flex-1 py-1.5 text-center transition-all duration-150"
                style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: isActive ? 700 : 400,
                  color: isActive ? 'var(--color-accent-cyan)' : 'var(--color-text-secondary)',
                  background: isActive ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
                  borderRight: opt.value < 2 ? '1px solid var(--color-border-default)' : 'none',
                  boxShadow: isActive ? '0 0 12px rgba(0, 240, 255, 0.2) inset' : 'none',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-wide)',
                  opacity: isChangingOS ? 0.5 : 1,
                  cursor: isChangingOS ? 'wait' : 'pointer',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {oversamplingFactor > 0 && (
          <p className="mt-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
            +{oversamplingLatencyMs.toFixed(1)}ms latency
          </p>
        )}
        <p className="mt-0.5" style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', opacity: 0.7 }}>
          Reduces aliasing from non-linear plugins
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={clearPeakRange}
          className="flex-1 rounded px-2 py-1.5 transition-all duration-150"
          style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-default)',
            background: 'transparent',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wide)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-focus)';
            e.currentTarget.style.color = 'var(--color-text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-default)';
            e.currentTarget.style.color = 'var(--color-text-secondary)';
          }}
        >
          Clear
        </button>
        <button
          onClick={applyPeakRange}
          className="btn btn-primary flex-1"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
