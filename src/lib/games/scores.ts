export type GameScoreMetric = 'score' | 'time' | 'wins'

/** Doc id: `${gameSlug}__${userId}` */
export function gameScoreDocId(gameSlug: string, userId: string): string {
  return `${gameSlug}__${userId}`
}

export interface GameScoreRecord {
  gameSlug: string
  userId: string
  username: string
  displayName: string
  metric: GameScoreMetric
  /** Sıralama için: her zaman yüksek olan daha iyi */
  sortValue: number
  /** Kullanıcıya gösterilen değer (skor / saniye / galibiyet) */
  displayValue: number
  lastValue: number
  plays: number
  wins: number
  updatedAt: number
}

/** Time (saniye) → sortValue (yüksek = daha hızlı) */
export function timeToSortValue(seconds: number): number {
  const s = Math.max(0, Math.round(seconds))
  return Math.max(0, 1_000_000 - s)
}

export function sortValueToDisplay(
  metric: GameScoreMetric,
  _sortValue: number,
  displayValue: number
): string {
  if (metric === 'time') {
    const sec = displayValue
    const m = Math.floor(sec / 60)
    const r = sec % 60
    return m > 0 ? `${m}:${r.toString().padStart(2, '0')}` : `${sec}s`
  }
  if (metric === 'wins') return `${displayValue} galibiyet`
  return String(displayValue)
}
