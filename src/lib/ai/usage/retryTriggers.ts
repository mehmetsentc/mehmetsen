import { contentHasIncompleteSegments, titleLooksIncomplete } from '@/lib/ai/textCompleteness'
import { countPlainWords, isNewsBodyTooShort, MIN_NEWS_BODY_WORDS } from '@/lib/contentQuality'

export const CONTINUATION_TRIGGERS = [
  'body_too_short',
  'incomplete_segment',
  'title_incomplete',
  'actual_truncation',
] as const

export const QUALITY_RETRY_TRIGGERS = [
  'draft',
  'publish_score_low',
  'category_confidence_zero',
  'body_short',
  'incomplete_content',
] as const

export type ContinuationTrigger = (typeof CONTINUATION_TRIGGERS)[number]
export type QualityRetryTrigger = (typeof QUALITY_RETRY_TRIGGERS)[number]
export type RetryTrigger = ContinuationTrigger | QualityRetryTrigger

const CONTINUATION_SET = new Set<string>(CONTINUATION_TRIGGERS)
const QUALITY_SET = new Set<string>(QUALITY_RETRY_TRIGGERS)

/** Drop anything that is not a closed enum — never persist free text. */
export function sanitizeRetryTriggers(raw: unknown): RetryTrigger[] {
  if (!Array.isArray(raw)) return []
  const out: RetryTrigger[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    if (!CONTINUATION_SET.has(item) && !QUALITY_SET.has(item)) continue
    if (seen.has(item)) continue
    seen.add(item)
    out.push(item as RetryTrigger)
  }
  return out
}

function looksLikeActualTruncation(content: string): boolean {
  const t = content.replace(/\s+/g, ' ').trim()
  if (!t) return false
  const words = countPlainWords(t)
  const longEnough = words >= MIN_NEWS_BODY_WORDS || t.length >= 800
  if (!longEnough) return false
  const endsWithCloser = /[.!?…:;"»')\]]$/.test(t)
  if (endsWithCloser) return false
  if (/[-–—]$/.test(t)) return true
  const last = t.split(/\s+/).pop() ?? ''
  return last.length >= 2 && /[a-zçğıöşü]$/iu.test(last)
}

export function classifyContinuationTriggers(input: {
  title?: string | null
  spot?: string | null
  summary?: string | null
  content?: string | null
}): ContinuationTrigger[] {
  const out: ContinuationTrigger[] = []
  if (titleLooksIncomplete(input.title || '')) out.push('title_incomplete')
  if (isNewsBodyTooShort(input.content)) out.push('body_too_short')
  if (
    contentHasIncompleteSegments(input.spot || '') ||
    contentHasIncompleteSegments(input.summary || '') ||
    contentHasIncompleteSegments(input.content || '')
  ) {
    out.push('incomplete_segment')
  }
  if (looksLikeActualTruncation(input.content || '')) out.push('actual_truncation')
  return out
}

export function classifyQualityRetryTriggers(input: {
  gateDecision?: string | null
  publishScore?: number | null
  categoryConfidence?: number | null
  title?: string | null
  spot?: string | null
  summary?: string | null
  description?: string | null
}): QualityRetryTrigger[] {
  const out: QualityRetryTrigger[] = []
  if (input.gateDecision === 'draft') out.push('draft')
  if ((input.publishScore ?? 0) < 60) out.push('publish_score_low')
  if ((input.categoryConfidence ?? 0) === 0) out.push('category_confidence_zero')
  if (isNewsBodyTooShort(input.description)) out.push('body_short')
  if (
    titleLooksIncomplete(input.title || '') ||
    contentHasIncompleteSegments(input.spot || '') ||
    contentHasIncompleteSegments(input.summary || '') ||
    contentHasIncompleteSegments(input.description || '')
  ) {
    out.push('incomplete_content')
  }
  return out
}
