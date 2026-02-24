export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-8 w-48 rounded bg-slate-200" />
        <div className="h-4 w-32 rounded bg-slate-100 mt-2" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="h-4 w-16 rounded bg-slate-200" />
              <div className="h-8 w-8 rounded bg-slate-100" />
            </div>
            <div className="h-8 w-20 rounded bg-slate-200" />
            <div className="h-3 w-24 rounded bg-slate-100 mt-2" />
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 w-28 rounded-lg bg-slate-100" />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-7">
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-6">
          <div className="h-5 w-32 rounded bg-slate-200 mb-4" />
          <div className="h-[280px] rounded bg-slate-100" />
        </div>
        <div className="lg:col-span-3 rounded-xl border border-slate-200 bg-white p-6">
          <div className="h-5 w-32 rounded bg-slate-200 mb-4" />
          <div className="h-[280px] rounded bg-slate-100" />
        </div>
      </div>
    </div>
  )
}
