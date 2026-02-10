import { useState, useEffect, useCallback } from 'react';
import { Copy, Link2, ChevronRight } from 'lucide-react';
import { juceBridge } from '../../api/juce-bridge';
import type { OtherInstanceInfo, MirrorState } from '../../api/types';
import { useChainStore } from '../../stores/chainStore';

/**
 * Shows other running PluginChainManager instances in the DAW session.
 * Offers "Copy" (one-time duplication) and "Mirror" (live sync) buttons.
 * Hidden when no other instances exist.
 */
export function OtherInstancesList() {
  const [instances, setInstances] = useState<OtherInstanceInfo[]>([]);
  const [mirrorState, setMirrorState] = useState<MirrorState>({ isMirrored: false, mirrorGroupId: null, partners: [] });
  const [copying, setCopying] = useState<number | null>(null);
  const [mirroring, setMirroring] = useState<number | null>(null);

  // Fetch initial data
  useEffect(() => {
    juceBridge.getOtherInstances().then(setInstances).catch(() => {});
    juceBridge.getMirrorState().then(setMirrorState).catch(() => {});
  }, []);

  // Subscribe to changes
  useEffect(() => {
    const unsub1 = juceBridge.onInstancesChanged((data) => {
      setInstances(data);
    });
    const unsub2 = juceBridge.onMirrorStateChanged((data) => {
      setMirrorState(data);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const handleCopy = useCallback(async (instanceId: number) => {
    setCopying(instanceId);
    try {
      const result = await juceBridge.copyChainFromInstance(instanceId);
      if (result.success && result.chainState) {
        useChainStore.setState({
          nodes: result.chainState.nodes || [],
          slots: result.chainState.slots || [],
          lastCloudChainId: null,
        });
      }
    } catch (err) {
      console.warn('Failed to copy chain from instance:', err);
    }
    setCopying(null);
  }, []);

  const handleMirror = useCallback(async (instanceId: number) => {
    setMirroring(instanceId);
    try {
      await juceBridge.startMirror(instanceId);
    } catch (err) {
      console.warn('Failed to start mirror:', err);
    }
    setMirroring(null);
  }, []);

  if (instances.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="text-[10px] font-mono uppercase text-plugin-muted mb-2 px-1">
        Copy from another track
      </h3>
      <div className="space-y-1.5">
        {instances.map((inst) => {
          const chainPreview = inst.pluginNames.length > 0
            ? inst.pluginNames.slice(0, 4).join(' \u2192 ') + (inst.pluginNames.length > 4 ? ' \u2026' : '')
            : 'Empty chain';

          const isMirroredToThis = mirrorState.isMirrored &&
            mirrorState.partners.some(p => p.id === inst.id);

          return (
            <div
              key={inst.id}
              className={`
                flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors
                ${isMirroredToThis
                  ? 'bg-plugin-accent/8 border-plugin-accent/30'
                  : 'bg-plugin-card border-plugin-border/50 hover:border-plugin-accent/30'
                }
              `}
            >
              {/* Track info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium font-mono text-plugin-text truncate">
                    {inst.trackName}
                  </span>
                  {isMirroredToThis && (
                    <span className="flex items-center gap-0.5 text-[9px] text-plugin-accent">
                      <Link2 className="w-2.5 h-2.5" />
                      Mirrored
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] font-mono text-plugin-muted truncate">
                    {chainPreview}
                  </span>
                  {inst.pluginCount > 0 && (
                    <span className="text-[9px] text-plugin-dim shrink-0">
                      ({inst.pluginCount})
                    </span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 shrink-0">
                {inst.pluginCount > 0 && !isMirroredToThis && (
                  <>
                    <button
                      onClick={() => handleCopy(inst.id)}
                      disabled={copying !== null}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase
                        bg-plugin-border/50 text-plugin-text hover:bg-plugin-accent/15 hover:text-plugin-accent
                        transition-colors disabled:opacity-50"
                      title="Copy chain to this track (one-time)"
                    >
                      <Copy className="w-3 h-3" />
                      {copying === inst.id ? '...' : 'Copy'}
                    </button>
                    <button
                      onClick={() => handleMirror(inst.id)}
                      disabled={mirroring !== null || mirrorState.isMirrored}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase
                        bg-plugin-border/50 text-plugin-text hover:bg-plugin-accent/15 hover:text-plugin-accent
                        transition-colors disabled:opacity-50"
                      title="Mirror chain (live sync)"
                    >
                      <Link2 className="w-3 h-3" />
                      {mirroring === inst.id ? '...' : 'Mirror'}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
