import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

interface ChainBrowserSearchProps {
  onSearch: (query: string) => void;
  debounceMs?: number;
}

export function ChainBrowserSearch({ onSearch, debounceMs = 300 }: ChainBrowserSearchProps) {
  const [value, setValue] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearch(value.trim());
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, debounceMs, onSearch]);

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--color-text-disabled)' }} />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search chains..."
        className="input w-full"
        style={{ paddingLeft: '28px', paddingRight: '28px', fontSize: 'var(--text-xs)' }}
      />
      {value && (
        <button
          onClick={() => setValue('')}
          className="absolute right-2 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--color-text-disabled)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-disabled)')}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
