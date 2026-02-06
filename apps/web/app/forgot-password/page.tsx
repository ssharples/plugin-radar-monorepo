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
    <div className="min-h-screen bg-stone-950 flex items-center justify-center px-4">
      <div className="bg-stone-900 rounded-xl p-8 max-w-md w-full">
        {submitted ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-amber-500"
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
            <h2 className="text-xl font-bold text-white mb-2">
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
                className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-white rounded-lg transition-colors text-sm"
              >
                Try a different email
              </button>
              <Link
                href="/"
                className="block w-full py-2 bg-amber-500 hover:bg-amber-600 text-stone-900 font-medium rounded-lg transition-colors text-center"
              >
                Back to Home
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-white mb-2">
              Forgot Password
            </h2>
            <p className="text-stone-400 text-sm mb-6">
              Enter your email address and we&apos;ll send you a link to reset
              your password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-stone-400 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3 py-2 bg-stone-800 rounded-lg text-white border border-stone-700 focus:border-amber-500 focus:outline-none"
                  placeholder="you@example.com"
                />
              </div>

              {error && (
                <div className="text-red-400 text-sm bg-red-900/20 rounded-lg p-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-stone-900 font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>

            <div className="mt-4 text-center text-sm text-stone-400">
              Remember your password?{" "}
              <Link
                href="/"
                className="text-amber-500 hover:underline"
              >
                Sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
