import { hammingHex64 } from '../duplicate/hash'
import { jaccard, localeLower, WEAK_EVENT_TOKENS } from './normalize'
import { strongNamedTokens, tokenOverlapScore, type EventFingerprint } from './fingerprint'

export interface ClusterMatchBreakdown {
  titleSimilarity: number
  tokenOverlap: number
  entityOverlap: number
  timeScore: number
  geoScore: number
  numericOverlap: number
  final: number
}

export const MATCH_WEIGHTS = {
  titleSimilarity: 0.28,
  tokenOverlap: 0.22,
  entityOverlap: 0.18,
  timeScore: 0.12,
  geoScore: 0.12,
  numericOverlap: 0.08,
} as const

export const HIGH_MATCH = 0.8
export const BORDERLINE_MATCH = 0.64
export const MATCH_HORIZON_MS = 24 * 60 * 60 * 1000

export type MatchBand = 'HIGH' | 'BORDERLINE' | 'LOW'

export interface ClusterMatchTarget {
  fingerprint: EventFingerprint
  lastSeenAt: Date
  firstSeenAt: Date
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function timeScore(articleAt: Date | null, clusterLast: Date, now: Date): number {
  const t = articleAt?.getTime() ?? now.getTime()
  const delta = Math.abs(t - clusterLast.getTime())
  if (delta > MATCH_HORIZON_MS) return 0
  return clamp01(1 - delta / MATCH_HORIZON_MS)
}

function geoScore(a: EventFingerprint, b: EventFingerprint): { score: number; mismatch: boolean } {
  if (a.countryCode && b.countryCode && a.countryCode !== b.countryCode) {
    return { score: 0, mismatch: true }
  }
  if (a.city && b.city && a.city !== b.city) return { score: 0, mismatch: true }
  if (a.district && b.district && a.district !== b.district) return { score: 0.2, mismatch: true }
  if (a.city && b.city && a.city === b.city) {
    if (a.district && b.district && a.district === b.district) return { score: 1, mismatch: false }
    return { score: 0.9, mismatch: false }
  }
  if (a.region && b.region && localeLower(a.region, a.language) === localeLower(b.region, b.language)) {
    return { score: 0.6, mismatch: false }
  }
  if (a.countryCode && b.countryCode && a.countryCode === b.countryCode) {
    return { score: 0.45, mismatch: false }
  }
  return { score: 0.35, mismatch: false }
}

function numericScore(a: string[], b: string[]): { score: number; mismatch: boolean } {
  if (!a.length || !b.length) return { score: 0.5, mismatch: false }
  const inter = a.filter((n) => b.includes(n))
  const score = inter.length / new Set([...a, ...b]).size
  const bothHaveMagnitude = a.some((n) => n.includes('.')) && b.some((n) => n.includes('.'))
  if (bothHaveMagnitude && inter.length === 0) return { score: 0, mismatch: true }
  return { score, mismatch: false }
}

export function scoreClusterMatch(
  article: EventFingerprint,
  cluster: ClusterMatchTarget,
  now = new Date()
): ClusterMatchBreakdown & { band: MatchBand; blockedReason: string | null } {
  const titleSimilarity = Math.max(
    jaccard(article.titleShingles, cluster.fingerprint.titleShingles),
    jaccard(article.titleTokens, cluster.fingerprint.titleTokens)
  )
  const tokenOverlap = tokenOverlapScore(
    [...article.titleTokens, ...article.leadTokens.slice(0, 20)],
    [...cluster.fingerprint.titleTokens, ...cluster.fingerprint.leadTokens.slice(0, 20)]
  )
  const entityOverlap = tokenOverlapScore(article.namedTokens, cluster.fingerprint.namedTokens)
  const time = timeScore(article.publishedAt, cluster.lastSeenAt, now)
  const geo = geoScore(article, cluster.fingerprint)
  const numeric = numericScore(article.numbers, cluster.fingerprint.numbers)
  let simBonus = 0
  if (article.simhash && cluster.fingerprint.simhash) {
    const dist = hammingHex64(article.simhash, cluster.fingerprint.simhash)
    if (dist <= 8) simBonus = 0.06
  }

  const final = clamp01(
    titleSimilarity * MATCH_WEIGHTS.titleSimilarity +
      tokenOverlap * MATCH_WEIGHTS.tokenOverlap +
      entityOverlap * MATCH_WEIGHTS.entityOverlap +
      time * MATCH_WEIGHTS.timeScore +
      geo.score * MATCH_WEIGHTS.geoScore +
      numeric.score * MATCH_WEIGHTS.numericOverlap +
      simBonus
  )

  const strongOverlap = strongNamedTokens(article.namedTokens).filter((t) =>
    cluster.fingerprint.namedTokens.includes(t) ||
    cluster.fingerprint.namedTokens.some((o) => t.length >= 5 && o.startsWith(t.slice(0, 5)))
  )
  const weakShared = [...WEAK_EVENT_TOKENS].some((w) => {
    const poolA = [...article.namedTokens, ...article.titleTokens]
    const poolB = [...cluster.fingerprint.namedTokens, ...cluster.fingerprint.titleTokens]
    const inA = poolA.some((t) => t === w || t.startsWith(w) || (t.length >= 5 && w.startsWith(t)))
    const inB = poolB.some((t) => t === w || t.startsWith(w) || (t.length >= 5 && w.startsWith(t)))
    return inA && inB
  })
  let blocked: string | null = null
  if (geo.mismatch) blocked = 'geography_mismatch'
  else if (numeric.mismatch) blocked = 'numeric_mismatch'
  else if (time < 0.2) blocked = 'time_separated'
  else if (strongOverlap.length === 0 && titleSimilarity < 0.72) blocked = 'weak_entity_overlap'

  let band: MatchBand = 'LOW'
  const highOk =
    !blocked &&
    final >= HIGH_MATCH &&
    (titleSimilarity >= 0.45 || tokenOverlap >= 0.5) &&
    (entityOverlap >= 0.35 || (geo.score >= 0.85 && tokenOverlap >= 0.4))
  if (highOk) band = 'HIGH'
  else if (!blocked && article.eventKey && article.eventKey === cluster.fingerprint.eventKey && time >= 0.5 && titleSimilarity >= 0.28) {
    band = 'HIGH'
  }
  else if (
    !blocked &&
    strongOverlap.length >= 1 &&
    (weakShared ||
      article.namedTokens.some((t) => WEAK_EVENT_TOKENS.has(t) && cluster.fingerprint.namedTokens.includes(t))) &&
    geo.score >= 0.8 &&
    time >= 0.5
  ) {
    band = 'HIGH'
  }
  else if (!blocked && strongOverlap.length >= 1 && titleSimilarity >= 0.42 && entityOverlap >= 0.35) {
    band = 'HIGH'
  }
  else if (!blocked && final >= BORDERLINE_MATCH) band = 'BORDERLINE'

  return {
    titleSimilarity: round4(titleSimilarity),
    tokenOverlap: round4(tokenOverlap),
    entityOverlap: round4(entityOverlap),
    timeScore: round4(time),
    geoScore: round4(geo.score),
    numericOverlap: round4(numeric.score),
    final: round4(final),
    band,
    blockedReason: blocked,
  }
}

function round4(n: number): number {
  return Number(n.toFixed(4))
}
