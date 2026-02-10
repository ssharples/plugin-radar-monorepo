"use client";

import { useState } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import type { ChainUseCaseGroup } from "../../../../packages/shared/src/chainUseCases";
import { CHAIN_USE_CASE_GROUPS } from "../../../../packages/shared/src/chainUseCases";

export function UseCaseCategoryTree({
  selectedCategory,
  onSelect,
}: {
  selectedCategory: string;
  onSelect: (value: string) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupValue: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupValue)) {
        next.delete(groupValue);
      } else {
        next.add(groupValue);
      }
      return next;
    });
  };

  return (
    <div className="space-y-0.5">
      {/* All categories option */}
      <button
        onClick={() => onSelect("")}
        className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition ${
          selectedCategory === ""
            ? "bg-amber-500/10 text-amber-400 font-medium"
            : "text-stone-400 hover:text-stone-200 hover:bg-white/[0.04]"
        }`}
      >
        All Categories
      </button>

      {CHAIN_USE_CASE_GROUPS.map((group: ChainUseCaseGroup) => {
        const isExpanded = expandedGroups.has(group.value);
        const isGroupSelected = selectedCategory === group.value;
        const hasChildSelected = group.useCases.some(
          (uc) => uc.value === selectedCategory
        );

        return (
          <div key={group.value}>
            <div className="flex items-center">
              <button
                onClick={() => toggleGroup(group.value)}
                className="p-1 text-stone-600 hover:text-stone-400 transition"
              >
                {isExpanded ? (
                  <CaretDown className="w-3 h-3" />
                ) : (
                  <CaretRight className="w-3 h-3" />
                )}
              </button>
              <button
                onClick={() => onSelect(group.value)}
                className={`flex-1 text-left px-2 py-1.5 rounded-lg text-sm transition ${
                  isGroupSelected
                    ? "bg-amber-500/10 text-amber-400 font-medium"
                    : hasChildSelected
                      ? "text-amber-400/70"
                      : "text-stone-400 hover:text-stone-200 hover:bg-white/[0.04]"
                }`}
              >
                <span className="mr-1.5">{group.emoji}</span>
                {group.label}
              </button>
            </div>

            {isExpanded && (
              <div className="ml-6 space-y-0.5">
                {group.useCases.map((uc) => (
                  <button
                    key={uc.value}
                    onClick={() => onSelect(uc.value)}
                    className={`w-full text-left px-3 py-1 rounded-lg text-xs transition ${
                      selectedCategory === uc.value
                        ? "bg-amber-500/10 text-amber-400 font-medium"
                        : "text-stone-500 hover:text-stone-300 hover:bg-white/[0.04]"
                    }`}
                  >
                    {uc.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
