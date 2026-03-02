"use client";

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";

export function FormSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-sm font-semibold text-stone-200">{title}</span>
        <CaretDown
          className={`w-4 h-4 text-stone-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/[0.04] pt-4">
          {children}
        </div>
      )}
    </div>
  );
}
