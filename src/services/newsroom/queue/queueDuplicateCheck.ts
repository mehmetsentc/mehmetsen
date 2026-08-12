/**
 * Pre-AI duplicate detection for newsQueue items.
 * Skips DeepSeek/Gemini when the article already exists or is near-duplicate.
 */
import type { Firestore } from 'firebase-admin/firestore'
import { Collections } from '@/lib/firebase/collections'
import { findSimilarPublishedArticle } from '@/services/newsroom/dedupe/similarityEngine'
import { findStoryLibraryMatch } from '@/services/newsroom/dedupe/storyLibraryService'
import type { NewsQueueDocument } from '@/services/newsroom/queue/types'

export interface QueueDuplicateHit {
  reason: string
  existingNewsId?: string
  /** True when matched via newsroomStoryLibrary (cross-source topic gate) */
  libraryHit?: boolean
  matchMethod?: string
}

async function findExistingByFingerprint(
  db: Firestore,
  fingerprint: string
): Promise<{ id: string; collection: 'news' | 'newsDrafts' } | null> {
  const [newsSnap, draftSnap] = await Promise.all([
    db.collection(Collections.NEWS).where('rssFingerprint', '==', fingerprint).limit(1).get(),
    db.collection(Collections.NEWS_DRAFTS).where('rssFingerprint', '==', fingerprint).limit(1).get(),
  ])

  if (!newsSnap.empty) return { id: newsSnap.docs[0]!.id, collection: 'news' }
  if (!draftSnap.empty) return { id: draftSnap.docs[0]!.id, collection: 'newsDrafts' }
  return null
}

async function findExistingBySourceUrl(
  db: Firestore,
  sourceUrl: string
): Promise<{ id: string; collection: 'news' | 'newsDrafts' } | null> {
  const [newsSnap, draftSnap] = await Promise.all([
    db.collection(Collections.NEWS).where('sourceUrl', '==', sourceUrl).limit(1).get(),
    db.collection(Collections.NEWS_DRAFTS).where('sourceUrl', '==', sourceUrl).limit(1).get(),
  ])

  if (!newsSnap.empty) return { id: newsSnap.docs[0]!.id, collection: 'news' }
  if (!draftSnap.empty) return { id: draftSnap.docs[0]!.id, collection: 'newsDrafts' }
  return null
}

async function findLinkedNewsFromFingerprint(
  db: Firestore,
  sourceId: string,
  hash: string
): Promise<string | null> {
  const snap = await db
    .collection(Collections.SOURCE_FINGERPRINTS)
    .doc(sourceId)
    .collection('articles')
    .doc(hash)
    .get()
  if (!snap.exists) return null
  const newsId = (snap.data() as { newsId?: string | null })?.newsId
  return typeof newsId === 'string' && newsId.trim() ? newsId.trim() : null
}

/**
 * Returns duplicate hit info or null when the item should proceed to the AI pipeline.
 */
export async function detectQueueDuplicate(
  db: Firestore,
  data: NewsQueueDocument
): Promise<QueueDuplicateHit | null> {
  if (data.changeType === 'updated') return null

  const input = data.input
  const fingerprint =
    input.rssFingerprint ??
    data.fingerprintHash ??
    `${input.editorId}:${input.sourceUrl}`.slice(0, 128)

  const byFingerprint = await findExistingByFingerprint(db, fingerprint)
  if (byFingerprint && byFingerprint.id !== data.existingNewsId) {
    return { reason: 'duplicate', existingNewsId: byFingerprint.id }
  }

  if (data.sourceId && data.fingerprintHash) {
    const linkedId = await findLinkedNewsFromFingerprint(db, data.sourceId, data.fingerprintHash)
    if (linkedId && linkedId !== data.existingNewsId) {
      return { reason: 'duplicate', existingNewsId: linkedId }
    }
  }

  const sourceUrl = input.sourceUrl?.trim() ?? ''
  if (sourceUrl.startsWith('http')) {
    try {
      const byUrl = await findExistingBySourceUrl(db, sourceUrl)
      if (byUrl && byUrl.id !== data.existingNewsId) {
        return { reason: 'duplicate', existingNewsId: byUrl.id }
      }
    } catch (err) {
      console.warn('[queueDuplicateCheck] sourceUrl lookup failed:', err)
    }
  }

  const body = [input.originalSummary, input.originalContent].filter(Boolean).join(' ').slice(0, 500)

  const libraryMatch = await findStoryLibraryMatch(db, {
    title: input.originalTitle,
    body,
    sourceUrl: input.sourceUrl,
    rssFingerprint: fingerprint,
    citySlug: input.forcedCitySlug,
    existingNewsId: data.existingNewsId,
  })
  if (libraryMatch) {
    console.log(
      `[queueDuplicateCheck] duplicateLibraryHit ${libraryMatch.matchMethod}` +
        ` → ${libraryMatch.firstNewsId} (${libraryMatch.reason})`
    )
    return {
      reason: `duplicateLibraryHit:${libraryMatch.reason}`,
      existingNewsId: libraryMatch.firstNewsId,
      libraryHit: true,
      matchMethod: libraryMatch.matchMethod,
    }
  }

  const similar = await findSimilarPublishedArticle(db, input.originalTitle, body)
  if (similar && similar.newsId !== data.existingNewsId) {
    return { reason: 'duplicate', existingNewsId: similar.newsId }
  }

  return null
}
