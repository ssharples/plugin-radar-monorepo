import { LEDIndicator } from './LEDIndicator';

interface DropdownOptionProps {
  label: string;
  value: string;
  selected: boolean;
  highlighted: boolean;
  icon?: string;
  disabled?: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

export function DropdownOption({
  label,
  selected,
  highlighted,
  icon,
  disabled = false,
  onClick,
  onMouseEnter,
}: DropdownOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      disabled={disabled}
      className={`
        w-full flex items-center gap-2 px-3 py-2
        text-left text-xs font-mono
        transition-colors
        ${disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'cursor-pointer'
        }
        ${selected
          ? 'bg-plugin-accent/20 text-plugin-accent'
          : highlighted
          ? 'bg-plugin-accent/10 text-white'
          : 'text-white hover:bg-plugin-accent/5 hover:text-plugin-accent'
        }
        ${highlighted || selected ? 'crt-text' : ''}
      `}
      role="option"
      aria-selected={selected}
    >
      {/* LED indicator for selected item */}
      {selected && <LEDIndicator color="green" pulse />}
      {!selected && <div className="w-1.5" />} {/* Spacer */}

      {/* Icon (if provided) */}
      {icon && <span className="text-sm">{icon}</span>}

      {/* Label */}
      <span className="flex-1">{label}</span>
    </button>
  );
}
