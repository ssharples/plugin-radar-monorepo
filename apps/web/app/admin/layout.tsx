"use client";

import { useAuth } from "@/components/auth-provider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  Gauge,
  Plugs,
  Factory,
  ArrowLeft,
  Question,
} from "@phosphor-icons/react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: Gauge },
  { href: "/admin/plugins", label: "Plugins", icon: Plugs },
  { href: "/admin/manufacturers", label: "Manufacturers", icon: Factory },
  { href: "/admin/unmatched", label: "Unmatched", icon: Question },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, isAdmin } = useAuth();
  const pathname = usePathname();

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#deff0a] border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-16 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-stone-100 mb-2">
            Access Denied
          </h1>
          <p className="text-stone-400 mb-6">
            You don&apos;t have permission to access the admin dashboard.
          </p>
          <Link
            href="/account"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] text-stone-300 rounded-xl border border-white/[0.06] transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 lg:px-6 py-8">
      <div className="flex gap-8">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 hidden md:block">
          <div className="sticky top-24">
            <div className="flex items-center gap-2 mb-6 px-3">
              <Shield className="w-5 h-5 text-[#deff0a]" weight="fill" />
              <span className="text-sm font-semibold text-stone-100">
                Admin
              </span>
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/admin" &&
                    pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-[#deff0a]/10 text-[#deff0a] font-medium"
                        : "text-stone-400 hover:text-stone-200 hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
