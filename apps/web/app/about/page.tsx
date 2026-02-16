import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | ProChain by Plugin Radar",
  description:
    "ProChain is the open plugin chain platform. Build signal chains with any VST3 or AU plugin, share them with the community, and discover chains other producers have built.",
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold text-neutral-100 mb-2">
        About ProChain
      </h1>
      <p className="text-neutral-500 text-sm mb-10">
        Built by{" "}
        <Link href="/" className="text-neutral-400 hover:text-white transition-colors">
          Plugin Radar
        </Link>
      </p>

      <div className="space-y-8 text-neutral-300 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            What is ProChain?
          </h2>
          <p>
            ProChain is the open plugin chain platform. Build signal chains with
            any VST3 or AU plugin, share them with the community, and discover
            chains other producers have built &mdash; rated, commented, and
            forkable like GitHub repos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            How it works
          </h2>
          <ul className="list-disc list-inside space-y-2 text-neutral-400">
            <li>
              Load ProChain as a plugin in your DAW &mdash; it hosts other
              plugins inside a configurable chain.
            </li>
            <li>
              Build serial or parallel signal paths with per-plugin metering,
              gain staging, and latency compensation.
            </li>
            <li>
              Share chains to the community or send them privately to friends.
            </li>
            <li>
              Browse and fork chains by genre, use case, or plugin
              compatibility.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            Why ProChain?
          </h2>
          <ul className="space-y-3 text-neutral-400">
            <li>
              <span className="text-neutral-200 font-medium">Open.</span>{" "}
              Works with any VST3, AU, or AAX plugin &mdash; no ecosystem
              lock-in.
            </li>
            <li>
              <span className="text-neutral-200 font-medium">Social.</span>{" "}
              Rate, comment, and fork chains like GitHub repos.
            </li>
            <li>
              <span className="text-neutral-200 font-medium">Smart.</span>{" "}
              See which plugins you already own before loading a shared chain.
            </li>
            <li>
              <span className="text-neutral-200 font-medium">Free.</span>{" "}
              Completely free during open beta. No subscription, ever.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            Contact
          </h2>
          <p>
            Questions or feedback? Reach us at{" "}
            <a
              href="mailto:hello@pluginradar.com"
              className="text-[#deff0a] hover:underline"
            >
              hello@pluginradar.com
            </a>
          </p>
        </section>
      </div>

      <div className="mt-12 pt-8 border-t border-white/[0.06]">
        <Link
          href="/download"
          className="neon-button inline-block px-6 py-3 rounded-lg text-sm font-bold"
        >
          Download ProChain Free
        </Link>
      </div>
    </div>
  );
}
