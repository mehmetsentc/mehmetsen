interface InfographicStat {
  label: string
  value: string
  unit?: string
}

interface InfographicBlockProps {
  title?: string
  stats: InfographicStat[]
  source?: string
}

/** Data-story infographic block for articles and feeds. */
export function InfographicBlock({ title, stats, source }: InfographicBlockProps) {
  if (stats.length === 0) return null

  return (
    <figure
      className="my-8 overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]"
      aria-label={title ?? 'İnfografik'}
    >
      {title ? (
        <figcaption className="border-b border-[rgb(var(--color-border))] px-5 py-3 text-sm font-bold text-[rgb(var(--color-text))]">
          {title}
        </figcaption>
      ) : null}
      <div className="grid grid-cols-2 gap-px bg-[rgb(var(--color-border))] sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center justify-center bg-[rgb(var(--color-card))] px-4 py-6 text-center"
          >
            <p className="text-2xl font-black tabular-nums text-[rgb(var(--color-brand))]">
              {stat.value}
              {stat.unit ? (
                <span className="ml-0.5 text-base font-semibold text-[rgb(var(--color-muted))]">
                  {stat.unit}
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
      {source ? (
        <p className="px-5 py-2 text-[11px] text-[rgb(var(--color-muted))]">Kaynak: {source}</p>
      ) : null}
    </figure>
  )
}
