/** Skeleton loaders — every major page has a matching loading state. */

export function Skeleton({ className = '', ...props }) {
  return <span className={`skeleton block ${className}`} {...props} />
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="mt-4 h-7 w-16" />
      <Skeleton className="mt-3 h-3 w-28" />
    </div>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3.5">
        <Skeleton className="h-11 w-11 rounded-lg" />
        <div className="flex-1">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </div>
        <Skeleton className="h-5 w-20 rounded-md" />
      </div>
      <div className="mt-5 space-y-2.5 border-t border-line pt-4">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  )
}

export function RowSkeleton({ columns = 4 }) {
  return (
    <div className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-b-0">
      <Skeleton className="h-9 w-9 rounded-lg" />
      {Array.from({ length: columns }).map((_, index) => (
        <Skeleton key={index} className="h-3.5 flex-1" />
      ))}
    </div>
  )
}

export function ListSkeleton({ rows = 5, columns = 4 }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      {Array.from({ length: rows }).map((_, index) => (
        <RowSkeleton key={index} columns={columns} />
      ))}
    </div>
  )
}

export function CardGridSkeleton({ count = 6 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="mt-3 h-4 w-40" />
        <div className="mt-5 flex gap-2">
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-6 w-28 rounded-md" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <Skeleton className="h-4 w-36" />
            <div className="mt-4 space-y-3">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3.5 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Skeleton
