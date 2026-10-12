"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UploadSimple, X, Image as ImageIcon } from "@phosphor-icons/react";

export function ImageUpload({
  label,
  storageId,
  onStorageIdChange,
}: {
  label: string;
  storageId: Id<"_storage"> | null;
  onStorageIdChange: (id: Id<"_storage"> | null) => void;
}) {
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const previewUrl = useQuery(
    api.storage.getUrl,
    storageId ? { storageId } : "skip"
  );
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const url = await generateUploadUrl();
      const result = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId: newId } = await result.json();
      onStorageIdChange(newId as Id<"_storage">);
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div>
      <label className="block text-sm text-stone-400 mb-2">{label}</label>
      {storageId && previewUrl ? (
        <div className="relative inline-block">
          <img
            src={previewUrl}
            alt="Preview"
            className="w-24 h-24 object-cover rounded-xl border border-white/[0.06]"
          />
          <button
            type="button"
            onClick={() => onStorageIdChange(null)}
            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
          >
            <X className="w-3 h-3 text-white" weight="bold" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
            dragOver
              ? "border-[#deff0a]/50 bg-[#deff0a]/5"
              : "border-white/[0.08] hover:border-white/[0.16] bg-white/[0.02]"
          }`}
        >
          {uploading ? (
            <div className="animate-spin w-6 h-6 border-2 border-[#deff0a] border-t-transparent rounded-full" />
          ) : (
            <>
              <ImageIcon className="w-8 h-8 text-stone-500" />
              <span className="text-xs text-stone-500">
                Drop image or click to upload
              </span>
            </>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
