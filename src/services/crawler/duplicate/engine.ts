import { contentHashOf, hammingHex64, jaccardTokens, titleHashOf } from './hash'
import type { RawArticleRecord } from '../types'

export type DuplicateLevel = 1 | 2 | 3 | 4 | 5

export interface DuplicateHit {
  level: DuplicateLevel
  existingId: string
  reason: string
}

const SIMHASH_NEAR_THRESHOLD = 8
const TITLE_JACCARD_THRESHOLD = 0.86

export function isNearDuplicateSimhash(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return hammingHex64(a, b) <= SIMHASH_NEAR_THRESHOLD
}

export function hashesForArticle(title: string | null, body: string) {
  return {
    contentHash: body.trim() ? contentHashOf(body) : null,
    titleHash: title?.trim() ? titleHashOf(title) : null,
  }
}

export function evaluateExactDuplicate(opts: {
  canonicalUrl: string | null
  bodyText: string
  title: string | null
  simhash: string | null
  existingByNormalizedUrl?: string | null
  existingByCanonicalUrl?: string | null
  existingByContentHash?: string | null
  existingByTitleHash?: string | null
  nearCandidates?: Array<Pick<RawArticleRecord, 'id' | 'title' | 'simhash'>>
}): DuplicateHit | null {
  if (opts.existingByNormalizedUrl) {
    return { level: 1, existingId: opts.existingByNormalizedUrl, reason: 'normalized_url' }
  }
  if (opts.canonicalUrl && opts.existingByCanonicalUrl) {
    return { level: 2, existingId: opts.existingByCanonicalUrl, reason: 'canonical_url' }
  }
  if (opts.bodyText.length >= 80 && opts.existingByContentHash) {
    return { level: 3, existingId: opts.existingByContentHash, reason: 'content_hash' }
  }
  if (opts.title && opts.existingByTitleHash) {
    return { level: 4, existingId: opts.existingByTitleHash, reason: 'title_hash' }
  }

  const title = opts.title || ''
  for (const candidate of opts.nearCandidates || []) {
    if (isNearDuplicateSimhash(opts.simhash, candidate.simhash)) {
      return { level: 5, existingId: candidate.id, reason: 'simhash' }
    }
    if (title && candidate.title && jaccardTokens(title, candidate.title) >= TITLE_JACCARD_THRESHOLD) {
      return { level: 5, existingId: candidate.id, reason: 'title_jaccard' }
    }
  }
  return null
}
