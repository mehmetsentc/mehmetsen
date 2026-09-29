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

/** Drop ham-haber rows whose news is already live. Active queue includes DRAFT. */
export async function reconcilePublishedRawArticles<T extends { id: string; editorialStatus: string }>(
  articles: T[]
): Promise<{ articles: T[]; hidden: number }> {
  const stuck = articles.filter(
    (article) => article.editorialStatus === 'DRAFT' || article.editorialStatus === 'EDITING'
  )
  if (stuck.length === 0) return { articles, hidden: 0 }

  const hidden = new Set<string>()
  await Promise.all(
    stuck.map(async (article) => {
      const news = await findNewsByRawArticleId(article.id).catch(() => null)
      if (news?.status !== 'published') return
      await syncCrawlerEditorial({
        rawArticleId: article.id,
        newsId: news.id,
        status: 'published',
      }).catch(() => {})
      hidden.add(article.id)
    })
  )
  if (hidden.size === 0) return { articles, hidden: 0 }
  return { articles: articles.filter((article) => !hidden.has(article.id)), hidden: hidden.size }
}
