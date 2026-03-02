"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth-provider";
import { Id } from "@/convex/_generated/dataModel";
import { MatchPluginDialog } from "@/components/admin/MatchPluginDialog";
import {
  Question,
  MagnifyingGlass,
  X,
  Plus,
  Spinner,
  Check,
  Users,
} from "@phosphor-icons/react";
import Link from "next/link";

type StatusFilter = "pending" | "completed" | "ignored" | undefined;

export default function UnmatchedPluginsPage() {
  const { sessionToken } = useAuth();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [matchingItem, setMatchingItem] = useState<{
    id: Id<"enrichmentQueue">;
    pluginName: string;
    manufacturer: string;
  } | null>(null);
  const [dismissingId, setDismissingId] = useState<Id<"enrichmentQueue"> | null>(null);

  const queueItems = useQuery(api.adminEnrich.listEnrichmentQueue, {
    status: statusFilter,
    limit: 100,
  });

  const stats = useQuery(api.pluginDirectory.getUnmatchedStats);
  const dismissMutation = useMutation(api.pluginDirectory.dismissUnmatchedPlugin);

  async function handleDismiss(queueItemId: Id<"enrichmentQueue">) {
    if (!sessionToken) return;
    setDismissingId(queueItemId);
    try {
      await dismissMutation({ sessionToken, queueItemId });
    } catch (e) {
      console.error("Failed to dismiss:", e);
    } finally {
      setDismissingId(null);
    }
  }

  const statusTabs: { label: string; value: StatusFilter; count?: number }[] = [
    { label: "Pending", value: "pending", count: stats?.pending },
    { label: "Completed", value: "completed" },
    { label: "Ignored", value: "ignored" },
    { label: "All", value: undefined, count: stats?.total },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-2xl font-bold text-stone-100 mb-1"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Unmatched Plugins
          </h1>
          <p className="text-sm text-stone-400">
            Review plugins that couldn&apos;t be matched to the catalog during
            user scans.
          </p>
        </div>
        {stats && (
          <div className="text-right">
            <p className="text-2xl font-bold text-[#deff0a]">
              {stats.pending}
            </p>
            <p className="text-xs text-stone-500">pending review</p>
          </div>
        )}
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-white/[0.03] rounded-lg w-fit">
        {statusTabs.map((tab) => (
          <button
            key={tab.label}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              statusFilter === tab.value
                ? "bg-white/[0.1] text-stone-100"
                : "text-stone-500 hover:text-stone-300"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-stone-600">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {queueItems === undefined ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="w-6 h-6 text-stone-500 animate-spin" />
        </div>
      ) : queueItems.length === 0 ? (
        <div className="text-center py-16">
          <Question className="w-10 h-10 text-stone-600 mx-auto mb-3" />
          <p className="text-sm text-stone-500">
            No {statusFilter || ""} unmatched plugins.
          </p>
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">
                  Plugin
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">
                  Manufacturer
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">
                  Format
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">
                  Users
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">
                  First Seen
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {queueItems.map((item) => (
                <tr
                  key={item._id}
                  className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-stone-200">
                      {item.pluginName}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-stone-400">
                      {item.manufacturer}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-white/[0.06] text-stone-400">
                      {item.format}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-stone-200">
                      <Users className="w-3.5 h-3.5 text-stone-500" />
                      {item.userCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-stone-500">
                      {new Date(item.firstSeenAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {item.status === "pending" && (
                        <>
                          <button
                            onClick={() =>
                              setMatchingItem({
                                id: item._id,
                                pluginName: item.pluginName,
                                manufacturer: item.manufacturer,
                              })
                            }
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-[#deff0a]/10 text-[#deff0a] rounded-lg hover:bg-[#deff0a]/20 transition-colors"
                          >
                            <MagnifyingGlass className="w-3.5 h-3.5" />
                            Match
                          </button>
                          <Link
                            href={`/admin/plugins/new?name=${encodeURIComponent(item.pluginName)}&manufacturer=${encodeURIComponent(item.manufacturer)}`}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-white/[0.06] text-stone-300 rounded-lg hover:bg-white/[0.1] transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Create
                          </Link>
                          <button
                            onClick={() => handleDismiss(item._id)}
                            disabled={dismissingId === item._id}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:text-stone-300 rounded-lg hover:bg-white/[0.06] disabled:opacity-50 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Dismiss
                          </button>
                        </>
                      )}
                      {item.status === "completed" && item.createdPluginId && (
                        <Link
                          href={`/admin/plugins/${item.createdPluginId}`}
                          className="text-xs text-[#deff0a]/70 hover:text-[#deff0a] transition-colors"
                        >
                          View plugin &rarr;
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Match Dialog */}
      {matchingItem && (
        <MatchPluginDialog
          queueItemId={matchingItem.id}
          pluginName={matchingItem.pluginName}
          manufacturer={matchingItem.manufacturer}
          onClose={() => setMatchingItem(null)}
          onResolved={() => setMatchingItem(null)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    processing: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    completed: "bg-green-500/10 text-green-400 border-green-500/20",
    ignored: "bg-stone-500/10 text-stone-500 border-stone-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${styles[status] || styles.pending}`}
    >
      {status === "completed" && <Check className="w-3 h-3" />}
      {status}
    </span>
  );
}
