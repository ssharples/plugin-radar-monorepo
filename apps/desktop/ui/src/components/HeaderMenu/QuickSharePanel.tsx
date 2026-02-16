import { useState } from 'react';
import { Send, X, Loader2, Check, AlertCircle } from 'lucide-react';
import { useChainStore } from '../../stores/chainStore';
import { useSyncStore } from '../../stores/syncStore';
import * as convexClient from '../../api/convex-client';
const { getStoredSession } = convexClient;
import { api } from '@convex/_generated/api';
import { juceBridge } from '../../api/juce-bridge';
import { captureSlotParameters } from '../../utils/captureParameters';

const glassPanel: React.CSSProperties = {
  background: 'rgba(15, 15, 15, 0.9)',
  backdropFilter: 'blur(12px)',
  border: '1px solid var(--color-border-default)',
  boxShadow: 'var(--shadow-elevated)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-bg-input)',
  border: '1px solid var(--color-border-default)',
  borderRadius: 'var(--radius-base)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-primary)',
  padding: '6px 10px',
  outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
};

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
      <div className="w-80 rounded-md p-4 scale-in" style={glassPanel}>
        <div className="text-center">
          <AlertCircle className="w-5 h-5 mx-auto mb-2" style={{ color: 'var(--color-text-tertiary)' }} />
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            Log in to share chains
          </p>
        </div>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="w-80 rounded-md p-4 scale-in" style={glassPanel}>
        <div className="text-center">
          <AlertCircle className="w-5 h-5 mx-auto mb-2" style={{ color: 'var(--color-text-tertiary)' }} />
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            Add plugins before sharing
          </p>
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
      const token = getStoredSession();
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
    <div className="w-80 rounded-md scale-in" style={glassPanel}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
        <div className="flex items-center gap-2">
          <Send className="w-3.5 h-3.5" style={{ color: 'var(--color-accent-cyan)' }} />
          <span style={{
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-extended)',
            fontWeight: 900,
            color: 'var(--color-text-primary)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wider)',
          }}>
            Share Chain
          </span>
        </div>
        <button
          onClick={onClose}
          className="transition-colors duration-150"
          style={{ color: 'var(--color-text-tertiary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Recipient input */}
        <div>
          <label
            className="block mb-1"
            style={{
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wide)',
            }}
          >
            Send to
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Username, email, phone, or @instagram"
            disabled={isBusy}
            style={{
              ...inputStyle,
              opacity: isBusy ? 0.5 : 1,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent-cyan)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--color-accent-cyan)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.boxShadow = 'none'; }}
            autoFocus
          />
        </div>

        {/* Chain preview */}
        <div
          className="rounded-md px-2.5 py-1.5"
          style={{ background: 'var(--color-bg-input)', border: '1px solid var(--color-border-subtle)' }}
        >
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            {chainName} ({slots.length} plugin{slots.length !== 1 ? 's' : ''})
          </div>
        </div>

        {/* Status messages */}
        {status === 'saving' && (
          <div className="flex items-center gap-1.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            <Loader2 className="w-3 h-3 animate-spin" />
            Saving chain to cloud...
          </div>
        )}
        {status === 'sending' && (
          <div className="flex items-center gap-1.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            <Loader2 className="w-3 h-3 animate-spin" />
            Sending to {recipient}...
          </div>
        )}
        {status === 'success' && (
          <div className="flex items-center gap-1.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-status-active)', fontFamily: 'var(--font-mono)' }}>
            <Check className="w-3 h-3" />
            Chain sent!
          </div>
        )}
        {status === 'error' && (
          <div
            className="rounded px-2 py-1.5"
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-status-error)',
              background: 'rgba(255, 0, 51, 0.1)',
              border: '1px solid rgba(255, 0, 51, 0.2)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Send button */}
        <button
          onClick={handleShare}
          disabled={isBusy || !recipient.trim()}
          className="btn btn-primary w-full"
          style={{ opacity: isBusy || !recipient.trim() ? 0.4 : 1 }}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Send className="w-3 h-3" />
            Send
          </span>
        </button>
      </div>
    </div>
  );
}
