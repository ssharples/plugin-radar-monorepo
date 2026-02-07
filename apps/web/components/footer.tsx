"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Link as LinkIcon } from "@phosphor-icons/react";

export function Footer() {
  const stats = useQuery(api.stats.overview);

  return (
    <footer className="relative mt-24">
      {/* Top gradient divider */}
      <div className="section-line" />

      <div className="container mx-auto px-4 lg:px-6 pt-12 pb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-500 mb-4">
              Chains
            </h3>
            <ul className="space-y-2.5">
              <FooterLink href="/chains">Browse Chains</FooterLink>
              <FooterLink href="/chains?category=vocals">Vocal Chains</FooterLink>
              <FooterLink href="/chains?category=mastering">Mastering</FooterLink>
              <FooterLink href="/chains?category=drums">Drum Bus</FooterLink>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-500 mb-4">
              Plugins
            </h3>
            <ul className="space-y-2.5">
              <FooterLink href="/plugins">Plugin Directory</FooterLink>
              <FooterLink href="/sales">Deals & Sales</FooterLink>
              <FooterLink href="/free">Free Plugins</FooterLink>
              <FooterLink href="/manufacturers">Manufacturers</FooterLink>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-500 mb-4">
              Account
            </h3>
            <ul className="space-y-2.5">
              <FooterLink href="/wishlist">My Wishlist</FooterLink>
              <FooterLink href="/collection">My Collection</FooterLink>
              <FooterLink href="/alerts">Price Alerts</FooterLink>
              <FooterLink href="/account">Settings</FooterLink>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-stone-500 mb-4">
              Product
            </h3>
            <ul className="space-y-2.5">
              <FooterLink href="#download">Download App</FooterLink>
              <FooterLink href="/#how-it-works">How It Works</FooterLink>
              <FooterLink href="/compare">Comparisons</FooterLink>
              <FooterLink href="/chains">Community</FooterLink>
            </ul>
          </div>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="flex flex-wrap items-center gap-6 py-4 mb-8 border-y border-white/[0.04] text-xs text-stone-600">
            <span>
              <span className="text-indigo-400/70 font-medium tabular-nums">
                {stats.totalPlugins?.toLocaleString() || "..."}
              </span>{" "}
              plugins supported
            </span>
            <span>
              <span className="text-indigo-400/70 font-medium tabular-nums">
                {stats.totalManufacturers || "..."}
              </span>{" "}
              manufacturers
            </span>
            <span>
              <span className="text-amber-400/70 font-medium tabular-nums">
                {stats.activeSales || "..."}
              </span>{" "}
              active deals
            </span>
            <span>
              <span className="text-emerald-400/70 font-medium tabular-nums">
                {stats.freePlugins || "..."}
              </span>{" "}
              free plugins
            </span>
          </div>
        )}

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <LinkIcon weight="bold" className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-stone-500 text-sm">PluginRadar</span>
          </div>
          <p className="text-stone-600 text-xs">
            Your plugins. Your chains. Shared everywhere.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="text-sm text-stone-500 hover:text-indigo-400/80 transition-colors duration-200"
      >
        {children}
      </Link>
    </li>
  );
}
