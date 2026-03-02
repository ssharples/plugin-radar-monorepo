"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PluginForm } from "@/components/admin/PluginForm";

export default function EditPluginPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const plugin = useQuery(api.plugins.get, {
    id: id as Id<"plugins">,
  });

  if (plugin === undefined) {
    return (
      <div className="py-16 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#deff0a] border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (plugin === null) {
    return (
      <div className="py-16 text-center">
        <p className="text-stone-400">Plugin not found.</p>
      </div>
    );
  }

  return <PluginForm mode="edit" initialData={plugin} />;
}
