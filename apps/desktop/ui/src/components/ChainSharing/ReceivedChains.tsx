import { useState, useEffect } from 'react';
import { Download, X, RefreshCw, Inbox, Check } from 'lucide-react';
import * as convexClient from '../../api/convex-client';
import { api } from '@convex/_generated/api';
import { juceBridge } from '../../api/juce-bridge';

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
    const token = localStorage.getItem('pluginradar_session');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await convexClient.convex.query(api.privateChains.getReceivedChains, {
        sessionToken: token,
      });
      setChains(res as ReceivedChain[]);
    } catch (err) {
      console.error('Failed to load received chains:', err);
    }
    setLoading(false);
  };

  const handleAccept = async (shareId: string) => {
    setProcessing(shareId);
    const token = localStorage.getItem('pluginradar_session');
    if (!token) return;

    try {
      const result = await convexClient.convex.mutation(api.privateChains.acceptChain, {
        sessionToken: token,
        shareId: shareId as any,
      });

      // Parse the chain data and import it via the JUCE bridge
      if (result.chainData) {
        const chainData = JSON.parse(result.chainData);
        try {
          await juceBridge.importChain(chainData);
          setImportedChain(result.chainName);
          setTimeout(() => setImportedChain(null), 3000);
        } catch (importErr) {
          console.error('Failed to import chain into JUCE:', importErr);
        }
      }

      setChains((prev) => prev.filter((c) => c._id !== shareId));
    } catch (err) {
      console.error('Failed to accept chain:', err);
    }
    setProcessing(null);
  };

  const handleReject = async (shareId: string) => {
    setProcessing(shareId);
    const token = localStorage.getItem('pluginradar_session');
    if (!token) return;

    try {
      await convexClient.convex.mutation(api.privateChains.rejectChain, {
        sessionToken: token,
        shareId: shareId as any,
      });
      setChains((prev) => prev.filter((c) => c._id !== shareId));
    } catch (err) {
      console.error('Failed to reject chain:', err);
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
      <div className="bg-plugin-surface rounded-lg p-4 border border-plugin-border">
        <div className="text-gray-400 text-sm">Loading received chains...</div>
      </div>
    );
  }

  return (
    <div className="bg-plugin-surface rounded-lg p-4 border border-plugin-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Inbox size={18} className="text-purple-400" />
          <h3 className="text-white font-medium">Received Chains</h3>
          {chains.length > 0 && (
            <span className="bg-purple-600 text-white text-xs rounded-full px-2 py-0.5 animate-pulse">
              {chains.length}
            </span>
          )}
        </div>
        <button
          onClick={loadChains}
          className="text-gray-400 hover:text-white p-1"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {importedChain && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded p-3 mb-3 text-green-400 text-sm">
          <Check size={14} />
          Imported "{importedChain}" into your chain!
        </div>
      )}

      {chains.length === 0 ? (
        <div className="text-gray-500 text-sm text-center py-4">
          No pending chains. When friends share chains with you, they'll appear here.
        </div>
      ) : (
        <div className="space-y-2">
          {chains.map((chain) => (
            <div
              key={chain._id}
              className="bg-black/20 rounded p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-white text-sm font-medium">{chain.chainName}</div>
                  <div className="text-gray-500 text-xs">
                    From <span className="text-purple-400">{chain.senderUsername}</span> • {formatTime(chain.sentAt)}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(chain._id)}
                  disabled={processing === chain._id}
                  className="flex-1 flex items-center justify-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded px-3 py-1.5"
                >
                  <Download size={14} />
                  Import
                </button>
                <button
                  onClick={() => handleReject(chain._id)}
                  disabled={processing === chain._id}
                  className="flex items-center justify-center gap-1 bg-red-600/20 hover:bg-red-600/30 disabled:opacity-50 text-red-400 text-sm rounded px-3 py-1.5"
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
