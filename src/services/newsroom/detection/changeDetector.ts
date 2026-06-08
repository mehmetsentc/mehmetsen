/**
 * Compare live RSS items against stored fingerprints — new | updated | removed.
 */
import type { RssFeedItem } from '@/services/rss/rssFetcher'
import {
  buildFingerprintRecord,
  computeContentHash,
  computeTitleHash,
  type SourceArticleFingerprint,
} from '@/services/newsroom/detection/sourceFingerprint'

export type ArticleChangeType = 'new' | 'updated' | 'removed' | 'unchanged'

export interface DetectedArticleChange {
  type: Exclude<ArticleChangeType, 'unchanged'>
  hash: string
  item: RssFeedItem
  existingNewsId?: string | null
  previousContentHash?: string
  fingerprint: SourceArticleFingerprint
}

export interface ChangeDetectionResult {
  changes: DetectedArticleChange[]
  unchanged: number
}

export function detectArticleChanges(
  items: RssFeedItem[],
  stored: Map<string, SourceArticleFingerprint>
): ChangeDetectionResult {
  const changes: DetectedArticleChange[] = []
  let unchanged = 0
  const seenHashes = new Set<string>()

  for (const item of items) {
    const hash = item.fingerprint
    seenHashes.add(hash)
    const contentHash = computeContentHash(item.title, item.summary, item.content)
    const previous = stored.get(hash)

    if (!previous) {
      changes.push({
        type: 'new',
        hash,
        item,
        fingerprint: buildFingerprintRecord(
          hash,
          item.guid,
          item.link,
          item.title,
          item.summary,
          item.content,
          item.publishedAt
        ),
      })
      continue
    }

    const titleHash = computeTitleHash(item.title)
    if (previous.contentHash !== contentHash || previous.titleHash !== titleHash) {
      const titleChanged = previous.titleHash !== titleHash
      const contentChanged = previous.contentHash !== contentHash

      if (titleChanged || contentChanged) {
        changes.push({
          type: 'updated',
          hash,
          item,
          existingNewsId: previous.newsId,
          previousContentHash: previous.contentHash,
          fingerprint: buildFingerprintRecord(
            hash,
            item.guid,
            item.link,
            item.title,
            item.summary,
            item.content,
            item.publishedAt,
            previous.newsId
          ),
        })
        continue
      }
    }

    unchanged += 1
  }

  for (const [hash, fp] of stored) {
    if (seenHashes.has(hash)) continue
    if (fp.removedAt) continue
    changes.push({
      type: 'removed',
      hash,
      item: {
        source: { id: '', label: '', feedUrl: '', maxItemsPerRun: 0, enabled: true },
        guid: fp.guid,
        link: fp.link,
        title: fp.title,
        summary: '',
        content: '',
        publishedAt: fp.publishedAt,
        imageUrl: null,
        fingerprint: hash,
      },
      existingNewsId: fp.newsId,
      fingerprint: { ...fp, removedAt: Date.now() },
    })
  }

  return { changes, unchanged }
}
