import type { ArticleMediaRecord } from '../types'

export interface ArticleMediaSummary {
  mediaCount: number
  primaryUrl: string | null
  duplicateCount: number
  rejectedCount: number
}

export function summarizeArticleMedia(media: ArticleMediaRecord[]): ArticleMediaSummary {
  const rejectedCount = media.filter((m) => m.status === 'REJECTED').length
  const accepted = media.filter((m) => m.status !== 'REJECTED')
  const hashes = new Map<string, number>()
  for (const item of accepted) {
    const key = item.contentHash || item.perceptualHash || item.normalizedUrl
    hashes.set(key, (hashes.get(key) || 0) + 1)
  }
  let duplicateCount = 0
  for (const n of hashes.values()) {
    if (n > 1) duplicateCount += n - 1
  }
  const primary = media.find((m) => m.isPrimary && m.status !== 'REJECTED') || accepted[0]
  return {
    mediaCount: media.length,
    primaryUrl: primary?.sourceUrl ?? null,
    duplicateCount,
    rejectedCount,
  }
}
