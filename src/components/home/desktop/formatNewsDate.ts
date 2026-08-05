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

const clockFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false })
const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' })

/** SonDakika-style clock: "00:03" (today), "Dün 22:24" (yesterday), "5 Ağu 14:30" (older) */
export function formatNewsClock(value?: string | number): string | null {
  if (value == null) return null
  const ms = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(ms)) return null

  const now = new Date()
  const d = new Date(ms)
  const time = clockFmt.format(d)

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86_400_000

  if (ms >= todayStart) return time
  if (ms >= yesterdayStart) return `Dün ${time}`
  return `${dateFmt.format(d)} ${time}`
}
