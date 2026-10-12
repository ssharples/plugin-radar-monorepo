import { UseCaseCategoryTree } from './UseCaseCategoryTree';

const COMPAT_OPTIONS = [
  { value: 'all', label: 'All chains', hint: '' },
  { value: 'full', label: 'I own every plugin', hint: '' },
  { value: 'close', label: 'Missing 1 or 2', hint: '' },
];

interface ChainBrowserSidebarProps {
  selectedGroup: string | null;
  selectedUseCase: string | null;
  compatibilityFilter: string;
  isLoggedIn: boolean;
  onSelectGroup: (group: string | null) => void;
  onSelectUseCase: (useCase: string | null) => void;
  onCompatFilterChange: (filter: string) => void;
}

/** Left filter rail of the Library: what you own, then use case. */
export function ChainBrowserSidebar({
  selectedGroup,
  selectedUseCase,
  compatibilityFilter,
  isLoggedIn,
  onSelectGroup,
  onSelectUseCase,
  onCompatFilterChange,
}: ChainBrowserSidebarProps) {
  return (
    <nav className="w-[196px] flex-shrink-0 border-r border-plugin-border bg-plugin-surface flex flex-col min-h-0" aria-label="Library filters">
      <div className="px-2.5 pt-3 pb-2.5 border-b border-plugin-border">
        <p className="section-label px-1 mb-1.5">Plugins I own</p>
        <div className="space-y-0.5" role="radiogroup" aria-label="Compatibility">
          {COMPAT_OPTIONS.map((opt) => {
            const disabled = opt.value !== 'all' && !isLoggedIn;
            const active = compatibilityFilter === opt.value;
            return (
              <button
                key={opt.value}
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onCompatFilterChange(opt.value)}
                className={`w-full flex items-center gap-2 px-2 h-7 rounded-md text-[13px] text-left transition-colors ${
                  active
                    ? 'bg-plugin-accent/15 text-plugin-accent-bright font-medium'
                    : 'text-plugin-muted hover:text-plugin-text hover:bg-plugin-raised'
                } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
              >
                <span className={`w-3 h-3 rounded-full border flex items-center justify-center ${active ? 'border-plugin-accent' : 'border-plugin-border-bright'}`}>
                  {active && <span className="w-1.5 h-1.5 rounded-full bg-plugin-accent" />}
                </span>
                {opt.label}
              </button>
            );
          })}
          {!isLoggedIn && (
            <p className="text-[11px] text-plugin-dim px-2 pt-1">Log in to filter by the plugins you own.</p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 pt-3 pb-3">
        <p className="section-label px-1 mb-1.5">Use case</p>
        <UseCaseCategoryTree
          selectedGroup={selectedGroup}
          selectedUseCase={selectedUseCase}
          onSelectGroup={onSelectGroup}
          onSelectUseCase={onSelectUseCase}
        />
      </div>
    </nav>
  );
}
