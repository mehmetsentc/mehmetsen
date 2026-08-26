import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { PublisherArticleItem, PublisherArticlePage } from '@/types/publisher'

function parsePublishedAt(value: unknown): Date | null {
  if (value == null) return null
  if (value instanceof Date) return value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value)
  if (typeof value === 'string') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const maybe = value as { toDate?: () => Date }
    if (typeof maybe.toDate === 'function') return maybe.toDate()
  }
  return null
}

function encodeCursor(publishedAt: Date, id: string): string {
  return Buffer.from(`${publishedAt.getTime()}:${id}`, 'utf8').toString('base64url')
}

function decodeCursor(cursor: string): { publishedAtMs: number; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8')
    const sep = raw.lastIndexOf(':')
    if (sep <= 0) return null
    const publishedAtMs = Number(raw.slice(0, sep))
    const id = raw.slice(sep + 1)
    if (!Number.isFinite(publishedAtMs) || !id) return null
    return { publishedAtMs, id }
  } catch {
    return null
  }
}

function mapFirestoreDoc(
  docId: string,
  data: FirebaseFirestore.DocumentData,
  sourceId: string
): PublisherArticleItem | null {
  if (String(data.status ?? '') !== 'published') return null
  const title = String(data.title ?? '').trim()
  const slug = String(data.slug ?? docId).trim()
  if (!title || !slug) return null

  const publishedAt =
    parsePublishedAt(data.publishedAt) ??
    parsePublishedAt(data.createdAt) ??
    parsePublishedAt(data.updatedAt)

  const thumbnailUrl =
    String(data.coverImageUrl ?? data.thumbnail ?? data.imageUrl ?? '').trim() || null

  return {
    id: docId,
    slug,
    title,
    summary: typeof data.summary === 'string' ? data.summary : null,
    thumbnailUrl,
    publishedAt,
    sourceId,
  }
}

/** Firestore fallback for published news not yet mirrored in Postgres. */
export async function fetchFirestorePublisherArticles(input: {
  sourceIds: string[]
  limit: number
  cursor?: string | null
  excludeIds?: Set<string>
}): Promise<PublisherArticlePage> {
  const limit = Math.min(Math.max(input.limit, 1), 48)
  const excludeIds = input.excludeIds ?? new Set<string>()
  const sourceIds = [...new Set(input.sourceIds.filter(Boolean))].slice(0, 30)
  if (!sourceIds.length) return { items: [], nextCursor: null }

  const cursorInfo = input.cursor ? decodeCursor(input.cursor) : null
  const db = getAdminFirestore()
  const perSourceLimit = Math.min(limit + excludeIds.size + 5, 40)
  const collected: PublisherArticleItem[] = []

  for (const sourceId of sourceIds) {
    if (collected.length >= limit + 1) break
    try {
      const snap = await db
        .collection(Collections.NEWS)
        .where('ingestionSourceId', '==', sourceId)
        .where('status', '==', 'published')
        .orderBy('publishedAt', 'desc')
        .limit(perSourceLimit)
        .get()

      for (const doc of snap.docs) {
        const item = mapFirestoreDoc(doc.id, doc.data(), sourceId)
        if (!item || excludeIds.has(item.id)) continue
        if (cursorInfo) {
          const ms = item.publishedAt?.getTime() ?? 0
          if (ms > cursorInfo.publishedAtMs) continue
          if (ms === cursorInfo.publishedAtMs && item.id >= cursorInfo.id) continue
        }
        collected.push(item)
      }
    } catch (err) {
      console.warn('[publisher] firestore article fallback failed', { sourceId, err })
    }
  }

  collected.sort((a, b) => {
    const am = a.publishedAt?.getTime() ?? 0
    const bm = b.publishedAt?.getTime() ?? 0
    if (bm !== am) return bm - am
    return a.id.localeCompare(b.id)
  })

  const items = collected.slice(0, limit)
  const last = items[items.length - 1]
  const nextCursor =
    collected.length > limit && last?.publishedAt
      ? encodeCursor(last.publishedAt, last.id)
      : null

  return { items, nextCursor }
}

export { encodeCursor as encodePublisherArticleCursor, decodeCursor as decodePublisherArticleCursor }
