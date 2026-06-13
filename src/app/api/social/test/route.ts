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
import { createSocialImage } from '@/lib/social/imageOverlay'
import { uploadSocialImage } from '@/lib/social/storageUploader'
import { FieldValue } from 'firebase-admin/firestore'
import type { SocialPublishPayload } from '@/lib/social/types'

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
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://nahaber.com').replace(/\/$/, '')
  if (typeof data.url  === 'string' && data.url.trim())  return data.url.trim()
  if (typeof data.slug === 'string' && data.slug.trim()) return `${base}/news/${data.slug.trim()}`
  return `${base}/news/${id}`
}

async function handleRequest(request: Request) {
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

    const candidate = snap.docs.find(d => !d.data().socialPublished)
    if (!candidate) {
      return NextResponse.json({
        error: 'Paylaşılacak Çanakkale haberi bulunamadı. Tüm haberler zaten paylaşılmış olabilir.',
      }, { status: 404 })
    }
    docId = candidate.id
    data  = candidate.data() as Record<string, unknown>
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
      headline: title.slice(0, 60),
      caption:  `📰 ${title}`,
      hashtags: ['#NaHaber', '#Çanakkale', '#SonDakika', '#Haber', '#Türkiye'],
      altText:  title,
    }
    steps.aiContent = 'fallback (Gemini yanıt vermedi)'
  } else {
    steps.aiContent = socialContent
  }

  // ── 3. Görsel overlay ─────────────────────────────────────────────────────
  let socialImageUrl: string | undefined = originalImg
  steps.overlayResult = 'atlandı (görsel yok)'

  if (originalImg) {
    const buf = await createSocialImage(originalImg, socialContent.headline)
    if (buf) {
      const uploaded = await uploadSocialImage(buf, `test-${docId}`)
      if (uploaded) {
        socialImageUrl = uploaded
        steps.overlayResult = `yüklendi → ${uploaded}`
      } else {
        steps.overlayResult = 'Storage yükleme başarısız'
      }
    } else {
      steps.overlayResult = 'Sharp overlay başarısız'
    }
  }

  // ── 4. Sosyal medya paylaşımı ─────────────────────────────────────────────
  const hashtagStr = socialContent.hashtags.join(' ')
  const fullCaption = `${socialContent.caption}\n\n${hashtagStr}\n\n🔗 ${articleUrl}`

  const payload: SocialPublishPayload = {
    newsId:      docId,
    title:       socialContent.headline || title,
    description: fullCaption,
    imageUrl:    socialImageUrl,
    articleUrl,
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
