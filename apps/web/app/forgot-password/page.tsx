"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestReset = useMutation(api.auth.requestPasswordReset);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await requestReset({ email: email.trim() });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-6 py-16 relative">
        <div className="max-w-md mx-auto">
          {submitted ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-white/10 border border-[#deff0a]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-[#deff0a]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h2
                className="text-xl font-bold text-stone-100 mb-2"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Check Your Email
              </h2>
              <p className="text-stone-400 mb-6">
                If an account exists for{" "}
                <span className="text-white font-medium">{email}</span>, we&apos;ve
                sent a password reset link. It will expire in 1 hour.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setSubmitted(false);
                    setEmail("");
                  }}
                  className="w-full py-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-stone-300 rounded-xl transition text-sm"
                >
                  Try a different email
                </button>
                <Link
                  href="/"
                  className="block w-full py-2.5 bg-white hover:bg-[#ccff00] text-stone-900 font-semibold rounded-xl transition shadow-lg shadow-[#deff0a]/20 hover:shadow-[#deff0a]/30 text-center"
                >
                  Back to Home
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h2
                  className="text-2xl font-bold text-stone-100 mb-2"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Forgot Password
                </h2>
                <p className="text-stone-400">
                  Enter your email address and we&apos;ll send you a link to reset
                  your password.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="glass-card rounded-xl p-6">
                <div className="mb-4">
                  <label className="block text-sm text-stone-400 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
                    placeholder="you@example.com"
                  />
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-white hover:bg-[#ccff00] disabled:bg-white/[0.06] disabled:text-stone-500 text-stone-900 font-semibold py-3 rounded-xl transition shadow-lg shadow-[#deff0a]/20 hover:shadow-[#deff0a]/30"
                >
                  {isLoading ? "Sending..." : "Send Reset Link"}
                </button>
              </form>

              <p className="text-center text-stone-400 text-sm mt-4">
                Remember your password?{" "}
                <Link
                  href="/account"
                  className="text-white hover:text-[#deff0a] transition"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
