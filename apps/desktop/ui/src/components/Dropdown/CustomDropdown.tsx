import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { DropdownPanel } from './DropdownPanel';
import { DropdownOption } from './DropdownOption';
import { useKeyboardStore, ShortcutPriority } from '../../stores/keyboardStore';

export interface DropdownOption<T> {
  value: T;
  label: string;
  icon?: string;
  disabled?: boolean;
}

interface CustomDropdownProps<T> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function CustomDropdown<T extends string | number>({
  value,
  options,
  onChange,
  label,
  placeholder = 'Select...',
  searchable = false,
  disabled = false,
  size = 'md',
  className = '',
}: CustomDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const uniqueId = useRef(`dropdown-${Math.random().toString(36).substr(2, 9)}`);

  // Filter options based on search query
  const filteredOptions = searchable && searchQuery
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : options;

  // Find selected option
  const selectedOption = options.find((opt) => opt.value === value);

  // Reset highlighted index when filtered options change
  useEffect(() => {
    if (filteredOptions.length > 0 && highlightedIndex >= filteredOptions.length) {
      setHighlightedIndex(filteredOptions.length - 1);
    }
  }, [filteredOptions.length, highlightedIndex]);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Keyboard navigation (higher priority than modal)
  useEffect(() => {
    if (!isOpen) return;

    const registerShortcut = useKeyboardStore.getState().registerShortcut;

    // Escape to close
    const cleanupEscape = registerShortcut({
      id: `${uniqueId.current}-escape`,
      key: 'Escape',
      priority: ShortcutPriority.DROPDOWN,
      allowInInputs: true,
      handler: (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        setSearchQuery('');
        return false; // Stop propagation
      },
    });

    // Arrow Down
    const cleanupArrowDown = registerShortcut({
      id: `${uniqueId.current}-arrow-down`,
      key: 'ArrowDown',
      priority: ShortcutPriority.DROPDOWN,
      allowInInputs: true,
      handler: (e) => {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        return false;
      },
    });

    // Arrow Up
    const cleanupArrowUp = registerShortcut({
      id: `${uniqueId.current}-arrow-up`,
      key: 'ArrowUp',
      priority: ShortcutPriority.DROPDOWN,
      allowInInputs: true,
      handler: (e) => {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        return false;
      },
    });

    // Enter to select
    const cleanupEnter = registerShortcut({
      id: `${uniqueId.current}-enter`,
      key: 'Enter',
      priority: ShortcutPriority.DROPDOWN,
      allowInInputs: true,
      handler: (e) => {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          const option = filteredOptions[highlightedIndex];
          if (!option.disabled) {
            onChange(option.value);
            setIsOpen(false);
            setSearchQuery('');
          }
        }
        return false;
      },
    });

    // Tab to close
    const cleanupTab = registerShortcut({
      id: `${uniqueId.current}-tab`,
      key: 'Tab',
      priority: ShortcutPriority.DROPDOWN,
      allowInInputs: true,
      handler: () => {
        setIsOpen(false);
        setSearchQuery('');
        return true; // Allow default tab behavior
      },
    });

    return () => {
      cleanupEscape();
      cleanupArrowDown();
      cleanupArrowUp();
      cleanupEnter();
      cleanupTab();
    };
  }, [isOpen, filteredOptions, highlightedIndex, onChange]);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      setHighlightedIndex(
        filteredOptions.findIndex((opt) => opt.value === value)
      );
    } else {
      setSearchQuery('');
    }
  }, [disabled, isOpen, filteredOptions, value]);

  const handleSelect = useCallback(
    (option: DropdownOption<T>) => {
      if (option.disabled) return;
      onChange(option.value);
      setIsOpen(false);
      setSearchQuery('');
    },
    [onChange]
  );

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-xs',
    lg: 'px-4 py-2.5 text-sm',
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`
          relative w-full flex items-center justify-between gap-2
          bg-black/30 border border-plugin-border rounded
          text-white font-mono text-left
          transition-colors
          ${sizeClasses[size]}
          ${
            disabled
              ? 'opacity-40 cursor-not-allowed'
              : 'hover:border-plugin-accent/40 cursor-pointer'
          }
          ${isOpen ? 'border-plugin-accent' : ''}
          dropdown-trigger
        `}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={label}
      >
        {/* Rivet decorations */}
        <style>{`
          .dropdown-trigger::before,
          .dropdown-trigger::after {
            content: '';
            position: absolute;
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.08);
            box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1);
          }
          .dropdown-trigger::before {
            top: 4px;
            left: 4px;
          }
          .dropdown-trigger::after {
            top: 4px;
            right: 4px;
          }
        `}</style>

        <span className="flex-1 truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-plugin-muted transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <DropdownPanel>
          {/* Search Input */}
          {searchable && (
            <div className="p-2 border-b border-plugin-border">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full bg-black/40 border border-plugin-border rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-plugin-accent"
              />
            </div>
          )}

          {/* Options */}
          <div role="listbox" aria-label={label}>
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-plugin-dim font-mono">
                No options found
              </div>
            ) : (
              filteredOptions.map((option, index) => (
                <DropdownOption
                  key={String(option.value)}
                  label={option.label}
                  value={String(option.value)}
                  selected={option.value === value}
                  highlighted={index === highlightedIndex}
                  icon={option.icon}
                  disabled={option.disabled}
                  onClick={() => handleSelect(option)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                />
              ))
            )}
          </div>
        </DropdownPanel>
      )}
    </div>
  );
}
