"use client";

import Link from "next/link";
import { CheckCircle, DownloadSimple } from "@phosphor-icons/react";

export default function PurchaseSuccessPage() {
  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-6 py-24 relative">
        <div className="max-w-md mx-auto text-center">
          <div className="w-20 h-20 bg-[#deff0a]/10 border border-[#deff0a]/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-[#deff0a]" weight="fill" />
          </div>

          <h1
            className="text-2xl font-bold text-stone-100 mb-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            You're all set!
          </h1>
          <p className="text-stone-400 mb-8">
            Your ProChain license is now active. Download the plugin and sign in
            with the same email to get started.
          </p>

          <div className="space-y-3">
            <Link
              href="/download"
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-bold bg-white hover:bg-[#ccff00] text-stone-900 transition shadow-lg shadow-[#deff0a]/20 hover:shadow-[#deff0a]/30"
            >
              <DownloadSimple className="w-5 h-5" weight="bold" />
              Download ProChain
            </Link>

            <Link
              href="/"
              className="block w-full py-3 rounded-xl text-sm text-stone-400 hover:text-stone-200 transition border border-white/[0.06] hover:border-white/[0.12]"
            >
              Back to Plugin Radar
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
