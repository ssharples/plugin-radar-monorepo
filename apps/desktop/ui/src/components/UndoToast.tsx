import { useState, useEffect, useCallback, useRef } from 'react';
import { useChainStore } from '../stores/chainStore';

const TOAST_DURATION = 5000;

export function UndoToast() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [entering, setEntering] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const dismiss = useCallback(() => {
    setEntering(false);
    // Wait for exit animation to finish before hiding
    setTimeout(() => setVisible(false), 200);
  }, []);

  const handleUndo = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    useChainStore.getState().undo();
    dismiss();
  }, [dismiss]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message: string };
      setMessage(detail.message);
      setVisible(true);

      // Trigger enter animation on next frame
      requestAnimationFrame(() => setEntering(true));

      // Reset progress bar
      startTimeRef.current = Date.now();
      if (progressRef.current) {
        progressRef.current.style.transform = 'scaleX(1)';
        // Force reflow then start shrink
        progressRef.current.getBoundingClientRect();
        progressRef.current.style.transform = 'scaleX(0)';
      }

      // Auto-dismiss
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(dismiss, TOAST_DURATION);
    };

    window.addEventListener('showUndoToast', handler);
    return () => {
      window.removeEventListener('showUndoToast', handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dismiss]);

  // Kick off progress bar animation once visible and entering
  useEffect(() => {
    if (visible && entering && progressRef.current) {
      progressRef.current.style.transform = 'scaleX(1)';
      progressRef.current.getBoundingClientRect();
      progressRef.current.style.transform = 'scaleX(0)';
    }
  }, [visible, entering]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 z-[9999] font-mono"
      style={{
        transform: entering
          ? 'translate(-50%, 0)'
          : 'translate(-50%, 12px)',
        opacity: entering ? 1 : 0,
        transition: 'opacity 200ms ease, transform 200ms ease',
      }}
    >
      <div
        className="flex items-center gap-3 rounded-lg px-4 py-2.5 shadow-lg"
        style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
      >
        <span className="text-sm text-neutral-300">{message}</span>
        <button
          onClick={handleUndo}
          className="text-sm font-semibold rounded px-2.5 py-1 transition-colors"
          style={{
            background: '#89572a',
            color: '#fff',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#a0683a')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#89572a')}
        >
          Undo
        </button>
      </div>
      {/* Progress bar */}
      <div
        className="mt-1 h-0.5 w-full overflow-hidden rounded-full"
        style={{ background: '#2a2a2a' }}
      >
        <div
          ref={progressRef}
          className="h-full origin-left"
          style={{
            background: '#89572a',
            transform: 'scaleX(1)',
            transition: `transform ${TOAST_DURATION}ms linear`,
          }}
        />
      </div>
    </div>
  );
}
