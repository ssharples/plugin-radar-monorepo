"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";

export function Footer() {
  const stats = useQuery(api.stats.overview);

  return (
    <footer className="relative mt-24">
      {/* Top gradient divider */}
      <div className="section-line" />

      <div className="container mx-auto px-4 lg:px-6 pt-12 pb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-500 mb-4">Browse</h3>
            <ul className="space-y-2.5">
              <FooterLink href="/plugins">All Plugins</FooterLink>
              <FooterLink href="/sales">Active Sales</FooterLink>
              <FooterLink href="/free">Free Plugins</FooterLink>
              <FooterLink href="/manufacturers">Manufacturers</FooterLink>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-500 mb-4">Discover</h3>
            <ul className="space-y-2.5">
              <FooterLink href="/chains">Plugin Chains</FooterLink>
              <FooterLink href="/compare">Comparisons</FooterLink>
              <FooterLink href="/category/synth">Synths</FooterLink>
              <FooterLink href="/category/compressor">Compressors</FooterLink>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-500 mb-4">Account</h3>
            <ul className="space-y-2.5">
              <FooterLink href="/wishlist">My Wishlist</FooterLink>
              <FooterLink href="/collection">My Collection</FooterLink>
              <FooterLink href="/alerts">Price Alerts</FooterLink>
              <FooterLink href="/account">Settings</FooterLink>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-500 mb-4">Stats</h3>
            <ul className="space-y-2.5 text-sm">
              <li className="text-stone-500">
                <span className="text-amber-400/80 font-medium tabular-nums">{stats?.totalPlugins?.toLocaleString() || "..."}</span> plugins
              </li>
              <li className="text-stone-500">
                <span className="text-amber-400/80 font-medium tabular-nums">{stats?.totalManufacturers || "..."}</span> manufacturers
              </li>
              <li className="text-stone-500">
                <span className="text-amber-400/80 font-medium tabular-nums">{stats?.activeSales || "..."}</span> active sales
              </li>
              <li className="text-stone-500">
                <span className="text-amber-400/80 font-medium tabular-nums">{stats?.freePlugins || "..."}</span> free plugins
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-white/[0.04]">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="text-stone-900">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2"/>
                <circle cx="8" cy="8" r="2" fill="currentColor"/>
              </svg>
            </div>
            <span className="text-stone-500 text-sm">
              PluginRadar
            </span>
          </div>
          <p className="text-stone-600 text-xs">
            Track audio plugin deals. Discover new tools. Never miss a sale.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-sm text-stone-500 hover:text-amber-400/80 transition-colors duration-200"
      >
        {children}
      </Link>
    </li>
  );
}
