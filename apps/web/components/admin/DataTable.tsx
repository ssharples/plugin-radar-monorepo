"use client";

import { useRouter } from "next/navigation";

export interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T extends { _id: string }>({
  columns,
  data,
  isLoading,
  emptyMessage = "No items found.",
  onRowClick,
}: {
  columns: Column<T>[];
  data: T[] | undefined;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
}) {
  if (isLoading || data === undefined) {
    return (
      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider ${col.className || ""}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-white/[0.04]">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="h-4 bg-white/[0.06] rounded animate-pulse" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="glass-card rounded-xl p-12 text-center">
        <p className="text-stone-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider ${col.className || ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr
              key={item._id}
              onClick={() => onRowClick?.(item)}
              className={`border-b border-white/[0.04] last:border-0 ${
                onRowClick
                  ? "cursor-pointer hover:bg-white/[0.03] transition-colors"
                  : ""
              }`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-3 text-sm text-stone-300 ${col.className || ""}`}
                >
                  {col.render
                    ? col.render(item)
                    : (item as any)[col.key]?.toString() ?? "\u2014"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
