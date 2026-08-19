import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { dispatchCrawlerArticleToNewsroom } from '@/services/crawler/dispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })
  const { id } = await context.params
  const store = new DrizzleCrawlerStore()
  const cluster = await store.getCluster(id)
  if (!cluster) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const memberships = await store.listMemberships(id)
  const members = []
  for (const m of memberships) {
    const article = await store.getRawArticle(m.articleId)
    const source = article ? await store.getSource(article.sourceId) : null
    members.push({
      source: source?.name || article?.sourceId,
      title: article?.title,
      publishedAt: article?.publishedAt,
      wordCount: article?.wordCount,
      extractionConfidence: article?.extractionConfidence,
      similarityScore: m.similarityScore,
      url: article?.canonicalUrl || article?.originalUrl,
      preview: (article?.articleBodyText || '').slice(0, 280),
    })
  }
  return NextResponse.json({
    aiCalls: dispatchCrawlerArticleToNewsroom().aiRequests,
    cluster,
    members,
  })
}
