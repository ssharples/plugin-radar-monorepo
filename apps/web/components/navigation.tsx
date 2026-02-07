"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MagnifyingGlass,
  User,
  Heart,
  DownloadSimple,
  List,
  X,
  Link as LinkIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/plugins?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header
      className="sticky top-0 z-50 border-b border-white/[0.04]"
      style={{
        background:
          "linear-gradient(180deg, rgba(10,10,18,0.97) 0%, rgba(10,10,18,0.92) 100%)",
        backdropFilter: "blur(16px) saturate(1.2)",
      }}
    >
      <div className="container mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between h-16 gap-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/30 transition-shadow">
              <LinkIcon weight="bold" className="w-4 h-4 text-white" />
            </div>
            <span
              className="text-lg font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <span className="text-indigo-400">Plugin</span>
              <span className="text-stone-300">Radar</span>
            </span>
          </Link>

          {/* Search Bar — desktop */}
          <form onSubmit={handleSearch} className="flex-1 max-w-lg hidden md:flex">
            <div className="relative w-full group">
              <MagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 group-focus-within:text-indigo-400/70 transition-colors" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search plugins & chains..."
                className="w-full pl-10 pr-4 py-2 bg-white/[0.04] border border-white/[0.06] rounded-xl text-stone-200 placeholder-stone-500 focus:outline-none focus:border-indigo-500/30 focus:bg-white/[0.06] focus:ring-1 focus:ring-indigo-500/20 transition-all text-sm"
              />
            </div>
          </form>

          {/* Navigation Links — desktop */}
          <nav className="hidden md:flex items-center gap-0.5">
            <NavLink href="/chains" active={isActive("/chains")}>
              Chains
            </NavLink>
            <NavLink href="/plugins" active={isActive("/plugins")}>
              Explore
            </NavLink>
            <NavLink href="/sales" active={isActive("/sales")}>
              <span className="flex items-center gap-1.5">
                Deals
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              </span>
            </NavLink>
            <NavLink href="/manufacturers" active={isActive("/manufacturers")}>
              Brands
            </NavLink>
            <div className="w-px h-5 bg-white/[0.06] mx-1.5" />
            <NavLink href="/wishlist" active={isActive("/wishlist")} icon>
              <Heart
                className="w-[18px] h-[18px]"
                weight={isActive("/wishlist") ? "fill" : "regular"}
              />
            </NavLink>
            <NavLink href="/account" active={isActive("/account")} icon>
              <User className="w-[18px] h-[18px]" />
            </NavLink>
            <div className="w-px h-5 bg-white/[0.06] mx-1.5" />
            <Link
              href="#download"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium rounded-lg transition-all shadow-sm shadow-indigo-500/20"
            >
              <DownloadSimple weight="bold" className="w-3.5 h-3.5" />
              Download
            </Link>
          </nav>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-stone-400 hover:text-white transition"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <List className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Mobile Search */}
        <form onSubmit={handleSearch} className="pb-3 md:hidden">
          <div className="relative w-full">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search plugins & chains..."
              className="w-full pl-10 pr-4 py-2 bg-white/[0.04] border border-white/[0.06] rounded-xl text-stone-200 placeholder-stone-500 focus:outline-none focus:border-indigo-500/30 text-sm"
            />
          </div>
        </form>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <nav className="md:hidden pb-4 flex flex-wrap gap-2">
            {[
              { href: "/chains", label: "Chains" },
              { href: "/plugins", label: "Explore" },
              { href: "/sales", label: "Deals" },
              { href: "/manufacturers", label: "Brands" },
              { href: "/free", label: "Free" },
              { href: "/wishlist", label: "Wishlist" },
              { href: "/account", label: "Account" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileMenuOpen(false)}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  isActive(href)
                    ? "bg-indigo-500/10 text-indigo-400"
                    : "text-stone-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                {label}
              </Link>
            ))}
            <Link
              href="#download"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-1.5 rounded-lg text-sm bg-indigo-500 text-white font-medium"
            >
              Download
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
  icon = false,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  icon?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`relative px-3 py-2 rounded-lg transition-all text-sm font-medium flex items-center gap-1.5 ${
        icon ? "px-2" : ""
      } ${
        active
          ? "text-indigo-400"
          : "text-stone-400 hover:text-stone-200 hover:bg-white/[0.04]"
      }`}
    >
      {children}
      {active && !icon && (
        <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-gradient-to-r from-indigo-500/0 via-indigo-500 to-indigo-500/0" />
      )}
    </Link>
  );
}
