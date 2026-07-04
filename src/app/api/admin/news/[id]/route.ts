import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

interface UpdatePayload {
  title?: string
  summary?: string
  content?: string
  spot?: string
  seoTitle?: string
  seoDescription?: string
  categoryId?: string
  status?: string
  isBreaking?: boolean
  tags?: string[]
  citySlug?: string
  city?: string
  thumbnail?: string
  videoUrl?: string
  additionalImages?: Array<{ url: string; caption?: string }>
}

/** PUT /api/admin/news/[id] — manually update a news article */
export async function PUT(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  let body: UpdatePayload
  try {
    body = await request.json() as UpdatePayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Build safe update — only allow whitelisted fields
  const update: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    manuallyEdited: true,
    manualEditedBy: auth.uid,
    manualEditedAt: FieldValue.serverTimestamp(),
  }

  if (body.title?.trim())      update.title = body.title.trim()
  if (body.summary?.trim())    update.summary = body.summary.trim()
  if (body.content?.trim())    update.content = body.content.trim()
  if (body.spot?.trim())       update.spot = body.spot.trim()
  if (body.seoTitle?.trim())   update.seoTitle = body.seoTitle.trim()
  if (body.seoDescription?.trim()) update.seoDescription = body.seoDescription.trim()
  if (body.categoryId?.trim()) {
    const newCat = body.categoryId.trim()
    update.categoryId = newCat
    // Son-dakika dışına çıkarılırsa isBreaking otomatik kapat
    if (newCat !== 'son-dakika') {
      update.isBreaking = false
      update.breakingScore = 30
    }
  }
  if (typeof body.isBreaking === 'boolean') update.isBreaking = body.isBreaking
  if (body.status?.trim())     update.status = body.status.trim()
  if (Array.isArray(body.tags)) update.tags = body.tags
  if (body.citySlug !== undefined) update.citySlug = body.citySlug.trim()
  if (body.city !== undefined)    update.city = body.city.trim()
  if (body.thumbnail?.trim()) {
    update.thumbnail = body.thumbnail.trim()
    update.coverImageUrl = body.thumbnail.trim()
    update.imageUrl = body.thumbnail.trim()
  }
  if (body.videoUrl?.trim()) {
    update.mediaItems = [
      {
        type: 'video',
        url: body.videoUrl.trim(),
        thumbnailUrl: body.thumbnail?.trim() || '',
      },
    ]
  }
  if (Array.isArray(body.additionalImages)) {
    update.additionalImages = body.additionalImages
      .filter((img) => img.url?.trim())
      .map((img) => ({ url: img.url.trim(), caption: img.caption?.trim() ?? '' }))
  }

  const db = getAdminFirestore()

  // 1. Try news collection (primary)
  const newsRef = db.collection(Collections.NEWS).doc(id)
  const newsSnap = await newsRef.get()
  if (newsSnap.exists) {
    const prevData = newsSnap.data()
    const oldCategoryId = prevData?.categoryId as string | undefined
    await newsRef.update(update)
    // Sync to posts if published
    if (prevData?.status === 'published' || body.status === 'published') {
      const postsRef = db.collection(Collections.POSTS).doc(id)
      const postsSnap = await postsRef.get()
      if (postsSnap.exists) await postsRef.update(update)
    }
    // Invalidate ISR cache for affected pages
    const newCategoryId = body.categoryId?.trim()
    try {
      revalidatePath('/feed')
      revalidatePath('/')
      revalidatePath('/kategori/son-dakika') // breaking news strip her zaman temizle
      if (oldCategoryId) revalidatePath(`/kategori/${oldCategoryId}`)
      if (newCategoryId && newCategoryId !== oldCategoryId) revalidatePath(`/kategori/${newCategoryId}`)
      // Makale sayfasını da temizle
      const slug = prevData?.slug as string | undefined
      if (slug) revalidatePath(`/haber/${slug}`)
    } catch { /* revalidation is best-effort */ }
    return NextResponse.json({ ok: true, collection: 'news' })
  }

  // 2. Try newsDrafts collection (pending queue articles)
  const draftRef = db.collection(Collections.NEWS_DRAFTS).doc(id)
  const draftSnap = await draftRef.get()
  if (draftSnap.exists) {
    // If being published, move to news collection instead of keeping as draft
    if (body.status === 'published') {
      const draftData = draftSnap.data() ?? {}
      await db.collection(Collections.NEWS).doc(id).set({
        ...draftData,
        ...update,
        status: 'published',
        publishedAt: Date.now(),
        draftStatus: 'approved',
      })
      await draftRef.update({ draftStatus: 'approved', ...update })
    } else {
      await draftRef.update(update)
    }
    return NextResponse.json({ ok: true, collection: 'newsDrafts' })
  }

  // 3. Try posts collection (fallback)
  const postsRef = db.collection(Collections.POSTS).doc(id)
  const postsSnap = await postsRef.get()
  if (postsSnap.exists) {
    await postsRef.update(update)
    return NextResponse.json({ ok: true, collection: 'posts' })
  }

  return NextResponse.json({ error: 'Article not found' }, { status: 404 })
}

/** DELETE /api/admin/news/[id] — archive (soft) or permanently delete an article */
export async function DELETE(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const url = new URL(request.url)
  const permanent = url.searchParams.get('permanent') === 'true'

  const db = getAdminFirestore()

  // Read article to get categoryId for cache invalidation
  const newsRef = db.collection(Collections.NEWS).doc(id)
  const newsSnap = await newsRef.get()

  let categoryId: string | undefined
  let collection = 'news'

  if (newsSnap.exists) {
    categoryId = newsSnap.data()?.categoryId as string | undefined
    if (permanent) {
      await newsRef.delete()
      // Also remove from posts if present
      try { await db.collection(Collections.POSTS).doc(id).delete() } catch { /* ok */ }
    } else {
      const softDeleteUpdate = {
        status: 'archived',
        isBreaking: false,      // son-dakika feed'inden çıkar
        breakingScore: 0,
        publishedAt: null,
        updatedAt: FieldValue.serverTimestamp(),
        moderationNote: 'Admin tarafından kaldırıldı',
      }
      await newsRef.update(softDeleteUpdate)
      // POSTS collection'ı da güncelle — sessiz başarısızlığa izin ver
      try { await db.collection(Collections.POSTS).doc(id).update(softDeleteUpdate) } catch { /* ok */ }
    }
  } else {
    // Try newsDrafts
    const draftRef = db.collection(Collections.NEWS_DRAFTS).doc(id)
    const draftSnap = await draftRef.get()
    if (!draftSnap.exists) return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    categoryId = draftSnap.data()?.categoryId as string | undefined
    collection = 'newsDrafts'
    await draftRef.delete()
  }

  // Invalidate ISR cache
  try {
    revalidatePath('/feed')
    revalidatePath('/')
    revalidatePath('/kategori/son-dakika') // isBreaking olan haberler buraya etki eder
    if (categoryId) revalidatePath(`/kategori/${categoryId}`)
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, collection, permanent })
}
