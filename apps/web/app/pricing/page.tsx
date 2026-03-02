"use client";

import { useAuth } from "@/components/auth-provider";
import { useState } from "react";
import Link from "next/link";
import {
  Check,
  Lightning,
  MusicNotes,
  Users,
  ArrowsHorizontal,
  CloudArrowUp,
} from "@phosphor-icons/react";

const FEATURES = [
  { icon: MusicNotes, text: "Works with every AU and VST3 plugin" },
  { icon: ArrowsHorizontal, text: "Serial & parallel signal chains" },
  { icon: Lightning, text: "Automatic latency compensation" },
  { icon: CloudArrowUp, text: "Cloud sharing & community chains" },
  { icon: Users, text: "Ratings, comments, forking & friends" },
  { icon: Check, text: "Lifetime updates, no subscription" },
];

export default function PricingPage() {
  const { isAuthenticated, sessionToken } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePurchase = async () => {
    setIsLoading(true);
    setError("");

    try {
      const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
      if (!convexUrl) throw new Error("Backend not configured");

      // Convex HTTP endpoints use the .convex.site domain
      const baseUrl = convexUrl.replace(".convex.cloud", ".convex.site");
      const res = await fetch(`${baseUrl}/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken: sessionToken || undefined,
          successUrl: `${window.location.origin}/pricing/success`,
          cancelUrl: `${window.location.origin}/pricing`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start checkout");
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-6 py-16 relative">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-xs text-[#deff0a] uppercase tracking-wider mb-3">
            ProChain by Plugin Radar
          </p>
          <h1
            className="text-3xl font-bold text-stone-100 mb-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            One price. Yours forever.
          </h1>
          <p className="text-stone-400 mb-10">
            No subscription. Buy once, own it for life with free updates.
          </p>

          {/* Pricing card */}
          <div className="glass-card rounded-2xl p-8 mb-8 border border-[#deff0a]/10">
            <div className="mb-6">
              <span className="text-5xl font-bold text-stone-100">$50</span>
              <span className="text-stone-500 ml-2">one-time</span>
            </div>

            <ul className="text-left space-y-3 mb-8">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-stone-300">
                  <Icon className="w-5 h-5 text-[#deff0a] shrink-0" weight="bold" />
                  {text}
                </li>
              ))}
            </ul>

            <button
              onClick={handlePurchase}
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl text-sm font-bold bg-white hover:bg-[#ccff00] disabled:bg-white/[0.06] disabled:text-stone-500 text-stone-900 transition shadow-lg shadow-[#deff0a]/20 hover:shadow-[#deff0a]/30"
            >
              {isLoading ? "Redirecting to checkout..." : "Buy ProChain — $50"}
            </button>

            {error && (
              <p className="mt-3 text-sm text-red-400">{error}</p>
            )}

            {!isAuthenticated && (
              <p className="mt-4 text-xs text-stone-500">
                Have an account?{" "}
                <Link href="/account" className="text-[#deff0a] hover:underline">
                  Sign in first
                </Link>{" "}
                to link the purchase to your account.
              </p>
            )}
          </div>

          <div className="text-xs text-stone-600 space-y-1">
            <p>Secure checkout powered by Stripe</p>
            <p>macOS (AU & VST3) available now. Windows coming soon.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
