import { usePluginStore } from '../../stores/pluginStore';

export function PluginFilters() {
  const { typeFilter, sortBy, setTypeFilter, setSortBy } = usePluginStore();

  const typeOptions = [
    { value: 'all', label: 'All' },
    { value: 'effects', label: 'FX' },
    { value: 'instruments', label: 'Inst' },
  ] as const;

  const sortOptions = [
    { value: 'name', label: 'Name' },
    { value: 'manufacturer', label: 'Maker' },
    { value: 'most-used', label: 'Most Used' },
    { value: 'recent', label: 'Recent' },
  ] as const;

  return (
    <div className="flex items-center gap-2">
      {/* Type toggle */}
      <div className="flex rounded overflow-hidden border border-plugin-border">
        {typeOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTypeFilter(opt.value)}
            className={`px-1.5 py-0.5 text-xxs transition-all ${
              typeFilter === opt.value
                ? 'bg-plugin-accent text-black font-semibold'
                : 'bg-plugin-bg text-plugin-muted hover:text-plugin-text'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Sort dropdown */}
      <select
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
        className="bg-plugin-bg text-xxs text-plugin-muted rounded px-1.5 py-0.5 border border-plugin-border focus:outline-none focus:border-plugin-accent/50 cursor-pointer"
      >
        {sortOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
