import { useState, useEffect, useCallback } from 'react';
import { Link2, Unlink } from 'lucide-react';
import { juceBridge } from '../../api/juce-bridge';
import type { MirrorState } from '../../api/types';

/**
 * Toolbar badge shown when this instance is mirrored with another track.
 * Shows partner name(s), pulse animation on incoming updates, and an unlink button.
 */
export function MirrorIndicator() {
  const [mirrorState, setMirrorState] = useState<MirrorState>({
    isMirrored: false,
    mirrorGroupId: null,
    partners: [],
  });
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    juceBridge.getMirrorState().then(setMirrorState).catch(() => {});
  }, []);

  useEffect(() => {
    const unsub1 = juceBridge.onMirrorStateChanged((data) => {
      setMirrorState(data);
    });
    const unsub2 = juceBridge.onMirrorUpdateApplied(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const handleUnlink = useCallback(async () => {
    try {
      await juceBridge.stopMirror();
    } catch (err) {
      console.warn('Failed to stop mirror:', err);
    }
  }, []);

  if (!mirrorState.isMirrored) return null;

  const partnerNames = mirrorState.partners.map(p => p.trackName).join(', ');

  return (
    <div
      className={`
        flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono
        border transition-all duration-300
        ${pulse
          ? 'bg-plugin-accent/20 border-plugin-accent/50 shadow-glow-accent'
          : 'bg-plugin-accent/8 border-plugin-accent/25'
        }
      `}
    >
      <Link2 className={`w-3 h-3 text-plugin-accent ${pulse ? 'animate-pulse' : ''}`} />
      <span className="text-plugin-accent uppercase truncate max-w-[120px]">
        {partnerNames}
      </span>
      <button
        onClick={handleUnlink}
        className="p-0.5 rounded hover:bg-plugin-accent/20 text-plugin-accent/60 hover:text-plugin-accent transition-colors"
        title="Break mirror link"
      >
        <Unlink className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}
