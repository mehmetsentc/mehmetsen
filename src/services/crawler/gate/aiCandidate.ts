import { isValidLanguageTag } from '../language'
import type { CrawlerAiEligibility, NewsSourceRecord, RawArticleRecord } from '../types'

export interface AiGateInput {
  source: Pick<NewsSourceRecord, 'status'>
  article: Pick<
    RawArticleRecord,
    | 'title'
    | 'articleBodyText'
    | 'extractionConfidence'
    | 'language'
    | 'publishedAt'
    | 'isExactDuplicate'
    | 'fetchedAt'
  >
  clusterHasBetterEligible: boolean
  cacheHit: boolean
  now?: Date
}

export interface AiGateResult {
  eligibility: CrawlerAiEligibility
  reason: string | null
  avoidedAi: boolean
}

const MIN_BODY = 400
const MAX_AGE_MS = 72 * 60 * 60 * 1000

function looksLikeSpam(text: string): boolean {
  const compact = text.replace(/\s+/g, '')
  if (!compact) return true
  const letters = compact.replace(/[^\p{L}]/gu, '')
  if (letters.length < 40) return true
  const upper = letters.replace(/[^\p{Lu}]/gu, '').length
  if (letters.length > 80 && upper / letters.length > 0.65) return true
  if (/(buy now|click here|xxx|crypto giveaway)/i.test(text) && text.length < 800) return true
  return false
}

/** Deterministic AI cost gate. Phase 0 never calls an LLM. */
export function evaluateAiCandidate(input: AiGateInput): AiGateResult {
  if (input.source.status === 'DISABLED' || input.source.status === 'PAUSED') {
    return { eligibility: 'SKIPPED', reason: 'source_blocked', avoidedAi: true }
  }
  if (input.article.isExactDuplicate) {
    return { eligibility: 'SKIPPED', reason: 'duplicate', avoidedAi: true }
  }
  if (input.cacheHit) {
    return { eligibility: 'SKIPPED', reason: 'ai_cache_hit', avoidedAi: true }
  }
  const body = input.article.articleBodyText?.trim() || ''
  if (body.length < MIN_BODY) {
    return { eligibility: 'SKIPPED', reason: 'too_short', avoidedAi: true }
  }
  if ((input.article.extractionConfidence ?? 0) < 0.4) {
    return { eligibility: 'SKIPPED', reason: 'low_confidence', avoidedAi: true }
  }
  if (!isValidLanguageTag(input.article.language)) {
    return { eligibility: 'SKIPPED', reason: 'invalid_language', avoidedAi: true }
  }
  const now = input.now ?? new Date()
  if (input.article.publishedAt) {
    const age = now.getTime() - input.article.publishedAt.getTime()
    if (age > MAX_AGE_MS) {
      return { eligibility: 'SKIPPED', reason: 'too_old', avoidedAi: true }
    }
  }
  if (looksLikeSpam(body)) {
    return { eligibility: 'SKIPPED', reason: 'spam', avoidedAi: true }
  }
  if (input.clusterHasBetterEligible) {
    return { eligibility: 'SKIPPED', reason: 'cluster_better_exists', avoidedAi: true }
  }
  return { eligibility: 'ELIGIBLE', reason: null, avoidedAi: false }
}
