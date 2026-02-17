import { useState, useEffect } from 'react';
import { Download, X, RefreshCw, Inbox, Check } from 'lucide-react';
import { convex, getStoredSession, recordChainLoadResult } from '../../api/convex-client';
import { api } from '@convex/_generated/api';
import { juceBridge } from '../../api/juce-bridge';
import { autoDiscoverAllPlugins } from '../../stores/chainStore';

interface ReceivedChain {
  _id: string;
  chainName: string;
  chainId: string;
  senderUsername: string;
  senderId: string;
  status: string;
  sentAt: number;
}

interface ReceivedChainsProps {
  onBadgeCount?: (count: number) => void;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--color-bg-secondary)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-4)',
  border: '1px solid var(--color-border-default)',
};

export function ReceivedChains({ onBadgeCount }: ReceivedChainsProps) {
  const [chains, setChains] = useState<ReceivedChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [importedChain, setImportedChain] = useState<string | null>(null);

  useEffect(() => {
    loadChains();
  }, []);

  useEffect(() => {
    onBadgeCount?.(chains.length);
  }, [chains.length, onBadgeCount]);

  const loadChains = async () => {
    const token = getStoredSession();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await convex.query(api.privateChains.getReceivedChains, {
        sessionToken: token,
      });
      setChains(res as ReceivedChain[]);
    } catch {
      // Error handled silently
    }
    setLoading(false);
  };

  const handleAccept = async (shareId: string) => {
    setProcessing(shareId);
    const token = getStoredSession();
    if (!token) return;

    try {
      const result = await convex.mutation(api.privateChains.acceptChain, {
        sessionToken: token,
        shareId: shareId as any,
      });

      if (result.chainData) {
        let rawData;
        try {
          rawData = JSON.parse(result.chainData);
        } catch {
          // Invalid JSON — skip import
          setProcessing(null);
          return;
        }
        if (rawData) {
          // Map Convex slot format to JUCE import format
          const chainData = {
            version: 1,
            numSlots: rawData.slots?.length ?? 0,
            slots: (rawData.slots ?? []).map((slot: any, idx: number) => ({
              type: 'plugin',
              id: idx + 1,
              index: slot.position ?? idx,
              name: slot.pluginName ?? slot.name ?? '',
              manufacturer: slot.manufacturer ?? '',
              format: slot.format || 'VST3',
              uid: slot.uid || 0,
              fileOrIdentifier: slot.fileOrIdentifier || '',
              version: slot.version || '',
              bypassed: slot.bypassed ?? false,
              presetData: slot.presetData || '',
              presetSizeBytes: slot.presetSizeBytes || 0,
              parameters: slot.parameters ? slot.parameters.map((p: any) => ({
                name: p.name || '',
                semantic: p.semantic || '',
                unit: p.unit || '',
                value: String(p.value ?? ''),
                normalizedValue: p.normalizedValue ?? 0,
              })) : [],
            })),
          };
          try {
            const loadStart = performance.now();
            const importResult = await juceBridge.importChain(chainData);
            const loadTimeMs = Math.round(performance.now() - loadStart);

            // Report load result (best-effort)
            recordChainLoadResult({
              chainId: result.chainId,
              totalSlots: (importResult as any).totalSlots ?? chainData.numSlots,
              loadedSlots: (importResult as any).loadedSlots ?? chainData.numSlots,
              failedSlots: (importResult as any).failedSlots ?? 0,
              substitutedSlots: 0,
              failures: (importResult as any).failures,
              loadTimeMs,
            });

            if (importResult.success) {
              setImportedChain(result.chainName);
              setTimeout(() => setImportedChain(null), 3000);
              // Fire-and-forget: crowdpool parameter discovery
              if (importResult.chainState?.nodes) {
                autoDiscoverAllPlugins(importResult.chainState.nodes).catch(() => {});
              }
            }
          } catch {
            // Import failed silently
          }
        }
      }

      setChains((prev) => prev.filter((c) => c._id !== shareId));
    } catch {
      // Error handled silently
    }
    setProcessing(null);
  };

  const handleReject = async (shareId: string) => {
    setProcessing(shareId);
    const token = getStoredSession();
    if (!token) return;

    try {
      await convex.mutation(api.privateChains.rejectChain, {
        sessionToken: token,
        shareId: shareId as any,
      });
      setChains((prev) => prev.filter((c) => c._id !== shareId));
    } catch {
      // Error handled silently
    }
    setProcessing(null);
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>Loading received chains...</div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Inbox size={18} style={{ color: 'var(--color-accent-cyan)' }} />
          <h3 style={{ color: '#deff0a', fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Received Chains</h3>
          {chains.length > 0 && (
            <span className="badge badge-cyan" style={{ animation: 'neon-pulse 2s ease-in-out infinite' }}>
              {chains.length}
            </span>
          )}
        </div>
        <button
          onClick={loadChains}
          style={{ color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {importedChain && (
        <div className="flex items-center gap-2" style={{ background: 'rgba(0, 255, 65, 0.1)', border: '1px solid rgba(0, 255, 65, 0.3)', borderRadius: 'var(--radius-base)', padding: 'var(--space-3)', marginBottom: 'var(--space-3)', color: 'var(--color-status-active)', fontSize: 'var(--text-sm)' }}>
          <Check size={14} />
          Imported "{importedChain}" into your chain!
        </div>
      )}

      {chains.length === 0 ? (
        <div style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-4) 0' }}>
          No pending chains. When friends share chains with you, they'll appear here.
        </div>
      ) : (
        <div className="space-y-2">
          {chains.map((chain) => (
            <div
              key={chain._id}
              style={{ background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div style={{ color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{chain.chainName}</div>
                  <div style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-xs)' }}>
                    From <span style={{ color: 'var(--color-accent-cyan)' }}>{chain.senderUsername}</span> &bull; {formatTime(chain.sentAt)}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(chain._id)}
                  disabled={processing === chain._id}
                  className="btn btn-primary flex-1 flex items-center justify-center gap-1"
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  <Download size={14} />
                  Import
                </button>
                <button
                  onClick={() => handleReject(chain._id)}
                  disabled={processing === chain._id}
                  className="btn btn-danger flex items-center justify-center gap-1"
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
