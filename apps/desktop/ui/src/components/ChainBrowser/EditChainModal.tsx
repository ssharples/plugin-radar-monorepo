import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useCloudChainStore } from '../../stores/cloudChainStore';
import { useChainStore } from '../../stores/chainStore';
import type { BrowseChainResult } from '../../api/types';

interface EditChainModalProps {
  chain: BrowseChainResult;
  onClose: () => void;
  onSaved?: () => void;
}

export function EditChainModal({ chain, onClose, onSaved }: EditChainModalProps) {
  const updateChainMetadata = useCloudChainStore((s) => s.updateChainMetadata);
  const showToast = useChainStore((s) => s.showToast);
  const [description, setDescription] = useState(chain.description || '');
  const [useCase, setUseCase] = useState(chain.useCase || '');
  const [tags, setTags] = useState((chain.tags || []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const parsedTags = useMemo(
    () => tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    [tags],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    const success = await updateChainMetadata(chain._id, {
      description: description || undefined,
      useCase: useCase || undefined,
      tags: parsedTags,
      category: chain.category,
    });
    setSaving(false);

    if (!success) {
      setError('Failed to update chain');
      return;
    }

    showToast('Chain updated');
    onSaved?.();
    onClose();
  }, [chain._id, chain.category, description, onClose, onSaved, parsedTags, showToast, updateChainMetadata, useCase]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 360,
          background: '#111',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: 16,
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 style={{ fontSize: 'var(--text-body)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Edit Chain
          </h3>
          <button onClick={onClose} style={{ color: 'var(--color-text-secondary)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            className="w-full rounded px-3 py-2 text-sm"
            style={{ background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', minHeight: 96 }}
          />
          <input
            value={useCase}
            onChange={(e) => setUseCase(e.target.value)}
            placeholder="Use case"
            className="w-full rounded px-3 py-2 text-sm"
            style={{ background: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags, comma separated"
            className="w-full rounded px-3 py-2 text-sm"
            style={{ background: 'var(--color-bg-input)', color: 'var(--color-text-primary)' }}
          />
          {error && <p style={{ color: 'var(--color-status-error)', fontSize: 'var(--text-xs)' }}>{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-2 text-xs uppercase tracking-wider">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-2 text-xs uppercase tracking-wider rounded"
              style={{
                background: 'rgba(222, 255, 10, 0.12)',
                color: 'var(--color-accent-cyan)',
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
