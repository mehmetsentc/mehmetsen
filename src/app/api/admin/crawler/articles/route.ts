import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'DATABASE_URL missing', articles: [] }, { status: 503 })
  }
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const store = new DrizzleCrawlerStore()
  if (id) {
    const article = await store.getRawArticle(id)
    if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ article })
  }
  const articles = await store.listRecentArticles(80)
  return NextResponse.json({
    articles: articles.map((a) => ({
      id: a.id,
      sourceId: a.sourceId,
      title: a.title,
      countryCode: a.countryCode,
      publishedAt: a.publishedAt,
      wordCount: a.wordCount,
      extractionMethod: a.extractionMethod,
      extractionConfidence: a.extractionConfidence,
      canonicalUrl: a.canonicalUrl,
      isExactDuplicate: a.isExactDuplicate,
      fetchedAt: a.fetchedAt,
    })),
  })
}
