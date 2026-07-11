import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue } from 'firebase-admin/firestore'
import { newsDraftService } from '@/services/newsDraftService'
import { buildEditorMediaItems, sanitizeAdditionalImages } from '@/lib/adminNewsMedia'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

interface UpdatePayload {
  title?: string
  slug?: string
  summary?: string
  content?: string
  spot?: string
  seoTitle?: string
  seoDescription?: string
  seoKeywords?: string[]
  categoryId?: string
  status?: string
  isBreaking?: boolean
  tags?: string[]
  citySlug?: string
  city?: string
  districtSlug?: string
  district?: string
  countrySlug?: string
  country?: string
  location?: { city?: string; district?: string; country: string; lat: number; lng: number }
  thumbnail?: string
  videoUrl?: string
  additionalImages?: Array<{ url: string; caption?: string }>
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

function buildUpdatePayload(body: UpdatePayload, authUid: string): Record<string, unknown> {
  const update: Record<string, unknown> = {
    updatedAt: Date.now(),
    manuallyEdited: true,
    manualEditedBy: authUid,
    manualEditedAt: FieldValue.serverTimestamp(),
  }

  if (body.title?.trim()) update.title = body.title.trim()
  if (body.slug?.trim()) {
    const slug = body.slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (slug) update.slug = slug
  }
  if (body.summary?.trim()) update.summary = body.summary.trim()
  if (body.content?.trim()) {
    const text = body.content.trim()
    update.content = text
    update.description = text
    update.htmlContent = FieldValue.delete()
  }
  if (body.spot?.trim()) update.spot = body.spot.trim()
  if (body.seoTitle?.trim()) update.seoTitle = body.seoTitle.trim()
  if (body.seoDescription?.trim()) update.seoDescription = body.seoDescription.trim()
  if (Array.isArray(body.seoKeywords)) {
    update.seoKeywords = body.seoKeywords.map((k) => k.trim().toLowerCase()).filter(Boolean)
  }
  if (body.categoryId?.trim()) update.categoryId = body.categoryId.trim()
  if (typeof body.isBreaking === 'boolean') update.isBreaking = body.isBreaking
  if (body.status?.trim()) update.status = body.status.trim()
  if (Array.isArray(body.tags)) update.tags = body.tags
  if (body.citySlug != null) update.citySlug = String(body.citySlug).trim()
  if (body.city != null) update.city = String(body.city).trim()
  if (body.districtSlug != null) update.districtSlug = String(body.districtSlug).trim()
  if (body.district != null) update.district = String(body.district).trim()
  if (body.countrySlug != null) update.countrySlug = String(body.countrySlug).trim()
  if (body.country != null) update.country = String(body.country).trim()
  if (body.location != null) update.location = body.location
  if (body.thumbnail?.trim()) {
    const thumb = body.thumbnail.trim()
    update.thumbnail = thumb
    update.coverImageUrl = thumb
    update.imageUrl = thumb
  }
  if (Array.isArray(body.additionalImages) || body.thumbnail?.trim() || body.videoUrl?.trim()) {
    if (Array.isArray(body.additionalImages)) {
      update.additionalImages = sanitizeAdditionalImages(body.additionalImages)
    }
    update.mediaItems = buildEditorMediaItems({
      thumbnail: body.thumbnail,
      videoUrl: body.videoUrl,
      additionalImages: Array.isArray(body.additionalImages)
        ? sanitizeAdditionalImages(body.additionalImages)
        : [],
    })
  }

  return stripUndefined(update)
}

function applyBreakingToggle(
  update: Record<string, unknown>,
  body: UpdatePayload,
  prevData: Record<string, unknown> | undefined
) {
  if (body.isBreaking === true) {
    const prevOriginalCat = prevData?.originalCategoryId as string | undefined
    const prevCat = prevData?.categoryId as string | undefined
    if (!prevOriginalCat && prevCat && prevCat !== 'son-dakika') {
      update.originalCategoryId = prevCat
    }
    update.breakingSetAt = FieldValue.serverTimestamp()
  } else if (body.isBreaking === false) {
    const originalCat = prevData?.originalCategoryId as string | undefined
    if (originalCat) {
      if (!update.categoryId) update.categoryId = originalCat
      update.originalCategoryId = FieldValue.delete()
    }
    update.breakingScore = 30
  }
}

function revalidateNewsPaths(
  prevData: Record<string, unknown> | undefined,
  body: UpdatePayload
) {
  try {
    const oldCategoryId = prevData?.categoryId as string | undefined
    const newCategoryId = body.categoryId?.trim()
    revalidatePath('/feed')
    revalidatePath('/')
    revalidatePath('/kategori/son-dakika')
    if (oldCategoryId) revalidatePath(`/kategori/${oldCategoryId}`)
    if (newCategoryId && newCategoryId !== oldCategoryId) revalidatePath(`/kategori/${newCategoryId}`)
    const slug = prevData?.slug as string | undefined
    if (slug) revalidatePath(`/haber/${slug}`)
    if (body.slug?.trim() && body.slug.trim() !== slug) revalidatePath(`/haber/${body.slug.trim()}`)
  } catch {
    /* best-effort */
  }
}

async function syncPostsMirror(id: string, update: Record<string, unknown>) {
  try {
    const db = getAdminFirestore()
    const postsRef = db.collection(Collections.POSTS).doc(id)
    const postsSnap = await postsRef.get()
    if (postsSnap.exists) await postsRef.update(update)
  } catch (err) {
    console.warn('[admin/news PUT] posts mirror sync skipped:', err)
  }
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

  try {
    const update = buildUpdatePayload(body, auth.uid)
    const db = getAdminFirestore()

    const newsRef = db.collection(Collections.NEWS).doc(id)
    const newsSnap = await newsRef.get()
    if (newsSnap.exists) {
      const prevData = newsSnap.data()
      applyBreakingToggle(update, body, prevData)
      await newsRef.update(update)

      if (prevData?.status === 'published' || body.status === 'published') {
        await syncPostsMirror(id, update)
      }

      revalidateNewsPaths(prevData, body)
      return NextResponse.json({ ok: true, collection: 'news' })
    }

    const draftRef = db.collection(Collections.NEWS_DRAFTS).doc(id)
    const draftSnap = await draftRef.get()
    if (draftSnap.exists) {
      const draftUpdate = { ...update }
      delete draftUpdate.status

      if (body.status === 'published') {
        if (Object.keys(draftUpdate).length > 0) {
          await draftRef.update(draftUpdate)
        }
        const result = await newsDraftService.approveDraft(id)
        revalidateNewsPaths(draftSnap.data(), body)
        return NextResponse.json({ ok: true, collection: 'newsDrafts', ...result })
      }

      if (body.status === 'archived') {
        draftUpdate.draftStatus = 'rejected'
      }

      await draftRef.update(draftUpdate)
      return NextResponse.json({ ok: true, collection: 'newsDrafts' })
    }

    const postsRef = db.collection(Collections.POSTS).doc(id)
    const postsSnap = await postsRef.get()
    if (postsSnap.exists) {
      await postsRef.update(update)
      return NextResponse.json({ ok: true, collection: 'posts' })
    }

    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  } catch (err) {
    console.error('[admin/news PUT]', err)
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** DELETE /api/admin/news/[id] — archive (soft) or permanently delete an article */
export async function DELETE(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const url = new URL(request.url)
  const permanent = url.searchParams.get('permanent') === 'true'

  try {
    const db = getAdminFirestore()
    const newsRef = db.collection(Collections.NEWS).doc(id)
    const newsSnap = await newsRef.get()

    let categoryId: string | undefined
    let collection = 'news'

    if (newsSnap.exists) {
      categoryId = newsSnap.data()?.categoryId as string | undefined
      if (permanent) {
        await newsRef.delete()
        try { await db.collection(Collections.POSTS).doc(id).delete() } catch { /* ok */ }
      } else {
        const softDeleteUpdate = {
          status: 'archived',
          isBreaking: false,
          breakingScore: 0,
          publishedAt: null,
          updatedAt: FieldValue.serverTimestamp(),
          moderationNote: 'Admin tarafından kaldırıldı',
        }
        await newsRef.update(softDeleteUpdate)
        try { await db.collection(Collections.POSTS).doc(id).update(softDeleteUpdate) } catch { /* ok */ }
      }
    } else {
      const draftRef = db.collection(Collections.NEWS_DRAFTS).doc(id)
      const draftSnap = await draftRef.get()
      if (!draftSnap.exists) return NextResponse.json({ error: 'Article not found' }, { status: 404 })
      categoryId = draftSnap.data()?.categoryId as string | undefined
      collection = 'newsDrafts'
      await draftRef.delete()
    }

    try {
      revalidatePath('/feed')
      revalidatePath('/')
      revalidatePath('/kategori/son-dakika')
      if (categoryId) revalidatePath(`/kategori/${categoryId}`)
    } catch { /* best-effort */ }

    return NextResponse.json({ ok: true, collection, permanent })
  } catch (err) {
    console.error('[admin/news DELETE]', err)
    const message = err instanceof Error ? err.message : 'Delete failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
