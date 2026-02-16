"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "./auth-provider";
import {
  User,
  SignOut,
  LinkSimple,
  DownloadSimple,
  Gear,
} from "@phosphor-icons/react";

export function AvatarDropdown() {
  const { user, isAuthenticated, isLoading, login, register, logout } =
    useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || "?";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center justify-center w-9 h-9 rounded-full transition-all ${
          isAuthenticated
            ? "bg-[#deff0a]/15 text-[#deff0a] hover:bg-[#deff0a]/25 border border-[#deff0a]/20"
            : "bg-white/[0.06] text-stone-400 hover:bg-white/[0.12] hover:text-stone-200 border border-white/[0.06]"
        }`}
        aria-label={isAuthenticated ? "Account menu" : "Sign in"}
      >
        {isAuthenticated ? (
          <span className="text-xs font-bold leading-none">{initials}</span>
        ) : (
          <User className="w-4 h-4" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-white/[0.08] bg-stone-900/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden z-50">
          {isAuthenticated ? (
            <LoggedInMenu
              user={user}
              onLogout={() => {
                logout();
                setOpen(false);
              }}
              onClose={() => setOpen(false)}
            />
          ) : (
            <LoginPanel
              isLoading={isLoading}
              onLogin={login}
              onRegister={register}
              onSuccess={() => setOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function LoggedInMenu({
  user,
  onLogout,
  onClose,
}: {
  user: any;
  onLogout: () => void;
  onClose: () => void;
}) {
  return (
    <div>
      {/* User info */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <p className="text-sm font-medium text-stone-100 truncate">
          {user?.name || "User"}
        </p>
        <p className="text-xs text-stone-500 truncate">{user?.email}</p>
      </div>

      {/* Links */}
      <div className="py-1">
        <DropdownLink
          href="/chains"
          icon={<LinkSimple className="w-4 h-4" />}
          label="My Chains"
          onClick={onClose}
        />
        <DropdownLink
          href="/download"
          icon={<DownloadSimple className="w-4 h-4" />}
          label="Download ProChain"
          onClick={onClose}
        />
        <DropdownLink
          href="/account"
          icon={<Gear className="w-4 h-4" />}
          label="Account Settings"
          onClick={onClose}
        />
      </div>

      {/* Sign out */}
      <div className="border-t border-white/[0.06] py-1">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-4 py-2 text-sm text-stone-400 hover:text-white hover:bg-white/[0.05] transition-colors"
        >
          <SignOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

function DropdownLink({
  href,
  icon,
  label,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2 text-sm text-stone-300 hover:text-white hover:bg-white/[0.05] transition-colors"
    >
      {icon}
      {label}
    </Link>
  );
}

function LoginPanel({
  isLoading,
  onLogin,
  onRegister,
  onSuccess,
}: {
  isLoading: boolean;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, name?: string) => Promise<void>;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "login") {
        await onLogin(email, password);
      } else {
        await onRegister(email, password, name || undefined);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    }
  };

  return (
    <div className="p-4">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white/[0.04] rounded-lg p-0.5">
        <button
          onClick={() => setMode("login")}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
            mode === "login"
              ? "bg-white/[0.1] text-white"
              : "text-stone-500 hover:text-stone-300"
          }`}
        >
          Sign In
        </button>
        <button
          onClick={() => setMode("register")}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
            mode === "register"
              ? "bg-white/[0.1] text-white"
              : "text-stone-500 hover:text-stone-300"
          }`}
        >
          Register
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "register" && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/30"
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="Email"
          className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/30"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          placeholder="Password"
          className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/30"
        />

        {error && (
          <p className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2 bg-[#deff0a] hover:bg-[#ccff00] text-stone-900 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {isLoading
            ? "Loading..."
            : mode === "login"
              ? "Sign In"
              : "Create Account"}
        </button>
      </form>

      {mode === "login" && (
        <Link
          href="/forgot-password"
          className="block text-center text-xs text-stone-500 hover:text-stone-300 mt-3 transition-colors"
        >
          Forgot password?
        </Link>
      )}
    </div>
  );
}
