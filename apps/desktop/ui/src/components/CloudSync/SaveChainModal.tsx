import { useState, useEffect, useCallback } from 'react';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useSyncStore } from '../../stores/syncStore';
import type { ChainSlot } from '../../api/types';

interface SaveChainModalProps {
  slots: ChainSlot[];
  onClose: () => void;
  onSaved?: (slug: string, shareCode: string) => void;
}

const CATEGORIES = [
  { value: 'vocal', label: '🎤 Vocal' },
  { value: 'drums', label: '🥁 Drums' },
  { value: 'bass', label: '🎸 Bass' },
  { value: 'guitar', label: '🎸 Guitar' },
  { value: 'keys', label: '🎹 Keys/Synth' },
  { value: 'mixing', label: '🎚️ Mixing' },
  { value: 'mastering', label: '🏆 Mastering' },
  { value: 'creative', label: '✨ Creative/FX' },
  { value: 'live', label: '🎤 Live/Performance' },
];

export function SaveChainModal({ slots, onClose, onSaved }: SaveChainModalProps) {
  const { isLoggedIn } = useSyncStore();
  const { saveChain, saving, error } = useCloudChainStore();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('mixing');
  const [tags, setTags] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [savedResult, setSavedResult] = useState<{ slug: string; shareCode: string } | null>(null);

  // Escape key to close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const tagArray = tags.split(',').map(t => t.trim()).filter(Boolean);
    
    const result = await saveChain(name, slots, {
      description: description || undefined,
      category,
      tags: tagArray,
      isPublic,
    });

    if (result.slug && result.shareCode) {
      setSavedResult({ slug: result.slug, shareCode: result.shareCode });
      onSaved?.(result.slug, result.shareCode);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
        <div className="bg-plugin-surface rounded-propane-lg p-6 max-w-md w-full mx-4 border border-plugin-accent animate-slide-up" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-xl font-bold text-white mb-4">Sign In Required</h2>
          <p className="text-gray-400 mb-4">
            Connect to PluginRadar to save and share your chains.
          </p>
          <button
            onClick={onClose}
            className="w-full bg-plugin-accent hover:bg-plugin-accent-bright text-white rounded px-4 py-2"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (savedResult) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
        <div className="bg-plugin-surface rounded-propane-lg p-6 max-w-md w-full mx-4 border border-plugin-accent animate-slide-up" onClick={(e) => e.stopPropagation()}>
          <div className="text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h2 className="text-xl font-bold text-white mb-2">Chain Saved!</h2>
            <p className="text-gray-400 mb-4">
              Your chain has been saved to PluginRadar.
            </p>
            
            <div className="bg-black/30 rounded-lg p-4 mb-4">
              <div className="text-sm text-gray-400 mb-1">Share Code</div>
              <div className="text-2xl font-mono font-bold text-plugin-accent">
                {savedResult.shareCode}
              </div>
            </div>
            
            {isPublic && (
              <div className="text-sm text-gray-400 mb-4">
                View at: <span className="text-plugin-accent">plugin-radar.com/chains/{savedResult.slug}</span>
              </div>
            )}
            
            <button
              onClick={onClose}
              className="w-full bg-plugin-accent hover:bg-plugin-accent-bright text-white rounded px-4 py-2"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-plugin-surface rounded-propane-lg p-6 max-w-md w-full mx-4 border border-plugin-accent animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-white mb-4">Save Chain to Cloud</h2>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded p-3 mb-4 text-red-400 text-sm">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Chain Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Vocal Chain"
              required
              className="w-full bg-black/30 border border-plugin-border rounded px-3 py-2 text-white"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this chain good for?"
              rows={2}
              className="w-full bg-black/30 border border-plugin-border rounded px-3 py-2 text-white resize-none"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-black/30 border border-plugin-border rounded px-3 py-2 text-white"
            >
              {CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Tags (comma separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="warm, punchy, vintage"
              className="w-full bg-black/30 border border-plugin-border rounded px-3 py-2 text-white"
            />
          </div>
          
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isPublic"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="isPublic" className="text-sm text-gray-300">
              Make this chain public (anyone can find and use it)
            </label>
          </div>
          
          <div className="bg-black/20 rounded p-3">
            <div className="text-sm text-gray-400 mb-2">Chain Preview</div>
            <div className="text-sm text-white">
              {slots.length} plugin{slots.length !== 1 ? 's' : ''}:{' '}
              <span className="text-gray-400">
                {slots.map(s => s.name).join(' → ')}
              </span>
            </div>
          </div>
          
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-plugin-border text-gray-400 hover:text-white rounded px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className={`flex-1 rounded px-4 py-2 font-medium ${
                saving
                  ? 'bg-plugin-accent/50 text-plugin-accent cursor-wait'
                  : 'bg-plugin-accent hover:bg-plugin-accent-bright text-white'
              }`}
            >
              {saving ? 'Saving...' : 'Save Chain'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
