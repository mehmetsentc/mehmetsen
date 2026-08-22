import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { RawArticleListRow } from '../store/types'

export interface RawArticleReviewMeta {
  needsReview: boolean
  categoryId: string | null
  citySlug: string | null
  tags: string[]
  newsTitle: string | null
  newsStatus: string | null
}

export type RawArticleWithReview = RawArticleListRow & { reviewMeta?: RawArticleReviewMeta | null }

function mapNewsReviewData(data: Record<string, unknown>): RawArticleReviewMeta {
  return {
    needsReview: data.needsReview === true,
    categoryId: typeof data.categoryId === 'string' ? data.categoryId : null,
    citySlug: typeof data.citySlug === 'string' ? data.citySlug : null,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    newsTitle: typeof data.title === 'string' ? data.title : null,
    newsStatus: typeof data.status === 'string' ? data.status : null,
  }
}

export async function loadReviewMetaByNewsIds(
  newsIds: string[]
): Promise<Map<string, RawArticleReviewMeta>> {
  const out = new Map<string, RawArticleReviewMeta>()
  const unique = [...new Set(newsIds.filter(Boolean))]
  if (!unique.length) return out

  const db = getAdminFirestore()
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += 10) chunks.push(unique.slice(i, i + 10))

  for (const chunk of chunks) {
    const snaps = await Promise.all(chunk.map((id) => db.collection(Collections.NEWS).doc(id).get()))
    for (const snap of snaps) {
      if (!snap.exists) continue
      const data = snap.data() || {}
      out.set(snap.id, {
        needsReview: data.needsReview === true,
        categoryId: typeof data.categoryId === 'string' ? data.categoryId : null,
        citySlug: typeof data.citySlug === 'string' ? data.citySlug : null,
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        newsTitle: typeof data.title === 'string' ? data.title : null,
        newsStatus: typeof data.status === 'string' ? data.status : null,
      })
    }
  }
  return out
}

export async function countCrawlerReviewQueue(): Promise<number> {
  const db = getAdminFirestore()
  const snap = await db
    .collection(Collections.NEWS)
    .where('needsReview', '==', true)
    .limit(500)
    .get()
  return snap.docs.filter((d) => String(d.data().rssGuid || '').startsWith('raw_')).length
}

export async function enrichArticlesWithReviewMeta<T extends RawArticleListRow>(
  articles: T[]
): Promise<RawArticleWithReview[]> {
  const newsIds = articles.map((a) => a.editorialNewsId).filter((id): id is string => Boolean(id))
  const metaByNewsId = await loadReviewMetaByNewsIds(newsIds)
  return articles.map((article) => ({
    ...article,
    reviewMeta: article.editorialNewsId ? metaByNewsId.get(article.editorialNewsId) ?? null : null,
  }))
}

export function filterReviewQueueArticles<T extends RawArticleWithReview>(articles: T[]): T[] {
  return articles.filter((a) => a.reviewMeta?.needsReview === true)
}

export async function listReviewMetaByRssGuids(
  rawIds: string[]
): Promise<Map<string, RawArticleReviewMeta>> {
  const out = new Map<string, RawArticleReviewMeta>()
  const unique = [...new Set(rawIds.filter((id) => id.startsWith('raw_')))]
  if (!unique.length) return out

  const db = getAdminFirestore()
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += 10) chunks.push(unique.slice(i, i + 10))

  for (const chunk of chunks) {
    const snap = await db.collection(Collections.NEWS).where('rssGuid', 'in', chunk).get()
    for (const doc of snap.docs) {
      const data = doc.data()
      const rssGuid = String(data.rssGuid || '')
      if (!rssGuid.startsWith('raw_')) continue
      out.set(rssGuid, mapNewsReviewData(data))
    }
  }
  return out
}
