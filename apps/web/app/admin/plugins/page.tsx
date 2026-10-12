"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DataTable, Column } from "@/components/admin/DataTable";
import { DeleteConfirmDialog } from "@/components/admin/DeleteConfirmDialog";
import { Trash, MagnifyingGlass } from "@phosphor-icons/react";

export default function PluginsListPage() {
  const { sessionToken } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const searchResults = useQuery(
    api.plugins.search,
    search.length >= 2
      ? { query: search, category: categoryFilter || undefined }
      : "skip"
  );
  const browseResults = useQuery(
    api.plugins.list,
    search.length < 2
      ? { category: categoryFilter || undefined, limit: 100 }
      : "skip"
  );
  const categories = useQuery(api.plugins.getCategories);
  const removeMutation = useMutation(api.plugins.remove);

  const [deleteTarget, setDeleteTarget] = useState<{
    id: any;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const plugins =
    search.length >= 2 ? searchResults : browseResults?.items;

  const handleDelete = async () => {
    if (!deleteTarget || !sessionToken) return;
    setIsDeleting(true);
    try {
      await removeMutation({ sessionToken, id: deleteTarget.id });
      setDeleteTarget(null);
    } catch (err: any) {
      console.error("Delete failed:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const columns: Column<any>[] = [
    {
      key: "name",
      label: "Name",
      render: (item) => (
        <span className="font-medium text-stone-100">{item.name}</span>
      ),
    },
    {
      key: "category",
      label: "Category",
      render: (item) => (
        <span className="inline-block px-2 py-0.5 bg-white/[0.06] rounded text-xs text-stone-300">
          {item.category}
        </span>
      ),
    },
    {
      key: "currentPrice",
      label: "Price",
      render: (item) => {
        if (item.isFree) return <span className="text-green-400">Free</span>;
        if (item.currentPrice != null)
          return <span>${(item.currentPrice / 100).toFixed(2)}</span>;
        if (item.msrp != null)
          return <span>${(item.msrp / 100).toFixed(2)}</span>;
        return <span className="text-stone-500">\u2014</span>;
      },
    },
    {
      key: "isActive",
      label: "Status",
      render: (item) => (
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            item.isActive ? "bg-green-400" : "bg-stone-600"
          }`}
          title={item.isActive ? "Active" : "Inactive"}
        />
      ),
    },
    {
      key: "actions",
      label: "",
      className: "w-12",
      render: (item) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDeleteTarget({ id: item._id, name: item.name });
          }}
          className="p-1.5 text-stone-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
        >
          <Trash className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <div>
      <AdminPageHeader
        title="Plugins"
        subtitle={browseResults ? `${browseResults.items.length}+ total` : undefined}
        actionLabel="Add Plugin"
        actionHref="/admin/plugins/new"
      />

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <MagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plugins..."
            className="w-full pl-11 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 focus:outline-none focus:border-[#deff0a]/50 transition"
        >
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.count})
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={plugins}
        isLoading={plugins === undefined}
        emptyMessage="No plugins found."
        onRowClick={(item) => router.push(`/admin/plugins/${item._id}`)}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Plugin"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}
