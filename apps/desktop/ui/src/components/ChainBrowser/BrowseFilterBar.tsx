import { Search } from 'lucide-react';
import { CustomDropdown } from '../Dropdown';

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

interface BrowseFilterBarProps {
  sortBy: string;
  compatibilityFilter: string;
  isLoggedIn: boolean;
  searchQuery: string;
  onSortChange: (sort: string) => void;
  onCompatFilterChange: (filter: string) => void;
  onSearch: (query: string) => void;
}

export function BrowseFilterBar({
  sortBy,
  compatibilityFilter,
  isLoggedIn,
  searchQuery,
  onSortChange,
  onCompatFilterChange,
  onSearch,
}: BrowseFilterBarProps) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 flex-shrink-0"
      style={{
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-secondary)',
      }}
    >
      {/* Sort */}
      <div className="flex items-center gap-1.5">
        <span
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-disabled)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wider)',
          }}
        >
          Sort
        </span>
        <CustomDropdown
          value={sortBy}
          options={SORT_OPTIONS}
          onChange={onSortChange}
          size="sm"
        />
      </div>

      {/* Compatibility */}
      <div className="flex items-center gap-1.5">
        <span
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-disabled)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wider)',
          }}
        >
          Compat
        </span>
        <div className="flex items-center gap-0.5">
          {COMPAT_OPTIONS.map((opt) => {
            const isActive = compatibilityFilter === opt.value;
            const disabled = opt.value !== 'all' && !isLoggedIn;

            return (
              <button
                key={opt.value}
                onClick={() => !disabled && onCompatFilterChange(opt.value)}
                disabled={disabled}
                style={{
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-base)',
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  color: isActive ? 'var(--color-accent-cyan)' : 'var(--color-text-tertiary)',
                  background: isActive ? 'rgba(222, 255, 10, 0.15)' : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                  opacity: disabled ? 0.4 : 1,
                  border: 'none',
                  transition: 'all var(--duration-fast)',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
          style={{ color: 'var(--color-text-disabled)' }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search chains..."
          style={{
            width: '180px',
            padding: '3px 8px 3px 24px',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-primary)',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-base)',
            outline: 'none',
            transition: 'border-color var(--duration-fast)',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(222, 255, 10, 0.4)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; }}
        />
      </div>
    </div>
  );
}
