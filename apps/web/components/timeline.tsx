"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import {
  Megaphone,
  Tag,
  TagSimple,
  Rocket,
  ArrowUp,
  CurrencyDollar,
} from "@phosphor-icons/react";

interface TimelineProps {
  pluginId?: Id<"plugins">;
  manufacturerId?: Id<"manufacturers">;
  limit?: number;
  showPluginLinks?: boolean;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });

  // Add ordinal suffix
  const suffix =
    day === 1 || day === 21 || day === 31
      ? "st"
      : day === 2 || day === 22
        ? "nd"
        : day === 3 || day === 23
          ? "rd"
          : "th";

  return `${month} ${day}${suffix}`;
}

function getEventIcon(type: string) {
  switch (type) {
    case "release":
      return <Rocket className="w-4 h-4" />;
    case "update":
      return <ArrowUp className="w-4 h-4" />;
    case "sale_started":
      return <Tag className="w-4 h-4" />;
    case "sale_ended":
      return <TagSimple className="w-4 h-4" />;
    case "announcement":
      return <Megaphone className="w-4 h-4" />;
    case "price_change":
      return <CurrencyDollar className="w-4 h-4" />;
    default:
      return null;
  }
}

function getEventColor(type: string) {
  switch (type) {
    case "release":
      return "bg-emerald-500";
    case "update":
      return "bg-blue-500";
    case "sale_started":
      return "bg-amber-500";
    case "sale_ended":
      return "bg-stone-500";
    case "announcement":
      return "bg-purple-500";
    case "price_change":
      return "bg-pink-500";
    default:
      return "bg-stone-500";
  }
}

export function Timeline({
  pluginId,
  manufacturerId,
  limit = 10,
  showPluginLinks = true,
}: TimelineProps) {
  // Fetch timeline events based on context
  const pluginEvents = useQuery(
    api.timelineEvents.getForPlugin,
    pluginId ? { plugin: pluginId, limit } : "skip"
  );

  const manufacturerEvents = useQuery(
    api.timelineEvents.getForManufacturer,
    manufacturerId ? { manufacturer: manufacturerId, limit } : "skip"
  );

  const events = pluginId ? pluginEvents : manufacturerEvents;

  if (events === undefined) {
    return (
      <div className="animate-pulse">
        <div className="h-6 bg-stone-800 rounded w-32 mb-6" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-4 mb-8">
            <div className="w-16 h-4 bg-stone-800 rounded" />
            <div className="w-4 h-4 bg-stone-800 rounded-full" />
            <div className="h-4 bg-stone-800 rounded flex-1" />
          </div>
        ))}
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="text-stone-500 text-sm py-4">No timeline events yet.</div>
    );
  }

  return (
    <div className="relative">
      {events.map((event, index) => {
        const isLast = index === events.length - 1;

        return (
          <div key={event._id} className="flex items-start gap-4 relative">
            {/* Date column */}
            <div className="w-20 flex-shrink-0 text-right">
              <span className="text-stone-400 text-sm font-medium">
                {formatDate(event.occurredAt)}
              </span>
            </div>

            {/* Timeline dot and line */}
            <div className="relative flex flex-col items-center">
              {/* Dot */}
              <div
                className={`w-5 h-5 rounded-full ${getEventColor(event.type)} flex items-center justify-center text-white flex-shrink-0`}
              >
                {getEventIcon(event.type)}
              </div>

              {/* Connecting line */}
              {!isLast && (
                <div className="w-0.5 bg-stone-700 flex-1 min-h-[3rem]" />
              )}
            </div>

            {/* Content */}
            <div className={`flex-1 ${!isLast ? "pb-8" : ""}`}>
              <p className="text-white text-sm leading-relaxed">
                {showPluginLinks && event.pluginData ? (
                  <Link
                    href={`/plugins/${event.pluginData.slug}`}
                    className="hover:text-emerald-400 transition"
                  >
                    {event.title}
                  </Link>
                ) : (
                  event.title
                )}
              </p>

              {/* Extra details for sales */}
              {(event.type === "sale_started" || event.type === "price_change") &&
                event.discountPercent && (
                  <p className="text-emerald-400 text-xs mt-1">
                    {event.discountPercent}% off
                    {event.newPrice && (
                      <span className="text-stone-500">
                        {" "}
                        · ${(event.newPrice / 100).toFixed(2)}
                      </span>
                    )}
                  </p>
                )}

              {/* Description if present */}
              {event.description && (
                <p className="text-stone-400 text-xs mt-1">
                  {event.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Compact version for sidebars
export function TimelineCompact({
  pluginId,
  manufacturerId,
  limit = 5,
}: TimelineProps) {
  const pluginEvents = useQuery(
    api.timelineEvents.getForPlugin,
    pluginId ? { plugin: pluginId, limit } : "skip"
  );

  const manufacturerEvents = useQuery(
    api.timelineEvents.getForManufacturer,
    manufacturerId ? { manufacturer: manufacturerId, limit } : "skip"
  );

  const events = pluginId ? pluginEvents : manufacturerEvents;

  if (events === undefined) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-4 bg-stone-800 rounded" />
        ))}
      </div>
    );
  }

  if (!events || events.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event._id} className="flex items-start gap-3">
          <div
            className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${getEventColor(event.type)}`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-stone-300 truncate">{event.title}</p>
            <p className="text-xs text-stone-500">
              {formatDate(event.occurredAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
