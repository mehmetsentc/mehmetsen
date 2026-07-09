export function formatNewsDate(value?: string): string | null {
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

export function formatNewsDateLong(): string {
  return new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

/** BBC MORE satırı: "1 Tem 2026" */
export function formatNewsDateBbc(value?: string | number): string | null {
  if (value == null) return null
  const iso = typeof value === 'number' ? new Date(value).toISOString() : value
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return null
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed)
}

/** BBC tarzı "3 sa önce | Gündem" meta satırı */
export function formatNewsRelative(value?: string): string | null {
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null

  const diffMin = Math.floor((Date.now() - parsed) / 60_000)
  if (diffMin < 1) return 'Az önce'
  if (diffMin < 60) return `${diffMin} dk önce`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} sa önce`

  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay} gün önce`

  return formatNewsDate(value)
}
