import { CustomDropdown, DropdownOption } from './CustomDropdown';

interface LufsPreset {
  value: number;
  label: string;
}

interface LufsPresetInputProps {
  value: number;
  onChange: (value: number) => void;
  presets: LufsPreset[];
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

export function LufsPresetInput({
  value,
  onChange,
  presets,
  label,
  min = -40,
  max = 0,
  step = 1,
  disabled = false,
}: LufsPresetInputProps) {
  // Convert presets to dropdown options
  const presetOptions: DropdownOption<number>[] = presets.map((p) => ({
    value: p.value,
    label: p.label,
  }));

  return (
    <div className="flex items-center gap-2">
      {/* Number Input */}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="w-16 bg-black/30 border border-plugin-border rounded px-2 py-1.5 font-mono text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-plugin-accent disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label={label ? `${label} - Manual Input` : 'LUFS Value'}
      />
      <span className="text-xs text-white">dB</span>

      {/* Preset Dropdown */}
      <div className="flex-1">
        <CustomDropdown
          value={value}
          options={presetOptions}
          onChange={onChange}
          label={label ? `${label} - Preset` : 'LUFS Preset'}
          disabled={disabled}
          size="md"
        />
      </div>
    </div>
  );
}
