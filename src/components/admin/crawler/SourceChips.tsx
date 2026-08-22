'use client'

export interface SourceChipItem {
  sourceId: string
  sourceName: string
  articleCount: number
}

export function SourceChips({
  sources,
  activeSourceId,
  onSelect,
}: {
  sources: SourceChipItem[]
  activeSourceId: string | null
  onSelect: (sourceId: string | null) => void
}) {
  if (!sources.length) return null

  const chipClass = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? 'bg-[rgb(var(--color-brand))] text-white'
        : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-border))]/40'
    }`

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button type="button" className={chipClass(!activeSourceId)} onClick={() => onSelect(null)}>
          Hepsi
        </button>
        {sources.map((s) => (
          <button
            key={s.sourceId}
            type="button"
            className={chipClass(activeSourceId === s.sourceId)}
            onClick={() => onSelect(s.sourceId)}
            title={`${s.sourceName} (${s.articleCount})`}
          >
            {s.sourceName}
            <span className="ml-1 opacity-70">({s.articleCount})</span>
          </button>
        ))}
      </div>
    </div>
  )
}
