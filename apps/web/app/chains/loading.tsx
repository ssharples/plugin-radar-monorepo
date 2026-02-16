export default function ChainsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-pulse">
      {/* Header skeleton */}
      <div className="h-8 bg-neutral-800 rounded w-48 mb-6" />

      <div className="flex gap-8">
        {/* Sidebar skeleton */}
        <div className="hidden lg:block w-64 shrink-0 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 bg-neutral-800 rounded w-full" />
          ))}
        </div>

        {/* Chain cards grid skeleton */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="bg-neutral-900 rounded-xl p-4 space-y-3">
              <div className="h-5 bg-neutral-800 rounded w-3/4" />
              <div className="h-3 bg-neutral-800 rounded w-1/2" />
              <div className="flex gap-2 mt-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-6 bg-neutral-800 rounded-full w-16" />
                ))}
              </div>
              <div className="h-3 bg-neutral-800 rounded w-1/3 mt-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
