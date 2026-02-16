export default function ManufacturersLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-pulse">
      {/* Header skeleton */}
      <div className="h-8 bg-neutral-800 rounded w-56 mb-8" />

      {/* Manufacturer cards grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="bg-neutral-900 rounded-xl p-5 space-y-3">
            <div className="h-12 w-12 bg-neutral-800 rounded-full" />
            <div className="h-5 bg-neutral-800 rounded w-2/3" />
            <div className="h-3 bg-neutral-800 rounded w-full" />
            <div className="h-3 bg-neutral-800 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
