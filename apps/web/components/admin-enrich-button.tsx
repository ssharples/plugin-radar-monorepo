"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useAuth } from "./auth-provider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  Spinner,
} from "@phosphor-icons/react";

interface AdminEnrichButtonProps {
  pluginId: Id<"plugins">;
  pluginSlug: string;
  pluginName: string;
  className?: string;
}

export function AdminEnrichButton({
  pluginId,
  className,
}: AdminEnrichButtonProps) {
  const { isAdmin, user, sessionToken } = useAuth();
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  const queueEnrichment = useMutation(api.adminEnrich.queueEnrichment);

  if (!isAdmin || !user) {
    return null; // Only show for admins
  }

  const handleClick = async () => {
    setStatus("loading");
    setMessage("Creating job...");

    try {
      // Queue the job in Convex; processing is handled by the server-side worker.
      await queueEnrichment({
        pluginId,
        sessionToken: sessionToken!,
        priority: "high",
      });

      setStatus("success");
      setMessage("Enrichment queued. Refresh after processing to see updates.");

      // Reset after 10 seconds
      setTimeout(() => {
        setStatus("idle");
        setMessage(null);
      }, 10000);
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Failed to queue enrichment");

      setTimeout(() => {
        setStatus("idle");
        setMessage(null);
      }, 5000);
    }
  };

  return (
    <div className={className}>
      <button
        onClick={handleClick}
        disabled={status === "loading"}
        className={`
          inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
          ${
            status === "idle"
              ? "bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-700"
              : status === "loading"
                ? "bg-stone-800 text-stone-400 border border-stone-700 cursor-wait"
                : status === "success"
                  ? "bg-green-900/50 text-green-400 border border-green-700"
                  : "bg-red-900/50 text-red-400 border border-red-700"
          }
        `}
        title="Queue plugin data refresh"
      >
        {status === "idle" && (
          <>
            <ArrowsClockwise size={16} />
            <span>Refresh Data</span>
          </>
        )}
        {status === "loading" && (
          <>
            <Spinner size={16} className="animate-spin" />
            <span>Queuing...</span>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle size={16} />
            <span>Queued</span>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle size={16} />
            <span>Error</span>
          </>
        )}
      </button>

      {message && (
        <p
          className={`text-xs mt-1 ${
            status === "error" ? "text-red-400" : "text-green-400"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
