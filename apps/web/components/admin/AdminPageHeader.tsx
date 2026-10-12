"use client";

import Link from "next/link";
import { Plus } from "@phosphor-icons/react";

export function AdminPageHeader({
  title,
  subtitle,
  actionLabel,
  actionHref,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        <h1
          className="text-2xl font-bold text-stone-100"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-stone-400 mt-1">{subtitle}</p>
        )}
      </div>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#deff0a] hover:bg-[#ccff00] text-stone-900 text-sm font-semibold rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" weight="bold" />
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
