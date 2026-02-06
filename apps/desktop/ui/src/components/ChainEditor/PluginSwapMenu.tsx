import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeftRight, Dice5, X, Loader2 } from 'lucide-react';
import { findCompatibleSwaps, translateParameters } from '../../api/convex-client';
import { juceBridge } from '../../api/juce-bridge';

interface SwapCandidate {
  pluginId: string;
  pluginName: string;
  category: string;
  confidence: number;
  parameterCount: number;
  eqBandCount?: number;
}

interface PluginSwapMenuProps {
  nodeId: number;
  pluginName: string;
  /** The matched PluginRadar catalog ID for this plugin (if known) */
  matchedPluginId?: string;
  /** JUCE UID for finding the plugin in the scan list */
  pluginUid?: number;
  onSwapComplete?: (newPluginName: string, confidence: number) => void;
  onClose?: () => void;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence > 80) {
    return <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">🟢 {confidence}%</span>;
  } else if (confidence > 50) {
    return <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">🟡 {confidence}%</span>;
  } else {
    return <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">🔴 {confidence}%</span>;
  }
}

export function PluginSwapMenu({
  nodeId,
  pluginName,
  matchedPluginId,
  pluginUid,
  onSwapComplete,
  onClose,
}: PluginSwapMenuProps) {
  const [swaps, setSwaps] = useState<SwapCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!matchedPluginId) {
      setLoading(false);
      setError('Plugin not matched to catalog');
      return;
    }

    findCompatibleSwaps(matchedPluginId).then((results) => {
      setSwaps(results);
      setLoading(false);
    }).catch((err) => {
      setError(String(err));
      setLoading(false);
    });
  }, [matchedPluginId]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleSwap = useCallback(async (target: SwapCandidate) => {
    if (!matchedPluginId) return;
    setSwapping(target.pluginId);
    setError(null);

    try {
      // 1. Read current parameters from the loaded plugin
      const readResult = await juceBridge.readPluginParameters(nodeId);
      if (!readResult.success || !readResult.parameters) {
        setError('Failed to read plugin parameters');
        setSwapping(null);
        return;
      }

      // 2. Translate parameters via Convex
      const sourceParams = readResult.parameters.map((p) => ({
        paramId: p.name,
        paramIndex: p.index,
        normalizedValue: p.normalizedValue,
      }));

      const translation = await translateParameters(
        matchedPluginId,
        target.pluginId,
        sourceParams
      );

      if (!translation) {
        setError('Translation failed');
        setSwapping(null);
        return;
      }

      // 3. Build translated params for the JUCE bridge
      const translatedParams = translation.targetParams
        .filter((p) => p.paramIndex !== undefined)
        .map((p) => ({
          paramIndex: p.paramIndex!,
          value: p.value,
        }));

      // 4. Find the JUCE plugin UID for the target
      // We need to find the target plugin's JUCE identifier from the scanned list
      const pluginList = await juceBridge.getPluginList();
      // Try to match by name (best we can do without a direct ID mapping)
      const targetPlugin = pluginList.find(
        (p) => p.name.toLowerCase().includes(target.pluginName.toLowerCase()) ||
               target.pluginName.toLowerCase().includes(p.name.toLowerCase())
      );

      if (!targetPlugin) {
        setError(`Plugin "${target.pluginName}" not found in scanned plugins`);
        setSwapping(null);
        return;
      }

      // 5. Execute the swap
      const result = await juceBridge.swapPluginInChain(
        nodeId,
        targetPlugin.id, // JUCE identifier string
        translatedParams
      );

      if (result.success) {
        onSwapComplete?.(target.pluginName, translation.confidence);
        onClose?.();
      } else {
        setError(result.error || 'Swap failed');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSwapping(null);
    }
  }, [matchedPluginId, nodeId, onSwapComplete, onClose]);

  const handleRandomize = useCallback(async () => {
    if (swaps.length === 0) return;
    const randomIndex = Math.floor(Math.random() * swaps.length);
    await handleSwap(swaps[randomIndex]);
  }, [swaps, handleSwap]);

  return (
    <div
      ref={menuRef}
      className="absolute z-50 mt-1 w-72 bg-plugin-bg border border-plugin-border rounded-lg shadow-xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-plugin-border bg-plugin-bg/80">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-plugin-accent" />
          <span className="text-sm font-medium text-plugin-text">Swap Plugin</span>
        </div>
        <div className="flex items-center gap-1">
          {swaps.length > 0 && (
            <button
              onClick={handleRandomize}
              disabled={!!swapping}
              className="p-1 rounded hover:bg-plugin-accent/20 text-plugin-muted hover:text-plugin-accent transition-colors"
              title="Random swap"
            >
              <Dice5 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-plugin-border text-plugin-muted hover:text-plugin-text transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-plugin-muted">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Finding compatible plugins...</span>
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : swaps.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <p className="text-sm text-plugin-muted">No compatible plugins found.</p>
            <p className="text-xs text-plugin-muted/60 mt-1">
              You need owned plugins in the same category with parameter maps.
            </p>
          </div>
        ) : (
          swaps.map((swap) => (
            <button
              key={swap.pluginId}
              onClick={() => handleSwap(swap)}
              disabled={!!swapping}
              className={`w-full flex items-center justify-between px-3 py-2 hover:bg-plugin-accent/10 transition-colors text-left ${
                swapping === swap.pluginId ? 'bg-plugin-accent/5' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-plugin-text truncate">{swap.pluginName}</p>
                <p className="text-xs text-plugin-muted">
                  {swap.parameterCount} params
                  {swap.eqBandCount ? ` • ${swap.eqBandCount} bands` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-2">
                <ConfidenceBadge confidence={swap.confidence} />
                {swapping === swap.pluginId && (
                  <Loader2 className="w-4 h-4 animate-spin text-plugin-accent" />
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      {swaps.length > 0 && (
        <div className="px-3 py-1.5 border-t border-plugin-border bg-plugin-bg/50">
          <p className="text-[10px] text-plugin-muted/50">
            🟢 &gt;80% • 🟡 50-80% • 🔴 &lt;50% match confidence
          </p>
        </div>
      )}
    </div>
  );
}
