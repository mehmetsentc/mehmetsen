/**
 * GET|POST /api/cron/social
 *
 * Cron job — her 5 dakikada bir çalışır.
 * Firestore `news` koleksiyonunda citySlug='canakkale' olan ve henüz
 * sosyal medyaya yayınlanmamış haberleri Facebook ve Instagram'da paylaşır.
 *
 * Pipeline:
 *   1. Firestore'dan yayınlanmamış Çanakkale haberlerini çek
 *   2. Gemini ile sosyal medya içeriği üret (manşet, açıklama, hashtag)
 *   3. Sharp ile görsel üzerine manşet overlay'i uygula
 *   4. Firebase Storage'a yükle → public URL al
 *   5. Facebook ve Instagram'a paylaş
 *   6. Firestore'da socialPublished=true olarak işaretle
 *
 * Auth: Bearer CRON_SECRET  veya ?secret=CRON_SECRET
 */
import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { publishToFacebook } from '@/lib/social/facebook'
import { publishToInstagram } from '@/lib/social/instagram'
import { generateSocialContent } from '@/lib/social/aiSocialEditor'

import type {
  SocialCronItemResult,
  SocialCronResult,
  SocialPublishPayload,
  SocialPublishResult,
} from '@/lib/social/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const INTER_ITEM_DELAY_MS = 2000
const BATCH_LIMIT = 10

/** Pipeline'ın yazdığı tüm görsel alanlarından ilk dolu olanı al */
function extractImageUrl(data: Record<string, unknown>): string | undefined {
  const candidates = [
    data.thumbnail,       // pipeline birincil alan
    data.coverImageUrl,   // pipeline ikincil alan
    data.imageUrl,
    data.featuredImage,
    data.image,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 10) return c.trim()
  }
  return undefined
}

function buildArticleUrl(id: string, data: Record<string, unknown>): string {
  // Sosyal medya linkleri her zaman production domain kullanır
  const base = 'https://nahaber.com'
  const url  = typeof data.url   === 'string' ? data.url.trim()  : ''
  const slug = typeof data.slug  === 'string' ? data.slug.trim() : ''
  if (url)  return url.replace('nahaber.vercel.app', 'nahaber.com')
  if (slug) return `${base}/news/${slug}`
  return `${base}/news/${id}`
}

// Çanakkale ve tüm ilçelerinin slug listesi
const CANAKKALE_SLUGS = new Set([
  'canakkale',
  'biga', 'can', 'yenice', 'bayramic', 'ezine',
  'ayvacik', 'gokceada', 'bozcaada', 'gelibolu', 'eceabat', 'lapseki',
])

/** Dokümanın Çanakkale veya ilçesi haberi olup olmadığını kontrol et */
function isCanakkale(data: Record<string, unknown>): boolean {
  const citySlug     = String(data.citySlug     ?? '').toLowerCase()
  const districtSlug = String(data.districtSlug ?? data.district ?? '').toLowerCase()
  const city         = String(data.city         ?? '').toLowerCase()
  const category     = String(data.category     ?? '').toLowerCase()
  const categoryId   = String(data.categoryId   ?? '').toLowerCase()
  return (
    CANAKKALE_SLUGS.has(citySlug)  ||
    CANAKKALE_SLUGS.has(districtSlug) ||
    city.includes('çanakkale') ||
    city.includes('canakkale') ||
    city.includes('biga') ||
    city.includes('gelibolu') ||
    city.includes('gökçeada') ||
    category   === 'canakkale' ||
    categoryId === 'canakkale'
  )
}

/** Aynı haberin daha önce paylaşılıp paylaşılmadığını çift kontrol et (duplikat önleme) */
async function isAlreadyPublished(
  db: FirebaseFirestore.Firestore,
  newsId: string,
  title: string
): Promise<boolean> {
  // 1. ID ile doğrudan kontrol (birincil)
  const doc = await db.collection(Collections.NEWS).doc(newsId).get()
  if (doc.exists && doc.data()?.socialPublished === true) return true

  // 2. Aynı başlıkla daha önce paylaşılmış mı? (başlık eşleşmesi)
  const snap = await db
    .collection(Collections.NEWS)
    .where('socialPublished', '==', true)
    .where('title', '==', title)
    .limit(1)
    .get()

  return !snap.empty
}

async function runSocialCron(): Promise<SocialCronResult & { error?: string }> {
  // Token kontrolü — Vercel'de set edilmemişse erken çık
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim()
  if (!accessToken) {
    const msg = 'FACEBOOK_PAGE_ACCESS_TOKEN eksik — Vercel > Settings > Environment Variables kontrol edin'
    console.error('[cron/social]', msg)
    return { processed: 0, succeeded: 0, failed: 0, items: [], error: msg }
  }

  const db = getAdminFirestore()

  // ── Birincil sorgu: citySlug == 'canakkale' ────────────────────────────
  const snap = await db
    .collection(Collections.NEWS)
    .where('citySlug', '==', 'canakkale')
    .where('status', '==', 'published')
    .orderBy('createdAt', 'desc')
    .limit(BATCH_LIMIT * 5)
    .get()

  let candidates = snap.docs.filter(doc => {
    const d = doc.data()
    // Video haberlerini atla — thumbnail'leri "Videolu Haber" kartı olduğu için
    // OG şablonunun fotoğraf alanında kötü görünüyor
    return !d.socialPublished && !d.hasVideo && !d.isVideo
  })

  // ── Yedek sorgu: son 100 haberi tara, Çanakkale olanları bul ──────────
  if (candidates.length === 0) {
    const snap2 = await db
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()
    candidates = snap2.docs.filter(doc => {
      const d = doc.data() as Record<string, unknown>
      return isCanakkale(d) && !d.socialPublished && !d.hasVideo && !d.isVideo
    })
  }

  // ── Görseli olan haberleri önceliklendir ──────────────────────────────
  // Instagram için görsel şart — görselsiz haberler koyu/siyah görünür.
  const withImage    = candidates.filter(doc => !!extractImageUrl(doc.data() as Record<string, unknown>))
  const prioritized  = withImage.length > 0 ? withImage : candidates
  console.log(`[cron/social] candidates=${candidates.length} withImage=${withImage.length}`)

  const finalDocs = prioritized.slice(0, BATCH_LIMIT)
  const results: SocialCronItemResult[] = []
  let succeeded = 0
  let failed = 0

  for (const doc of finalDocs) {
    const data  = doc.data() as Record<string, unknown>
    const id    = doc.id
    const title = typeof data.title === 'string' ? data.title : ''

    // ── Duplikat önleme: çift kontrol ────────────────────────────────────
    const alreadyDone = await isAlreadyPublished(db, id, title)
    if (alreadyDone) {
      console.log(`[cron/social] Duplikat atlandı — ${id}: "${title}"`)
      // Tutarsızlık varsa düzelt
      await db.collection(Collections.NEWS).doc(id).update({ socialPublished: true })
      continue
    }

    // Spot / özet metin (AI için kısa bağlam)
    const spot: string =
      typeof data.spot        === 'string' ? data.spot        :
      typeof data.summary     === 'string' ? data.summary     :
      typeof data.description === 'string' ? data.description : ''

    // Tam haber metni — HTML strip + 2000 karakter (Instagram limiti ~2200)
    const rawContent: string =
      typeof data.content === 'string' ? data.content :
      typeof data.body    === 'string' ? data.body    : ''

    /** HTML tag ve fazla boşlukları temizle */
    function stripHtml(html: string): string {
      return html
        .replace(/<[^>]+>/g, ' ')          // tag'ları boşlukla değiştir
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, ' ')           // çoklu boşlukları tek'e
        .trim()
    }

    const fullText  = rawContent ? stripHtml(rawContent) : spot
    const bodyText  = fullText.slice(0, 2000)   // Instagram güvenli limit

    const originalImageUrl = extractImageUrl(data)
    const articleUrl       = buildArticleUrl(id, data)
    const cityName         = typeof data.cityName === 'string' ? data.cityName : 'Çanakkale'

    // ── AI İçerik Üretimi (hashtag için) ─────────────────────────────────
    let socialContent = await generateSocialContent(title, spot, cityName)
    if (!socialContent) {
      socialContent = {
        headline: title.slice(0, 60),
        caption:  '',
        hashtags: ['#NaHaber', '#Çanakkale', '#SonDakika', '#Haber', '#Türkiye'],
        altText:  title,
      }
    }

    // ── Onyedi Tivi markalı görsel — OG route (1080×1080, Edge cached) ───
    const socialImageUrl: string = `https://nahaber.com/api/og/social/${id}`
    console.log(`[cron/social] OG görsel → ${socialImageUrl}`)

    // ── Post formatı: tam haber metni + link + hashtag ───────────────────
    const hashtagStr = socialContent.hashtags.join(' ')
    const fullCaption = [
      bodyText,
      '',
      `🔗 Haberin devamı: ${articleUrl}`,
      '',
      hashtagStr,
    ].join('\n')

    const payload: SocialPublishPayload = {
      newsId:      id,
      title:       socialContent.headline || title,
      description: fullCaption,   // tam metin + link + hashtag
      imageUrl:    socialImageUrl,
      articleUrl,
    }

    // ── Facebook ──────────────────────────────────────────────────────────
    let fbResult: SocialPublishResult = { success: false, error: 'not attempted' }
    try {
      fbResult = await publishToFacebook(payload)
    } catch (err) {
      fbResult = { success: false, error: err instanceof Error ? err.message : String(err) }
    }

    await new Promise(r => setTimeout(r, INTER_ITEM_DELAY_MS))

    // ── Instagram ─────────────────────────────────────────────────────────
    let igResult: SocialPublishResult = { success: false, error: 'not attempted' }
    try {
      igResult = await publishToInstagram(payload)
    } catch (err) {
      igResult = { success: false, error: err instanceof Error ? err.message : String(err) }
    }

    // ── Firestore güncelle ────────────────────────────────────────────────
    const markedDone = fbResult.success || igResult.success

    if (markedDone) {
      try {
        const update: Record<string, unknown> = {
          socialPublished:   true,
          socialPublishedAt: FieldValue.serverTimestamp(),
          socialImageUrl:    socialImageUrl ?? null,
          socialHeadline:    socialContent.headline,
          socialHashtags:    socialContent.hashtags,
        }
        if (fbResult.platformId) update.facebookPostId   = fbResult.platformId
        if (igResult.platformId) update.instagramMediaId = igResult.platformId
        await db.collection(Collections.NEWS).doc(id).update(update)
        succeeded++
      } catch (err) {
        console.error(`[cron/social] Firestore update failed for ${id}:`, err)
        failed++
      }
    } else {
      failed++
      console.warn(`[cron/social] Her iki platform başarısız — ${id}`)
      console.warn(`  FB: ${fbResult.error}`)
      console.warn(`  IG: ${igResult.error}`)
    }

    results.push({ newsId: id, title, facebook: fbResult, instagram: igResult, markedDone })
    await new Promise(r => setTimeout(r, INTER_ITEM_DELAY_MS))
  }

  return { processed: finalDocs.length, succeeded, failed, items: results }
}

async function handleRequest(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runSocialCron()
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Social cron failed'
    console.error('[cron/social] fatal error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const GET  = handleRequest
export const POST = handleRequest
