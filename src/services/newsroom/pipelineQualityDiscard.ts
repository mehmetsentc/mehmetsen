/**
 * After AI rewrite: worthless copy is deleted (queue skip), not parked as a draft.
 * Safety holds (moderation, kill switch, persona approval) still draft.
 *
 * Completeness checks MUST stay identical for final discard and Stage1 fail-fast.
 */
import { contentHasIncompleteSegments, titleLooksIncomplete } from '@/lib/ai/textCompleteness'
import { countPlainWords, isNewsBodyTooShort } from '@/lib/contentQuality'

export type QualityDiscardReason = 'body_too_short' | 'incomplete_text' | 'fact_check_failed'
export type CompletenessDiscardReason = 'body_too_short' | 'incomplete_text'

export type ArticleCompletenessInput = {
  title?: string | null
  spot?: string | null
  summary?: string | null
  description?: string | null
}

export type ArticleCompleteness = {
  bodyTooShort: boolean
  incompleteText: boolean
  wordCount: number
  charCount: number
  reason: CompletenessDiscardReason | null
}

export function qualityDiscardReason(opts: {
  bodyTooShort: boolean
  incompleteText: boolean
  factCheckFailedBadly: boolean
}): QualityDiscardReason | null {
  if (opts.bodyTooShort) return 'body_too_short'
  if (opts.incompleteText) return 'incomplete_text'
  if (opts.factCheckFailedBadly) return 'fact_check_failed'
  return null
}

export function qualityDiscardSkipReason(reason: QualityDiscardReason): string {
  return `quality:${reason}`
}

/**
 * Same predicates as the final pipeline quality discard (minus fact-check).
 * Fail-fast and final validation must share this helper so reasons cannot drift.
 */
export function evaluateArticleCompleteness(article: ArticleCompletenessInput): ArticleCompleteness {
  const description = article.description || ''
  const bodyTooShort = isNewsBodyTooShort(description)
  const incompleteText =
    titleLooksIncomplete(article.title || '') ||
    contentHasIncompleteSegments(description) ||
    contentHasIncompleteSegments(article.spot || '') ||
    contentHasIncompleteSegments(article.summary || '')
  const ranked = qualityDiscardReason({
    bodyTooShort,
    incompleteText,
    factCheckFailedBadly: false,
  })
  const reason: CompletenessDiscardReason | null =
    ranked === 'body_too_short' || ranked === 'incomplete_text' ? ranked : null
  return {
    bodyTooShort,
    incompleteText,
    wordCount: countPlainWords(description),
    charCount: description.trim().length,
    reason,
  }
}
