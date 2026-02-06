"use client";

import { useAuth } from "@/components/auth-provider";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { User, SignOut, Heart, Bell, Package, Shield } from "@phosphor-icons/react";

export default function AccountPage() {
  const { user, isLoading, isAuthenticated, isAdmin, login, register, logout } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const updatePreferences = useMutation(api.users.updatePreferences);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, name.trim() || undefined);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] via-transparent to-transparent pointer-events-none" />

        <div className="container mx-auto px-4 lg:px-6 py-16 relative">
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-amber-400" />
              </div>
              <h1
                className="text-2xl font-bold text-stone-100 mb-2"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {mode === "login" ? "Welcome Back" : "Create Account"}
              </h1>
              <p className="text-stone-400">
                {mode === "login"
                  ? "Sign in to track wishlists, set price alerts, and manage your plugin collection."
                  : "Join PluginRadar to track your favorite plugins."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="glass-card rounded-xl p-6">
              {mode === "register" && (
                <div className="mb-4">
                  <label className="block text-sm text-stone-400 mb-2">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500/50 transition"
                  />
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm text-stone-400 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500/50 transition"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm text-stone-400 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500/50 transition"
                  required
                />
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-white/[0.06] disabled:text-stone-500 text-stone-900 font-semibold py-3 rounded-xl transition shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
              >
                {isSubmitting
                  ? "Loading..."
                  : mode === "login"
                  ? "Sign In"
                  : "Create Account"}
              </button>
            </form>

            <p className="text-center text-stone-400 text-sm mt-4">
              {mode === "login" ? (
                <>
                  Don&apos;t have an account?{" "}
                  <button
                    onClick={() => setMode("register")}
                    className="text-amber-400 hover:text-amber-300 transition"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    onClick={() => setMode("login")}
                    className="text-amber-400 hover:text-amber-300 transition"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-6 py-10 relative">
        <p className="text-xs text-stone-500 uppercase tracking-wider mb-3">Settings</p>
        <h1
          className="text-2xl font-bold text-stone-100 mb-8"
          style={{ fontFamily: "var(--font-display)" }}
        >
          My Account
        </h1>

        <div className="section-line mb-8" />

        <div className="grid md:grid-cols-3 gap-6">
          {/* Profile Card */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-stone-100">{user?.name || "User"}</h2>
                  {isAdmin && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded text-xs text-amber-400">
                      <Shield className="w-3 h-3" weight="fill" />
                      Admin
                    </span>
                  )}
                </div>
                <p className="text-stone-400 text-sm">{user?.email}</p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-stone-400">
                <span>Member since</span>
                <span className="text-stone-200">
                  {user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString()
                    : "\u2014"}
                </span>
              </div>
              <div className="flex justify-between text-stone-400">
                <span>Account tier</span>
                <span className="text-amber-400 capitalize">{user?.tier || "free"}</span>
              </div>
            </div>

            <button
              onClick={logout}
              className="w-full mt-6 flex items-center justify-center gap-2 px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-stone-300 rounded-xl border border-white/[0.06] transition"
            >
              <SignOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>

          {/* Quick Links */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="font-semibold text-stone-100 mb-4">Quick Links</h3>
            <div className="space-y-2">
              <Link
                href="/wishlist"
                className="flex items-center gap-3 p-3 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl transition border border-transparent hover:border-white/[0.06]"
              >
                <Heart className="w-5 h-5 text-pink-400" />
                <span className="text-stone-200">My Wishlist</span>
              </Link>
              <Link
                href="/alerts"
                className="flex items-center gap-3 p-3 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl transition border border-transparent hover:border-white/[0.06]"
              >
                <Bell className="w-5 h-5 text-amber-400" />
                <span className="text-stone-200">Price Alerts</span>
              </Link>
              <Link
                href="/collection"
                className="flex items-center gap-3 p-3 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl transition border border-transparent hover:border-white/[0.06]"
              >
                <Package className="w-5 h-5 text-blue-400" />
                <span className="text-stone-200">My Collection</span>
              </Link>
            </div>
          </div>

          {/* Notification Preferences */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="font-semibold text-stone-100 mb-4">Preferences</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-stone-300 mb-2">Email digest</label>
                <select
                  value={user?.emailDigest ?? "weekly"}
                  onChange={(e) =>
                    user &&
                    updatePreferences({
                      id: user._id,
                      emailDigest: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 focus:outline-none focus:border-amber-500/50 transition"
                >
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div>
                <label className="block text-stone-300 mb-2">Currency</label>
                <select
                  value={user?.preferredCurrency ?? "USD"}
                  onChange={(e) =>
                    user &&
                    updatePreferences({
                      id: user._id,
                      preferredCurrency: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 focus:outline-none focus:border-amber-500/50 transition"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (&euro;)</option>
                  <option value="GBP">GBP (&pound;)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
