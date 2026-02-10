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
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-plugin-dim" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search chains..."
        className="w-full bg-black/40 border border-plugin-border rounded-propane font-mono pl-7 pr-7 py-1.5 text-xs text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:ring-1 focus:ring-plugin-accent"
      />
      {value && (
        <button
          onClick={() => setValue('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-plugin-dim hover:text-plugin-text"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
