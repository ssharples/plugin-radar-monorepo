import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-neutral-400 mb-4">404</h1>
        <h2 className="text-xl font-semibold text-neutral-200 mb-2">
          Page Not Found
        </h2>
        <p className="text-neutral-400 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          href="/"
          className="neon-button inline-block px-6 py-3 rounded-lg text-sm font-bold"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
