import {
  collection,
  getDocs,
  orderBy,
  query,
  limit,
  startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { Collections, db } from '@/lib/firebase/firestore'
import { enqueueFirestoreRead } from '@/lib/firestoreQueue'
import { withTimeout } from '@/lib/asyncUtils'
import type { NewsArchiveDocument } from '@/types/news'

const PAGE_SIZE = 25
const QUERY_TIMEOUT_MS = 15_000

export interface AdminArchiveItem extends NewsArchiveDocument {
  id: string
}

function mapDoc(id: string, data: Record<string, unknown>): AdminArchiveItem {
  return {
    id,
    title: String(data.title ?? ''),
    summary: String(data.summary ?? ''),
    content: String(data.content ?? ''),
    categoryId: String(data.categoryId ?? ''),
    city: String(data.city ?? ''),
    district: String(data.district ?? ''),
    citySlug: String(data.citySlug ?? ''),
    country: String(data.country ?? 'Türkiye'),
    source: String(data.source ?? ''),
    sourceUrl: String(data.sourceUrl ?? ''),
    fingerprint: String(data.fingerprint ?? ''),
    sourceHash: String(data.sourceHash ?? ''),
    publishedAt: typeof data.publishedAt === 'number' ? data.publishedAt : null,
    archivedAt: typeof data.archivedAt === 'number' ? data.archivedAt : 0,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    confidenceScore: typeof data.confidenceScore === 'number' ? data.confidenceScore : 0,
    factCheckFlags: Array.isArray(data.factCheckFlags) ? data.factCheckFlags.map(String) : [],
    editorId: 'archive',
    status: 'archived',
    aiGenerated: Boolean(data.aiGenerated),
    originalTitle: String(data.originalTitle ?? ''),
    sourceLabel: String(data.sourceLabel ?? ''),
    ingestionSourceId: String(data.ingestionSourceId ?? ''),
    rssGuid: String(data.rssGuid ?? ''),
    thumbnail: String(data.thumbnail ?? ''),
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  }
}

export const adminArchiveService = {
  async list(after?: QueryDocumentSnapshot): Promise<{
    items: AdminArchiveItem[]
    lastDoc: QueryDocumentSnapshot | null
    hasMore: boolean
  }> {
    const q = after
      ? query(
          collection(db, Collections.NEWS_ARCHIVE),
          orderBy('archivedAt', 'desc'),
          startAfter(after),
          limit(PAGE_SIZE + 1)
        )
      : query(
          collection(db, Collections.NEWS_ARCHIVE),
          orderBy('archivedAt', 'desc'),
          limit(PAGE_SIZE + 1)
        )

    const snap = await withTimeout(
      enqueueFirestoreRead(() => getDocs(q)),
      QUERY_TIMEOUT_MS,
      'Arşiv yüklenemedi'
    )

    const docs = snap.docs
    const hasMore = docs.length > PAGE_SIZE
    const page = hasMore ? docs.slice(0, PAGE_SIZE) : docs

    return {
      items: page.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>)),
      lastDoc: page.length > 0 ? page[page.length - 1] : null,
      hasMore,
    }
  },
}
