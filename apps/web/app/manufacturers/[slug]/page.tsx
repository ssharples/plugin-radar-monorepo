"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PluginCard } from "@/components/plugin-card";
import Link from "next/link";
import { CaretRight, Globe, Envelope, ClockCounterClockwise, MagnifyingGlass, MusicNote, Package } from "@phosphor-icons/react";
import { Timeline } from "@/components/timeline";

export default function ManufacturerDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const manufacturer = useQuery(api.manufacturers.getBySlug, { slug });
  const plugins = useQuery(
    api.plugins.list,
    manufacturer ? { manufacturer: manufacturer._id, limit: 100 } : "skip"
  );

  if (manufacturer === null) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-16 text-center">
        <MagnifyingGlass className="w-12 h-12 text-stone-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-stone-100 mb-2">Manufacturer Not Found</h1>
        <p className="text-stone-400 mb-4">We couldn't find a manufacturer with this name</p>
        <Link href="/manufacturers" className="text-amber-400 hover:text-amber-300 transition">
          &larr; Back to manufacturers
        </Link>
      </div>
    );
  }

  if (!manufacturer) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-white/[0.03] rounded w-1/4 mb-4" />
          <div className="h-4 bg-white/[0.03] rounded w-1/3 mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-video bg-white/[0.03] rounded-xl mb-3" />
                <div className="h-4 bg-white/[0.04] rounded w-3/4 mb-2" />
                <div className="h-3 bg-white/[0.04] rounded w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-6 py-8 relative">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-stone-400 mb-6">
          <Link href="/" className="hover:text-stone-100 transition">
            Home
          </Link>
          <CaretRight className="w-3 h-3" />
          <Link href="/manufacturers" className="hover:text-stone-100 transition">
            Manufacturers
          </Link>
          <CaretRight className="w-3 h-3" />
          <span className="text-stone-200">{manufacturer.name}</span>
        </nav>

        {/* Header */}
        <div className="glass-card rounded-2xl p-6 md:p-8 mb-8">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* Logo */}
            {manufacturer.logoUrl ? (
              <img
                src={manufacturer.logoUrl}
                alt={manufacturer.name}
                className="w-24 h-24 rounded-xl object-contain bg-white"
              />
            ) : (
              <div className="w-24 h-24 rounded-xl bg-white/[0.04] flex items-center justify-center">
                <MusicNote className="w-10 h-10 text-stone-500" />
              </div>
            )}

            {/* Info */}
            <div className="flex-1">
              <h1
                className="text-3xl font-bold text-stone-100 mb-2"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {manufacturer.name}
              </h1>
              {manufacturer.description && (
                <p className="text-stone-400 mb-4 max-w-2xl">{manufacturer.description}</p>
              )}
              <div className="flex flex-wrap gap-4">
                <a
                  href={manufacturer.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-amber-400 hover:text-amber-300 transition"
                >
                  <Globe className="w-4 h-4" />
                  Visit Website
                </a>
                {manufacturer.newsletterEmail && (
                  <span className="flex items-center gap-2 text-stone-400">
                    <Envelope className="w-4 h-4" />
                    Newsletter available
                  </span>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-amber-400">
                {manufacturer.pluginCount}
              </div>
              <div className="text-stone-400 text-sm">
                Plugin{manufacturer.pluginCount !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="glass-card rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <ClockCounterClockwise className="w-5 h-5 text-stone-400" />
            <h2 className="text-lg font-semibold text-stone-100">Recent Activity</h2>
          </div>
          <Timeline manufacturerId={manufacturer._id} limit={10} showPluginLinks={true} />
        </div>

        <div className="section-line mb-8" />

        {/* Plugins */}
        <h2
          className="text-xl font-semibold text-stone-100 mb-6"
          style={{ fontFamily: "var(--font-display)" }}
        >
          All Plugins by {manufacturer.name}
        </h2>

        {plugins ? (
          plugins.items.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {plugins.items.map((plugin) => (
                <PluginCard key={plugin._id} plugin={plugin} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 glass-card rounded-xl">
              <Package className="w-12 h-12 text-stone-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-stone-100 mb-2">No plugins yet</h3>
              <p className="text-stone-400">
                We haven't added any plugins from this manufacturer yet
              </p>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-video bg-white/[0.03] rounded-xl mb-3" />
                <div className="h-4 bg-white/[0.04] rounded w-3/4 mb-2" />
                <div className="h-3 bg-white/[0.04] rounded w-1/2" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
