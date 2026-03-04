"use client";

import { useState, useEffect } from "react";
import { X } from "@phosphor-icons/react";
import Link from "next/link";

const LAUNCH_END = new Date("2026-04-03T23:59:59Z"); // 30 days from now

export function LaunchBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    // Check if dismissed in this session
    if (sessionStorage.getItem("launch-banner-dismissed")) {
      setDismissed(true);
      return;
    }

    const update = () => {
      const now = new Date();
      const diff = LAUNCH_END.getTime() - now.getTime();
      if (diff <= 0) {
        setTimeLeft("");
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft(`${days}d ${hours}h ${minutes}m`);
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  if (dismissed || !timeLeft) return null;

  return (
    <div className="bg-[#deff0a] text-black text-center py-2 px-4 text-sm font-medium relative">
      <Link href="/pricing" className="hover:underline">
        Launch Sale — 50% off ProChain.{" "}
        <span className="font-bold">$30</span>{" "}
        <span className="line-through opacity-60">$60</span>{" "}
        — ends in{" "}
        <span className="font-mono font-bold">{timeLeft}</span>
      </Link>
      <button
        onClick={() => {
          setDismissed(true);
          sessionStorage.setItem("launch-banner-dismissed", "1");
        }}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-black/10 rounded"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
