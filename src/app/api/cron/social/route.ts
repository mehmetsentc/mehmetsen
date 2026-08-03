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
import { publishToFacebook, publishFacebookStory } from '@/lib/social/facebook'
import { publishToInstagram, publishInstagramStory } from '@/lib/social/instagram'
import { publishToTwitter } from '@/lib/social/twitter'
import { generateSocialContent } from '@/lib/social/aiSocialEditor'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import { clampAtWordBoundary, clampCompleteHeadline, clampCompleteSentences } from '@/lib/social/feedCaption'

import {
  isOwnContent,
  isSkippableForSocial,
  isStoryEligible as isStoryEligibleShared,
} from '@/lib/social/publishOneSocial'
import { getCategoryRulesDoc } from '@/lib/social/categoryRulesStore'
import {
  allowsAutoPost,
  allowsAutoStory,
  resolveCategoryRule,
} from '@/lib/social/categoryRules'
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
  const base = getSiteUrl()
  const url = typeof data.url === 'string' ? data.url.trim() : ''
  const slug = typeof data.slug === 'string' ? data.slug.trim() : ''
  if (url) {
    return url
      .replace('nahaber.vercel.app', 'www.nahaber.com')
      .replace('https://nahaber.com', 'https://www.nahaber.com')
  }
  if (slug) return `${base}${ROUTES.NEWS_DETAIL(slug)}`
  return `${base}${ROUTES.POST_DETAIL(id)}`
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
  const categoryRules = await getCategoryRulesDoc()

  // ── İki sorguyu paralel çalıştır ve birleştir ────────────────────────
  // 1. citySlug='canakkale' olan haberler (yeni haberler)
  // 2. city='Çanakkale' olan haberler (citySlug eksik olabilir)
  const [snap1, snap2] = await Promise.all([
    db.collection(Collections.NEWS)
      .where('citySlug', '==', 'canakkale')
      .where('status', '==', 'published')
      .orderBy('createdAt', 'desc')
      .limit(BATCH_LIMIT * 5)
      .get(),
    db.collection(Collections.NEWS)
      .where('city', '==', 'Çanakkale')
      .where('status', '==', 'published')
      .orderBy('createdAt', 'desc')
      .limit(BATCH_LIMIT * 5)
      .get(),
  ])

  // Merge + deduplicate
  const seen = new Set<string>()
  const merged = [...snap1.docs, ...snap2.docs].filter(doc => {
    if (seen.has(doc.id)) return false
    seen.add(doc.id)
    return true
  })

  let candidates = merged.filter(doc => {
    const d = doc.data() as Record<string, unknown>
    // Video haberlerini atla
    if (d.socialPublished || d.hasVideo || d.isVideo) return false
    // Çanakkale haberi değilse atla (geniş kontrol)
    if (!isCanakkale(d)) return false
    // Sadece kendi haberlerimizi yayınla — harici RSS/scraper kaynakları atla
    if (!isOwnContent(d)) return false
    // Canlı yayın / boş içerik / sosyal medya tanıtım haberlerini atla
    if (isSkippableForSocial(d)) return false
    // Kategori kuralı: none / autoPost=false → atla
    const catId = typeof d.categoryId === 'string' ? d.categoryId : undefined
    if (!allowsAutoPost(resolveCategoryRule(categoryRules, catId))) return false
    return true
  })

  // ── Görseli olan haberler zorunlu — görselsiz haberler paylaşılmaz ──────
  // Instagram/Facebook için görsel şart; görselsiz haberler koyu/siyah görünür.
  const withImage   = candidates.filter(doc => !!extractImageUrl(doc.data() as Record<string, unknown>))
  const prioritized = withImage   // fallback yok — sadece görseli olan haberler
  console.log(`[cron/social] candidates=${candidates.length} withImage=${withImage.length}`)

  // ═══════════════════════════════════════════════════════════════════════════
  // BÖLÜM 1 — HİKAYELER ÖNCE (güncel + öne çıkan)
  // Post döngüsü zamanı yemesin diye hikayeler önce yayınlanır.
  // publishedAt NUMBER ile filtrele — createdAt Timestamp karşılaştırması 0 sonuç
  // döndürüyordu (tüm news.createdAt number; Timestamp query sessizce boş geliyordu).
  // ═══════════════════════════════════════════════════════════════════════════

  const STORY_BATCH_LIMIT = 5
  const STORY_WINDOW_MS   = 10 * 60 * 60 * 1000  // son 10 saat
  const recentPublishedAt = Date.now() - STORY_WINDOW_MS

  let storySucceeded = 0
  let storyFailed    = 0
  let storyProcessed = 0
  const storyItemLogs: Array<{ newsId: string; title: string; ok: boolean; error?: string }> = []

  try {
    // publishedAt number — draft onayında createdAt eski kalabiliyor
    const storySnap = await db
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .where('publishedAt', '>=', recentPublishedAt)
      .orderBy('publishedAt', 'desc')
      .limit(80)
      .get()

    const storyCandidates = storySnap.docs
      .filter(doc => {
        const d = doc.data() as Record<string, unknown>
        if (d.storyPublished === true) return false
        if (!isOwnContent(d)) return false
        if (!extractImageUrl(d)) return false
        const catId = typeof d.categoryId === 'string' ? d.categoryId : undefined
        const rule = resolveCategoryRule(categoryRules, catId)
        // Mevcut gundem/featured + kategori autoStory opt-in / veto
        return allowsAutoStory(rule, isStoryEligibleShared(d))
      })
      .slice(0, STORY_BATCH_LIMIT)

    console.log(
      `[cron/social] Story candidates: ${storyCandidates.length}` +
        ` (window publishedAt>=${new Date(recentPublishedAt).toISOString()}, scanned=${storySnap.size})`
    )

    for (const doc of storyCandidates) {
      storyProcessed++
      const data    = doc.data() as Record<string, unknown>
      const id      = doc.id
      const title   = typeof data.title === 'string' ? data.title : ''
      const spot    = typeof data.spot === 'string' ? data.spot :
                      typeof data.summary === 'string' ? data.summary : ''
      const articleUrl = buildArticleUrl(id, data)

      if (!articleUrl) {
        console.warn(`[cron/social] Story articleUrl boş — atlandı: ${id}`)
        storyFailed++
        storyItemLogs.push({ newsId: id, title, ok: false, error: 'articleUrl missing' })
        continue
      }

      // AI içerik — headline + storySummary Firestore'a yazılsın (OG route okur)
      let headline = clampCompleteHeadline(title, 78)
      let storySummary = spot
        ? clampCompleteSentences(
            /[.!?]$/.test(spot.trim()) ? spot.trim() : `${spot.trim()}.`,
            130
          )
        : `${clampAtWordBoundary(title, 120)}.`
      try {
        const ai = await generateSocialContent(
          title,
          spot,
          typeof data.cityName === 'string' ? data.cityName : 'Türkiye'
        )
        if (ai) {
          headline = ai.headline || headline
          if (ai.storySummary) storySummary = ai.storySummary
        }
      } catch { /* fallback */ }

      // OG route sosyal alanları okusun diye önce kaydet
      try {
        await db.collection(Collections.NEWS).doc(id).update({
          socialHeadline: headline,
          socialStorySummary: storySummary,
        })
      } catch (err) {
        console.warn(`[cron/social] story AI fields update failed ${id}:`, err)
      }

      const storyImageUrl: string = `https://nahaber.com/api/og/story/${id}?v=${Date.now()}`
      const storyPayload: SocialPublishPayload = {
        newsId:      id,
        title:       headline,
        description: undefined,
        imageUrl:    storyImageUrl,
        articleUrl,
      }

      let igStoryResult: SocialPublishResult = { success: false, error: 'not attempted' }
      try {
        igStoryResult = await publishInstagramStory(storyPayload)
        console.log(`[cron/social] IG Story → ${id}: ${igStoryResult.success ? '✓' : igStoryResult.error}`)
      } catch (err) {
        igStoryResult = { success: false, error: err instanceof Error ? err.message : String(err) }
      }

      await new Promise(r => setTimeout(r, INTER_ITEM_DELAY_MS))

      let fbStoryResult: SocialPublishResult = { success: false, error: 'not attempted' }
      try {
        fbStoryResult = await publishFacebookStory(storyPayload)
        console.log(`[cron/social] FB Story → ${id}: ${fbStoryResult.success ? '✓' : fbStoryResult.error}`)
      } catch (err) {
        fbStoryResult = { success: false, error: err instanceof Error ? err.message : String(err) }
      }

      if (igStoryResult.success || fbStoryResult.success) {
        try {
          const storyUpdate: Record<string, unknown> = {
            storyPublished:   true,
            storyPublishedAt: FieldValue.serverTimestamp(),
          }
          if (igStoryResult.platformId) storyUpdate.instagramStoryId = igStoryResult.platformId
          if (fbStoryResult.platformId) storyUpdate.facebookStoryId  = fbStoryResult.platformId
          await db.collection(Collections.NEWS).doc(id).update(storyUpdate)
          storySucceeded++
          storyItemLogs.push({ newsId: id, title, ok: true })
        } catch (err) {
          console.error(`[cron/social] Story Firestore update failed for ${id}:`, err)
          storyFailed++
          storyItemLogs.push({ newsId: id, title, ok: false, error: 'firestore update failed' })
        }
      } else {
        storyFailed++
        storyItemLogs.push({
          newsId: id,
          title,
          ok: false,
          error: `IG: ${igStoryResult.error} | FB: ${fbStoryResult.error}`,
        })
      }

      await new Promise(r => setTimeout(r, INTER_ITEM_DELAY_MS))
    }
  } catch (err) {
    console.error('[cron/social] Story loop error:', err)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BÖLÜM 2 — POSTLAR (Çanakkale)
  // ═══════════════════════════════════════════════════════════════════════════

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

    // ── AI İçerik Üretimi — tam metin gönder, 3 paragraflı açıklama al ──
    // AI'a spot değil tam haber içeriğini (bodyText) veriyoruz; bu sayede
    // daha zengin, bilgilendirici ve paragraflı bir açıklama üretiyor.
    const aiContext = bodyText.length > 100 ? bodyText : spot
    let socialContent = await generateSocialContent(title, aiContext, cityName)
    if (!socialContent) {
      // Fallback: AI başarısız olursa spot'tan manuel bir caption oluştur
      const fallbackCaption = spot
        ? `📰 ${spot.trim()}`
        : `📰 ${title.trim()}`
      socialContent = {
        headline: clampCompleteHeadline(title, 78),
        storySummary: spot
          ? clampCompleteSentences(
              /[.!?]$/.test(spot.trim()) ? spot.trim() : `${spot.trim()}.`,
              170
            )
          : `${clampAtWordBoundary(title, 120)}.`,
        caption:  fallbackCaption,
        hashtags: ['#NaHaber', '#Çanakkale', '#SonDakika', '#Haber', '#Türkiye'],
        altText:  title,
      }
    }

    // ── Onyedi Tivi markalı görsel — OG route (1080×1080) ────────────────
    // ?v=timestamp → CDN + Next.js data cache bypass — her paylaşımda taze görsel
    const socialImageUrl: string = `https://nahaber.com/api/og/social/${id}?v=${Date.now()}`
    console.log(`[cron/social] OG görsel → ${socialImageUrl}`)

    // Post: TAM manşet + AI özet; URL/hashtag publisher (buildFeedCaption) ekler
    const payload: SocialPublishPayload = {
      newsId:      id,
      title,
      description: socialContent.caption,
      imageUrl:    socialImageUrl,
      articleUrl,
      hashtags:    socialContent.hashtags,
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

    await new Promise(r => setTimeout(r, INTER_ITEM_DELAY_MS))

    // ── X (Twitter) ───────────────────────────────────────────────────────
    let twResult: SocialPublishResult = { success: false, error: 'not attempted' }
    try {
      twResult = await publishToTwitter(payload)
    } catch (err) {
      twResult = { success: false, error: err instanceof Error ? err.message : String(err) }
    }

    // ── Firestore güncelle ────────────────────────────────────────────────
    const markedDone = fbResult.success || igResult.success || twResult.success

    if (markedDone) {
      try {
        const update: Record<string, unknown> = {
          socialPublished:   true,
          socialPublishedAt: FieldValue.serverTimestamp(),
          socialImageUrl:    socialImageUrl ?? null,
          socialHeadline:      socialContent.headline,
          socialStorySummary:  socialContent.storySummary,
          socialHashtags:    socialContent.hashtags,
        }
        if (fbResult.platformId) update.facebookPostId   = fbResult.platformId
        if (igResult.platformId) update.instagramMediaId = igResult.platformId
        if (twResult.platformId) update.twitterTweetId   = twResult.platformId
        await db.collection(Collections.NEWS).doc(id).update(update)
        succeeded++
      } catch (err) {
        console.error(`[cron/social] Firestore update failed for ${id}:`, err)
        failed++
      }
    } else {
      failed++
      console.warn(`[cron/social] Tüm platformlar başarısız — ${id}`)
      console.warn(`  FB: ${fbResult.error}`)
      console.warn(`  IG: ${igResult.error}`)
      console.warn(`  X:  ${twResult.error}`)
    }

    results.push({ newsId: id, title, facebook: fbResult, instagram: igResult, twitter: twResult, markedDone })
    await new Promise(r => setTimeout(r, INTER_ITEM_DELAY_MS))
  }

  return {
    processed: finalDocs.length, succeeded, failed, items: results,
    stories: {
      processed: storyProcessed,
      succeeded: storySucceeded,
      failed: storyFailed,
      items: storyItemLogs,
    },
  }
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
