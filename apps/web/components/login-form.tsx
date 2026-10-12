"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "./auth-provider";

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const { login, register, isLoading } = useAuth();
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
        await login(email, password);
      } else {
        await register(email, password, name || undefined);
      }
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    }
  };

  return (
    <div className="bg-stone-900 rounded-xl p-6 max-w-md mx-auto">
      <h2 className="text-xl font-bold text-white mb-4">
        {mode === "login" ? "Sign In" : "Create Account"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "register" && (
          <div>
            <label className="block text-sm text-stone-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-stone-800 rounded-lg text-white border border-stone-700 focus:border-[#deff0a] focus:outline-none"
              placeholder="Your name"
            />
          </div>
        )}

        <div>
          <label className="block text-sm text-stone-400 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 bg-stone-800 rounded-lg text-white border border-stone-700 focus:border-[#deff0a] focus:outline-none"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="block text-sm text-stone-400 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-3 py-2 bg-stone-800 rounded-lg text-white border border-stone-700 focus:border-[#deff0a] focus:outline-none"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div className="text-red-400 text-sm bg-red-900/20 rounded-lg p-2">
            {error}
          </div>
        )}

        {mode === "login" && (
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-sm text-stone-400 hover:text-[#deff0a] transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2 bg-[#deff0a] hover:bg-[#ccff00] text-stone-900 font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {isLoading
            ? "Loading..."
            : mode === "login"
            ? "Sign In"
            : "Create Account"}
        </button>
      </form>

      <div className="mt-4 text-center text-sm text-stone-400">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <button
              onClick={() => setMode("register")}
              className="text-[#deff0a] hover:underline"
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              onClick={() => setMode("login")}
              className="text-[#deff0a] hover:underline"
            >
              Sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
