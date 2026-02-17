import { useState, useCallback, useRef, useEffect } from 'react';
import {
  MoreHorizontal,
  Download,
  Heart,
  Globe,
  Lock,
  FolderOpen,
  Cloud,
  Link2,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Check,
  X,
} from 'lucide-react';
import type { UnifiedChainItem } from '../../api/types';

interface UnifiedChainCardProps {
  item: UnifiedChainItem;
  onLoad: () => void;
  onRename: (newName: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onToggleVisibility?: () => Promise<boolean>;
}

function getSourceBadge(source: 'local' | 'cloud' | 'both') {
  switch (source) {
    case 'local':
      return { label: 'LOCAL', icon: FolderOpen, color: 'var(--color-serial)' };
    case 'cloud':
      return { label: 'CLOUD', icon: Cloud, color: 'var(--color-accent-cyan)' };
    case 'both':
      return { label: 'SYNCED', icon: Link2, color: 'var(--color-status-active)' };
  }
}

export function UnifiedChainCard({
  item,
  onLoad,
  onRename,
  onDelete,
  onToggleVisibility,
}: UnifiedChainCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showPlugins, setShowPlugins] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const name =
    item.source === 'both'
      ? item.localData.name
      : item.data.name;

  const isCloud = item.source === 'cloud' || item.source === 'both';
  const cloudData = item.source === 'cloud' ? item.data : item.source === 'both' ? item.cloudData : null;
  const isPublic = cloudData?.isPublic ?? false;
  const slots = cloudData?.slots;

  const badge = getSourceBadge(item.source);
  const BadgeIcon = badge.icon;

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Focus rename input
  useEffect(() => {
    if (isRenaming) renameRef.current?.focus();
  }, [isRenaming]);

  const handleStartRename = useCallback(() => {
    setRenameValue(name);
    setIsRenaming(true);
    setMenuOpen(false);
  }, [name]);

  const handleConfirmRename = useCallback(async () => {
    if (renameValue.trim() && renameValue.trim() !== name) {
      await onRename(renameValue.trim());
    }
    setIsRenaming(false);
  }, [renameValue, name, onRename]);

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete();
    setMenuOpen(false);
    setConfirmDelete(false);
  }, [confirmDelete, onDelete]);

  return (
    <div
      className="group fast-snap"
      style={{
        background: 'var(--color-bg-input)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        transition: 'all var(--duration-fast) var(--ease-snap)',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(222, 255, 10, 0.3)';
        e.currentTarget.style.boxShadow = '0 0 8px rgba(222, 255, 10, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Top row: name + badges */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <div className="flex items-center gap-1">
              <input
                ref={renameRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmRename();
                  if (e.key === 'Escape') setIsRenaming(false);
                }}
                className="input flex-1"
                style={{ fontSize: 'var(--text-xs)', padding: '2px 6px' }}
              />
              <button
                onClick={handleConfirmRename}
                style={{ padding: '2px', color: 'var(--color-status-active)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={() => setIsRenaming(false)}
                style={{ padding: '2px', color: 'var(--color-text-disabled)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={onLoad}
              className="text-left w-full"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <h4
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: '#deff0a',
                  fontFamily: 'var(--font-mono)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {name}
              </h4>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Source badge */}
          <span
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded"
            style={{
              fontSize: '8px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: badge.color,
              background: `color-mix(in srgb, ${badge.color} 15%, transparent)`,
            }}
          >
            <BadgeIcon className="w-2.5 h-2.5" />
            {badge.label}
          </span>

          {/* Public/Private indicator */}
          {isCloud && (
            <span style={{ color: isPublic ? 'var(--color-text-disabled)' : 'var(--color-accent-cyan)' }}>
              {isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
            </span>
          )}

          {/* Three-dot menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
                setConfirmDelete(false);
              }}
              className="p-0.5 opacity-0 group-hover:opacity-100"
              style={{
                color: 'var(--color-text-tertiary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'opacity var(--duration-fast)',
              }}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-20"
                style={{
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '4px 0',
                  minWidth: '140px',
                  boxShadow: 'var(--shadow-elevated)',
                }}
              >
                <MenuButton icon={Pencil} label="Rename" onClick={handleStartRename} />
                {isCloud && onToggleVisibility && (
                  <MenuButton
                    icon={isPublic ? EyeOff : Eye}
                    label={isPublic ? 'Make Private' : 'Publish'}
                    onClick={() => {
                      onToggleVisibility();
                      setMenuOpen(false);
                    }}
                  />
                )}
                <MenuButton
                  icon={Trash2}
                  label={confirmDelete ? 'Confirm Delete' : 'Delete'}
                  onClick={handleDelete}
                  danger={confirmDelete}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Plugin preview + stats */}
      {cloudData && (
        <div className="flex items-center gap-2.5 mb-1" style={{ fontSize: '9px', color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
          <span>{cloudData.pluginCount}p</span>
          <span className="flex items-center gap-0.5">
            <Download className="w-2.5 h-2.5" /> {cloudData.downloads}
          </span>
          <span className="flex items-center gap-0.5">
            <Heart className="w-2.5 h-2.5" /> {cloudData.likes}
          </span>
        </div>
      )}

      {/* Category for local-only */}
      {item.source === 'local' && (
        <p style={{ fontSize: '10px', color: 'var(--color-text-disabled)', textTransform: 'capitalize' }}>
          {item.data.category}
        </p>
      )}

      {/* Expandable plugin list */}
      {slots && slots.length > 0 && (
        <div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowPlugins(!showPlugins);
            }}
            className="flex items-center gap-1 mt-1"
            style={{
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {showPlugins ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {slots.length} plugin{slots.length !== 1 ? 's' : ''}
          </button>

          {showPlugins && (
            <div className="mt-1 space-y-0.5">
              {slots.map((slot, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-2 py-1 rounded"
                  style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <span style={{ color: 'var(--color-text-disabled)', width: '16px', textAlign: 'right' }}>
                    {(slot.position ?? idx) + 1}.
                  </span>
                  <span style={{ color: slot.bypassed ? 'var(--color-text-disabled)' : 'var(--color-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {slot.pluginName}
                  </span>
                  <span style={{ color: 'var(--color-text-disabled)', flexShrink: 0 }}>
                    {slot.manufacturer}
                  </span>
                  {slot.bypassed && (
                    <span
                      className="px-1 rounded"
                      style={{
                        fontSize: '7px',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                        color: 'var(--color-status-warning)',
                        background: 'rgba(255, 200, 0, 0.1)',
                      }}
                    >
                      BYP
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left fast-snap"
      style={{
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--font-mono)',
        color: danger ? 'var(--color-status-error)' : 'var(--color-text-primary)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? 'rgba(255, 0, 51, 0.1)' : 'rgba(222, 255, 10, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none';
      }}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}
