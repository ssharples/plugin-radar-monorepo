import { ReactNode } from 'react';

interface DropdownPanelProps {
  children: ReactNode;
  maxHeight?: string;
  className?: string;
}

export function DropdownPanel({ children, maxHeight = '300px', className = '' }: DropdownPanelProps) {
  return (
    <div
      className={`
        absolute top-full left-0 right-0 mt-1
        bg-plugin-surface border border-plugin-border rounded-lg
        shadow-[0_8px_32px_rgba(0,0,0,0.6)]
        animate-slide-up
        overflow-hidden
        z-50
        ${className}
      `}
      style={{ maxHeight }}
    >
      {/* Scanline texture overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-10 bg-[repeating-linear-gradient(0deg,transparent,transparent_1px,rgba(0,0,0,0.3)_2px)]" />

      {/* Scrollable content */}
      <div className="relative max-h-full overflow-y-auto custom-scrollbar">
        {children}
      </div>
    </div>
  );
}
