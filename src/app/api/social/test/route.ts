/**
 * POST /api/social/test
 *
 * Tek bir haberi test olarak sosyal medyaya paylaşır.
 * Firestore'dan ilk uygun Çanakkale haberini alır,
 * AI içerik + görsel overlay + Facebook/Instagram paylaşımı yapar.
 *
 * Body (isteğe bağlı): { newsId?: string }
 * Auth: Bearer CRON_SECRET veya ?secret=CRON_SECRET
 *
 * DİKKAT: Bu route sadece test içindir. Production'da kaldırın.
 */
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { publishToFacebook } from '@/lib/social/facebook'
import { publishToInstagram } from '@/lib/social/instagram'
import { generateSocialContent } from '@/lib/social/aiSocialEditor'
import { FieldValue } from 'firebase-admin/firestore'
import type { SocialPublishPayload } from '@/lib/social/types'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import { clampAtWordBoundary } from '@/lib/social/feedCaption'
import { buildSocialImagePayload } from '@/lib/social/carouselImages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function extractImageUrl(data: Record<string, unknown>): string | undefined {
  for (const key of ['thumbnail', 'coverImageUrl', 'imageUrl', 'featuredImage', 'image']) {
    const v = data[key]
    if (typeof v === 'string' && v.trim().length > 10) return v.trim()
  }
  return undefined
}

function buildArticleUrl(id: string, data: Record<string, unknown>): string {
  const base = getSiteUrl()
  if (typeof data.url === 'string' && data.url.trim()) {
    return data.url
      .trim()
      .replace('nahaber.vercel.app', 'www.nahaber.com')
      .replace('https://nahaber.com', 'https://www.nahaber.com')
  }
  if (typeof data.slug === 'string' && data.slug.trim()) return `${base}${ROUTES.NEWS_DETAIL(data.slug.trim())}`
  return `${base}${ROUTES.POST_DETAIL(id)}`
}

async function handleRequest(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let requestedId: string | undefined
  try {
    const body = await request.json() as { newsId?: string }
    requestedId = body.newsId?.trim() || undefined
  } catch { /* body yoksa sorun değil */ }

  const db = getAdminFirestore()

  // ── 1. Haberi bul ──────────────────────────────────────────────────────────
  let docId: string
  let data: Record<string, unknown>

  try {
    if (requestedId) {
      const ref = await db.collection(Collections.NEWS).doc(requestedId).get()
      if (!ref.exists) {
        return NextResponse.json({ error: `Haber bulunamadı: ${requestedId}` }, { status: 404 })
      }
      docId = ref.id
      data  = ref.data() as Record<string, unknown>
    } else {
      // İlk uygun Çanakkale haberi — daha önce paylaşılmamış
      const snap = await db
        .collection(Collections.NEWS)
        .where('citySlug', '==', 'canakkale')
        .where('status', '==', 'published')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get()

      // Görseli olan ilk haberi tercih et
      const withImage = snap.docs.find(d => {
        const dd = d.data() as Record<string, unknown>
        if (dd.socialPublished) return false
        return ['thumbnail','coverImageUrl','imageUrl','featuredImage','image']
          .some(k => typeof dd[k] === 'string' && (dd[k] as string).length > 10)
      })
      const candidate = withImage ?? snap.docs.find(d => !d.data().socialPublished)
      if (!candidate) {
        return NextResponse.json({
          error: 'Paylaşılacak Çanakkale haberi bulunamadı.',
        }, { status: 404 })
      }
      docId = candidate.id
      data  = candidate.data() as Record<string, unknown>
    }
  } catch (firestoreErr) {
    const code = (firestoreErr as { code?: number }).code
    const msg = code === 8
      ? 'Firestore kotası doldu (RESOURCE_EXHAUSTED). Gece yarısı Pacific time\'da sıfırlanır.'
      : String(firestoreErr)
    return NextResponse.json({ error: msg, firestoreCode: code }, { status: 503 })
  }

  const title       = typeof data.title === 'string' ? data.title : '(başlık yok)'
  const description = (data.spot ?? data.summary ?? data.description ?? '') as string
  const cityName    = typeof data.cityName === 'string' ? data.cityName : 'Çanakkale'
  const originalImg = extractImageUrl(data)
  const articleUrl  = buildArticleUrl(docId, data)

  const steps: Record<string, unknown> = {
    newsId:    docId,
    title,
    articleUrl,
    originalImageUrl: originalImg ?? null,
  }

  // ── 2. AI İçerik üretimi ──────────────────────────────────────────────────
  let socialContent = await generateSocialContent(title, description, cityName)
  if (!socialContent) {
    socialContent = {
      headline: clampAtWordBoundary(title, 52),
      storySummary: `${clampAtWordBoundary(title, 120)}.`,
      caption:  `📰 ${title}`,
      hashtags: ['#NaHaber', '#Çanakkale', '#SonDakika', '#Haber', '#Türkiye'],
      altText:  title,
    }
    steps.aiContent = 'fallback (AI yanıt vermedi)'
  } else {
    steps.aiContent = socialContent
  }

  // ── 3. Onyedi Tivi markalı görsel — OG route URL (1080×1080, Edge cached) ──
  const socialImageUrl: string = `https://nahaber.com/api/og/social/${docId}`
  const imagePayload = await buildSocialImagePayload(docId, socialImageUrl, data, {
    fallbackImageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
  })
  steps.overlayResult = `OG route → ${socialImageUrl} (${imagePayload.mode})`
  if (imagePayload.imageUrls) steps.carouselSlides = imagePayload.imageUrls.length

  // ── 4. Sosyal medya paylaşımı ─────────────────────────────────────────────
  const payload: SocialPublishPayload = {
    newsId:      docId,
    title,
    description: socialContent.caption,
    imageUrl:    imagePayload.imageUrl,
    ...(imagePayload.imageUrls ? { imageUrls: imagePayload.imageUrls } : {}),
    articleUrl,
    hashtags:    socialContent.hashtags,
  }

  let fbResult, igResult
  try { fbResult = await publishToFacebook(payload) }
  catch (e) { fbResult = { success: false, error: String(e) } }

  await new Promise(r => setTimeout(r, 1500))

  try { igResult = await publishToInstagram(payload) }
  catch (e) { igResult = { success: false, error: String(e) } }

  steps.facebook  = fbResult
  steps.instagram = igResult

  // ── 5. Firestore işareti ──────────────────────────────────────────────────
  const success = (fbResult?.success || igResult?.success)
  if (success) {
    await db.collection(Collections.NEWS).doc(docId).update({
      socialPublished:   true,
      socialPublishedAt: FieldValue.serverTimestamp(),
      socialImageUrl:    socialImageUrl ?? null,
      socialHeadline:    socialContent.headline,
      socialStorySummary: socialContent.storySummary,
      socialHashtags:    socialContent.hashtags,
      ...(fbResult?.platformId  ? { facebookPostId:   fbResult.platformId }  : {}),
      ...(igResult?.platformId  ? { instagramMediaId: igResult.platformId }  : {}),
    })
    steps.firestoreUpdated = true
  }

  return NextResponse.json({
    success,
    steps,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export const POST = handleRequest
export const GET  = handleRequest
