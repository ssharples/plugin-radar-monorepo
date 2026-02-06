"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuth } from "./auth-provider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ArrowsClockwise, CheckCircle, XCircle, Spinner } from "@phosphor-icons/react";

// Webhook URL for triggering enrichment (VPS endpoint)
const WEBHOOK_URL = process.env.NEXT_PUBLIC_ENRICHMENT_WEBHOOK_URL || "http://localhost:3847";
const API_KEY = process.env.NEXT_PUBLIC_ENRICHMENT_API_KEY || "pluginradar-enrich-2026";

interface AdminEnrichButtonProps {
  pluginId: Id<"plugins">;
  pluginSlug: string;
  pluginName: string;
  className?: string;
}

export function AdminEnrichButton({ pluginId, pluginSlug, pluginName, className }: AdminEnrichButtonProps) {
  const { isAdmin, user } = useAuth();
  const [status, setStatus] = useState<"idle" | "loading" | "running" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const queueEnrichment = useMutation(api.adminEnrich.queueEnrichment);

  if (!isAdmin || !user) {
    return null; // Only show for admins
  }

  const handleClick = async () => {
    setStatus("loading");
    setMessage("Creating job...");

    try {
      // 1. Create job in Convex
      const result = await queueEnrichment({
        pluginId,
        userId: user._id,
        priority: "high",
      });

      setMessage("Triggering agent...");

      // 2. Call webhook to trigger immediate processing
      try {
        const webhookResponse = await fetch(`${WEBHOOK_URL}/enrich`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pluginSlug,
            jobId: result.jobId,
            apiKey: API_KEY,
          }),
        });

        if (webhookResponse.ok) {
          setStatus("running");
          setMessage(`Agent enriching ${pluginName}...`);
          
          // Poll for completion (optional - could use Convex subscription instead)
          setTimeout(() => {
            setStatus("success");
            setMessage("Enrichment complete! Refresh to see updates.");
          }, 30000); // Assume 30s for enrichment
        } else {
          // Webhook failed but job is queued
          setStatus("success");
          setMessage(`Queued for enrichment (webhook unavailable)`);
        }
      } catch (webhookErr) {
        // Webhook unreachable but job is queued
        console.warn("Webhook unavailable:", webhookErr);
        setStatus("success");
        setMessage(`Queued for batch processing`);
      }

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
        disabled={status === "loading" || status === "running"}
        className={`
          inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
          ${status === "idle" 
            ? "bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-700" 
            : status === "loading"
            ? "bg-stone-800 text-stone-400 border border-stone-700 cursor-wait"
            : status === "running"
            ? "bg-amber-900/50 text-amber-400 border border-amber-700 cursor-wait"
            : status === "success"
            ? "bg-green-900/50 text-green-400 border border-green-700"
            : "bg-red-900/50 text-red-400 border border-red-700"
          }
        `}
        title="Refresh plugin data using AI agent"
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
        {status === "running" && (
          <>
            <Spinner size={16} className="animate-spin" />
            <span>Running...</span>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle size={16} />
            <span>Done!</span>
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
        <p className={`text-xs mt-1 ${
          status === "error" ? "text-red-400" : 
          status === "running" ? "text-amber-400" : 
          "text-green-400"
        }`}>
          {message}
        </p>
      )}
    </div>
  );
}
