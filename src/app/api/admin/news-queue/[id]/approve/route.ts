/**
 * POST /api/admin/news-queue/[id]/approve
 *
 * Directly publishes a newsQueue item using its original content (no AI rewrite).
 * This unblocks admins from a stuck AI cron — items can be enriched later.
 */
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { verifyAdminRequest } from '@/lib/adminAuth'
import { Collections, getAdminFirestore } from '@/lib/firebase/admin'
import { revalidateHomeFeedCaches } from '@/lib/revalidateHome'
import { buildNewsSlug } from '@/lib/newsSlug'
import { normalizePublishedLocalCategory } from '@/lib/news/nationalLocalCategoryRouting'
import { notifyPublishedArticle } from '@/lib/indexNow'
import type { NewsroomArticleInput } from '@/services/newsroom/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const admin = await verifyAdminRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const db = getAdminFirestore()

  const queueRef = db.collection(Collections.NEWS_QUEUE).doc(id)
  const queueSnap = await queueRef.get()
  if (!queueSnap.exists) {
    return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
  }

  const queueData = queueSnap.data()!
  const input = queueData.input as NewsroomArticleInput

  const title = input.originalTitle?.trim() || 'Başlıksız'
  const content = input.originalContent?.trim() || input.originalSummary?.trim() || ''
  const summary = input.originalSummary?.trim() || content.slice(0, 280)
  const imageUrl = input.imageUrl?.trim() || ''
  const categoryIdRaw = input.forcedCategoryId?.trim() || ''
  const city = input.forcedCity?.trim() || ''
  const citySlug = input.forcedCitySlug?.trim() || ''
  const sourceLabel = input.sourceLabel?.trim() || ''
  const tagsRaw = input.extraTags ?? []
  const isBreaking = input.isBreaking ?? false

  const { categoryId, tags } = normalizePublishedLocalCategory(
    categoryIdRaw,
    citySlug,
    tagsRaw,
  )

  const now = Date.now()
  const slug = buildNewsSlug(title)

  const newsDoc = {
    title,
    description: content,
    content,
    summary,
    spot: summary.slice(0, 160),
    slug,
    author: 'nahaber',
    authorId: 'nahaber',
    authorUsername: 'nahaber',
    authorDisplayName: 'NaHaber',
    thumbnail: imageUrl,
    coverImageUrl: imageUrl,
    imageUrl,
    videoUrl: '',
    category: categoryId,
    categoryId,
    city,
    citySlug,
    district: input.forcedDistrict?.trim() || '',
    country: 'Türkiye',
    location: city ? { city, country: 'Türkiye', lat: 0, lng: 0 } : null,
    tags,
    isBreaking,
    source: sourceLabel,
    sourceUrl: input.sourceUrl ?? '',
    type: 'news',
    postType: 'news',
    status: 'published',
    aiGenerated: false,
    featured: false,
    visibility: 'public',
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
    mediaItems: imageUrl ? [{ type: 'image', url: imageUrl, order: 0 }] : [],
    approvedFromQueue: true,
    queueJobId: id,
  }

  const newsRef = db.collection(Collections.NEWS).doc()
  await newsRef.set(newsDoc)

  await queueRef.update({
    status: 'published',
    publishedNewsId: newsRef.id,
    updatedAt: now,
    lastError: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    claimedAt: null,
  })

  try {
    revalidateHomeFeedCaches()
    if (categoryId) revalidatePath(`/kategori/${categoryId}`)
    if (categoryIdRaw !== categoryId) revalidatePath(`/kategori/${categoryIdRaw}`)
    revalidatePath(`/haber/${slug}`)
    void notifyPublishedArticle(slug).catch(() => {})
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, newsId: newsRef.id, slug })
}
