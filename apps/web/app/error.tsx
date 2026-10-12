"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-neutral-400 mb-4">500</h1>
        <h2 className="text-xl font-semibold text-neutral-200 mb-2">
          Something went wrong
        </h2>
        <p className="text-neutral-400 mb-8">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <button
          onClick={reset}
          className="neon-button px-6 py-3 rounded-lg text-sm font-bold"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
