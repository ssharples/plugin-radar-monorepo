"use client";

export function MultiCheckbox({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const toggle = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option));
    } else {
      onChange([...value, option]);
    }
  };

  return (
    <div>
      <label className="block text-sm text-stone-400 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = value.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                checked
                  ? "bg-[#deff0a]/10 border-[#deff0a]/30 text-[#deff0a]"
                  : "bg-white/[0.03] border-white/[0.06] text-stone-400 hover:text-stone-200 hover:border-white/[0.12]"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
