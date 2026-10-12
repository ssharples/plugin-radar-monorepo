"use client";

import { useEffect, useState } from "react";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function SlugInput({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
}) {
  const [manualOverride, setManualOverride] = useState(false);

  useEffect(() => {
    if (!manualOverride && !disabled) {
      onChange(generateSlug(name));
    }
  }, [name, manualOverride, disabled, onChange]);

  return (
    <div>
      <label className="block text-sm text-stone-400 mb-2">Slug</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setManualOverride(true);
            onChange(e.target.value);
          }}
          disabled={disabled}
          className="flex-1 px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition disabled:opacity-50"
          placeholder="auto-generated-slug"
        />
        {manualOverride && !disabled && (
          <button
            type="button"
            onClick={() => {
              setManualOverride(false);
              onChange(generateSlug(name));
            }}
            className="px-3 py-2 text-xs text-stone-400 hover:text-stone-200 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl transition"
          >
            Auto
          </button>
        )}
      </div>
    </div>
  );
}
