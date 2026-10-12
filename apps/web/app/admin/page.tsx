"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Plugs, Factory, Plus, Question } from "@phosphor-icons/react";

export default function AdminDashboardPage() {
  const manufacturers = useQuery(api.manufacturers.list, { limit: 1 });
  const plugins = useQuery(api.plugins.list, { limit: 1 });
  const categories = useQuery(api.plugins.getCategories);
  const unmatchedStats = useQuery(api.pluginDirectory.getUnmatchedStats);

  const pluginCount = categories
    ? categories.reduce((sum, c) => sum + c.count, 0)
    : undefined;
  const manufacturerCount = manufacturers !== undefined ? "..." : undefined;

  // We don't have a count query, so we'll show what we can
  const mfgList = useQuery(api.manufacturers.list, { limit: 500 });

  return (
    <div>
      <h1
        className="text-2xl font-bold text-stone-100 mb-2"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Admin Dashboard
      </h1>
      <p className="text-sm text-stone-400 mb-8">
        Manage plugins and manufacturers in the Plugin Radar catalog.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-[#deff0a]/10 rounded-lg flex items-center justify-center">
              <Plugs className="w-5 h-5 text-[#deff0a]" />
            </div>
            <div>
              <p className="text-xs text-stone-500 uppercase tracking-wider">
                Plugins
              </p>
              <p className="text-2xl font-bold text-stone-100">
                {pluginCount ?? (
                  <span className="inline-block w-12 h-7 bg-white/[0.06] rounded animate-pulse" />
                )}
              </p>
            </div>
          </div>
          <Link
            href="/admin/plugins"
            className="text-sm text-[#deff0a]/70 hover:text-[#deff0a] transition-colors"
          >
            Manage plugins &rarr;
          </Link>
        </div>

        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white/[0.06] rounded-lg flex items-center justify-center">
              <Factory className="w-5 h-5 text-stone-300" />
            </div>
            <div>
              <p className="text-xs text-stone-500 uppercase tracking-wider">
                Manufacturers
              </p>
              <p className="text-2xl font-bold text-stone-100">
                {mfgList ? mfgList.length : (
                  <span className="inline-block w-12 h-7 bg-white/[0.06] rounded animate-pulse" />
                )}
              </p>
            </div>
          </div>
          <Link
            href="/admin/manufacturers"
            className="text-sm text-[#deff0a]/70 hover:text-[#deff0a] transition-colors"
          >
            Manage manufacturers &rarr;
          </Link>
        </div>

        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center">
              <Question className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-stone-500 uppercase tracking-wider">
                Unmatched Plugins
              </p>
              <p className="text-2xl font-bold text-stone-100">
                {unmatchedStats ? unmatchedStats.pending : (
                  <span className="inline-block w-12 h-7 bg-white/[0.06] rounded animate-pulse" />
                )}
              </p>
            </div>
          </div>
          <Link
            href="/admin/unmatched"
            className="text-sm text-[#deff0a]/70 hover:text-[#deff0a] transition-colors"
          >
            Review unmatched &rarr;
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <h2 className="text-sm font-semibold text-stone-300 mb-4">
        Quick Actions
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/admin/plugins/new"
          className="flex items-center gap-3 p-4 glass-card rounded-xl hover:bg-white/[0.04] transition-colors"
        >
          <Plus className="w-5 h-5 text-[#deff0a]" />
          <span className="text-sm text-stone-200">Add New Plugin</span>
        </Link>
        <Link
          href="/admin/manufacturers/new"
          className="flex items-center gap-3 p-4 glass-card rounded-xl hover:bg-white/[0.04] transition-colors"
        >
          <Plus className="w-5 h-5 text-stone-400" />
          <span className="text-sm text-stone-200">Add New Manufacturer</span>
        </Link>
      </div>

      {/* Categories breakdown */}
      {categories && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-stone-300 mb-4">
            Plugins by Category
          </h2>
          <div className="glass-card rounded-xl p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between px-3 py-2 bg-white/[0.02] rounded-lg"
                >
                  <span className="text-sm text-stone-300">
                    {c.name.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </span>
                  <span className="text-sm font-medium text-stone-500">
                    {c.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
