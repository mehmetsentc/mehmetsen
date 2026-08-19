import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '../store/drizzle'
import type { CrawlerEditorialStatus } from '../types'

export async function findNewsByRawArticleId(rawArticleId: string): Promise<{
  id: string
  status: string
  slug: string
  title: string
} | null> {
  const db = getAdminFirestore()
  const snap = await db.collection(Collections.NEWS).where('rssGuid', '==', rawArticleId).limit(3).get()
  if (snap.empty) return null
  const published = snap.docs.find((d) => d.data().status === 'published')
  const doc = published || snap.docs[0]
  const data = doc.data()
  return {
    id: doc.id,
    status: String(data.status || 'draft'),
    slug: String(data.slug || ''),
    title: String(data.title || ''),
  }
}

export async function syncCrawlerEditorial(opts: {
  rawArticleId: string
  newsId: string
  status: string
}): Promise<void> {
  if (!hasDatabaseUrl()) return
  if (!opts.rawArticleId.startsWith('raw_')) return
  const editorialStatus: CrawlerEditorialStatus =
    opts.status === 'published'
      ? 'PUBLISHED'
      : opts.status === 'archived'
        ? 'SKIPPED'
        : 'EDITING'
  const store = new DrizzleCrawlerStore()
  await store.updateRawArticle(opts.rawArticleId, {
    editorialNewsId: opts.newsId,
    editorialStatus,
  })
}
