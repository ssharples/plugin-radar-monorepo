"use client";

import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { SlugInput } from "./SlugInput";
import { ImageUpload } from "./ImageUpload";
import { ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";

interface ManufacturerData {
  _id?: Id<"manufacturers">;
  name?: string;
  slug?: string;
  website?: string;
  description?: string;
  logoUrl?: string;
  logoStorageId?: Id<"_storage">;
  newsletterEmail?: string;
}

export function ManufacturerForm({
  initialData,
  mode,
}: {
  initialData?: ManufacturerData;
  mode: "create" | "edit";
}) {
  const { sessionToken } = useAuth();
  const router = useRouter();
  const createMutation = useMutation(api.manufacturers.create);
  const updateMutation = useMutation(api.manufacturers.update);

  const [name, setName] = useState(initialData?.name ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [website, setWebsite] = useState(initialData?.website ?? "");
  const [description, setDescription] = useState(
    initialData?.description ?? ""
  );
  const [newsletterEmail, setNewsletterEmail] = useState(
    initialData?.newsletterEmail ?? ""
  );
  const [logoStorageId, setLogoStorageId] = useState<Id<"_storage"> | null>(
    initialData?.logoStorageId ?? null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSlugChange = useCallback((newSlug: string) => {
    setSlug(newSlug);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken) return;
    if (!name.trim() || !slug.trim() || !website.trim()) {
      setError("Name, slug, and website are required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (mode === "create") {
        await createMutation({
          sessionToken,
          name: name.trim(),
          slug: slug.trim(),
          website: website.trim(),
          description: description.trim() || undefined,
          newsletterEmail: newsletterEmail.trim() || undefined,
        });
      } else if (initialData?._id) {
        await updateMutation({
          sessionToken,
          id: initialData._id,
          name: name.trim(),
          website: website.trim(),
          description: description.trim() || undefined,
          logoStorageId: logoStorageId ?? undefined,
          newsletterEmail: newsletterEmail.trim() || undefined,
        });
      }
      router.push("/admin/manufacturers");
    } catch (err: any) {
      setError(err.message || "Failed to save manufacturer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link
        href="/admin/manufacturers"
        className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-stone-200 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Manufacturers
      </Link>

      <h1
        className="text-2xl font-bold text-stone-100 mb-8"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {mode === "create" ? "Add Manufacturer" : `Edit ${initialData?.name ?? "Manufacturer"}`}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <div className="glass-card rounded-xl p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm text-stone-400 mb-2">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
              placeholder="e.g. FabFilter"
            />
          </div>

          {/* Slug */}
          <SlugInput
            name={name}
            value={slug}
            onChange={handleSlugChange}
            disabled={mode === "edit"}
          />

          {/* Website */}
          <div>
            <label className="block text-sm text-stone-400 mb-2">
              Website <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
              placeholder="https://www.fabfilter.com"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-stone-400 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition resize-none"
              placeholder="Brief description of the manufacturer..."
            />
          </div>

          {/* Logo */}
          <ImageUpload
            label="Logo"
            storageId={logoStorageId}
            onStorageIdChange={setLogoStorageId}
          />

          {/* Newsletter Email */}
          <div>
            <label className="block text-sm text-stone-400 mb-2">
              Newsletter Email
            </label>
            <input
              type="email"
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
              placeholder="newsletter@fabfilter.com"
            />
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-[#deff0a] hover:bg-[#ccff00] text-stone-900 font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : mode === "create"
                ? "Create Manufacturer"
                : "Save Changes"}
          </button>
          <Link
            href="/admin/manufacturers"
            className="px-6 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-stone-300 rounded-xl border border-white/[0.06] transition"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
