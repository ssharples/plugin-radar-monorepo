"use client";

import Link from "next/link";
import { useState } from "react";
import { AvatarDropdown } from "./avatar-dropdown";

const navLinks = [
  { href: "/chains", label: "Chains" },
  { href: "/plugins", label: "Plugins" },
  { href: "/learn", label: "Learn" },
  { href: "/download", label: "Download" },
  { href: "/about", label: "About" },
];

export function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-50 border-b border-white/[0.04]"
      style={{
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.92) 100%)",
        backdropFilter: "blur(16px) saturate(1.2)",
      }}
    >
      <div className="container mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <img
              src="/prochain-logo.png"
              alt="ProChain"
              className="h-9 w-auto object-contain transition-all duration-300 group-hover:scale-105 group-hover:brightness-110"
            />
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-1.5 text-sm text-stone-400 hover:text-white transition-colors rounded-md hover:bg-white/[0.05]"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {/* CTA */}
            <a
              href="/download"
              className="neon-button px-5 py-2 rounded-lg text-sm font-bold hidden sm:inline-flex"
            >
              Download Free
            </a>

            {/* Avatar / Auth */}
            <AvatarDropdown />

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden flex flex-col gap-1.5 p-2 -mr-2"
              aria-label="Toggle menu"
            >
              <span
                className={`block w-5 h-0.5 bg-stone-300 transition-all ${mobileOpen ? "rotate-45 translate-y-2" : ""}`}
              />
              <span
                className={`block w-5 h-0.5 bg-stone-300 transition-all ${mobileOpen ? "opacity-0" : ""}`}
              />
              <span
                className={`block w-5 h-0.5 bg-stone-300 transition-all ${mobileOpen ? "-rotate-45 -translate-y-2" : ""}`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/[0.06] bg-black/95">
          <nav className="container mx-auto px-4 py-3 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2.5 text-sm text-stone-400 hover:text-white transition-colors rounded-md hover:bg-white/[0.05]"
              >
                {link.label}
              </Link>
            ))}
            <a
              href="/download"
              className="neon-button px-5 py-2.5 rounded-lg text-sm font-bold text-center mt-2"
            >
              Download Free
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
