import { useState, useEffect, useCallback } from 'react';
import { Copy, Link2, Send, ChevronDown, ChevronRight } from 'lucide-react';
import { juceBridge } from '../../api/juce-bridge';
import type { OtherInstanceInfo, MirrorState } from '../../api/types';
import { useChainStore } from '../../stores/chainStore';

/**
 * Shows other running ProChain instances in the DAW session.
 * Digital Underground styling with cyan accents and monospace text.
 * Offers Copy (one-time), Mirror (live sync), and Send To (push chain) buttons.
 *
 * NOTE: Hover effects use CSS classes (.inst-btn / .inst-btn-send) instead of
 * JS onMouseEnter/onMouseLeave — JUCE WebView fires mouseenter on page load
 * for elements under the cursor, causing styles to get stuck.
 */
export function OtherInstancesList() {
  const [instances, setInstances] = useState<OtherInstanceInfo[]>([]);
  const [mirrorState, setMirrorState] = useState<MirrorState>({ isMirrored: false, isLeader: false, mirrorGroupId: null, partners: [] });
  const [copying, setCopying] = useState<number | null>(null);
  const [sending, setSending] = useState<number | null>(null);
  const [mirroring, setMirroring] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(true);

  const showToast = useChainStore((s) => s.showToast);

  // Fetch initial data
  useEffect(() => {
    juceBridge.getOtherInstances().then(setInstances).catch(() => {});
    juceBridge.getMirrorState().then(setMirrorState).catch(() => {});
  }, []);

  // Subscribe to changes
  useEffect(() => {
    const unsub1 = juceBridge.onInstancesChanged((data) => setInstances(data));
    const unsub2 = juceBridge.onMirrorStateChanged((data) => setMirrorState(data));
    return () => { unsub1(); unsub2(); };
  }, []);

  // Listen for async sendChainComplete events
  useEffect(() => {
    const unsub = juceBridge.onSendChainComplete((data) => {
      console.log('sendChainComplete event received:', data);
      if (data.success) {
        showToast('Chain sent successfully');
      } else {
        showToast(data.error || 'Send failed');
      }
      setSending(null);
    });
    return unsub;
  }, [showToast]);

  const handleCopyFrom = useCallback(async (instanceId: number, trackName: string) => {
    console.log('handleCopyFrom clicked', instanceId, trackName);
    setCopying(instanceId);
    try {
      const result = await juceBridge.copyChainFromInstance(instanceId);
      if (result.success && result.chainState) {
        useChainStore.setState({
          nodes: result.chainState.nodes || [],
          slots: result.chainState.slots || [],
          lastCloudChainId: null,
        });
        showToast(`Copied chain from ${trackName}`);
      } else {
        showToast(result.error || 'Failed to copy chain');
      }
    } catch {
      showToast('Failed to copy chain');
    }
    setCopying(null);
  }, [showToast]);

  const handleSendTo = useCallback(async (instanceId: number, trackName: string) => {
    console.log('handleSendTo clicked', instanceId, trackName);
    setSending(instanceId);
    try {
      const result = await juceBridge.sendChainToInstance(instanceId);
      if (result.success) {
        // C++ returns immediately — actual import happens async.
        // sendChainComplete event will fire when done.
        showToast(`Sending chain to ${trackName}...`);
      } else {
        showToast(result.error || 'Failed to send chain');
        setSending(null);
      }
    } catch {
      showToast('Failed to send chain');
      setSending(null);
    }
  }, [showToast]);

  const handleMirror = useCallback(async (instanceId: number, trackName: string) => {
    console.log('handleMirror clicked', instanceId, trackName);
    setMirroring(instanceId);
    try {
      const result = await juceBridge.startMirror(instanceId);
      if (result.success) {
        showToast(`Mirrored with ${trackName}`);
      } else {
        showToast(result.error || 'Failed to start mirror');
      }
    } catch {
      showToast('Failed to start mirror');
    }
    setMirroring(null);
  }, [showToast]);

  const handleUnmirror = useCallback(async () => {
    try {
      await juceBridge.stopMirror();
      showToast('Mirror unlinked');
    } catch {
      showToast('Failed to stop mirror');
    }
  }, [showToast]);

  if (instances.length === 0) return null;

  const btnBase: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    fontWeight: 700,
    letterSpacing: 'var(--tracking-wide)',
    textTransform: 'uppercase' as const,
    background: 'var(--color-bg-elevated)',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border-default)',
    cursor: 'pointer',
    transition: 'all var(--duration-fast) var(--ease-snap)',
  };

  return (
    <div
      className="mb-3"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          letterSpacing: 'var(--tracking-wide)',
          textTransform: 'uppercase' as const,
          color: 'var(--color-accent-cyan)',
        }}
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span>Other Instances</span>
        <span
          style={{
            color: 'var(--color-text-tertiary)',
            fontSize: 'var(--text-xs)',
            fontWeight: 400,
          }}
        >
          ({instances.length})
        </span>
        {mirrorState.isMirrored && (
          <span
            className="ml-auto flex items-center gap-1"
            style={{ color: 'var(--color-accent-cyan)' }}
          >
            <Link2 className="w-3 h-3" />
            <span style={{ fontSize: 'var(--text-xs)' }}>LINKED</span>
          </span>
        )}
      </button>

      {/* Instance List */}
      {expanded && (
        <div className="px-2 pb-2 space-y-1.5">
          {instances.map((inst) => {
            const chainPreview = inst.pluginNames.length > 0
              ? inst.pluginNames.slice(0, 3).join(' \u2192 ') + (inst.pluginNames.length > 3 ? ' \u2026' : '')
              : 'Empty chain';

            const isMirroredToThis = mirrorState.isMirrored &&
              mirrorState.partners.some(p => p.id === inst.id);

            return (
              <div
                key={inst.id}
                style={{
                  background: isMirroredToThis
                    ? 'rgba(222, 255, 10, 0.06)'
                    : 'var(--color-bg-primary)',
                  border: isMirroredToThis
                    ? '1px solid rgba(222, 255, 10, 0.3)'
                    : '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-base)',
                  padding: 'var(--space-2) var(--space-3)',
                  transition: 'all var(--duration-fast) var(--ease-snap)',
                }}
              >
                {/* Track info row */}
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: isMirroredToThis ? 'var(--color-accent-cyan)' : 'var(--color-status-active)',
                      boxShadow: isMirroredToThis ? '0 0 6px var(--color-accent-cyan)' : 'none',
                    }}
                  />
                  <span
                    className="truncate"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-sm)',
                      fontWeight: 700,
                      letterSpacing: 'var(--tracking-wide)',
                      color: 'var(--color-text-primary)',
                      textTransform: 'uppercase' as const,
                    }}
                  >
                    {inst.trackName || `Instance ${inst.id}`}
                  </span>
                  {/* Mirror role badge */}
                  {inst.isLeader && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '9px',
                        fontWeight: 700,
                        letterSpacing: 'var(--tracking-wide)',
                        color: 'var(--color-accent-cyan)',
                        border: '1px solid rgba(222, 255, 10, 0.3)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '0 4px',
                        lineHeight: '16px',
                      }}
                    >
                      LEADER
                    </span>
                  )}
                  {inst.isFollower && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '9px',
                        fontWeight: 700,
                        letterSpacing: 'var(--tracking-wide)',
                        color: 'var(--color-text-tertiary)',
                        border: '1px solid var(--color-border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '0 4px',
                        lineHeight: '16px',
                      }}
                    >
                      MIRROR
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    {inst.pluginCount} plugins
                  </span>
                </div>

                {/* Chain preview */}
                <div
                  className="truncate mb-2"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-secondary)',
                    paddingLeft: 'var(--space-4)',
                  }}
                >
                  {chainPreview}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1.5" style={{ paddingLeft: 'var(--space-4)' }}>
                  {isMirroredToThis ? (
                    <button
                      onClick={() => handleUnmirror()}
                      className="inst-btn flex items-center gap-1.5 px-2.5 py-1 rounded"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 700,
                        letterSpacing: 'var(--tracking-wide)',
                        textTransform: 'uppercase' as const,
                        background: 'rgba(222, 255, 10, 0.12)',
                        color: 'var(--color-accent-cyan)',
                        border: '1px solid rgba(222, 255, 10, 0.3)',
                        cursor: 'pointer',
                        transition: 'all var(--duration-fast) var(--ease-snap)',
                      }}
                      title="Break mirror link"
                    >
                      <Link2 className="w-3 h-3" />
                      Unlink
                    </button>
                  ) : (
                    <>
                      {inst.pluginCount > 0 && (
                        <button
                          onClick={() => handleCopyFrom(inst.id, inst.trackName)}
                          disabled={copying !== null}
                          className="inst-btn flex items-center gap-1 px-2 py-1 rounded"
                          style={{
                            ...btnBase,
                            cursor: copying !== null ? 'not-allowed' : 'pointer',
                            opacity: copying !== null ? 0.5 : 1,
                          }}
                          title="Copy chain from this instance (one-time)"
                        >
                          <Copy className="w-3 h-3" />
                          {copying === inst.id ? '...' : 'Copy'}
                        </button>
                      )}
                      <button
                        onClick={() => handleSendTo(inst.id, inst.trackName)}
                        disabled={sending !== null}
                        className="inst-btn-send flex items-center gap-1 px-2 py-1 rounded"
                        style={{
                          ...btnBase,
                          cursor: sending !== null ? 'not-allowed' : 'pointer',
                          opacity: sending !== null ? 0.5 : 1,
                        }}
                        title="Send current chain to this instance"
                      >
                        <Send className="w-3 h-3" />
                        {sending === inst.id ? 'Sending...' : 'Send'}
                      </button>
                      {!mirrorState.isMirrored && !inst.isFollower && (
                        <button
                          onClick={() => handleMirror(inst.id, inst.trackName)}
                          disabled={mirroring !== null}
                          className="inst-btn flex items-center gap-1 px-2 py-1 rounded"
                          style={{
                            ...btnBase,
                            cursor: mirroring !== null ? 'not-allowed' : 'pointer',
                            opacity: mirroring !== null ? 0.5 : 1,
                          }}
                          title={inst.isLeader ? 'Join this mirror group (live sync)' : 'Mirror chain (live sync)'}
                        >
                          <Link2 className="w-3 h-3" />
                          {mirroring === inst.id ? 'Linking...' : inst.isLeader ? 'Join' : 'Mirror'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
