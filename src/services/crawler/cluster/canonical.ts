import type { NewsSourceRecord, RawArticleRecord } from '../types'

export function selectCanonicalArticle(
  members: Array<{ article: RawArticleRecord; source: NewsSourceRecord | null }>
): RawArticleRecord | null {
  if (!members.length) return null
  let best = members[0]
  let bestScore = -1
  for (const row of members) {
    const health = row.source?.healthScore ?? 50
    const conf = row.article.extractionConfidence ?? 0
    const words = Math.min((row.article.wordCount ?? 0) / 800, 1)
    const titleLen = (row.article.title || '').trim().length
    const titleScore = titleLen >= 24 && titleLen <= 140 ? 1 : titleLen > 12 ? 0.6 : 0.2
    const fetched = row.article.fetchedAt?.getTime() ?? 0
    const freshness = fetched ? Math.min(1, fetched / (fetched + 1)) : 0
    const score = health * 0.35 + conf * 35 + words * 20 + titleScore * 15 + (row.source?.qualityTier === 'TIER_A' ? 8 : 0)
    void freshness
    if (score > bestScore) {
      bestScore = score
      best = row
    }
  }
  return best.article
}

const UPDATE_HINTS = [
  'tahliye',
  'söndür',
  'sondur',
  'kontrol altına',
  'kontrol altina',
  'ölü',
  'olu',
  'yaralı',
  'yarali',
  'evacuation',
  'contained',
  'death',
  'injured',
  'killed',
]

export function detectMaterialUpdate(opts: {
  existingTitle: string | null
  existingLead: string | null
  incomingTitle: string | null
  incomingLead: string | null
}): { hasMaterialUpdate: boolean; materialUpdateReason: string | null } {
  const prev = `${opts.existingTitle || ''} ${opts.existingLead || ''}`.toLocaleLowerCase('tr-TR')
  const next = `${opts.incomingTitle || ''} ${opts.incomingLead || ''}`.toLocaleLowerCase('tr-TR')
  for (const hint of UPDATE_HINTS) {
    if (next.includes(hint) && !prev.includes(hint)) {
      return { hasMaterialUpdate: true, materialUpdateReason: `new_signal:${hint}` }
    }
  }
  const prevNums: string[] = prev.match(/\d+(?:[.,]\d+)?/g) || []
  const nextNums: string[] = next.match(/\d+(?:[.,]\d+)?/g) || []
  if (nextNums.some((n) => !prevNums.includes(n)) && nextNums.length > prevNums.length) {
    return { hasMaterialUpdate: true, materialUpdateReason: 'new_numeric_detail' }
  }
  return { hasMaterialUpdate: false, materialUpdateReason: null }
}
