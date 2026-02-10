import { useState, useCallback } from 'react';
import {
  ChevronLeft,
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

interface ChainBrowserDetailProps {
  chain: any;
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
  const { setChainName, setTargetInputLufs } = useChainStore();
  const { isLoggedIn } = useSyncStore();

  const [forkName, setForkName] = useState('');
  const [showForkInput, setShowForkInput] = useState(false);
  const [forking, setForking] = useState(false);

  const handleLoadChain = useCallback(async () => {
    downloadChain(chain._id);
    const chainData = {
      version: 1,
      numSlots: chain.slots.length,
      slots: chain.slots.map((slot: any, idx: number) => ({
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
      })),
    };
    const result = await juceBridge.importChain(chainData);
    if (result.success) {
      setChainName(chain.name);
      setTargetInputLufs(chain.targetInputLufs ?? null);
      onClose();
    }
  }, [chain, downloadChain, setChainName, setTargetInputLufs, onClose]);

  const handleFork = useCallback(async () => {
    if (!forkName.trim()) return;
    setForking(true);
    await forkChain(chain._id, forkName.trim());
    setForking(false);
    setShowForkInput(false);
    setForkName('');
  }, [chain, forkChain, forkName]);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-[10px] text-plugin-muted hover:text-plugin-text mb-3 font-mono uppercase"
      >
        <ChevronLeft className="w-3 h-3" /> Back
      </button>

      <h3 className="text-sm font-bold text-plugin-text mb-1 crt-text">
        {chain.name}
      </h3>
      {chain.author?.name && (
        <p className="text-[10px] text-plugin-muted mb-2">
          by @{chain.author.name}
        </p>
      )}
      {chain.description && (
        <p className="text-[10px] text-plugin-muted mb-3">{chain.description}</p>
      )}

      {/* Tags */}
      {chain.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {chain.tags.map((tag: string) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 bg-plugin-accent/15 text-plugin-accent rounded text-[9px] font-mono"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Target LUFS */}
      {chain.targetInputLufs != null && (
        <div className="flex items-center gap-2 mb-3 text-[10px]">
          <span className="text-plugin-muted">Target:</span>
          <span className="font-mono font-medium text-plugin-accent">
            {chain.targetInputLufs} LUFS
          </span>
        </div>
      )}

      {/* Compatibility */}
      {compatibility && (
        <div
          className={`rounded-propane p-3 mb-3 ${
            compatibility.canFullyLoad
              ? 'bg-green-500/10 border border-green-500/20'
              : 'bg-yellow-500/10 border border-yellow-500/20'
          }`}
        >
          <div className="flex items-center justify-between text-[10px] mb-1.5">
            <span
              className={
                compatibility.canFullyLoad ? 'text-green-400' : 'text-yellow-400'
              }
            >
              {compatibility.canFullyLoad
                ? 'All plugins available'
                : `Missing ${compatibility.missingCount} plugins`}
            </span>
            <span className="font-mono font-bold text-plugin-text">
              {compatibility.percentage}%
            </span>
          </div>
          <div className="w-full bg-black/30 rounded-full h-1">
            <div
              className={`h-1 rounded-full ${
                compatibility.canFullyLoad ? 'bg-green-500' : 'bg-yellow-500'
              }`}
              style={{ width: `${compatibility.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Plugin slots */}
      <div className="mb-4">
        <h4 className="text-[9px] font-mono text-plugin-dim uppercase tracking-wider mb-2">
          Plugins ({chain.slots?.length ?? 0})
        </h4>
        <div className="space-y-1">
          {chain.slots?.map((slot: any, idx: number) => {
            const isMissing = detailedCompatibility?.missing?.some(
              (m) =>
                m.pluginName.toLowerCase() === slot.pluginName.toLowerCase()
            );
            return (
              <div
                key={idx}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded text-[10px] ${
                  isMissing
                    ? 'bg-red-500/5 border border-red-500/10'
                    : 'bg-white/3'
                }`}
              >
                <div>
                  <span className="text-plugin-text">{slot.pluginName}</span>
                  <span className="text-plugin-dim ml-1">{slot.manufacturer}</span>
                </div>
                {isMissing ? (
                  <span className="text-red-400 text-[9px]">Missing</span>
                ) : (
                  <span className="text-green-400 text-[9px]">OK</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-[10px] text-plugin-muted mb-4">
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
          className="flex-1 flex items-center justify-center gap-1.5 bg-plugin-accent hover:bg-plugin-accent-dim text-black rounded-propane px-4 py-2 text-[10px] font-mono uppercase font-bold transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Load Chain
        </button>
        <button
          onClick={onToggleCollection}
          className={`flex items-center gap-1 border rounded-propane px-3 py-2 text-[10px] font-mono uppercase transition-colors ${
            isInCollection
              ? 'border-plugin-accent/40 text-plugin-accent'
              : 'border-plugin-border hover:border-plugin-accent/30 text-plugin-muted hover:text-plugin-text'
          }`}
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
            className="flex items-center gap-1 border border-plugin-border hover:border-plugin-accent/30 text-plugin-muted hover:text-plugin-text rounded-propane px-3 py-2 text-[10px] font-mono uppercase transition-colors"
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
            className="flex-1 bg-black/40 border border-plugin-border rounded-propane font-mono px-2.5 py-1.5 text-xs text-plugin-text focus:outline-none focus:ring-1 focus:ring-plugin-accent"
            autoFocus
          />
          <button
            onClick={handleFork}
            disabled={forking || !forkName.trim()}
            className="px-3 py-1.5 bg-plugin-accent hover:bg-plugin-accent-dim text-black rounded-propane text-[10px] font-mono uppercase font-bold disabled:opacity-40"
          >
            {forking ? '...' : 'Fork'}
          </button>
          <button
            onClick={() => setShowForkInput(false)}
            className="px-2 text-[10px] text-plugin-dim hover:text-plugin-text"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
