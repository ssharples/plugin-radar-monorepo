import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

// Inline taxonomy — matches packages/shared/src/chainUseCases.ts
const CHAIN_USE_CASE_GROUPS = [
  {
    value: 'vocals', label: 'Vocals', emoji: '🎤',
    useCases: [
      { value: 'rap-vocals', label: 'Rap Vocals' },
      { value: 'female-vocals', label: 'Female Vocals' },
      { value: 'male-vocals', label: 'Male Vocals' },
      { value: 'backings', label: 'Backings' },
      { value: 'adlibs', label: 'Adlibs' },
      { value: 'harmonies', label: 'Harmonies' },
      { value: 'spoken-word', label: 'Spoken Word' },
    ],
  },
  {
    value: 'drums', label: 'Drums', emoji: '🥁',
    useCases: [
      { value: 'kick', label: 'Kick' },
      { value: 'snare', label: 'Snare' },
      { value: 'hats', label: 'Hats' },
      { value: 'drum-bus', label: 'Drum Bus' },
      { value: 'overheads', label: 'Overheads' },
      { value: 'toms', label: 'Toms' },
      { value: 'percussion', label: 'Percussion' },
    ],
  },
  {
    value: 'bass', label: 'Bass', emoji: '🎸',
    useCases: [
      { value: 'bass-guitar', label: 'Bass Guitar' },
      { value: 'sub-bass', label: 'Sub Bass' },
      { value: '808', label: '808' },
      { value: 'synth-bass', label: 'Synth Bass' },
    ],
  },
  {
    value: 'keys-synths', label: 'Keys & Synths', emoji: '🎹',
    useCases: [
      { value: 'piano', label: 'Piano' },
      { value: 'pads', label: 'Pads' },
      { value: 'leads', label: 'Leads' },
      { value: 'organs', label: 'Organs' },
      { value: 'strings', label: 'Strings' },
    ],
  },
  {
    value: 'guitar', label: 'Guitar', emoji: '🎸',
    useCases: [
      { value: 'electric-guitar', label: 'Electric Guitar' },
      { value: 'acoustic-guitar', label: 'Acoustic Guitar' },
      { value: 'guitar-bus', label: 'Guitar Bus' },
    ],
  },
  {
    value: 'fx-creative', label: 'FX & Creative', emoji: '✨',
    useCases: [
      { value: 'experimental', label: 'Experimental' },
      { value: 'sound-design', label: 'Sound Design' },
      { value: 'ambient', label: 'Ambient' },
      { value: 'risers-impacts', label: 'Risers & Impacts' },
    ],
  },
  {
    value: 'mixing-mastering', label: 'Mixing & Mastering', emoji: '🎚️',
    useCases: [
      { value: 'mix-bus', label: 'Mix Bus' },
      { value: 'master-chain', label: 'Master Chain' },
      { value: 'stem-mixing', label: 'Stem Mixing' },
      { value: 'live-performance', label: 'Live Performance' },
    ],
  },
];

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
        // Deselect
        onSelectGroup(null);
      } else {
        onSelectGroup(groupValue);
        onSelectUseCase(null);
      }
      // Expand/collapse
      toggleExpand(groupValue);
    },
    [selectedGroup, selectedUseCase, onSelectGroup, onSelectUseCase, toggleExpand]
  );

  const handleUseCaseClick = useCallback(
    (ucValue: string, groupValue: string) => {
      if (selectedUseCase === ucValue) {
        // Deselect use case, keep group
        onSelectUseCase(null);
      } else {
        onSelectGroup(groupValue);
        onSelectUseCase(ucValue);
      }
    },
    [selectedUseCase, onSelectGroup, onSelectUseCase]
  );

  return (
    <div className="space-y-0.5">
      {/* "All" button */}
      <button
        onClick={() => {
          onSelectGroup(null);
          onSelectUseCase(null);
        }}
        className={`w-full text-left px-2 h-7 rounded-md text-[13px] transition-colors ${
          !selectedGroup && !selectedUseCase
            ? 'bg-plugin-accent/15 text-plugin-accent-bright font-medium'
            : 'text-plugin-muted hover:text-plugin-text hover:bg-plugin-raised'
        }`}
      >
        All Categories
      </button>

      {CHAIN_USE_CASE_GROUPS.map((group) => {
        const isExpanded = expandedGroups.has(group.value);
        const isGroupSelected = selectedGroup === group.value && !selectedUseCase;

        return (
          <div key={group.value}>
            <button
              onClick={() => handleGroupClick(group.value)}
              className={`w-full flex items-center gap-1.5 px-2 h-7 rounded-md text-[13px] transition-colors ${
                isGroupSelected
                  ? 'bg-plugin-accent/15 text-plugin-accent-bright font-medium'
                  : selectedGroup === group.value
                    ? 'text-plugin-text bg-plugin-raised'
                    : 'text-plugin-muted hover:text-plugin-text hover:bg-plugin-raised'
              }`}
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 flex-shrink-0" />
              )}
              <span className="truncate">{group.label}</span>
            </button>

            {isExpanded && (
              <div className="ml-[11px] pl-2 border-l border-plugin-border mt-0.5 mb-1 space-y-0.5">
                {group.useCases.map((uc) => (
                  <button
                    key={uc.value}
                    onClick={() => handleUseCaseClick(uc.value, group.value)}
                    className={`w-full text-left px-2 h-6 rounded-md text-xs transition-colors ${
                      selectedUseCase === uc.value
                        ? 'bg-plugin-accent/15 text-plugin-accent-bright font-medium'
                        : 'text-plugin-dim hover:text-plugin-muted hover:bg-plugin-raised'
                    }`}
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
