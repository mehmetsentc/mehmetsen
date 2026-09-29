export function StudioSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="aspect-video animate-pulse bg-[rgb(var(--color-surface))]" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-[rgb(var(--color-surface))]" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-[rgb(var(--color-surface))]" />
          </div>
        </div>
      ))}
    </div>
  )
}
