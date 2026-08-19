'use client'

export function BulkToolbar({
  count,
  pageHint,
  matchingHint,
  onSelectMatching,
  onClear,
  children,
}: {
  count: number
  pageHint?: string | null
  matchingHint?: string | null
  onSelectMatching?: () => void
  onClear: () => void
  children: React.ReactNode
}) {
  if (count <= 0) return null
  return (
    <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-3 text-sm shadow-sm">
      <strong>{count} kayıt seçildi</strong>
      {pageHint ? <span className="text-[rgb(var(--color-muted))]">{pageHint}</span> : null}
      {matchingHint && onSelectMatching ? (
        <button type="button" className="underline" onClick={onSelectMatching}>
          {matchingHint}
        </button>
      ) : null}
      {children}
      <button type="button" className="underline" onClick={onClear}>
        Seçimi Temizle
      </button>
    </div>
  )
}
