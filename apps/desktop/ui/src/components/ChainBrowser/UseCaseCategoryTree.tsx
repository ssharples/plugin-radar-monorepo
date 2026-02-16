import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Mic2, Drum, Guitar, Piano, Sparkles, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { USE_CASE_GROUPS } from '../../constants/useCaseGroups';

// Icon mapping per group
const GROUP_ICONS: Record<string, LucideIcon> = {
  vocals: Mic2,
  drums: Drum,
  bass: Guitar,
  'keys-synths': Piano,
  guitar: Guitar,
  'fx-creative': Sparkles,
  'mixing-mastering': SlidersHorizontal,
};

interface UseCaseCategoryTreeProps {
  selectedGroup: string | null;
  selectedUseCase: string | null;
  onSelectGroup: (group: string | null) => void;
  onSelectUseCase: (useCase: string | null) => void;
}

export function UseCaseCategoryTree({
  selectedGroup,
  selectedUseCase,
  onSelectGroup,
  onSelectUseCase,
}: UseCaseCategoryTreeProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(selectedGroup ? [selectedGroup] : [])
  );

  const toggleExpand = useCallback((groupValue: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupValue)) {
        next.delete(groupValue);
      } else {
        next.add(groupValue);
      }
      return next;
    });
  }, []);

  const handleGroupClick = useCallback(
    (groupValue: string) => {
      if (selectedGroup === groupValue && !selectedUseCase) {
        onSelectGroup(null);
      } else {
        onSelectGroup(groupValue);
        onSelectUseCase(null);
      }
      toggleExpand(groupValue);
    },
    [selectedGroup, selectedUseCase, onSelectGroup, onSelectUseCase, toggleExpand]
  );

  const handleUseCaseClick = useCallback(
    (ucValue: string, groupValue: string) => {
      if (selectedUseCase === ucValue) {
        onSelectUseCase(null);
      } else {
        onSelectGroup(groupValue);
        onSelectUseCase(ucValue);
      }
    },
    [selectedUseCase, onSelectGroup, onSelectUseCase]
  );

  const isAllSelected = !selectedGroup && !selectedUseCase;

  return (
    <div className="space-y-0.5">
      {/* "All" button */}
      <button
        onClick={() => {
          onSelectGroup(null);
          onSelectUseCase(null);
        }}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '4px 8px',
          borderRadius: 'var(--radius-base)',
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          color: isAllSelected ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
          background: isAllSelected ? 'rgba(222, 255, 10, 0.15)' : 'transparent',
          fontWeight: isAllSelected ? 600 : 400,
          border: 'none',
          cursor: 'pointer',
          transition: 'all var(--duration-fast)',
        }}
      >
        All Categories
      </button>

      {USE_CASE_GROUPS.map((group) => {
        const isExpanded = expandedGroups.has(group.value);
        const isGroupSelected = selectedGroup === group.value && !selectedUseCase;
        const isGroupActive = selectedGroup === group.value;

        return (
          <div key={group.value}>
            <button
              onClick={() => handleGroupClick(group.value)}
              className="flex items-center gap-1.5"
              style={{
                width: '100%',
                padding: '4px 8px',
                borderRadius: 'var(--radius-base)',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                color: isGroupSelected ? 'var(--color-accent-cyan)' : isGroupActive ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                background: isGroupSelected ? 'rgba(222, 255, 10, 0.15)' : isGroupActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                fontWeight: isGroupSelected ? 600 : 400,
                border: 'none',
                cursor: 'pointer',
                transition: 'all var(--duration-fast)',
              }}
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 flex-shrink-0" />
              )}
              {(() => { const Icon = GROUP_ICONS[group.value]; return Icon ? <Icon className="w-3 h-3 flex-shrink-0 opacity-60" /> : null; })()}
              <span className="truncate">{group.label}</span>
            </button>

            {isExpanded && (
              <div className="ml-4 mt-0.5 space-y-0.5">
                {group.useCases.map((uc) => (
                  <button
                    key={uc.value}
                    onClick={() => handleUseCaseClick(uc.value, group.value)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '4px 8px 4px 16px',
                      borderRadius: 'var(--radius-base)',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: selectedUseCase === uc.value ? 'var(--color-accent-cyan)' : 'var(--color-text-disabled)',
                      background: selectedUseCase === uc.value ? 'rgba(222, 255, 10, 0.15)' : 'transparent',
                      fontWeight: selectedUseCase === uc.value ? 600 : 400,
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all var(--duration-fast)',
                    }}
                  >
                    {uc.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
