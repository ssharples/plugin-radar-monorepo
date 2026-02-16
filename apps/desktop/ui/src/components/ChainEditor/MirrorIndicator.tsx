import { useState, useEffect, useCallback } from 'react';
import { Link2, Unlink } from 'lucide-react';
import { juceBridge } from '../../api/juce-bridge';
import type { MirrorState } from '../../api/types';
import { useChainStore } from '../../stores/chainStore';

/**
 * Toolbar badge shown when this instance is mirrored with another track.
 * Shows partner name(s), pulse animation on incoming updates, and an unlink button.
 * Digital Underground styling: cyan neon, monospace, pulsing glow.
 */
export function MirrorIndicator() {
  const [mirrorState, setMirrorState] = useState<MirrorState>({
    isMirrored: false,
    isLeader: false,
    mirrorGroupId: null,
    partners: [],
  });
  const [pulse, setPulse] = useState(false);
  const [syncCount, setSyncCount] = useState(0);
  const showToast = useChainStore((s) => s.showToast);

  useEffect(() => {
    juceBridge.getMirrorState().then(setMirrorState).catch(() => {});
  }, []);

  useEffect(() => {
    const unsub1 = juceBridge.onMirrorStateChanged((data) => {
      setMirrorState(data);
    });
    const unsub2 = juceBridge.onMirrorUpdateApplied(() => {
      setPulse(true);
      setSyncCount(c => c + 1);
      setTimeout(() => setPulse(false), 800);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const handleUnlink = useCallback(async () => {
    try {
      await juceBridge.stopMirror();
      showToast('Mirror unlinked');
    } catch {
      showToast('Failed to stop mirror');
    }
  }, [showToast]);

  if (!mirrorState.isMirrored) return null;

  const partnerNames = mirrorState.partners.map(p => p.trackName).join(', ');

  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${pulse ? 'pulse-cyan' : ''}`}
      style={{
        fontFamily: 'var(--font-mono)',
        letterSpacing: 'var(--tracking-wide)',
        background: pulse ? 'rgba(222, 255, 10, 0.15)' : 'rgba(222, 255, 10, 0.06)',
        border: pulse ? '1px solid rgba(222, 255, 10, 0.6)' : '1px solid rgba(222, 255, 10, 0.2)',
        transition: 'all var(--duration-slow) var(--ease-snap)',
      }}
    >
      {/* Sync indicator dot */}
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{
          background: 'var(--color-accent-cyan)',
          boxShadow: pulse
            ? '0 0 10px var(--color-accent-cyan), 0 0 20px rgba(222, 255, 10, 0.4)'
            : '0 0 4px var(--color-accent-cyan)',
          transition: 'all var(--duration-fast) var(--ease-snap)',
          animation: 'neon-pulse-cyan 2s ease-in-out infinite',
        }}
      />

      {/* Link icon */}
      <Link2
        className="w-3 h-3 shrink-0"
        style={{
          color: 'var(--color-accent-cyan)',
          filter: pulse ? 'drop-shadow(0 0 4px var(--color-accent-cyan))' : 'none',
        }}
      />

      {/* Partner names and sync status */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className="uppercase truncate"
          style={{
            color: 'var(--color-accent-cyan)',
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            maxWidth: '120px',
          }}
        >
          {partnerNames}
        </span>
        <span
          style={{
            color: 'rgba(222, 255, 10, 0.5)',
            fontSize: 'var(--text-xs)',
          }}
        >
          SYNC
        </span>
        <span
          style={{
            color: mirrorState.isLeader ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
            fontSize: '9px',
            fontWeight: 700,
          }}
        >
          {mirrorState.isLeader ? 'LEADER' : 'FOLLOWER'}
        </span>
      </div>

      {/* Unlink button */}
      <button
        onClick={handleUnlink}
        className="p-0.5 rounded shrink-0"
        style={{
          color: 'rgba(222, 255, 10, 0.4)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          transition: 'all var(--duration-fast) var(--ease-snap)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--color-status-error)';
          e.currentTarget.style.background = 'rgba(255, 0, 51, 0.12)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'rgba(222, 255, 10, 0.4)';
          e.currentTarget.style.background = 'transparent';
        }}
        title="Break mirror link"
      >
        <Unlink className="w-3 h-3" />
      </button>
    </div>
  );
}
