import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import type { Firestore } from 'firebase-admin/firestore'
import { hasPermission } from '@/types/cms'
import { sanitizeGroundingSources, type GroundingSource } from '@/lib/ai/liveResearch'
import { Collections } from '@/lib/firebase/collections'
import { buildNewsSlug, isPlaceholderDraftSlug } from '@/lib/newsSlug'
import { buildEditorMediaItems, sanitizeAdditionalImages } from '@/lib/adminNewsMedia'
import { notifyPublishedArticle } from '@/lib/indexNow'
import { revalidateHomeFeedCaches } from '@/lib/revalidateHome'
import { demoteExcessFeaturedPins } from '@/lib/featuredPins'
import { HOME_FEATURED_LIMIT } from '@/types/newsItem'
import {
  articleBlocksToPlainText,
  sanitizeArticleBlocks,
  type ArticleBlock,
} from '@/lib/articleBlocks'
import { getAiEditorById } from '@/lib/ai/editorial/aiEditorService'
import { authorFieldsFromEditor } from '@/lib/ai/editorial/editorRouter'
import {
  applyCanonicalArticleGeoWrite,
  canonicalArticleGeoToPersistFields,
} from '@/lib/geo/canonicalArticleGeoWrite'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CreatePayload {
  draftId?: string
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
  featured?: boolean
  localFeatured?: boolean
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
  /** AI persona override — null/'' clears and uses CMS user as author */
  aiEditorId?: string | null
  aiResearchSources?: GroundingSource[]
  sourceUrl?: string
  rssGuid?: string
  ingestionSourceId?: string
  sourceLabel?: string
  originalTitle?: string
  sourcePublishedAt?: number | null
  aiGenerated?: boolean
}

async function slugTaken(db: Firestore, slug: string): Promise<boolean> {
  const snap = await db.collection(Collections.NEWS).where('slug', '==', slug).limit(1).get()
  return !snap.empty
}

/** POST /api/admin/news — admin manual create */
export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:create')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: CreatePayload
  try {
    body = await request.json() as CreatePayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'Başlık gerekli' }, { status: 400 })
  }
  const willForcePublishViaFeatured = body.featured === true || body.localFeatured === true
  if (
    body.status?.trim() === 'published' &&
    !hasPermission(auth.role, 'news:publish') &&
    !willForcePublishViaFeatured
  ) {
    return NextResponse.json(
      { error: 'Bu hesabın doğrudan yayınlama yetkisi yok; haber incelemeye gönderilmeli' },
      { status: 403 }
    )
  }

  try {
    const db = getAdminFirestore()
    const now = Date.now()
    const requestedStatus = body.status?.trim() || 'pending'
    const featured = body.featured === true
    const localFeatured = body.localFeatured === true
    if (localFeatured && !body.citySlug?.trim()) {
      return NextResponse.json(
        { error: 'Yerelde öne çıkan için önce il seçin' },
        { status: 400 }
      )
    }
    // Öne Çıkan homepage query only returns published — force publish when featured.
    const status =
      (featured || localFeatured) && requestedStatus !== 'archived' && requestedStatus !== 'banned'
        ? 'published'
        : requestedStatus
    if (status === 'published' && !hasPermission(auth.role, 'news:publish') && !featured && !localFeatured) {
      return NextResponse.json(
        { error: 'Bu hesabın doğrudan yayınlama yetkisi yok; haber incelemeye gönderilmeli' },
        { status: 403 }
      )
    }
    const categoryId = body.categoryId?.trim() ?? ''
    const bodyBlocks = sanitizeArticleBlocks(body.bodyBlocks)
    const content = body.content?.trim() || articleBlocksToPlainText(bodyBlocks)
    const summary = body.summary?.trim() ?? content.slice(0, 280)

    let slug = body.slug?.trim()
      ? body.slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      : ''
    if (!slug || isPlaceholderDraftSlug(slug)) slug = buildNewsSlug(body.title.trim())
    if (await slugTaken(db, slug) || isPlaceholderDraftSlug(slug)) {
      slug = buildNewsSlug(body.title.trim(), String(now).slice(-6))
    }

    const userSnap = await db.collection(Collections.USERS).doc(auth.uid).get()
    const userData = userSnap.data()
    const authorUsername = (userData?.username as string | undefined)?.trim() || 'nahaber'

    const selectedAiEditorId = body.aiEditorId?.trim() || ''
    const aiEditor = selectedAiEditorId ? await getAiEditorById(selectedAiEditorId) : null
    if (selectedAiEditorId && (!aiEditor || aiEditor.status === 'archived')) {
      return NextResponse.json({ error: 'Geçersiz AI editör' }, { status: 400 })
    }
    const personaAuthors = aiEditor ? authorFieldsFromEditor(aiEditor) : null

    const newsRef = body.draftId?.trim()
      ? db.collection(Collections.NEWS).doc(body.draftId.trim())
      : db.collection(Collections.NEWS).doc()

    const payload: Record<string, unknown> = {
      title: body.title.trim(),
      slug,
      summary,
      description: content,
      content,
      bodyBlocks,
      articleLayout: body.articleLayout === 'longform' ? 'longform' : 'standard',
      articleFormat:
        body.articleFormat === 'column' || body.articleFormat === 'analysis'
          ? body.articleFormat
          : 'standard',
      spot: body.spot?.trim() ?? '',
      seoTitle: body.seoTitle?.trim() ?? '',
      seoDescription: body.seoDescription?.trim() ?? '',
      seoKeywords: Array.isArray(body.seoKeywords)
        ? body.seoKeywords.map((k) => k.trim().toLowerCase()).filter(Boolean)
        : [],
      aiResearchSources: sanitizeGroundingSources(body.aiResearchSources),
      categoryId,
      category: categoryId,
      status,
      type: 'news',
      source: body.sourceLabel?.trim() || 'NaHaber',
      ...(body.sourceUrl?.trim()
        ? {
            sourceUrl: body.sourceUrl.trim(),
            rssGuid: body.rssGuid?.trim() || '',
            ingestionSourceId: body.ingestionSourceId?.trim() || '',
            sourceLabel: body.sourceLabel?.trim() || '',
            originalTitle: body.originalTitle?.trim() || '',
            sourcePublishedAt: body.sourcePublishedAt ?? null,
            aiGenerated: body.aiGenerated === true,
          }
        : {}),
      ...(personaAuthors
        ? {
            author: personaAuthors.author,
            authorId: personaAuthors.authorId,
            authorUsername: personaAuthors.authorUsername,
            authorDisplayName: personaAuthors.authorDisplayName,
            authorPhotoURL: personaAuthors.authorPhotoURL,
            aiEditorId: personaAuthors.aiEditorId,
          }
        : {
            author: authorUsername,
            authorId: auth.uid,
            authorUsername,
            authorDisplayName: (userData?.displayName as string | undefined)?.trim() || authorUsername,
          }),
      thumbnail: body.thumbnail?.trim() ?? '',
      coverImageUrl: body.thumbnail?.trim() ?? '',
      imageUrl: body.thumbnail?.trim() ?? '',
      imageCaption: body.imageCaption?.trim() ?? '',
      videoUrl: body.videoUrl?.trim() ?? '',
      tags: Array.isArray(body.tags) ? body.tags : [],
      isBreaking: body.isBreaking ?? false,
      featured,
      isEditorPick: featured,
      ...(featured ? { featuredAt: now } : {}),
      localFeatured,
      ...(localFeatured ? { localFeaturedAt: now } : {}),
      manuallyEdited: true,
      manualEditedBy: auth.uid,
      createdAt: now,
      updatedAt: now,
      publishedAt: status === 'published' ? now : null,
      viewsCount: 0,
      likesCount: 0,
      commentCount: 0,
      savesCount: 0,
      sharesCount: 0,
      visibility: 'public',
      postType: 'news',
    }

    // Check citySlug first — domestic city articles also send country:'Türkiye',
    // so the citySlug branch must win over the generic country branch.
    const hasDomesticGeo = Boolean(body.citySlug?.trim() || body.districtSlug?.trim() || body.city?.trim())
    const hasAbroadGeo = Boolean(body.countrySlug?.trim() || (body.country?.trim() && !body.citySlug?.trim()))
    if (hasDomesticGeo || hasAbroadGeo) {
      const geoResult = applyCanonicalArticleGeoWrite(
        {},
        {
          city: body.city ?? '',
          citySlug: body.citySlug ?? '',
          district: body.district ?? '',
          districtSlug: body.districtSlug ?? '',
          location: body.location ?? null,
          country: body.country ?? (hasDomesticGeo ? 'Türkiye' : ''),
          countrySlug: body.countrySlug ?? '',
          articleIsAbroad: hasAbroadGeo && !hasDomesticGeo,
        },
        { rejectInvalidCompound: true, editorialGeoLocked: true }
      )
      if (!geoResult.ok) {
        return NextResponse.json({ error: geoResult.error }, { status: 400 })
      }
      Object.assign(payload, canonicalArticleGeoToPersistFields(geoResult.state))
    }

    const additionalImages = sanitizeAdditionalImages(body.additionalImages)
    payload.additionalImages = additionalImages

    const editorMediaItems = buildEditorMediaItems({
      thumbnail: body.thumbnail,
      thumbnailCaption: body.imageCaption,
      videoUrl: body.videoUrl,
      additionalImages,
    })
    if (editorMediaItems.length > 0) {
      payload.mediaItems = editorMediaItems
    }

    await newsRef.set(payload)

    const rssGuid = String(payload.rssGuid || '').trim()
    if (rssGuid.startsWith('raw_')) {
      const { syncCrawlerEditorial } = await import('@/services/crawler/editorial/newsLink')
      await syncCrawlerEditorial({
        rawArticleId: rssGuid,
        newsId: newsRef.id,
        status: status,
      }).catch(() => {})
    }

    if (featured) {
      try {
        await demoteExcessFeaturedPins(db, {
          keepId: newsRef.id,
          limit: HOME_FEATURED_LIMIT,
        })
      } catch (trimErr) {
        console.warn('[admin/news POST] featured trim skipped:', trimErr)
      }
    }

    if (status === 'published') {
      try {
        await db.collection(Collections.POSTS).doc(newsRef.id).set({
          ...payload,
          id: newsRef.id,
        })
      } catch {
        /* posts mirror optional */
      }
    }

    try {
      revalidateHomeFeedCaches()
      if (categoryId) revalidatePath(`/kategori/${categoryId}`)
      revalidatePath(`/haber/${slug}`)
      if (status === 'published') {
        void notifyPublishedArticle(slug).catch(() => {})
      }
    } catch { /* best-effort */ }

    return NextResponse.json({ ok: true, id: newsRef.id, slug })
  } catch (err) {
    console.error('[admin/news POST]', err)
    const message = err instanceof Error ? err.message : 'Create failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
