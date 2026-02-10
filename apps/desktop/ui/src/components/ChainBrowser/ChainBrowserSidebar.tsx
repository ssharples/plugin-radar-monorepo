import { UseCaseCategoryTree } from './UseCaseCategoryTree';
import { ChainBrowserSearch } from './ChainBrowserSearch';

const SORT_OPTIONS = [
  { value: 'popular', label: 'Popular' },
  { value: 'recent', label: 'Recent' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'rating', label: 'Top Rated' },
];

const COMPAT_OPTIONS = [
  { value: 'all', label: 'All Chains' },
  { value: 'full', label: 'I Own All' },
  { value: 'close', label: 'Missing 1-2' },
];

interface ChainBrowserSidebarProps {
  selectedGroup: string | null;
  selectedUseCase: string | null;
  sortBy: string;
  compatibilityFilter: string;
  isLoggedIn: boolean;
  onSelectGroup: (group: string | null) => void;
  onSelectUseCase: (useCase: string | null) => void;
  onSortChange: (sort: string) => void;
  onCompatFilterChange: (filter: string) => void;
  onSearch: (query: string) => void;
}

export function ChainBrowserSidebar({
  selectedGroup,
  selectedUseCase,
  sortBy,
  compatibilityFilter,
  isLoggedIn,
  onSelectGroup,
  onSelectUseCase,
  onSortChange,
  onCompatFilterChange,
  onSearch,
}: ChainBrowserSidebarProps) {
  return (
    <div className="w-[180px] flex-shrink-0 border-r border-plugin-border/50 flex flex-col min-h-0">
      {/* Search */}
      <div className="p-2 border-b border-plugin-border/50">
        <ChainBrowserSearch onSearch={onSearch} />
      </div>

      {/* Category tree — scrollable */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="text-[9px] font-mono text-plugin-dim uppercase tracking-wider mb-1.5">
          Category
        </div>
        <UseCaseCategoryTree
          selectedGroup={selectedGroup}
          selectedUseCase={selectedUseCase}
          onSelectGroup={onSelectGroup}
          onSelectUseCase={onSelectUseCase}
        />
      </div>

      {/* Compatibility filter */}
      <div className="p-2 border-t border-plugin-border/50">
        <div className="text-[9px] font-mono text-plugin-dim uppercase tracking-wider mb-1.5">
          Compatibility
        </div>
        <div className="space-y-0.5">
          {COMPAT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                compatibilityFilter === opt.value
                  ? 'text-plugin-accent bg-plugin-accent/10'
                  : 'text-plugin-muted hover:text-plugin-text hover:bg-white/5'
              } ${opt.value !== 'all' && !isLoggedIn ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="compat"
                value={opt.value}
                checked={compatibilityFilter === opt.value}
                onChange={() => onCompatFilterChange(opt.value)}
                disabled={opt.value !== 'all' && !isLoggedIn}
                className="accent-[#89572a] w-3 h-3"
              />
              {opt.label}
            </label>
          ))}
          {!isLoggedIn && (
            <p className="text-[8px] text-plugin-dim mt-1 px-2">
              Log in to filter by compatibility
            </p>
          )}
        </div>
      </div>

      {/* Sort */}
      <div className="p-2 border-t border-plugin-border/50">
        <div className="text-[9px] font-mono text-plugin-dim uppercase tracking-wider mb-1.5">
          Sort By
        </div>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          className="w-full bg-black/40 border border-plugin-border rounded-propane font-mono px-2 py-1.5 text-[10px] text-plugin-text focus:outline-none"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
