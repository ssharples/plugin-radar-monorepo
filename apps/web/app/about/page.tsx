import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | ProChain by Plugin Radar",
  description:
    "ProChain is your shortcut to the mix. A collection of powerful mixing tools in one unified interface — fast, ergonomic and crash-safe. Built to keep you in the flow state.",
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
            Your shortcut to the mix.
          </h2>
          <p className="mb-3">
            ProChain is a collection of powerful mixing tools in one unified
            interface. Fast, ergonomic and crash-safe.
          </p>
          <p>
            The problem is simple: native DAW chains scatter your attention
            across a dozen open windows. Every time you reach for a plugin
            you&apos;re context switching &mdash; and every context switch is a
            small interruption to the creative state that makes great recordings
            happen. ProChain consolidates your entire signal path into a single
            focused view. Navigate between every insert with a keystroke. Build
            complex serial and parallel routing without ever opening a plugin
            window. Stay in the zone.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            How it works
          </h2>
          <ul className="list-disc list-inside space-y-2 text-neutral-400">
            <li>
              Load ProChain as a plugin in your DAW &mdash; it hosts every other
              plugin inside one unified view.
            </li>
            <li>
              Navigate between inserts with keyboard shortcuts. No mouse, no
              window hunting, no broken concentration.
            </li>
            <li>
              Build serial or parallel signal paths. Per-plugin metering, gain
              staging, and auto latency compensation built in.
            </li>
            <li>
              Share when you&apos;ve got something great. Send chains privately
              to clients or publish them for the community.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            Why ProChain?
          </h2>
          <ul className="space-y-3 text-neutral-400">
            <li>
              <span className="text-neutral-200 font-medium">Fast.</span>{" "}
              Think in milliseconds. Keyboard shortcuts get you to any plugin in
              your chain without lifting your hands.
            </li>
            <li>
              <span className="text-neutral-200 font-medium">Ergonomic.</span>{" "}
              Designed around how you actually work. One view, every tool,
              no context switching.
            </li>
            <li>
              <span className="text-neutral-200 font-medium">Open.</span>{" "}
              Works with any VST3, AU, or AAX plugin &mdash; no ecosystem
              lock-in, no vendor restrictions.
            </li>
            <li>
              <span className="text-neutral-200 font-medium">Affordable.</span>{" "}
              $30 during launch (regular $60). One-time purchase.
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
          href="/pricing"
          className="neon-button inline-block px-6 py-3 rounded-lg text-sm font-bold"
        >
          Start Free Trial
        </Link>
      </div>
    </div>
  );
}
