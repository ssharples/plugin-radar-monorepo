import { useState } from 'react';
import { Send, X, Loader2, Check, AlertCircle } from 'lucide-react';
import { useChainStore } from '../../stores/chainStore';
import { useSyncStore } from '../../stores/syncStore';
import * as convexClient from '../../api/convex-client';
import { api } from '@convex/_generated/api';
import { juceBridge } from '../../api/juce-bridge';
import { captureSlotParameters } from '../../utils/captureParameters';

interface QuickSharePanelProps {
  onClose: () => void;
}

export function QuickSharePanel({ onClose }: QuickSharePanelProps) {
  const { isLoggedIn } = useSyncStore();
  const { slots, chainName, lastCloudChainId, setLastCloudChainId } = useChainStore();

  const [recipient, setRecipient] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'sending' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isLoggedIn) {
    return (
      <div className="w-72 bg-plugin-surface border border-plugin-border rounded-lg shadow-xl animate-slide-up p-4">
        <div className="text-center">
          <AlertCircle className="w-5 h-5 text-plugin-dim mx-auto mb-2" />
          <p className="text-xs text-plugin-muted">Log in to share chains</p>
        </div>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="w-72 bg-plugin-surface border border-plugin-border rounded-lg shadow-xl animate-slide-up p-4">
        <div className="text-center">
          <AlertCircle className="w-5 h-5 text-plugin-dim mx-auto mb-2" />
          <p className="text-xs text-plugin-muted">Add plugins before sharing</p>
        </div>
      </div>
    );
  }

  const handleShare = async () => {
    if (!recipient.trim()) return;
    setErrorMsg('');

    try {
      let chainId = lastCloudChainId;

      // Auto-save to cloud if needed
      if (!chainId) {
        setStatus('saving');

        // Export chain with preset data from JUCE
        const exported = await juceBridge.exportChain();
        const paramsByPosition = await captureSlotParameters(exported.slots);
        const mappedSlots = exported.slots.map((slot: any, i: number) => ({
          position: slot.index,
          pluginName: slot.name,
          manufacturer: slot.manufacturer,
          format: slot.format,
          uid: slot.uid,
          version: slot.version,
          bypassed: slot.bypassed,
          presetData: slot.presetData,
          presetSizeBytes: slot.presetSizeBytes,
          ...(paramsByPosition.has(i) ? { parameters: paramsByPosition.get(i) } : {}),
        }));

        const saveResult = await convexClient.saveChain(
          chainName || 'Shared Chain',
          mappedSlots,
          { isPublic: false }
        );

        if (saveResult.error) {
          setStatus('error');
          setErrorMsg(saveResult.error);
          return;
        }

        chainId = saveResult.chainId || null;
        if (chainId) {
          setLastCloudChainId(chainId);
        }
      }

      if (!chainId) {
        setStatus('error');
        setErrorMsg('Failed to save chain');
        return;
      }

      // Send to recipient
      setStatus('sending');
      const token = localStorage.getItem('pluginradar_session');
      if (!token) {
        setStatus('error');
        setErrorMsg('Not logged in');
        return;
      }

      await convexClient.convex.mutation(api.privateChains.sendChain, {
        sessionToken: token,
        recipientIdentifier: recipient.trim(),
        chainId: chainId as any,
      });

      setStatus('success');
      setTimeout(() => {
        setStatus('idle');
        setRecipient('');
      }, 2000);
    } catch (err: any) {
      setStatus('error');
      const msg = err?.message || String(err);
      // Simplify common error messages
      if (msg.includes('not friends')) {
        setErrorMsg('You must be friends with this user');
      } else if (msg.includes('not found') || msg.includes('No user found')) {
        setErrorMsg('User not found');
      } else {
        setErrorMsg(msg);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleShare();
    }
  };

  const isBusy = status === 'saving' || status === 'sending';

  return (
    <div className="w-72 bg-plugin-surface border border-plugin-border rounded-lg shadow-xl animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-plugin-border">
        <div className="flex items-center gap-2">
          <Send className="w-3.5 h-3.5 text-plugin-accent" />
          <span className="text-xs font-mono uppercase font-semibold text-plugin-text">Share Chain</span>
        </div>
        <button onClick={onClose} className="text-plugin-dim hover:text-plugin-text">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Recipient input */}
        <div>
          <label className="block text-[10px] font-mono text-plugin-dim mb-1">Send to</label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Username, email, phone, or @instagram"
            disabled={isBusy}
            className="w-full bg-black/40 border border-plugin-border rounded font-mono px-2.5 py-1.5 text-xs text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:ring-1 focus:ring-plugin-accent disabled:opacity-50"
            autoFocus
          />
        </div>

        {/* Chain preview */}
        <div className="bg-black/20 rounded px-2.5 py-1.5">
          <div className="text-[10px] text-plugin-dim">
            {chainName} ({slots.length} plugin{slots.length !== 1 ? 's' : ''})
          </div>
        </div>

        {/* Status messages */}
        {status === 'saving' && (
          <div className="flex items-center gap-1.5 text-[10px] text-plugin-muted">
            <Loader2 className="w-3 h-3 animate-spin" />
            Saving chain to cloud...
          </div>
        )}
        {status === 'sending' && (
          <div className="flex items-center gap-1.5 text-[10px] text-plugin-muted">
            <Loader2 className="w-3 h-3 animate-spin" />
            Sending to {recipient}...
          </div>
        )}
        {status === 'success' && (
          <div className="flex items-center gap-1.5 text-[10px] text-green-400">
            <Check className="w-3 h-3" />
            Chain sent!
          </div>
        )}
        {status === 'error' && (
          <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
            {errorMsg}
          </div>
        )}

        {/* Send button */}
        <button
          onClick={handleShare}
          disabled={isBusy || !recipient.trim()}
          className="w-full flex items-center justify-center gap-1.5 bg-plugin-accent hover:bg-plugin-accent-dim text-black rounded px-3 py-1.5 text-[11px] font-mono uppercase font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="w-3 h-3" />
          Send
        </button>
      </div>
    </div>
  );
}
