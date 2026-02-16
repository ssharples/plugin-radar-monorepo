"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CaretRight,
  Globe,
  Play,
  ClockCounterClockwise,
  Cpu,
  GraduationCap,
  MusicNote,
  Star,
  Waveform,
  Eye,
  TrendUp,
  ArrowLeft,
} from "@phosphor-icons/react";
import { WishlistButton } from "@/components/wishlist-button";
import { OwnButton } from "@/components/own-button";
import { Timeline } from "@/components/timeline";
import { AdminEnrichButton } from "@/components/admin-enrich-button";
import { SimilarPlugins } from "@/components/similar-plugins";
import { ComparisonLinks } from "@/components/comparison-links";
import { PluginCard } from "@/components/plugin-card";

interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
  channelUrl?: string;
  viewCount?: number;
  duration?: string;
  durationSeconds?: number;
  mentionType?: string;
}

function formatViewCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  } else if (count >= 1000) {
    return `${(count / 1000).toFixed(0)}K`;
  }
  return count.toString();
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export default function PluginPage() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";

  const pluginData = useQuery(api.plugins.getBySlugWithManufacturer, slug ? { slug } : "skip");
  const plugin = pluginData as typeof pluginData & {
    worksWellOn?: string[];
    sonicCharacter?: string[];
    genreSuitability?: string[];
    useCases?: string[];
    comparableTo?: string[];
    skillLevel?: string;
    cpuUsage?: string;
    licenseType?: string;
    isIndustryStandard?: boolean;
  };
  const mentionVideos = useQuery(
    api.mentions.getYouTubeVideos,
    plugin ? { plugin: plugin._id, limit: 8 } : "skip"
  );

  const [fallbackVideos, setFallbackVideos] = useState<YouTubeVideo[]>([]);
  const [loadingFallback, setLoadingFallback] = useState(false);

  const videos: YouTubeVideo[] =
    mentionVideos && mentionVideos.length > 0
      ? (mentionVideos as YouTubeVideo[])
      : fallbackVideos;

  const loadingVideos = mentionVideos === undefined || loadingFallback;

  useEffect(() => {
    if (mentionVideos !== undefined && mentionVideos.length === 0 && plugin && plugin.name) {
      const manufacturerName = plugin.manufacturerData?.name || "";
      setLoadingFallback(true);
      const searchQuery = `${manufacturerName} ${plugin.name} tutorial review`.trim();

      fetch(`/api/youtube?q=${encodeURIComponent(searchQuery)}`)
        .then((res) => res.json())
        .then((data) => {
          setFallbackVideos(data.videos || []);
          setLoadingFallback(false);
        })
        .catch(() => setLoadingFallback(false));
    }
  }, [mentionVideos, plugin]);

  if (plugin === undefined) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-10">
        <div className="animate-pulse">
          <div className="h-4 bg-white/[0.04] rounded w-1/4 mb-8" />
          <div className="grid md:grid-cols-[300px_1fr] lg:grid-cols-[340px_1fr] gap-8">
            <div className="aspect-square bg-white/[0.03] rounded-2xl" />
            <div>
              <div className="h-5 bg-white/[0.04] rounded w-1/4 mb-4" />
              <div className="h-10 bg-white/[0.04] rounded w-3/4 mb-3" />
              <div className="h-4 bg-white/[0.04] rounded w-1/3 mb-6" />
              <div className="h-10 bg-white/[0.04] rounded w-1/4 mb-6" />
              <div className="h-14 bg-white/[0.04] rounded w-full mb-6" />
              <div className="h-20 bg-white/[0.03] rounded w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (plugin === null) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/[0.03] flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-stone-600">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-stone-100 mb-2" style={{ fontFamily: "var(--font-display)" }}>
          Plugin Not Found
        </h1>
        <p className="text-stone-500 mb-6">The plugin you&apos;re looking for doesn&apos;t exist.</p>
        <Link
          href="/plugins"
          className="inline-flex items-center gap-2 text-white hover:text-[#deff0a] transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Browse all plugins
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* ===== HERO SECTION ===== */}
      <section className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent" />

        <div className="container mx-auto px-4 lg:px-6 pt-6 pb-10 relative">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-stone-500 mb-8">
            <Link href="/" className="hover:text-white transition">
              Home
            </Link>
            <CaretRight className="w-3 h-3" />
            <Link href="/plugins" className="hover:text-white transition">
              Plugins
            </Link>
            <CaretRight className="w-3 h-3" />
            <Link
              href={`/manufacturers/${plugin.manufacturerData?.slug}`}
              className="hover:text-white transition"
            >
              {plugin.manufacturerData?.name}
            </Link>
            <CaretRight className="w-3 h-3" />
            <span className="text-stone-300 truncate max-w-[200px]">{plugin.name}</span>
          </nav>

          {/* Two-column hero: image left (secondary), info right (primary) */}
          <div className="grid md:grid-cols-[300px_1fr] lg:grid-cols-[340px_1fr] gap-8 items-start">
            {/* Image — compact left column */}
            <div className="relative rounded-2xl overflow-hidden bg-[#1e1b18] md:sticky md:top-24">
              <div className="aspect-square relative">
                {plugin.resolvedImageUrl || plugin.imageUrl ? (
                  <img
                    src={plugin.resolvedImageUrl || plugin.imageUrl}
                    alt={plugin.name}
                    className="w-full h-full object-contain p-3"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-stone-600">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                        <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.5" />
                      </svg>
                    </div>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#1a1714]/40 via-transparent to-transparent pointer-events-none" />
              </div>

              {/* Category badge */}
              <div className="absolute top-3 right-3">
                <Link
                  href={`/category/${plugin.category}`}
                  className="px-2.5 py-1 bg-black/50 backdrop-blur-sm rounded-lg text-[11px] text-stone-300 hover:text-white transition capitalize"
                >
                  {plugin.category}
                </Link>
              </div>

              {/* Formats & Platforms — tucked under image */}
              <div className="px-4 pb-4 space-y-3">
                {plugin.formats && plugin.formats.length > 0 && (
                  <div>
                    <h3 className="text-stone-600 text-[10px] uppercase tracking-wider mb-1.5">Formats</h3>
                    <div className="flex flex-wrap gap-1">
                      {plugin.formats.map((f: string) => (
                        <span
                          key={f}
                          className="px-2 py-0.5 bg-white/[0.04] rounded text-[11px] text-stone-400 uppercase tracking-wider"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {plugin.platforms && plugin.platforms.length > 0 && (
                  <div>
                    <h3 className="text-stone-600 text-[10px] uppercase tracking-wider mb-1.5">Platforms</h3>
                    <div className="flex flex-wrap gap-1">
                      {plugin.platforms.map((p: string) => (
                        <span
                          key={p}
                          className="px-2 py-0.5 bg-white/[0.04] rounded text-[11px] text-stone-400"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Info panel — primary focus, right column */}
            <div>
              {/* Badges */}
              <div className="flex items-center gap-2 mb-3">
                {plugin.isFree && (
                  <span className="price-tag-free px-3 py-1 rounded-lg text-xs font-medium">
                    Free
                  </span>
                )}
                {plugin.isIndustryStandard && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/10 border border-[#deff0a]/20 rounded-lg text-xs text-white">
                    <Star className="w-3 h-3" weight="fill" />
                    Industry Standard
                  </span>
                )}
              </div>

              <h1
                className="text-3xl lg:text-4xl font-bold text-stone-100 mb-1.5 leading-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {plugin.name}
              </h1>
              <Link
                href={`/manufacturers/${plugin.manufacturerData?.slug}`}
                className="text-stone-400 hover:text-white transition text-sm"
              >
                by {plugin.manufacturerData?.name}
              </Link>

              {/* CTA buttons */}
              <div className="flex flex-wrap gap-2.5 mt-5 mb-6">
                {plugin.productUrl && (
                  <a
                    href={plugin.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-[180px] bg-white hover:bg-[#ccff00] text-stone-900 font-semibold py-3 px-6 rounded-xl text-center transition-all shadow-lg shadow-[#deff0a]/20 hover:shadow-[#deff0a]/30 flex items-center justify-center gap-2 text-sm"
                  >
                    <Globe className="w-4 h-4" />
                    Visit Product Page
                  </a>
                )}
                <WishlistButton pluginId={plugin._id} />
                <OwnButton pluginId={plugin._id} />
              </div>

              <AdminEnrichButton
                pluginId={plugin._id}
                pluginSlug={plugin.slug}
                pluginName={plugin.name}
                className="mb-6"
              />

              {/* Description — inline in the info column */}
              {plugin.description && (
                <div className="mb-6 pb-6 border-b border-white/[0.06]">
                  <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wider mb-2">About</h2>
                  <p className="text-stone-400 leading-relaxed text-[15px]">{plugin.description}</p>
                </div>
              )}

              {/* Info pills */}
              {(plugin.skillLevel || plugin.cpuUsage || plugin.licenseType) && (
                <div className="flex flex-wrap gap-2 mb-5">
                  {plugin.skillLevel && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/[0.08] border border-blue-500/15 rounded-lg text-xs text-blue-400">
                      <GraduationCap className="w-3.5 h-3.5" />
                      {plugin.skillLevel === "beginner"
                        ? "Beginner Friendly"
                        : plugin.skillLevel.charAt(0).toUpperCase() + plugin.skillLevel.slice(1)}
                    </span>
                  )}
                  {plugin.cpuUsage && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${
                        plugin.cpuUsage === "light"
                          ? "bg-green-500/[0.08] border border-green-500/15 text-green-400"
                          : plugin.cpuUsage === "moderate"
                          ? "bg-yellow-500/[0.08] border border-yellow-500/15 text-yellow-400"
                          : "bg-red-500/[0.08] border border-red-500/15 text-red-400"
                      }`}
                    >
                      <Cpu className="w-3.5 h-3.5" />
                      {plugin.cpuUsage === "very-heavy"
                        ? "Very Heavy CPU"
                        : `${plugin.cpuUsage.charAt(0).toUpperCase() + plugin.cpuUsage.slice(1)} CPU`}
                    </span>
                  )}
                  {plugin.licenseType && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.04] border border-white/[0.06] rounded-lg text-xs text-stone-400 capitalize">
                      {plugin.licenseType.replace(/-/g, " ")} License
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="section-line" />

      {/* ===== ENRICHMENT DETAILS ===== */}
      {(plugin.worksWellOn?.length || plugin.sonicCharacter?.length || plugin.useCases?.length || plugin.genreSuitability?.length) && (
        <section className="container mx-auto px-4 lg:px-6 py-10">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Works Well On */}
            {plugin.worksWellOn && plugin.worksWellOn.length > 0 && (
              <div className="glass-card rounded-xl p-5">
                <h3 className="text-stone-400 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Waveform className="w-4 h-4 text-white" />
                  Works Well On
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {plugin.worksWellOn.map((w: string) => (
                    <span
                      key={w}
                      className="px-2.5 py-1 bg-white/[0.08] border border-[#deff0a]/15 rounded-lg text-xs text-white/80 capitalize"
                    >
                      {w.replace(/-/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Sonic Character */}
            {plugin.sonicCharacter && plugin.sonicCharacter.length > 0 && (
              <div className="glass-card rounded-xl p-5">
                <h3 className="text-stone-400 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
                  <MusicNote className="w-4 h-4 text-purple-400" />
                  Sound Character
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {plugin.sonicCharacter.map((s: string) => (
                    <span
                      key={s}
                      className="px-2.5 py-1 bg-purple-500/[0.08] border border-purple-500/15 rounded-lg text-xs text-purple-400/80 capitalize"
                    >
                      {s}
                    </span>
                  ))}
                </div>
                {plugin.comparableTo && plugin.comparableTo.length > 0 && (
                  <p className="text-stone-500 text-xs mt-3">
                    Comparable to: {plugin.comparableTo.map((c: string) => c.replace(/-/g, " ").replace("style", "").trim()).join(", ")}
                  </p>
                )}
              </div>
            )}

            {/* Best For */}
            {((plugin.useCases && plugin.useCases.length > 0) ||
              (plugin.genreSuitability && plugin.genreSuitability.length > 0)) && (
              <div className="glass-card rounded-xl p-5">
                <h3 className="text-stone-400 text-xs uppercase tracking-wider mb-3">Best For</h3>
                <p className="text-stone-300 text-sm leading-relaxed">
                  {[
                    ...(plugin.useCases || []).map((u: string) => u.replace(/-/g, " ")),
                    ...(plugin.genreSuitability || []),
                  ]
                    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
                    .join(" \u2022 ")}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="section-line" />

      {/* ===== TIMELINE ===== */}
      <section className="container mx-auto px-4 lg:px-6 pb-10">
        <div className="flex items-center gap-3 mb-6">
          <ClockCounterClockwise className="w-5 h-5 text-stone-500" />
          <h2 className="text-lg font-semibold text-stone-100" style={{ fontFamily: "var(--font-display)" }}>
            Timeline
          </h2>
        </div>
        <div className="glass-card rounded-xl p-6">
          <Timeline pluginId={plugin._id} showPluginLinks={false} />
        </div>
      </section>

      <div className="section-line" />

      {/* ===== YOUTUBE VIDEOS ===== */}
      <section className="container mx-auto px-4 lg:px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-stone-100" style={{ fontFamily: "var(--font-display)" }}>
            Tutorials & Reviews
          </h2>
          {plugin.mentionCount7d !== undefined && plugin.mentionCount7d > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/[0.08] border border-[#deff0a]/15 rounded-lg text-xs text-white">
              <TrendUp className="w-3.5 h-3.5" />
              {plugin.mentionCount7d} new this week
            </span>
          )}
        </div>

        {loadingVideos ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-video bg-white/[0.03] rounded-xl mb-2" />
                <div className="h-4 bg-white/[0.04] rounded w-3/4 mb-1" />
                <div className="h-3 bg-white/[0.03] rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : videos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {videos.map((video) => (
              <a
                key={video.id}
                href={`https://www.youtube.com/watch?v=${video.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
              >
                <div className="aspect-video rounded-xl overflow-hidden mb-2 relative">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                    <div className="w-11 h-11 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-lg">
                      <Play className="w-5 h-5 text-white ml-0.5" weight="fill" />
                    </div>
                  </div>
                  {video.durationSeconds && (
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded text-[10px] text-white font-medium tabular-nums">
                      {formatDuration(video.durationSeconds)}
                    </div>
                  )}
                  {video.mentionType && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-white/90 rounded text-[10px] text-stone-900 font-semibold capitalize">
                      {video.mentionType}
                    </div>
                  )}
                </div>
                <h3 className="text-sm text-stone-200 group-hover:text-white transition line-clamp-2 leading-snug">
                  {video.title}
                </h3>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-stone-500 truncate flex-1">
                    {video.channelUrl ? (
                      <span
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open(video.channelUrl, "_blank");
                        }}
                        className="hover:text-stone-300 cursor-pointer"
                      >
                        {video.channel}
                      </span>
                    ) : (
                      video.channel
                    )}
                  </p>
                  {video.viewCount !== undefined && (
                    <span className="text-[10px] text-stone-600 flex items-center gap-1 ml-2 tabular-nums">
                      <Eye className="w-3 h-3" />
                      {formatViewCount(video.viewCount)}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-xl p-10 text-center">
            <Play className="w-10 h-10 mx-auto mb-3 text-stone-600" />
            <p className="text-stone-500 text-sm">No tutorials found for this plugin yet.</p>
          </div>
        )}
      </section>

      {/* Compare With */}
      <ComparisonLinks pluginId={plugin._id} />

      {/* Similar Plugins */}
      <SimilarPlugins pluginId={plugin._id} category={plugin.category} />

      {/* More from Manufacturer */}
      {plugin.manufacturerData && (
        <MoreFromManufacturer
          manufacturerId={plugin.manufacturer}
          manufacturerName={plugin.manufacturerData.name}
          manufacturerSlug={plugin.manufacturerData.slug}
          excludePluginId={plugin._id}
        />
      )}
    </div>
  );
}

function MoreFromManufacturer({
  manufacturerId,
  manufacturerName,
  manufacturerSlug,
  excludePluginId,
}: {
  manufacturerId: any;
  manufacturerName: string;
  manufacturerSlug: string;
  excludePluginId: any;
}) {
  const result = useQuery(api.plugins.browse, {
    manufacturer: manufacturerId,
    limit: 7,
  });

  const plugins = result?.items?.filter((p: any) => p._id !== excludePluginId);

  if (!plugins || plugins.length === 0) return null;

  return (
    <section className="container mx-auto px-4 lg:px-6 pb-14">
      <div className="flex items-center justify-between mb-6">
        <h2
          className="text-lg font-semibold text-stone-100"
          style={{ fontFamily: "var(--font-display)" }}
        >
          More from {manufacturerName}
        </h2>
        <Link
          href={`/manufacturers/${manufacturerSlug}`}
          className="text-sm text-stone-500 hover:text-white transition-colors"
        >
          View all &rarr;
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {plugins.slice(0, 6).map((p: any) => (
          <PluginCard key={p._id} plugin={p} />
        ))}
      </div>
    </section>
  );
}
