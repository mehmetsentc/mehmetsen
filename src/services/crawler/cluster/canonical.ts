import type { NewsSourceRecord, RawArticleRecord } from '../types'

export type PrimarySelectionResult = {
  article: RawArticleRecord
  score: number
  reasons: string[]
}

export function scorePrimaryCandidate(row: {
  article: RawArticleRecord
  source: NewsSourceRecord | null
}): { score: number; reasons: string[] } {
  const health = row.source?.healthScore ?? 50
  const conf = row.article.extractionConfidence ?? 0
  const words = row.article.wordCount ?? 0
  const titleLen = (row.article.title || '').trim().length
  const titleScore = titleLen >= 24 && titleLen <= 140 ? 1 : titleLen > 12 ? 0.6 : 0.2
  const boilerplate = row.article.boilerplateRatio ?? 0
  const linkDensity = row.article.linkDensity ?? 0
  const hasImage = Boolean(row.article.mainImageUrl)
  const structured = Boolean(row.article.canonicalUrl && row.article.publishedAt)
  const completeness =
    (row.article.articleBodyText ? 1 : 0) + (row.article.author ? 0.3 : 0) + (row.article.publishedAt ? 0.3 : 0)
  const freshnessHours = (() => {
    const t = row.article.publishedAt || row.article.fetchedAt
    if (!t) return 48
    return Math.max(0, (Date.now() - t.getTime()) / 3600_000)
  })()
  const freshness = Math.max(0, 1 - freshnessHours / 72)
  const tierBonus = row.source?.qualityTier === 'TIER_A' ? 10 : row.source?.qualityTier === 'TIER_B' ? 5 : 0
  const score =
    health * 0.25 +
    conf * 28 +
    Math.min(words / 800, 1) * 18 +
    titleScore * 10 +
    (1 - Math.min(1, boilerplate)) * 8 +
    (1 - Math.min(1, linkDensity)) * 6 +
    (hasImage ? 8 : 0) +
    (structured ? 6 : 0) +
    completeness * 4 +
    freshness * 6 +
    tierBonus

  const reasons: string[] = []
  if (conf >= 0.7) reasons.push('high extraction confidence')
  if (words >= 200) reasons.push('full body')
  if (row.source?.qualityTier === 'TIER_A' || health >= 75) reasons.push('trusted source')
  if (row.article.publishedAt) reasons.push('valid publication timestamp')
  if (hasImage) reasons.push('valid hero image')
  if (boilerplate < 0.2) reasons.push('low boilerplate')
  if (linkDensity < 0.2) reasons.push('low link density')
  if (structured) reasons.push('structured metadata')
  if (!reasons.length) reasons.push('best available completeness')
  return { score: Number(score.toFixed(2)), reasons }
}

export function selectCanonicalArticle(
  members: Array<{ article: RawArticleRecord; source: NewsSourceRecord | null }>
): RawArticleRecord | null {
  return selectPrimaryArticle(members)?.article ?? null
}

export function selectPrimaryArticle(
  members: Array<{ article: RawArticleRecord; source: NewsSourceRecord | null }>
): PrimarySelectionResult | null {
  if (!members.length) return null
  let best: PrimarySelectionResult | null = null
  for (const row of members) {
    const scored = scorePrimaryCandidate(row)
    if (!best || scored.score > best.score) {
      best = { article: row.article, score: scored.score, reasons: scored.reasons }
    }
  }
  return best
}

const UPDATE_HINTS: Array<{ needle: string; reason: string }> = [
  { needle: 'tahliye', reason: 'evacuation' },
  { needle: 'söndür', reason: 'fire controlled' },
  { needle: 'sondur', reason: 'fire controlled' },
  { needle: 'kontrol altına', reason: 'fire controlled' },
  { needle: 'kontrol altina', reason: 'fire controlled' },
  { needle: 'söndürüldü', reason: 'fire controlled' },
  { needle: 'ölü', reason: 'death toll' },
  { needle: 'olu', reason: 'death toll' },
  { needle: 'can kaybı', reason: 'death toll' },
  { needle: 'can kaybi', reason: 'death toll' },
  { needle: 'yaralı', reason: 'casualty update' },
  { needle: 'yarali', reason: 'casualty update' },
  { needle: 'gözaltı', reason: 'arrest' },
  { needle: 'gozalti', reason: 'arrest' },
  { needle: 'tutukla', reason: 'arrest' },
  { needle: 'açıklama', reason: 'official statement' },
  { needle: 'aciklama', reason: 'official statement' },
  { needle: 'bakanlık', reason: 'official statement' },
  { needle: 'skor', reason: 'score' },
  { needle: 'büyüklüğünde', reason: 'magnitude' },
  { needle: 'buyuklugunde', reason: 'magnitude' },
  { needle: 'evacuation', reason: 'evacuation' },
  { needle: 'contained', reason: 'fire controlled' },
  { needle: 'death', reason: 'death toll' },
  { needle: 'injured', reason: 'casualty update' },
  { needle: 'killed', reason: 'death toll' },
  { needle: 'arrest', reason: 'arrest' },
  { needle: 'magnitude', reason: 'magnitude' },
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
    if (next.includes(hint.needle) && !prev.includes(hint.needle)) {
      return { hasMaterialUpdate: true, materialUpdateReason: hint.reason }
    }
  }
  const prevNums: string[] = prev.match(/\d+(?:[.,]\d+)?/g) || []
  const nextNums: string[] = next.match(/\d+(?:[.,]\d+)?/g) || []
  if (nextNums.some((n) => !prevNums.includes(n)) && nextNums.length > prevNums.length) {
    return { hasMaterialUpdate: true, materialUpdateReason: 'new_numeric_detail' }
  }
  return { hasMaterialUpdate: false, materialUpdateReason: null }
}
