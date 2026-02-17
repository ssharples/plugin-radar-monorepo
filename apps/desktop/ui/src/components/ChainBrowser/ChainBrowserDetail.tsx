import { useState, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Heart,
  GitFork,
  Bookmark,
  BookmarkCheck,
} from 'lucide-react';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useChainStore } from '../../stores/chainStore';
import { useSyncStore } from '../../stores/syncStore';
import { juceBridge } from '../../api/juce-bridge';
import { recordChainLoadResult } from '../../api/convex-client';
import { autoDiscoverAllPlugins } from '../../stores/chainStore';
import type { BrowseChainResult } from '../../api/types';

interface ChainBrowserDetailProps {
  chain: BrowseChainResult;
  onBack: () => void;
  onClose: () => void;
  isInCollection: boolean;
  onToggleCollection: () => void;
}

export function ChainBrowserDetail({
  chain,
  onBack,
  onClose,
  isInCollection,
  onToggleCollection,
}: ChainBrowserDetailProps) {
  const { compatibility, detailedCompatibility, downloadChain, forkChain } =
    useCloudChainStore();
  const { setChainName, setTargetInputPeakRange } = useChainStore();
  const { isLoggedIn } = useSyncStore();

  const [forkName, setForkName] = useState('');
  const [showForkInput, setShowForkInput] = useState(false);
  const [forking, setForking] = useState(false);
  const [expandedSlotIdx, setExpandedSlotIdx] = useState<number | null>(null);

  const handleLoadChain = useCallback(async () => {
    downloadChain(chain._id);
    const chainData = {
      version: 1,
      numSlots: chain.slots.length,
      slots: chain.slots.map((slot, idx: number) => ({
        type: 'plugin',
        id: idx + 1,
        index: slot.position ?? idx,
        name: slot.pluginName,
        manufacturer: slot.manufacturer,
        format: slot.format || 'VST3',
        uid: slot.uid || 0,
        fileOrIdentifier: slot.fileOrIdentifier || '',
        version: slot.version || '',
        bypassed: slot.bypassed ?? false,
        presetData: slot.presetData || '',
        presetSizeBytes: slot.presetSizeBytes || 0,
        parameters: (slot.parameters || []).map((p: any) => ({
          name: p.name || '',
          semantic: p.semantic || '',
          unit: p.unit || '',
          value: String(p.value ?? ''),
          normalizedValue: p.normalizedValue ?? 0,
        })),
      })),
    };
    const loadStart = performance.now();
    const result = await juceBridge.importChain(chainData);
    const loadTimeMs = Math.round(performance.now() - loadStart);

    // Report load result (best-effort)
    recordChainLoadResult({
      chainId: chain._id,
      totalSlots: (result as any).totalSlots ?? chain.slots.length,
      loadedSlots: (result as any).loadedSlots ?? chain.slots.length,
      failedSlots: (result as any).failedSlots ?? 0,
      substitutedSlots: 0,
      failures: (result as any).failures,
      loadTimeMs,
    });

    if (result.success) {
      setChainName(chain.name);
      if (chain.targetInputPeakMin != null && chain.targetInputPeakMax != null) {
        setTargetInputPeakRange(chain.targetInputPeakMin, chain.targetInputPeakMax);
      } else if (chain.targetInputLufs != null) {
        setTargetInputPeakRange(chain.targetInputLufs, chain.targetInputLufs + 6);
      } else {
        setTargetInputPeakRange(null, null);
      }

      // Fire-and-forget: crowdpool parameter discovery for all plugins in chain
      if (result.chainState?.nodes) {
        autoDiscoverAllPlugins(result.chainState.nodes).catch(() => {});
      }
      onClose();
    }
  }, [chain, downloadChain, setChainName, setTargetInputPeakRange, onClose]);

  const handleFork = useCallback(async () => {
    if (!forkName.trim()) return;
    setForking(true);
    await forkChain(chain._id, forkName.trim());
    setForking(false);
    setShowForkInput(false);
    setForkName('');
  }, [chain, forkChain, forkName]);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-cyber" style={{ padding: 'var(--space-4)' }}>
      <button
        onClick={onBack}
        className="flex items-center gap-1 mb-3"
        style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent-cyan)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
      >
        <ChevronLeft className="w-3 h-3" /> Back
      </button>

      <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: '#deff0a', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
        {chain.name}
      </h3>
      {chain.author?.name && (
        <p style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>
          by @{chain.author.name}
        </p>
      )}
      {chain.description && (
        <p style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-3)' }}>{chain.description}</p>
      )}

      {/* Tags */}
      {chain.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {chain.tags.map((tag: string) => (
            <span key={tag} className="badge badge-cyan">{tag}</span>
          ))}
        </div>
      )}

      {/* Target Input Peak Range */}
      {(chain.targetInputPeakMin != null || chain.targetInputLufs != null) && (
        <div className="flex items-center gap-2 mb-3" style={{ fontSize: '10px' }}>
          <span style={{ color: 'var(--color-text-tertiary)' }}>Target:</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-accent-cyan)' }}>
            {chain.targetInputPeakMin != null && chain.targetInputPeakMax != null
              ? `${chain.targetInputPeakMin} to ${chain.targetInputPeakMax} dBpk`
              : chain.targetInputLufs != null
                ? `${chain.targetInputLufs} to ${chain.targetInputLufs + 6} dBpk`
                : ''}
          </span>
        </div>
      )}

      {/* Compatibility */}
      {compatibility && (
        <div
          style={{
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            marginBottom: 'var(--space-3)',
            background: compatibility.canFullyLoad ? 'rgba(0, 255, 65, 0.06)' : 'rgba(255, 170, 0, 0.06)',
            border: `1px solid ${compatibility.canFullyLoad ? 'rgba(0, 255, 65, 0.15)' : 'rgba(255, 170, 0, 0.15)'}`,
          }}
        >
          <div className="flex items-center justify-between mb-1.5" style={{ fontSize: '10px' }}>
            <span style={{ color: compatibility.canFullyLoad ? 'var(--color-status-active)' : 'var(--color-status-warning)' }}>
              {compatibility.canFullyLoad
                ? 'All plugins available'
                : `Missing ${compatibility.missingCount} plugins`}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {compatibility.percentage}%
            </span>
          </div>
          <div className="meter">
            <div
              className="meter-fill"
              style={{
                width: `${compatibility.percentage}%`,
                background: compatibility.canFullyLoad ? 'var(--color-status-active)' : 'var(--color-status-warning)',
              }}
            />
          </div>
        </div>
      )}

      {/* Plugin slots */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h4 style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#deff0a', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wider)', marginBottom: '8px' }}>
          Plugins ({chain.slots?.length ?? 0})
        </h4>
        <div className="space-y-1">
          {chain.slots?.map((slot, idx: number) => {
            const isMissing = detailedCompatibility?.missing?.some(
              (m) =>
                m.pluginName.toLowerCase() === slot.pluginName.toLowerCase()
            );
            const paramCount = slot.parameters?.length ?? 0;
            const isExpanded = expandedSlotIdx === idx;

            return (
              <div key={idx}>
                <div
                  className="flex items-center justify-between"
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-base)',
                    fontSize: '10px',
                    background: isMissing ? 'rgba(255, 0, 51, 0.05)' : isExpanded ? 'rgba(222, 255, 10, 0.06)' : 'rgba(255, 255, 255, 0.03)',
                    border: isMissing ? '1px solid rgba(255, 0, 51, 0.1)' : '1px solid transparent',
                    cursor: paramCount > 0 ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (paramCount > 0) {
                      setExpandedSlotIdx(isExpanded ? null : idx);
                    }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span style={{ color: 'var(--color-text-primary)' }}>{slot.pluginName}</span>
                    <span style={{ color: 'var(--color-text-disabled)' }}>{slot.manufacturer}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {paramCount > 0 && (
                      <span
                        className="flex items-center gap-0.5"
                        style={{
                          fontSize: '9px',
                          color: 'var(--color-accent-cyan)',
                        }}
                      >
                        {paramCount} param{paramCount !== 1 ? 's' : ''} {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                      </span>
                    )}
                    {isMissing ? (
                      <span style={{ color: 'var(--color-status-error)', fontSize: '9px' }}>Missing</span>
                    ) : (
                      <span style={{ color: 'var(--color-status-active)', fontSize: '9px' }}>OK</span>
                    )}
                  </div>
                </div>

                {/* Parameter sub-list */}
                {isExpanded && slot.parameters && (
                  <div className="ml-4 mt-1 mb-2 space-y-0.5">
                    {slot.parameters.map((param, pIdx) => (
                      <div
                        key={pIdx}
                        className="flex items-center justify-between px-3 py-1 rounded"
                        style={{
                          background: 'rgba(222, 255, 10, 0.03)',
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        <span style={{ color: 'var(--color-text-tertiary)' }}>
                          {param.name}
                        </span>
                        <span style={{ color: 'var(--color-accent-cyan)', fontWeight: 600 }}>
                          {param.value}{param.unit ? ` ${param.unit}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-4" style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
        <span className="flex items-center gap-1">
          <Download className="w-3 h-3" /> {chain.downloads}
        </span>
        <span className="flex items-center gap-1">
          <Heart className="w-3 h-3" /> {chain.likes}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleLoadChain}
          className="btn btn-primary flex-1 flex items-center justify-center gap-1.5"
          style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700 }}
        >
          <Download className="w-3.5 h-3.5" />
          Load Chain
        </button>
        <button
          onClick={onToggleCollection}
          className="btn flex items-center gap-1"
          style={{
            fontSize: '10px',
            textTransform: 'uppercase',
            borderColor: isInCollection ? 'rgba(222, 255, 10, 0.4)' : undefined,
            color: isInCollection ? 'var(--color-accent-cyan)' : undefined,
          }}
        >
          {isInCollection ? (
            <BookmarkCheck className="w-3.5 h-3.5" />
          ) : (
            <Bookmark className="w-3.5 h-3.5" />
          )}
          {isInCollection ? 'Saved' : 'Save'}
        </button>
        {isLoggedIn && (
          <button
            onClick={() => {
              setForkName(`${chain.name} (fork)`);
              setShowForkInput(true);
            }}
            className="btn flex items-center gap-1"
            style={{ fontSize: '10px', textTransform: 'uppercase' }}
          >
            <GitFork className="w-3.5 h-3.5" />
            Fork
          </button>
        )}
      </div>

      {/* Fork input */}
      {showForkInput && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={forkName}
            onChange={(e) => setForkName(e.target.value)}
            placeholder="Fork name..."
            className="input flex-1"
            style={{ fontSize: 'var(--text-xs)' }}
            autoFocus
          />
          <button
            onClick={handleFork}
            disabled={forking || !forkName.trim()}
            className="btn btn-primary"
            style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700 }}
          >
            {forking ? '...' : 'Fork'}
          </button>
          <button
            onClick={() => setShowForkInput(false)}
            style={{ padding: '0 8px', fontSize: '10px', color: 'var(--color-text-disabled)', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-disabled)')}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
