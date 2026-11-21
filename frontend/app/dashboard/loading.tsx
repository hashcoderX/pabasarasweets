export default function DashboardLoading() {
  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-6 sm:py-8">
      <div className="animate-pulse space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="h-7 w-56 rounded-lg bg-slate-200" />
          <div className="mt-3 h-4 w-80 max-w-full rounded bg-slate-200" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="h-10 w-10 rounded-xl bg-slate-200" />
            <div className="mt-4 h-5 w-36 rounded bg-slate-200" />
            <div className="mt-2 h-4 w-24 rounded bg-slate-200" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="h-10 w-10 rounded-xl bg-slate-200" />
            <div className="mt-4 h-5 w-36 rounded bg-slate-200" />
            <div className="mt-2 h-4 w-24 rounded bg-slate-200" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="h-10 w-10 rounded-xl bg-slate-200" />
            <div className="mt-4 h-5 w-36 rounded bg-slate-200" />
            <div className="mt-2 h-4 w-24 rounded bg-slate-200" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="h-10 w-10 rounded-xl bg-slate-200" />
            <div className="mt-4 h-5 w-36 rounded bg-slate-200" />
            <div className="mt-2 h-4 w-24 rounded bg-slate-200" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="h-6 w-48 rounded bg-slate-200" />
          <div className="mt-4 space-y-3">
            <div className="h-12 rounded-xl bg-slate-100" />
            <div className="h-12 rounded-xl bg-slate-100" />
            <div className="h-12 rounded-xl bg-slate-100" />
            <div className="h-12 rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
