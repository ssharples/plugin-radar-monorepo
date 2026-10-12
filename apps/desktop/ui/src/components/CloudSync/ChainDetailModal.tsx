import { useEffect, useCallback } from 'react';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { ChainDetailContent } from './ChainDetailContent';

interface ChainDetailModalProps {
  onClose: () => void;
  onLoad: (chainData: unknown) => void;
  onBack: () => void;
}

/** Modal wrapper around ChainDetailContent for the store's current chain. */
export function ChainDetailModal({ onClose, onLoad, onBack }: ChainDetailModalProps) {
  const { currentChain } = useCloudChainStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!currentChain) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-plugin-surface rounded-xl max-w-lg w-full mx-4 border border-plugin-border-bright h-[85vh] overflow-hidden shadow-panel animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <ChainDetailContent
          chain={currentChain}
          onBack={onBack}
          onClose={onClose}
          backLabel="Back to browse"
          onLoad={(data) => {
            onLoad(data);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
