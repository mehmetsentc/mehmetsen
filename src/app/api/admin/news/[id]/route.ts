import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue } from 'firebase-admin/firestore'
import { hasPermission } from '@/types/cms'
import { sanitizeGroundingSources, type GroundingSource } from '@/lib/ai/liveResearch'
import { newsDraftService } from '@/services/newsDraftService'
import { buildEditorMediaItems, sanitizeAdditionalImages } from '@/lib/adminNewsMedia'
import { notifyPublishedArticle } from '@/lib/indexNow'
import { isCanakkaleArticle, publishOneSocial } from '@/lib/social/publishOneSocial'
import { revalidateHomeFeedCaches } from '@/lib/revalidateHome'
import {
  articleBlocksToPlainText,
  sanitizeArticleBlocks,
  type ArticleBlock,
} from '@/lib/articleBlocks'
import { getAiEditorById } from '@/lib/ai/editorial/aiEditorService'
import { authorFieldsFromEditor } from '@/lib/ai/editorial/editorRouter'
import { demoteExcessFeaturedPins } from '@/lib/featuredPins'
import { HOME_FEATURED_LIMIT } from '@/types/newsItem'

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
  /** Homepage featured slider — any category */
  featured?: boolean
  tags?: string[]
  citySlug?: string
  city?: string
  districtSlug?: string
  district?: string
  countrySlug?: string
  country?: string
  location?: { city?: string; district?: string; country: string; lat: number; lng: number }
  thumbnail?: string
  imageCaption?: string
  videoUrl?: string
  additionalImages?: Array<{ url: string; caption?: string }>
  bodyBlocks?: ArticleBlock[]
  articleLayout?: 'standard' | 'longform'
  articleFormat?: 'standard' | 'column' | 'analysis'
  /** AI persona override — null/'' clears persona authorship */
  aiEditorId?: string | null
  /** Explicit live-blog mode for /canli/[slug] */
  isLiveBlog?: boolean
  liveUpdates?: Array<{ id?: string; content?: string; timestamp?: string | number; author?: string }>
  aiResearchSources?: GroundingSource[]
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
  if (Array.isArray(body.bodyBlocks)) {
    const bodyBlocks = sanitizeArticleBlocks(body.bodyBlocks)
    update.bodyBlocks = bodyBlocks
    const plainText = articleBlocksToPlainText(bodyBlocks)
    if (plainText) {
      update.content = plainText
      update.description = plainText
      update.htmlContent = FieldValue.delete()
    }
  }
  if (body.articleLayout === 'standard' || body.articleLayout === 'longform') {
    update.articleLayout = body.articleLayout
  }
  if (
    body.articleFormat === 'standard' ||
    body.articleFormat === 'column' ||
    body.articleFormat === 'analysis'
  ) {
    update.articleFormat = body.articleFormat
  }
  if (body.spot?.trim()) update.spot = body.spot.trim()
  if (body.seoTitle?.trim()) update.seoTitle = body.seoTitle.trim()
  if (body.seoDescription?.trim()) update.seoDescription = body.seoDescription.trim()
  if (Array.isArray(body.seoKeywords)) {
    update.seoKeywords = body.seoKeywords.map((k) => k.trim().toLowerCase()).filter(Boolean)
  }
  if (Array.isArray(body.aiResearchSources)) {
    update.aiResearchSources = sanitizeGroundingSources(body.aiResearchSources)
  }
  if (body.categoryId?.trim()) {
    const categoryId = body.categoryId.trim()
    update.categoryId = categoryId
    // Keep the legacy `category` mirror in sync so home-pool bucketing (which reads
    // `category`) and category listing queries (which read `categoryId`) agree.
    update.category = categoryId
  }
  if (typeof body.isBreaking === 'boolean') update.isBreaking = body.isBreaking
  if (typeof body.featured === 'boolean') {
    update.featured = body.featured
    // Keep live-feed / editor-pick consumers in sync
    update.isEditorPick = body.featured
    // Numeric epoch ms — survives cache JSON + sorts with orderBy featuredAt
    if (body.featured) {
      update.featuredAt = Date.now()
      // Öne Çıkan only appears on the homepage for published news.
      // Pending/draft pins were silently invisible on the live site.
      if (body.status?.trim() !== 'archived' && body.status?.trim() !== 'banned') {
        update.status = 'published'
        if (body.status == null || body.status === 'pending' || body.status === 'draft') {
          // ensure caller path also treats this as publish
        }
      }
    } else {
      update.featuredAt = FieldValue.delete()
    }
  }
  if (body.status?.trim()) {
    // Featured force-publish wins over an explicit pending/draft status in the same save.
    if (
      !(
        body.featured === true &&
        (body.status.trim() === 'pending' || body.status.trim() === 'draft')
      )
    ) {
      update.status = body.status.trim()
    }
  }
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
  if (body.imageCaption != null) {
    update.imageCaption = body.imageCaption.trim()
  }
  if (Array.isArray(body.additionalImages) || body.thumbnail?.trim() || body.videoUrl?.trim()) {
    if (Array.isArray(body.additionalImages)) {
      update.additionalImages = sanitizeAdditionalImages(body.additionalImages)
    }
    update.mediaItems = buildEditorMediaItems({
      thumbnail: body.thumbnail,
      thumbnailCaption: body.imageCaption,
      videoUrl: body.videoUrl,
      additionalImages: Array.isArray(body.additionalImages)
        ? sanitizeAdditionalImages(body.additionalImages)
        : [],
    })
  }

  if (typeof body.isLiveBlog === 'boolean') {
    update.isLiveBlog = body.isLiveBlog
  }
  if (Array.isArray(body.liveUpdates)) {
    update.liveUpdates = body.liveUpdates
      .map((u, index) => {
        const row: Record<string, unknown> = {
          id: (u.id?.trim() || `u-${index + 1}`).slice(0, 64),
          content: (u.content ?? '').trim().slice(0, 4000),
          timestamp: u.timestamp ?? Date.now(),
        }
        const author = (u.author ?? '').trim().slice(0, 120)
        if (author) row.author = author
        return row
      })
      .filter((u) => String(u.content ?? '').length > 0)
      .slice(0, 200)
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
    revalidateHomeFeedCaches()
    revalidatePath('/kategori/son-dakika')
    if (oldCategoryId) revalidatePath(`/kategori/${oldCategoryId}`)
    if (newCategoryId && newCategoryId !== oldCategoryId) revalidatePath(`/kategori/${newCategoryId}`)
    const slug = (body.slug?.trim() || (prevData?.slug as string | undefined))?.trim()
    if (slug) revalidatePath(`/haber/${slug}`)
    if (body.slug?.trim() && body.slug.trim() !== prevData?.slug) {
      revalidatePath(`/haber/${body.slug.trim()}`)
    }
    for (const tag of [...(prevData?.tags as string[] | undefined) ?? [], ...(body.tags ?? [])]) {
      const normalized = tag?.trim().toLocaleLowerCase('tr-TR')
      if (normalized) revalidatePath(`/etiket/${encodeURIComponent(normalized)}`)
    }
  } catch {
    /* best-effort */
  }
}

async function notifyIfPublished(
  prevData: Record<string, unknown> | undefined,
  body: UpdatePayload
) {
  const wasPublished = prevData?.status === 'published'
  const isPublished = body.status === 'published' || wasPublished
  if (!isPublished) return

  const slug = (body.slug?.trim() || (prevData?.slug as string | undefined))?.trim()
  if (slug) {
    void notifyPublishedArticle(slug).catch(() => {})
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
  if (body.status?.trim() === 'published' && !hasPermission(auth.role, 'news:publish')) {
    // Allow editors to publish when pinning Öne Çıkan (otherwise pin is invisible live).
    if (!(body.featured === true)) {
      return NextResponse.json(
        { error: 'Bu hesabın doğrudan yayınlama yetkisi yok; haber incelemeye gönderilmeli' },
        { status: 403 }
      )
    }
  }

  try {
    const update = buildUpdatePayload(body, auth.uid)

    if ('aiEditorId' in body) {
      const selectedId = typeof body.aiEditorId === 'string' ? body.aiEditorId.trim() : ''
      if (selectedId) {
        const aiEditor = await getAiEditorById(selectedId)
        if (!aiEditor || aiEditor.status === 'archived') {
          return NextResponse.json({ error: 'Geçersiz AI editör' }, { status: 400 })
        }
        Object.assign(update, authorFieldsFromEditor(aiEditor))
      } else {
        const dbUsers = getAdminFirestore()
        const userSnap = await dbUsers.collection(Collections.USERS).doc(auth.uid).get()
        const userData = userSnap.data()
        const authorUsername = (userData?.username as string | undefined)?.trim() || 'nahaber'
        update.aiEditorId = FieldValue.delete()
        update.authorId = auth.uid
        update.authorUsername = authorUsername
        update.authorDisplayName =
          (userData?.displayName as string | undefined)?.trim() || authorUsername
        update.author = authorUsername
        update.authorPhotoURL = (userData?.photoURL as string | undefined) ?? null
      }
    }

    const db = getAdminFirestore()

    const newsRef = db.collection(Collections.NEWS).doc(id)
    const newsSnap = await newsRef.get()
    if (newsSnap.exists) {
      const prevData = newsSnap.data()
      applyBreakingToggle(update, body, prevData)

      // Guarantee published articles always carry a numeric `publishedAt`. Category
      // and home listings order by `publishedAt`, and Firestore's orderBy silently
      // DROPS documents missing that field — the root cause of "published article
      // not showing in its category". Only backfill when it's actually missing, so
      // we never bump the sort position of an already-dated article.
      const willBePublished =
        update.status === 'published' ||
        (body.status?.trim() || prevData?.status) === 'published' ||
        body.featured === true
      const existingPublishedAt = prevData?.publishedAt
      const hasValidPublishedAt =
        typeof existingPublishedAt === 'number' ||
        (existingPublishedAt != null && typeof existingPublishedAt === 'object')
      if (willBePublished && !hasValidPublishedAt && update.publishedAt == null) {
        update.publishedAt = Date.now()
      }

      // Featured pin must have numeric featuredAt for homepage orderBy.
      if (body.featured === true && update.featuredAt == null) {
        update.featuredAt = Date.now()
      }

      await newsRef.update(update)

      if (body.featured === true) {
        try {
          await demoteExcessFeaturedPins(db, {
            keepId: id,
            limit: HOME_FEATURED_LIMIT,
          })
        } catch (trimErr) {
          console.warn('[admin/news PUT] featured trim skipped:', trimErr)
        }
      }

      if (prevData?.status === 'published' || body.status === 'published' || body.featured === true) {
        await syncPostsMirror(id, update)
      }

      revalidateNewsPaths(prevData, body)
      void notifyIfPublished(prevData, body)

      // ── Anında sosyal paylaşım: Çanakkale haberi ilk kez yayınlandığında ──
      // after() → response döndükten sonra arka planda çalışır (Next.js 15)
      const justPublished = prevData?.status !== 'published' && body.status === 'published'
      if (justPublished) {
        const mergedData = { ...prevData, ...update }
        if (isCanakkaleArticle(mergedData)) {
          after(() => publishOneSocial(id))
        }
      }

      return NextResponse.json({ ok: true, collection: 'news' })
    }

    const draftRef = db.collection(Collections.NEWS_DRAFTS).doc(id)
    const draftSnap = await draftRef.get()
    if (draftSnap.exists) {
      const draftUpdate = { ...update }
      delete draftUpdate.status

      // Öne Çıkan → otomatik yayına al (UI status=published gönderir; featured da yeterli)
      const shouldPublish =
        body.status === 'published' || body.featured === true

      if (shouldPublish) {
        if (body.featured === true) {
          draftUpdate.featured = true
          draftUpdate.isEditorPick = true
          if (draftUpdate.featuredAt == null) draftUpdate.featuredAt = Date.now()
        }
        if (Object.keys(draftUpdate).length > 0) {
          await draftRef.update(draftUpdate)
        }
        const result = await newsDraftService.approveDraft(id)
        if (body.featured === true && result.newsId) {
          try {
            await demoteExcessFeaturedPins(db, {
              keepId: result.newsId,
              limit: HOME_FEATURED_LIMIT,
            })
          } catch (trimErr) {
            console.warn('[admin/news PUT] featured trim skipped:', trimErr)
          }
        }
        revalidateNewsPaths(draftSnap.data(), body)
        void notifyIfPublished(draftSnap.data(), body)
        // Draft onaylandığında da anında paylaş
        const draftData = { ...draftSnap.data(), ...draftUpdate }
        if (isCanakkaleArticle(draftData)) {
          after(() => publishOneSocial(result.newsId))
        }
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
      // Homepage Öne Çıkan reads `news` only — mirror pin fields when the CMS
      // hit a posts-only document (legacy / user post ids).
      if (body.featured === true) {
        const newsTwin = db.collection(Collections.NEWS).doc(id)
        const twinSnap = await newsTwin.get()
        if (twinSnap.exists) {
          await newsTwin.update(update)
          try {
            await demoteExcessFeaturedPins(db, {
              keepId: id,
              limit: HOME_FEATURED_LIMIT,
            })
          } catch (trimErr) {
            console.warn('[admin/news PUT] featured trim skipped:', trimErr)
          }
        }
      }
      await postsRef.update(update)
      revalidateNewsPaths(postsSnap.data(), body)
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
      revalidateHomeFeedCaches()
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
