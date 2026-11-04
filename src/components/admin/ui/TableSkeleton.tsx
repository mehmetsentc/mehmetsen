/**
 * ADMIN-UX-1 — loading placeholder for admin tables. Use while data is on its way so an
 * empty table is never mistaken for «no data».
 */
export function TableSkeleton({ rows = 8, cols = 6, label = 'Yükleniyor…' }: { rows?: number; cols?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <span className="sr-only">{label}</span>
      <div className="flex gap-3 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 flex-1 animate-pulse rounded bg-[rgb(var(--color-border))]" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 border-b border-[rgb(var(--color-border))] px-3 py-3 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-3 flex-1 animate-pulse rounded bg-[rgb(var(--color-surface))]" style={{ opacity: 1 - c * 0.08 }} />
          ))}
        </div>
      ))}
    </div>
  )
}
