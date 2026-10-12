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

export default function ManufacturersListPage() {
  const { sessionToken } = useAuth();
  const router = useRouter();
  const manufacturers = useQuery(api.manufacturers.list, { limit: 500 });
  // @ts-expect-error -- manufacturers.remove mutation not yet implemented
  const removeMutation = useMutation(api.manufacturers.remove);

  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: any;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtered = manufacturers?.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async () => {
    if (!deleteTarget || !sessionToken) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await removeMutation({
        sessionToken,
        id: deleteTarget.id,
      });
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete");
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
    { key: "slug", label: "Slug" },
    {
      key: "pluginCount",
      label: "Plugins",
      className: "text-center",
      render: (item) => (
        <span className="text-center block">{item.pluginCount}</span>
      ),
    },
    {
      key: "website",
      label: "Website",
      render: (item) => (
        <a
          href={item.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#deff0a]/70 hover:text-[#deff0a] transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {item.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
        </a>
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
        title="Manufacturers"
        subtitle={`${manufacturers?.length ?? 0} total`}
        actionLabel="Add Manufacturer"
        actionHref="/admin/manufacturers/new"
      />

      {/* Search */}
      <div className="relative mb-6">
        <MagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search manufacturers..."
          className="w-full pl-11 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
        />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={manufacturers === undefined}
        emptyMessage="No manufacturers found."
        onRowClick={(item) => router.push(`/admin/manufacturers/${item._id}`)}
      />

      {deleteError && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {deleteError}
        </div>
      )}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Manufacturer"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}
