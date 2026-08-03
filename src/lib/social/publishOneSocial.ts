/**
 * publishOneSocial — tek haber için sosyal medya yayın pipeline'ı.
 *
 * Admin panelinde Çanakkale haberi ilk kez yayınlandığında
 * `after()` ile çağrılır; cron'u beklemeden anında paylaşım yapar.
 *
 * Fire-and-forget güvenli: hataları loglar, fırlatmaz (void çağrılar için).
 * Admin manuel paylaşımda options + result döner.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue } from 'firebase-admin/firestore'
import { publishToFacebook, publishFacebookStory } from '@/lib/social/facebook'
import { publishToInstagram, publishInstagramStory } from '@/lib/social/instagram'
import { publishToTwitter } from '@/lib/social/twitter'
import { generateSocialContent } from '@/lib/social/aiSocialEditor'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import type { SocialPublishPayload, SocialPublishResult } from '@/lib/social/types'
import { clampAtWordBoundary, clampCompleteHeadline, clampCompleteSentences } from '@/lib/social/feedCaption'
import { getRuleForCategory } from '@/lib/social/categoryRulesStore'
import { allowsAutoPost, allowsAutoStory } from '@/lib/social/categoryRules'

// ── Çanakkale slug listesi (cron/social ile aynı) ─────────────────────────────
const CANAKKALE_SLUGS = new Set([
  'canakkale',
  'biga', 'can', 'yenice', 'bayramic', 'ezine',
  'ayvacik', 'gokceada', 'bozcaada', 'gelibolu', 'eceabat', 'lapseki',
])

export function isCanakkaleArticle(data: Record<string, unknown>): boolean {
  const citySlug     = String(data.citySlug     ?? '').toLowerCase()
  const districtSlug = String(data.districtSlug ?? data.district ?? '').toLowerCase()
  const city         = String(data.city         ?? '').toLowerCase()
  const category     = String(data.category     ?? '').toLowerCase()
  const categoryId   = String(data.categoryId   ?? '').toLowerCase()
  return (
    CANAKKALE_SLUGS.has(citySlug) ||
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

/**
 * Haberin NaHaber/OnyediTivi tarafından hazırlandığını doğrula.
 * Harici sourceUrl (RSS, scraper) otomatik cron'da engellenir;
 * manuel admin paylaşımında (`manual: true`) bu kontrol atlanır.
 */
export function isOwnContent(data: Record<string, unknown>): boolean {
  const sourceUrl = String(data.sourceUrl ?? '').trim().toLowerCase()
  // sourceUrl yoksa veya http ile başlamıyorsa → kendi içeriğimiz ✓
  if (!sourceUrl || !sourceUrl.startsWith('http')) return true
  // sourceUrl kendi sitemizi gösteriyorsa → kendi içeriğimiz ✓
  if (sourceUrl.includes('nahaber.com') || sourceUrl.includes('onyeditivi.com')) return true
  // Harici URL → başka kaynaktan (cron engeller; manuel paylaşım serbest)
  return false
}

/**
 * Canlı yayın / boş içerik / sosyal medya tanıtım haberlerini yakala.
 * Bunlar sosyal medyaya gönderilmemeli:
 *   - isLiveBlog === true (canlı takip/blog)
 *   - Başlıkta "canlı" + yayın bağlamı olan haberler
 *   - Sadece sosyal medya takip linkleri içeren spot/içerik
 *   - Çok kısa içerikli (gerçek haber olmayan) paylaşımlar
 *   - Video (YouTube kanalı videoları)
 */
export function isSkippableForSocial(data: Record<string, unknown>): boolean {
  const title   = String(data.title ?? '').toLowerCase()
  const spot    = String(data.spot ?? data.summary ?? data.description ?? '').toLowerCase()
  const content = String(data.content ?? data.body ?? '').toLowerCase()
  const combined = `${spot} ${content}`

  // isLiveBlog / canlı takip alanı
  if (data.isLiveBlog === true) return true

  // Canlı yayın haberleri — başlıkta "canlı" + yayın/takip bağlamı
  const CANLI_TITLE_PATTERNS = [
    '#canlı', '# canlı',
    '#canli', '# canli',
    'canlı yayın',     // "canlı yayın izle"
    'canli yayin',
    'canlı takip',     // "canlı takip"
    'canlıyayın',
    'canlı anlatım',   // "dakika dakika canlı anlatım"
    'canlı blog',
  ]
  if (CANLI_TITLE_PATTERNS.some(p => title.includes(p))) return true

  // "canlı" kelimesi başlıkta + video veya yayın bağlamı
  if (title.includes('canlı') && (
    title.startsWith('canlı') ||          // "canlı: ..."
    title.includes(' canlıda ') ||         // "canlıda açıkladı"
    title.includes('canlıda ') ||
    data.hasVideo === true ||              // YouTube video
    title.includes('yayın') ||            // "canlı yayından"
    title.includes('dakika dakika')       // "canlı anlatım"
  )) return true

  // Sosyal medya tanıtım metni (whatsapp kanal linki, bluesky, vb.)
  const PROMO_PATTERNS = [
    'whatsapp.com/channel',
    'bsky.app/profile',
    'sosyal medya hesaplarımızı takip',
    'takip etmeyi unutmayın',
    'kanalımıza abone',
    't.me/',               // Telegram
    'youtube.com/@',       // YouTube kanal tanıtımı
  ]
  if (PROMO_PATTERNS.some(p => combined.includes(p))) return true

  // Spot 10 karakterden kısa VE içerik de yoksa — boş haber
  const spotLen    = spot.trim().length
  const contentLen = content.replace(/<[^>]+>/g, '').trim().length
  if (spotLen < 10 && contentLen < 30) return true

  return false
}

// ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────

function extractImageUrl(data: Record<string, unknown>): string | undefined {
  const candidates = [data.thumbnail, data.coverImageUrl, data.imageUrl, data.featuredImage, data.image]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 10) return c.trim()
  }
  return undefined
}

function buildArticleUrl(id: string, data: Record<string, unknown>): string {
  const base = getSiteUrl()
  const url  = typeof data.url  === 'string' ? data.url.trim()  : ''
  const slug = typeof data.slug === 'string' ? data.slug.trim() : ''
  if (url) {
    return url
      .replace('nahaber.vercel.app', 'www.nahaber.com')
      .replace('https://nahaber.com', 'https://www.nahaber.com')
  }
  if (slug) return `${base}${ROUTES.NEWS_DETAIL(slug)}`
  return `${base}${ROUTES.POST_DETAIL(id)}`
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ── Options / Result ──────────────────────────────────────────────────────────

export type PublishSocialMode = 'post' | 'story' | 'both'

/** Admin composer overrides — paylaşım öncesi düzenlenen alanlar. */
export interface SocialPublishOverrides {
  headline?: string
  /** FB/IG/X post caption gövdesi (URL/hashtag publisher ekler). */
  caption?: string
  /** Hikâye OG özeti. */
  storySummary?: string
  hashtags?: string[]
  /** Platform seçimi. Varsayılan: hepsi açık. X yalnızca post modunda. */
  platforms?: {
    facebook?: boolean
    instagram?: boolean
    twitter?: boolean
  }
}

export interface PublishOneSocialOptions {
  /** Hangi kanal(lar). Varsayılan: otomatik (uygunluk kurallarına göre). */
  mode?: PublishSocialMode
  /** Yayın bayraklarını sıfırla ve yeniden paylaş. */
  force?: boolean
  /**
   * Admin manuel paylaşım: şehir/kategori uygunluk kapılarını atla
   * (yine de kendi içerik + görsel + skippable kontrolleri uygulanır).
   */
  manual?: boolean
  /** Composer'dan gelen metin / platform override'ları. */
  overrides?: SocialPublishOverrides
}

export interface PublishOneSocialResult {
  ok: boolean
  newsId: string
  skipped: boolean
  reason?: string
  title?: string
  post?: {
    attempted: boolean
    facebook: SocialPublishResult
    instagram: SocialPublishResult
    twitter?: SocialPublishResult
  }
  story?: {
    attempted: boolean
    facebook: SocialPublishResult
    instagram: SocialPublishResult
  }
}

function skipped(newsId: string, reason: string): PublishOneSocialResult {
  return { ok: false, newsId, skipped: true, reason }
}

/**
 * Haber hikaye paylaşımı için uygun mu?
 *  - Güncel: categoryId === 'gundem'
 *  - Öne çıkan: featured === true
 *
 * NOT: isBreaking kasıtlı ÇIKARILDI — son dakika haberler çok kısa/ince içerik
 * olabiliyor ve canlı yayın takipleri breaking olarak gelebiliyor.
 * Breaking haberler yalnızca Çanakkale filtresiyle post olarak paylaşılır.
 */
export function isStoryEligible(data: Record<string, unknown>): boolean {
  // Canlı yayın / live blog → hikaye olmaz
  if (isSkippableForSocial(data)) return false
  if (data.featured === true || data.isFeatured === true) return true
  const catId = String(data.categoryId ?? '').toLowerCase()
  const cat   = String(data.category   ?? '').toLowerCase()
  return catId === 'gundem' || cat === 'gundem'
}

/**
 * Tek bir haberi FB + IG'ye yayınlar (post ve/veya hikaye).
 *
 * POST yayını   : Çanakkale konumlı haberler  → FB post + IG post
 * HİKAYE yayını : Güncel + Öne çıkan haberler → IG hikaye + FB hikaye
 *
 * `manual: true` ile admin panelinden şehir/kategori kapıları atlanır.
 * `force: true` ile mevcut yayın bayrakları sıfırlanıp yeniden paylaşılır.
 * `mode` ile yalnızca post / story / both seçilir.
 */
export async function publishOneSocial(
  newsId: string,
  options: PublishOneSocialOptions = {},
): Promise<PublishOneSocialResult> {
  const { mode, force = false, manual = false, overrides } = options

  try {
    const db  = getAdminFirestore()
    const doc = await db.collection(Collections.NEWS).doc(newsId).get()
    if (!doc.exists) {
      console.log(`[publishOneSocial] Haber bulunamadı: ${newsId}`)
      return skipped(newsId, 'Haber bulunamadı')
    }

    let data = doc.data() as Record<string, unknown>

    // Video haberler atla
    if (data.hasVideo || data.isVideo) {
      return skipped(newsId, 'Video haberler sosyal medyaya gönderilmez')
    }
    // Harici RSS/scraper: yalnızca otomatik (cron) yolunda engelle; manuel admin paylaşımı serbest
    if (!manual && !isOwnContent(data)) {
      console.log(`[publishOneSocial] Harici kaynak — otomatik paylaşım atlandı: ${newsId}`)
      return skipped(newsId, 'Harici RSS/kaynak haberi — otomatik paylaşım yalnızca NaHaber içerikleri için')
    }
    // Canlı yayın / boş içerik / sosyal medya tanıtım haberi
    if (isSkippableForSocial(data)) {
      console.log(`[publishOneSocial] Canlı yayın/boş içerik — atlandı: ${newsId}`)
      return skipped(newsId, 'Canlı yayın, boş içerik veya tanıtım haberi — paylaşıma uygun değil')
    }

    const title = typeof data.title === 'string' ? data.title : ''
    if (!title) return skipped(newsId, 'Haber başlığı yok')

    // ── Ne yayınlanacak? ─────────────────────────────────────────────────────
    let shouldPost: boolean
    let shouldStory: boolean

    if (mode === 'post') {
      shouldPost  = true
      shouldStory = false
    } else if (mode === 'story') {
      shouldPost  = false
      shouldStory = true
    } else if (mode === 'both') {
      shouldPost  = true
      shouldStory = true
    } else if (manual) {
      // mode yok + manual → her ikisini dene (uygunluk kapısı yok)
      shouldPost  = true
      shouldStory = true
    } else {
      // Otomatik (cron / after): uygunluk kuralları + kategori bayrakları
      const catId = typeof data.categoryId === 'string' ? data.categoryId : undefined
      const rule = await getRuleForCategory(catId)
      shouldPost  =
        isCanakkaleArticle(data) &&
        data.socialPublished !== true &&
        allowsAutoPost(rule)
      shouldStory =
        allowsAutoStory(rule, isStoryEligible(data)) &&
        data.storyPublished !== true
    }

    // Force değilse ve zaten yayınlandıysa atla (mode/manual açıkken)
    if (!force) {
      if (shouldPost && data.socialPublished === true) shouldPost = false
      if (shouldStory && data.storyPublished === true) shouldStory = false
    }

    if (!shouldPost && !shouldStory) {
      const reason = mode
        ? (mode === 'post'
            ? 'Bu haber zaten feed post olarak paylaşılmış (yeniden paylaşmak için force kullanın)'
            : mode === 'story'
              ? 'Bu haber zaten hikâye olarak paylaşılmış (yeniden paylaşmak için force kullanın)'
              : 'Post ve hikâye zaten yayınlanmış')
        : 'Post+Story zaten yayınlandı veya uygun değil'
      console.log(`[publishOneSocial] ${reason} — atlandı: ${newsId}`)
      return skipped(newsId, reason)
    }

    // Platform seçimi (varsayılan: hepsi)
    const wantFb = overrides?.platforms?.facebook !== false
    const wantIg = overrides?.platforms?.instagram !== false
    const wantTw = overrides?.platforms?.twitter === true // X opt-in (yalnızca post)

    if (shouldPost && !wantFb && !wantIg && !wantTw) {
      return skipped(newsId, 'Post için en az bir platform seçilmeli (Facebook / Instagram / X)')
    }
    if (shouldStory && !wantFb && !wantIg) {
      return skipped(newsId, 'Hikâye için Facebook veya Instagram seçilmeli')
    }

    // ── Force: bayrakları sıfırla ────────────────────────────────────────────
    if (force) {
      const reset: Record<string, unknown> = {}
      if (shouldPost) {
        reset.socialPublished = false
        reset.socialPublishedAt = FieldValue.delete()
        reset.facebookPostId = FieldValue.delete()
        reset.instagramMediaId = FieldValue.delete()
        reset.twitterTweetId = FieldValue.delete()
      }
      if (shouldStory) {
        reset.storyPublished = false
        reset.storyPublishedAt = FieldValue.delete()
        reset.instagramStoryId = FieldValue.delete()
        reset.facebookStoryId = FieldValue.delete()
      }
      if (Object.keys(reset).length > 0) {
        await db.collection(Collections.NEWS).doc(newsId).update(reset).catch(() => {})
        data = { ...data, socialPublished: shouldPost ? false : data.socialPublished, storyPublished: shouldStory ? false : data.storyPublished }
      }
    }

    // ── Görsel zorunluluğu ───────────────────────────────────────────────────
    const coverImage = extractImageUrl(data)
    if (!coverImage) {
      console.log(`[publishOneSocial] Görsel yok — paylaşım atlandı: ${newsId}`)
      return skipped(newsId, 'Görsel yok — paylaşım için kapak görseli gerekli')
    }

    // ── Metin hazırlığı ──────────────────────────────────────────────────────
    const spot: string =
      typeof data.spot        === 'string' ? data.spot        :
      typeof data.summary     === 'string' ? data.summary     :
      typeof data.description === 'string' ? data.description : ''

    const rawContent: string =
      typeof data.content === 'string' ? data.content :
      typeof data.body    === 'string' ? data.body    : ''

    const fullText = rawContent ? stripHtml(rawContent) : spot
    const bodyText = fullText.slice(0, 2000)

    const articleUrl = buildArticleUrl(newsId, data)
    const cityName   = typeof data.cityName === 'string' ? data.cityName : 'Çanakkale'

    // ── AI içerik üretimi (override yoksa) ───────────────────────────────────
    const hasFullOverride =
      !!(overrides?.headline?.trim()) &&
      !!(overrides?.caption?.trim() || overrides?.storySummary?.trim())

    let socialContent = hasFullOverride
      ? null
      : await generateSocialContent(title, bodyText.length > 100 ? bodyText : spot, cityName)

    if (!socialContent) {
      const fallbackSpot = spot.replace(/\s+/g, ' ').trim()
      socialContent = {
        headline: clampCompleteHeadline(title, 78),
        storySummary: (() => {
          const cleaned = fallbackSpot
            .replace(/\b(detaylar(?:ı|ın)?\s+(?:için\s+)?(?:haberimizde|tıklayın)|haberimizde|haberin\s+devamı|devamı\s+için|devamını\s+oku|tıklayın)\b/giu, '')
            .replace(/\s{2,}/g, ' ')
            .trim()
          if (!cleaned) return `${clampAtWordBoundary(title, 120)}.`
          if (cleaned.length <= 160) return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`
          return clampCompleteSentences(cleaned, 130)
        })(),
        caption:  spot ? `📰 ${spot.trim()}` : `📰 ${title.trim()}`,
        hashtags: ['#NaHaber', '#Çanakkale', '#SonDakika', '#Haber', '#Türkiye'],
        altText:  title,
      }
    }

    // Composer override'ları uygula
    if (overrides?.headline?.trim()) {
      socialContent.headline = overrides.headline.trim()
    }
    if (overrides?.caption?.trim()) {
      socialContent.caption = overrides.caption.trim()
    }
    if (overrides?.storySummary?.trim()) {
      socialContent.storySummary = overrides.storySummary.trim()
    } else if (overrides?.caption?.trim() && shouldStory && !shouldPost) {
      // Yalnız hikâye: caption alanı özet olarak da kullanılabilir
      socialContent.storySummary = overrides.caption.trim()
    }
    if (Array.isArray(overrides?.hashtags) && overrides.hashtags.length > 0) {
      socialContent.hashtags = overrides.hashtags
        .map((t) => {
          const s = String(t).trim()
          return s.startsWith('#') ? s : `#${s}`
        })
        .filter(Boolean)
    }

    // OG görseli Firestore'dan socialHeadline/socialStorySummary okur —
    // paylaşmadan önce kaydet ki taze OG doğru metni kullansın.
    try {
      await db.collection(Collections.NEWS).doc(newsId).update({
        socialHeadline: socialContent.headline,
        socialStorySummary: socialContent.storySummary,
        socialCaption: socialContent.caption,
        socialHashtags: socialContent.hashtags,
      })
    } catch (err) {
      console.warn(`[publishOneSocial] social fields pre-save failed ${newsId}:`, err)
    }

    const socialImageUrl = `https://nahaber.com/api/og/social/${newsId}?v=${Date.now()}`
    const storyImageUrl  = `https://nahaber.com/api/og/story/${newsId}?v=${Date.now()}`

    const result: PublishOneSocialResult = {
      ok: false,
      newsId,
      skipped: false,
      title: title.slice(0, 120),
    }

    // ── POST (Çanakkale / manuel) ────────────────────────────────────────────
    if (shouldPost) {
      const payload: SocialPublishPayload = {
        newsId,
        title,
        description: socialContent.caption,
        imageUrl: socialImageUrl,
        articleUrl,
        hashtags: socialContent.hashtags,
      }

      let fbResult: SocialPublishResult = { success: false, error: wantFb ? 'not attempted' : 'skipped' }
      let igResult: SocialPublishResult = { success: false, error: wantIg ? 'not attempted' : 'skipped' }
      let twResult: SocialPublishResult = { success: false, error: wantTw ? 'not attempted' : 'skipped' }

      if (wantFb) {
        try { fbResult = await publishToFacebook(payload) }
        catch (err) { fbResult = { success: false, error: err instanceof Error ? err.message : String(err) } }
        await new Promise(r => setTimeout(r, 2000))
      }

      if (wantIg) {
        try { igResult = await publishToInstagram(payload) }
        catch (err) { igResult = { success: false, error: err instanceof Error ? err.message : String(err) } }
        if (wantTw) await new Promise(r => setTimeout(r, 2000))
      }

      if (wantTw) {
        try { twResult = await publishToTwitter(payload) }
        catch (err) { twResult = { success: false, error: err instanceof Error ? err.message : String(err) } }
      }

      result.post = { attempted: true, facebook: fbResult, instagram: igResult, twitter: twResult }

      if (fbResult.success || igResult.success || twResult.success) {
        const update: Record<string, unknown> = {
          socialPublished:   true,
          socialPublishedAt: FieldValue.serverTimestamp(),
          socialImageUrl,
          socialHeadline:      socialContent.headline,
          socialStorySummary:  socialContent.storySummary,
          socialCaption:       socialContent.caption,
          socialHashtags:      socialContent.hashtags,
        }
        if (fbResult.platformId) update.facebookPostId   = fbResult.platformId
        if (igResult.platformId) update.instagramMediaId = igResult.platformId
        if (twResult.platformId) update.twitterTweetId   = twResult.platformId
        await db.collection(Collections.NEWS).doc(newsId).update(update)
        console.log(`[publishOneSocial] POST ✓ ${newsId} — FB:${fbResult.success} IG:${igResult.success} X:${twResult.success}`)
      } else {
        console.warn(`[publishOneSocial] POST ✗ ${newsId} — FB: ${fbResult.error} | IG: ${igResult.error} | X: ${twResult.error}`)
      }

      if (shouldStory) await new Promise(r => setTimeout(r, 2000))
    }

    // ── HİKAYE (güncel + öne çıkan / manuel) ────────────────────────────────
    if (shouldStory) {
      const storyPayload: SocialPublishPayload = {
        newsId, title: socialContent.headline || title,
        description: undefined, imageUrl: storyImageUrl, articleUrl,
      }

      if (!articleUrl?.trim()) {
        console.warn(`[publishOneSocial] STORY articleUrl eksik — yine de denenecek: ${newsId}`)
      }

      let igStoryResult: SocialPublishResult = { success: false, error: wantIg ? 'not attempted' : 'skipped' }
      let fbStoryResult: SocialPublishResult = { success: false, error: wantFb ? 'not attempted' : 'skipped' }

      if (wantIg) {
        try {
          igStoryResult = await publishInstagramStory(storyPayload)
          console.log(`[publishOneSocial] IG Story → ${newsId}: ${igStoryResult.success ? '✓' : igStoryResult.error}`)
        } catch (err) {
          igStoryResult = { success: false, error: err instanceof Error ? err.message : String(err) }
        }
        if (wantFb) await new Promise(r => setTimeout(r, 2000))
      }

      if (wantFb) {
        try {
          fbStoryResult = await publishFacebookStory(storyPayload)
          console.log(`[publishOneSocial] FB Story → ${newsId}: ${fbStoryResult.success ? '✓' : fbStoryResult.error}`)
        } catch (err) {
          fbStoryResult = { success: false, error: err instanceof Error ? err.message : String(err) }
        }
      }

      result.story = { attempted: true, facebook: fbStoryResult, instagram: igStoryResult }

      if (igStoryResult.success || fbStoryResult.success) {
        const storyUpdate: Record<string, unknown> = {
          storyPublished:   true,
          storyPublishedAt: FieldValue.serverTimestamp(),
          socialHeadline: socialContent.headline,
          socialStorySummary: socialContent.storySummary,
        }
        if (igStoryResult.platformId) storyUpdate.instagramStoryId = igStoryResult.platformId
        if (fbStoryResult.platformId) storyUpdate.facebookStoryId  = fbStoryResult.platformId
        await db.collection(Collections.NEWS).doc(newsId).update(storyUpdate)
        console.log(`[publishOneSocial] STORY ✓ ${newsId} — IG:${igStoryResult.success} FB:${fbStoryResult.success}`)
      } else {
        console.warn(`[publishOneSocial] STORY ✗ ${newsId} — IG: ${igStoryResult.error} | FB: ${fbStoryResult.error}`)
      }
    }

    const postOk  = !!(result.post && (
      result.post.facebook.success ||
      result.post.instagram.success ||
      result.post.twitter?.success
    ))
    const storyOk = !!(result.story && (result.story.facebook.success || result.story.instagram.success))
    result.ok = postOk || storyOk

    if (!result.ok) {
      const parts: string[] = []
      if (result.post) {
        parts.push(
          `Post FB: ${result.post.facebook.error ?? '—'} | IG: ${result.post.instagram.error ?? '—'}` +
          (result.post.twitter ? ` | X: ${result.post.twitter.error ?? '—'}` : '')
        )
      }
      if (result.story) {
        parts.push(`Hikâye FB: ${result.story.facebook.error ?? '—'} | IG: ${result.story.instagram.error ?? '—'}`)
      }
      result.reason = parts.join(' · ') || 'Paylaşım başarısız'
    }

    return result
  } catch (err) {
    // Fire-and-forget: hata yutulur, cron bir sonraki çalışmada tekrar dener
    console.error('[publishOneSocial] Beklenmeyen hata:', err)
    return {
      ok: false,
      newsId,
      skipped: false,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Görsel URL yardımcısı (harici kullanım için) ──────────────────────────────
export { extractImageUrl }
