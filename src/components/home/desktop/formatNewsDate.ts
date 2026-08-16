export function formatNewsDate(value?: string | number | null): string | null {
  return formatNewsDateBbc(value)
}

export function formatNewsDateLong(): string {
  return new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

/** Haber kartı tarihi — yalnızca gün (saat / “x önce” yok). */
export function formatNewsDateBbc(value?: string | number | null): string | null {
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

/** @deprecated Kartlarda göreli süre yok; tarih döner. */
export function formatNewsRelative(value?: string | number | null): string | null {
  return formatNewsDateBbc(value)
}

/** Mobil kart saati — paylaşım saati yerine yalnızca tarih. */
export function formatNewsClock(value?: string | number | null): string | null {
  return formatNewsDateBbc(value)
}
