export default function ServiceLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-6 w-40 bg-slate-200 rounded" />
          <div className="h-4 w-56 bg-slate-100 rounded mt-2" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 bg-slate-100 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-48 bg-slate-100 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
