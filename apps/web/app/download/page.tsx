"use client";

import Link from "next/link";

export default function DownloadPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold text-neutral-100 mb-2">
        Download ProChain
      </h1>
      <p className="text-neutral-400 text-sm mb-12">
        Free during open beta. Build, share, and discover plugin chains.
      </p>

      {/* Download cards */}
      <div className="grid sm:grid-cols-2 gap-4 mb-12">
        {/* macOS */}
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold text-neutral-100 mb-1">
            macOS
          </h2>
          <p className="text-neutral-500 text-xs mb-4">AU &amp; VST3</p>
          <ul className="text-neutral-400 text-sm space-y-1 mb-6">
            <li>macOS 12 Monterey or later</li>
            <li>Apple Silicon or Intel</li>
            <li>Any AU/VST3-compatible DAW</li>
          </ul>
          <button
            disabled
            className="w-full py-3 rounded-lg text-sm font-bold bg-neutral-800 text-neutral-500 cursor-not-allowed"
          >
            Join Open Beta &mdash; macOS
          </button>
          <p className="text-neutral-600 text-xs mt-2 text-center">
            Builds shipping soon. Join our Discord for early access.
          </p>
        </div>

        {/* Windows */}
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold text-neutral-100 mb-1">
            Windows
          </h2>
          <p className="text-neutral-500 text-xs mb-4">VST3</p>
          <ul className="text-neutral-400 text-sm space-y-1 mb-6">
            <li>Windows 10 or later</li>
            <li>64-bit only</li>
            <li>Any VST3-compatible DAW</li>
          </ul>
          <button
            disabled
            className="w-full py-3 rounded-lg text-sm font-bold bg-neutral-800 text-neutral-500 cursor-not-allowed"
          >
            Join Open Beta &mdash; Windows
          </button>
          <p className="text-neutral-600 text-xs mt-2 text-center">
            Coming soon
          </p>
        </div>
      </div>

      {/* Beta signup */}
      <div className="glass-card-subtle rounded-xl p-6 mb-12">
        <h2 className="text-lg font-semibold text-neutral-100 mb-2">
          Join the Open Beta
        </h2>
        <p className="text-neutral-400 text-sm mb-4">
          ProChain is in open beta. Leave your email to get notified when
          downloads are ready, or join our Discord for early access.
        </p>
        <form
          onSubmit={(e) => e.preventDefault()}
          className="flex gap-2 max-w-md"
        >
          <input
            type="email"
            placeholder="you@example.com"
            className="flex-1 px-4 py-2.5 rounded-lg bg-neutral-900 border border-white/[0.08] text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-[#deff0a]/30"
          />
          <button
            type="submit"
            className="neon-button px-5 py-2.5 rounded-lg text-sm font-bold shrink-0"
          >
            Notify Me
          </button>
        </form>
      </div>

      {/* Features */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-neutral-100 mb-4">
          What you get
        </h2>
        <ul className="grid sm:grid-cols-2 gap-3 text-sm text-neutral-400">
          <li className="glass-card-subtle rounded-lg p-4">
            Serial &amp; parallel signal chains with drag-and-drop
          </li>
          <li className="glass-card-subtle rounded-lg p-4">
            Per-branch gain, solo, mute, and dry/wet mix
          </li>
          <li className="glass-card-subtle rounded-lg p-4">
            Automatic latency compensation across parallel branches
          </li>
          <li className="glass-card-subtle rounded-lg p-4">
            Cloud sharing &mdash; publish chains for others to discover
          </li>
          <li className="glass-card-subtle rounded-lg p-4">
            Star ratings, comments, forking, and friend sharing
          </li>
          <li className="glass-card-subtle rounded-lg p-4">
            Works with every AU and VST3 plugin you own
          </li>
        </ul>
      </section>

      <div className="pt-6 border-t border-white/[0.06] text-sm text-neutral-500">
        <Link href="/about" className="hover:text-neutral-300 transition-colors">
          About ProChain
        </Link>
      </div>
    </div>
  );
}
