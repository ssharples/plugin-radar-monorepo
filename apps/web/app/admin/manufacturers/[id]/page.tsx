"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ManufacturerForm } from "@/components/admin/ManufacturerForm";

export default function EditManufacturerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const manufacturer = useQuery(api.manufacturers.get, {
    id: id as Id<"manufacturers">,
  });

  if (manufacturer === undefined) {
    return (
      <div className="py-16 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#deff0a] border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (manufacturer === null) {
    return (
      <div className="py-16 text-center">
        <p className="text-stone-400">Manufacturer not found.</p>
      </div>
    );
  }

  return <ManufacturerForm mode="edit" initialData={manufacturer} />;
}
