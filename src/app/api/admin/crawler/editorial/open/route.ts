import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { draftPrefillFromRaw } from '@/services/crawler/editorial/prefill'
import { findNewsByRawArticleId } from '@/services/crawler/editorial/newsLink'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Idempotent: one Firestore news draft per raw article. Does not call AI.
 * Does not mutate crawler evidence fields.
 */
export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:create')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })

  const body = (await request.json().catch(() => ({}))) as { rawArticleId?: string }
  const rawArticleId = body.rawArticleId?.trim()
  if (!rawArticleId) return NextResponse.json({ error: 'rawArticleId gerekli' }, { status: 400 })

  const store = new DrizzleCrawlerStore()
  const article = await store.getRawArticle(rawArticleId)
  if (!article) return NextResponse.json({ error: 'Ham haber bulunamadı' }, { status: 404 })

  const existing = article.editorialNewsId
    ? await loadNews(article.editorialNewsId)
    : await findNewsByRawArticleId(rawArticleId)

  if (existing) {
    if (existing.status === 'published') {
      return NextResponse.json({
        ok: true,
        created: false,
        published: true,
        newsId: existing.id,
        slug: existing.slug,
        editPath: `/admin/news/${existing.id}/edit`,
        publicPath: existing.slug ? `/haber/${existing.slug}` : null,
      })
    }
    await store.updateRawArticle(rawArticleId, {
      editorialNewsId: existing.id,
      editorialStatus: 'EDITING',
    })
    return NextResponse.json({
      ok: true,
      created: false,
      published: false,
      newsId: existing.id,
      slug: existing.slug,
      editPath: `/admin/news/${existing.id}/edit`,
    })
  }

  const source = await store.getSource(article.sourceId)
  const prefill = draftPrefillFromRaw(article, source)
  const db = getAdminFirestore()
  const userSnap = await db.collection(Collections.USERS).doc(auth.uid).get()
  const userData = userSnap.data()
  const authorUsername = (userData?.username as string | undefined)?.trim() || 'nahaber'
  const newsRef = db.collection(Collections.NEWS).doc()
  const now = Date.now()
  await newsRef.set({
    title: prefill.title || 'Başlıksız',
    slug: `taslak-${newsRef.id.slice(0, 8)}`,
    summary: '',
    description: prefill.content,
    content: prefill.content,
    bodyBlocks: [],
    spot: '',
    seoTitle: '',
    seoDescription: '',
    seoKeywords: [],
    categoryId: '',
    category: '',
    status: 'draft',
    type: 'news',
    source: prefill.source || 'NaHaber',
    sourceLabel: prefill.sourceLabel,
    sourceUrl: prefill.sourceUrl,
    rssGuid: prefill.rssGuid,
    ingestionSourceId: prefill.ingestionSourceId,
    originalTitle: prefill.originalTitle,
    sourcePublishedAt: prefill.sourcePublishedAt,
    aiGenerated: false,
    author: authorUsername,
    authorId: auth.uid,
    authorUsername,
    authorDisplayName: (userData?.displayName as string | undefined)?.trim() || authorUsername,
    thumbnail: prefill.thumbnail,
    coverImageUrl: prefill.thumbnail,
    imageUrl: prefill.thumbnail,
    additionalImages: prefill.additionalImages,
    tags: [],
    isBreaking: false,
    featured: false,
    localFeatured: false,
    manuallyEdited: true,
    manualEditedBy: auth.uid,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    viewsCount: 0,
    likesCount: 0,
    commentCount: 0,
    savesCount: 0,
    sharesCount: 0,
    visibility: 'public',
    postType: 'news',
    ...(prefill.citySlug ? { citySlug: prefill.citySlug, country: 'Türkiye' } : {}),
  })

  await store.updateRawArticle(rawArticleId, {
    editorialNewsId: newsRef.id,
    editorialStatus: 'DRAFT',
  })

  return NextResponse.json({
    ok: true,
    created: true,
    published: false,
    newsId: newsRef.id,
    editPath: `/admin/news/${newsRef.id}/edit`,
  })
}

async function loadNews(id: string) {
  const db = getAdminFirestore()
  const snap = await db.collection(Collections.NEWS).doc(id).get()
  if (!snap.exists) return null
  const data = snap.data() || {}
  return {
    id: snap.id,
    status: String(data.status || 'draft'),
    slug: String(data.slug || ''),
    title: String(data.title || ''),
  }
}
