/**
 * After AI rewrite: worthless copy is deleted (queue skip), not parked as a draft.
 * Safety holds (moderation, kill switch, persona approval) still draft.
 */
export type QualityDiscardReason = 'body_too_short' | 'incomplete_text' | 'fact_check_failed'

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
