/** Shared skeleton loader – the only loading animation used in the app. */
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}

export default function PageSkeleton({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="w-full space-y-3 p-4" aria-busy="true" aria-label="Loading">
        <SkeletonBlock className="h-5 w-1/3" />
        <SkeletonBlock className="h-10 w-full" />
        <SkeletonBlock className="h-10 w-full" />
        <SkeletonBlock className="h-10 w-5/6" />
      </div>
    );
  }
  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-6 sm:py-8" aria-busy="true" aria-label="Loading">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <SkeletonBlock className="h-7 w-56" />
          <SkeletonBlock className="mt-3 h-4 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
              <SkeletonBlock className="h-10 w-10 rounded-xl" />
              <SkeletonBlock className="mt-4 h-5 w-36" />
              <SkeletonBlock className="mt-2 h-4 w-24" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
          <SkeletonBlock className="h-6 w-48" />
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="h-12 w-full rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
