import type { GeographicScope } from '../types'

export type ClusterAiEligibility = 'REJECTED' | 'WATCHING' | 'ELIGIBLE' | 'HIGH_PRIORITY'

export interface EligibilityInput {
  bestWordCount: number
  bestConfidence: number
  avgHealth: number
  uniqueSourceCount: number
  independentSourceCount: number
  exactDuplicateOnly: boolean
  staleHours: number
  namedTokenCount: number
  looksLikeNews: boolean
  geographicScope: GeographicScope
  hasLocalGeography: boolean
  importanceScore: number
  crawlPriority: 'BREAKING' | 'HIGH' | 'NORMAL' | 'LOW'
  watchingAgeMinutes: number
}

export interface EligibilityResult {
  eligibility: ClusterAiEligibility
  reason: string
}

export function evaluateClusterEligibility(input: EligibilityInput): EligibilityResult {
  if (input.exactDuplicateOnly) {
    return { eligibility: 'REJECTED', reason: 'exact_duplicate_only' }
  }
  if (input.bestWordCount < 80) {
    return { eligibility: 'REJECTED', reason: 'too_short' }
  }
  if (input.bestConfidence < 0.4) {
    return { eligibility: 'REJECTED', reason: 'low_confidence_extraction' }
  }
  if (input.staleHours > 72) {
    return { eligibility: 'REJECTED', reason: 'stale' }
  }
  if (input.namedTokenCount < 1) {
    return { eligibility: 'REJECTED', reason: 'insufficient_event_signal' }
  }
  if (input.avgHealth < 30) {
    return { eligibility: 'REJECTED', reason: 'bad_source_health' }
  }
  if (!input.looksLikeNews) {
    return { eligibility: 'REJECTED', reason: 'non_news_content' }
  }

  const strongSingle =
    input.bestWordCount >= 120 &&
    input.bestConfidence >= 0.7 &&
    input.avgHealth >= 60 &&
    input.staleHours <= 48 &&
    input.namedTokenCount >= 2

  const localSingleOk = input.hasLocalGeography && strongSingle && input.independentSourceCount >= 1
  const nationalWatchExpired = !input.hasLocalGeography && strongSingle && input.watchingAgeMinutes >= 90

  if (input.independentSourceCount >= 2 || localSingleOk || nationalWatchExpired) {
    const high =
      input.importanceScore >= 70 &&
      (input.independentSourceCount >= 2 || input.crawlPriority === 'BREAKING' || input.hasLocalGeography)
    if (high) return { eligibility: 'HIGH_PRIORITY', reason: 'breaking_or_high_confidence_event' }
    return { eligibility: 'ELIGIBLE', reason: localSingleOk ? 'strong_single_source_local' : 'sufficient_quality' }
  }

  return { eligibility: 'WATCHING', reason: 'single_source_waiting' }
}

export function looksLikeNewsText(title: string | null, body: string | null): boolean {
  const text = `${title || ''} ${body || ''}`.trim()
  if (text.length < 40) return false
  if (/(buy now|click here|xxx|crypto giveaway|kazanmak için tıkla)/i.test(text) && text.length < 600) {
    return false
  }
  return /[\p{L}]{8,}/u.test(text)
}
