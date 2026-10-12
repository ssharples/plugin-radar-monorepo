interface ProChainMarkProps {
  className?: string;
  /** Show the word mark next to the glyph */
  showWord?: boolean;
  size?: number;
}

/**
 * ProChain logo: three linked slots (a chain of plugins) and the word mark.
 * Pure SVG + text so it needs no image assets.
 */
export function ProChainMark({ className = '', showWord = true, size = 20 }: ProChainMarkProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 select-none ${className}`}>
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
        <rect x="1" y="2" width="18" height="4.2" rx="1.4" fill="#8b7cff" />
        <rect x="1" y="7.9" width="18" height="4.2" rx="1.4" fill="#8b7cff" fillOpacity="0.6" />
        <rect x="1" y="13.8" width="18" height="4.2" rx="1.4" fill="#8b7cff" fillOpacity="0.32" />
        <circle cx="4" cy="4.1" r="1" fill="#0d0b1f" />
        <circle cx="4" cy="10" r="1" fill="#0d0b1f" />
        <circle cx="4" cy="15.9" r="1" fill="#0d0b1f" />
      </svg>
      {showWord && (
        <span className="text-[15px] font-semibold tracking-tight text-plugin-text leading-none">
          Pro<span className="text-plugin-accent">Chain</span>
        </span>
      )}
    </span>
  );
}
