import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

interface ChainBrowserSearchProps {
  onSearch: (query: string) => void;
  debounceMs?: number;
  /** Replaces the box text when it changes (e.g. "find chains like this") */
  value?: string;
}

export function ChainBrowserSearch({ onSearch, debounceMs = 300, value: external }: ChainBrowserSearchProps) {
  const [value, setValue] = useState(external ?? '');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (external !== undefined) setValue(external);
  }, [external]);

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
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-plugin-dim" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search chains, plugins, creators…"
        aria-label="Search chains"
        className="w-full h-8 bg-plugin-bg border border-plugin-border rounded-md pl-8 pr-7 text-[13px] text-plugin-text placeholder:text-plugin-dim focus:outline-none focus:border-plugin-accent/60"
      />
      {value && (
        <button
          onClick={() => setValue('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-plugin-dim hover:text-plugin-text"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
