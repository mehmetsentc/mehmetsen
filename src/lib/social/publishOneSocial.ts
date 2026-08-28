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
import { publishToThreads } from '@/lib/social/threads'
import { generateSocialContent } from '@/lib/social/aiSocialEditor'
import type { SocialPublishPayload, SocialPublishResult } from '@/lib/social/types'
import { clampAtWordBoundary, clampCompleteSentences, overlayHeadlineFromTitle } from '@/lib/social/feedCaption'
import { isGarbledSocialCopy, repairSocialCopyAgainstSource } from '@/lib/social/socialFactualFidelity'
import { getRuleForCategory } from '@/lib/social/categoryRulesStore'
import { allowsAutoPost, allowsAutoStory } from '@/lib/social/categoryRules'
import { getAutoShareSettings } from '@/lib/social/autoShareSettingsStore'
import { buildSocialImagePayload, materializeBrandedOgForPublish } from '@/lib/social/carouselImages'
import { buildOgSocialUrl, buildOgStoryUrl } from '@/lib/social/ogCacheVersion'
import {
  buildPublicArticleUrl,
  isPublicShareArticleUrl,
} from '@/lib/social/articleUrl'
import { isPlaceholderDraftSlug } from '@/lib/newsSlug'
import { ensurePublicNewsSlug } from '@/services/newsDraftService'
import { articleBlocksToPlainText, type ArticleBlock } from '@/lib/articleBlocks'

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

  // Resmi belediye duyuruları (Çanakkale .bel.tr) — otomatik paylaşım serbest
  const ingestion = String(data.ingestionSourceId ?? data.sourceId ?? '').toLowerCase()
  const categoryId = String(data.categoryId ?? '').toLowerCase()
  if (
    sourceUrl.includes('.bel.tr') &&
    (ingestion.startsWith('bel-canakkale-') || categoryId === 'yerel-duyuru')
  ) {
    return true
  }

  // Harici URL → başka kaynaktan (cron engeller; manuel paylaşım serbest)
  return false
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

/**
 * Canlı yayın akışı, canlı blog veya canlı maç/yayın izleme linki mi?
 * Not: Normal TV yayını açıklaması ("Bakan canlı yayında açıkladı", "Canlı yayın yanıtı")
 * haber metnidir ve engellenmez. Yalnızca gerçek canlı blog / canlı yayın akışları filtrelenir.
 */
export function isLiveBlogOrStream(data: Record<string, unknown>): boolean {
  if (data.isLiveBlog === true || data.isLive === true || data.isLiveStream === true) {
    return true
  }

  const title = String(data.title ?? '').trim()
  if (!title) return false

  const t = title.toLocaleLowerCase('tr')

  // Başlıkta #canlı, #shorts, #ankacanlı etiketleri
  if (/(?:^|[\s\[])#\s*(?:canlı|canli|shorts|ankacanlı|ankacanli)/i.test(t)) {
    return true
  }

  // Başlık açık bir canlı yayın/blog prefixi ile başlıyorsa:
  // "CANLI: ...", "[CANLI] ...", "CANLI YAYIN: ...", "CANLI ANLATIM: ...", "CANLI BLOG: ..."
  if (/^(?:\[\s*(?:canlı|canli)\s*\]|(?:canlı|canli)\s*:|(?:canlı|canli)\s+yay[ıi]n\s*:|(?:canlı|canli)\s+takip\s*:|(?:canlı|canli)\s+anlat[ıi]m\s*:|(?:canlı|canli)\s+blog\s*:)/i.test(t)) {
    return true
  }

  // Canlı izleme / streaming yönlendirme başlıkları (ör. "Canlı yayın izle", "Canlı maç izle", "Kesintisiz canlı izle")
  if (/(?<![\p{L}\p{N}])(?:canlı|canli)\s*(?:yay[ıi]n\s*)?izle(?:yin)?(?![\p{L}\p{N}])/iu.test(t)) {
    return true
  }
  if (/(?<![\p{L}\p{N}])(?:(?:canlı|canli)\s*maç\s*izle|kesintisiz\s+(?:canlı|canli)\s+izle|(?:canlı|canli)\s+tv\s+izle)(?![\p{L}\p{N}])/iu.test(t)) {
    return true
  }

  // Canlı blog / canlı takip akışı başlıkları (ör. "Dakika dakika canlı anlatım", "Canlı blog", "Canlı takip")
  if (/(?<![\p{L}\p{N}])dakika\s+dakika\s+(?:canlı|canli)\s+anlat[ıi]m(?![\p{L}\p{N}])/iu.test(t)) {
    return true
  }
  if (/(?<![\p{L}\p{N}])(?:canlı|canli)\s+anlat[ıi]m\s*-\s*(?:canlı|canli)\s+takip(?![\p{L}\p{N}])/iu.test(t)) {
    return true
  }

  return false
}

/**
 * Yalnızca sosyal medya/kanal tanıtımı veya reklam olan içerikler.
 * İçeriğinde Telegram/WhatsApp linki geçen ancak gerçek haber gövdesi olan haberler engellenmez.
 */
export function isPromoOnlyContent(data: Record<string, unknown>): boolean {
  if (data.isPromo === true || data.isAdvertisement === true || data.isSponsored === true) {
    return true
  }

  const title = String(data.title ?? '').toLowerCase()
  if (
    title.includes('kanalımıza abone') ||
    title.includes('kanalımıza katılın') ||
    title.includes('whatsapp kanalımıza') ||
    title.includes('telegram kanalımıza')
  ) {
    return true
  }

  const spot = String(data.spot ?? data.summary ?? data.description ?? data.feedTeaser ?? '')
  let blockText = ''
  if (Array.isArray(data.bodyBlocks) && data.bodyBlocks.length > 0) {
    blockText = articleBlocksToPlainText(data.bodyBlocks as ArticleBlock[])
  }
  const content =
    typeof data.content === 'string' && data.content.trim()
      ? data.content
      : typeof data.body === 'string' && data.body.trim()
        ? data.body
        : blockText || (typeof data.htmlContent === 'string' ? data.htmlContent : '')
  const combined = stripHtml(`${spot} ${content}`).trim().toLowerCase()

  const PROMO_PATTERNS = [
    'whatsapp.com/channel',
    'bsky.app/profile',
    'sosyal medya hesaplarımızı takip',
    'takip etmeyi unutmayın',
    'kanalımıza abone',
    't.me/',
    'youtube.com/@',
  ]

  const hasPromoPattern = PROMO_PATTERNS.some((p) => combined.includes(p))
  if (hasPromoPattern) {
    let stripped = combined
    for (const p of PROMO_PATTERNS) {
      stripped = stripped.replaceAll(p, '')
    }
    stripped = stripped.replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim()
    if (stripped.length < 60) {
      return true
    }
  }

  return false
}

/**
 * Haber içeriği veya özeti tamamen boş mu?
 * spot, summary, description, content, body, bodyBlocks, htmlContent alanlarını denetler.
 */
export function isContentEmpty(data: Record<string, unknown>): boolean {
  const spot = String(data.spot ?? data.summary ?? data.description ?? data.feedTeaser ?? '')
  let blockText = ''
  if (Array.isArray(data.bodyBlocks) && data.bodyBlocks.length > 0) {
    blockText = articleBlocksToPlainText(data.bodyBlocks as ArticleBlock[])
  }
  const content =
    typeof data.content === 'string' && data.content.trim()
      ? data.content
      : typeof data.body === 'string' && data.body.trim()
        ? data.body
        : blockText || (typeof data.htmlContent === 'string' ? data.htmlContent : '')
  const plainSpot = stripHtml(spot).trim()
  const plainContent = stripHtml(content).trim()

  // Spot 10 karakterden kısa VE içerik de 30 karakterden azsa boş kabul et
  if (plainSpot.length < 10 && plainContent.length < 30) {
    return true
  }

  return false
}

/**
 * Canlı yayın / boş içerik / sosyal medya tanıtım haberlerini yakala.
 * Bunlar otomatik sosyal medya yayınlarına gönderilmemeli.
 */
export function isSkippableForSocial(data: Record<string, unknown>): boolean {
  return isLiveBlogOrStream(data) || isPromoOnlyContent(data) || isContentEmpty(data)
}

/** FB veya IG feed post ID'si var mı? */
export function hasMetaFeedPublish(data: Record<string, unknown>): boolean {
  const fb = typeof data.facebookPostId === 'string' && data.facebookPostId.trim().length > 0
  const ig = typeof data.instagramMediaId === 'string' && data.instagramMediaId.trim().length > 0
  return fb || ig
}

/**
 * Feed paylaşımı tamam mı?
 * Threads-only TEXT success + socialPublished=true eski bug'ında IG/FB boş kalırdı —
 * bunları "tamamlanmamış" sayıp cron'un yeniden denemesine izin ver.
 */
export function isSocialFeedComplete(data: Record<string, unknown>): boolean {
  if (data.socialPublished !== true) return false
  return hasMetaFeedPublish(data)
}

// ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────

function extractImageUrl(data: Record<string, unknown>): string | undefined {
  const candidates = [data.thumbnail, data.coverImageUrl, data.imageUrl, data.featuredImage, data.image]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 10) return c.trim()
  }
  return undefined
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
  /** Platform seçimi. Varsayılan: hepsi açık. X ve Threads yalnızca post modunda. */
  platforms?: {
    facebook?: boolean
    instagram?: boolean
    twitter?: boolean
    threads?: boolean
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
    threads?: SocialPublishResult
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
    if (isLiveBlogOrStream(data)) {
      console.log(`[publishOneSocial] Canlı yayın/canlı blog — atlandı: ${newsId}`)
      return skipped(newsId, 'Canlı yayın veya canlı blog — paylaşıma uygun değil')
    }
    if (isPromoOnlyContent(data)) {
      console.log(`[publishOneSocial] Tanıtım/kanal içeriği — atlandı: ${newsId}`)
      return skipped(newsId, 'Tanıtım veya kanal yönlendirme içeriği — paylaşıma uygun değil')
    }
    if (isContentEmpty(data)) {
      console.log(`[publishOneSocial] Boş içerik — atlandı: ${newsId}`)
      return skipped(newsId, 'Haber içeriği veya özeti boş — paylaşıma uygun değil')
    }

    // Global otomatik paylaşım ayarları (manuel paylaşımı etkilemez)
    const autoShare = manual ? null : await getAutoShareSettings()
    if (autoShare && !autoShare.autoOnPublish && !mode) {
      // CMS yayınında anlık paylaşım kapalı — cron ayrı çalışır
      console.log(`[publishOneSocial] autoOnPublish kapalı — anlık paylaşım atlandı: ${newsId}`)
      return skipped(newsId, 'Yayınlanınca otomatik paylaşım kapalı (cron ayrı çalışır)')
    }

    const title = typeof data.title === 'string' ? data.title : ''
    if (!title) return skipped(newsId, 'Haber başlığı yok')

    // Draft placeholder slugs (`taslak-*`) must never appear in Haberi Oku links.
    // Upgrade to an SEO slug before building captions / calling platform APIs.
    const currentSlug = typeof data.slug === 'string' ? data.slug.trim() : ''
    if (!currentSlug || isPlaceholderDraftSlug(currentSlug)) {
      try {
        const publicSlug = await ensurePublicNewsSlug(db, newsId, title, currentSlug)
        data = { ...data, slug: publicSlug }
        console.log(
          `[publishOneSocial] draft slug upgraded ${newsId}: ${currentSlug || '(empty)'} → ${publicSlug}`
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[publishOneSocial] slug upgrade failed ${newsId}:`, msg)
        return skipped(newsId, 'Yayın SEO slug atanamadı — sosyal paylaşım ertelendi')
      }
    }

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
      // Otomatik (cron / after): uygunluk kuralları + kategori bayrakları + global toggle
      const catId = typeof data.categoryId === 'string' ? data.categoryId : undefined
      const rule = await getRuleForCategory(catId)
      shouldPost  =
        autoShare!.autoPost &&
        isCanakkaleArticle(data) &&
        !isSocialFeedComplete(data) &&
        allowsAutoPost(rule)
      shouldStory =
        autoShare!.autoStory &&
        allowsAutoStory(rule, isStoryEligible(data)) &&
        data.storyPublished !== true
    }

    // Force değilse ve zaten yayınlandıysa atla (mode/manual açıkken)
    if (!force) {
      if (shouldPost && isSocialFeedComplete(data)) shouldPost = false
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

    // Platform seçimi (varsayılan: hepsi). Force değilse zaten yayınlanmış platformları atla.
    let wantFb = overrides?.platforms?.facebook !== false
    let wantIg = overrides?.platforms?.instagram !== false
    let wantTw = overrides?.platforms?.twitter !== false  // X varsayılan: açık
    let wantTh = overrides?.platforms?.threads !== false  // Threads varsayılan: açık
    if (!force) {
      if (wantFb && typeof data.facebookPostId === 'string' && data.facebookPostId) wantFb = false
      if (wantIg && typeof data.instagramMediaId === 'string' && data.instagramMediaId) wantIg = false
      if (wantTw && typeof data.twitterTweetId === 'string' && data.twitterTweetId) wantTw = false
      if (wantTh && typeof data.threadsPostId === 'string' && data.threadsPostId) wantTh = false
    }

    if (shouldPost && !wantFb && !wantIg && !wantTw && !wantTh) {
      return skipped(newsId, 'Post için en az bir platform seçilmeli (Facebook / Instagram / X / Threads)')
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

    let blockText = ''
    if (Array.isArray(data.bodyBlocks) && data.bodyBlocks.length > 0) {
      blockText = articleBlocksToPlainText(data.bodyBlocks as ArticleBlock[])
    }

    const rawContent: string =
      typeof data.content === 'string' && data.content.trim() ? data.content :
      typeof data.body    === 'string' && data.body.trim()    ? data.body    :
      blockText ||
      (typeof data.htmlContent === 'string' ? data.htmlContent : '')

    const fullText = rawContent ? stripHtml(rawContent) : spot
    const bodyText = fullText.slice(0, 2000)

    const articleUrl = buildPublicArticleUrl(newsId, data)
    if (!articleUrl || !isPublicShareArticleUrl(articleUrl)) {
      console.warn(
        `[publishOneSocial] public article URL yok / taslak — paylaşım engellendi: ${newsId}`
      )
      return skipped(newsId, 'Herkese açık haber URL’si yok (taslak slug) — paylaşım engellendi')
    }
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
        headline: overlayHeadlineFromTitle(title),
        storySummary: (() => {
          const cleaned = fallbackSpot
            .replace(/\b(detaylar(?:ı|ın)?\s+(?:için\s+)?(?:haberimizde|tıklayın)|haberimizde|haberin\s+devamı|devamı\s+için|devamını\s+oku|tıklayın)\b/giu, '')
            .replace(/\s{2,}/g, ' ')
            .trim()
          if (!cleaned) return `${clampAtWordBoundary(title, 120)}.`
          return clampCompleteSentences(
            /[.!?…]["'»”’)\]]*$/.test(cleaned) ? cleaned : `${cleaned}.`,
            200,
            232,
          )
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

    // Overlay: haber başlığı. Caption: DeepSeek; salata ise başlık+spot.
    if (!overrides?.headline?.trim()) {
      socialContent.headline = overlayHeadlineFromTitle(title)
    }
    socialContent.storySummary = repairSocialCopyAgainstSource(
      socialContent.storySummary,
      title,
      bodyText || spot,
    )
    if (isGarbledSocialCopy(socialContent.storySummary)) {
      const cleaned = (spot || '').replace(/\s+/g, ' ').trim()
      socialContent.storySummary = cleaned
        ? clampCompleteSentences(/[.!?…]["'»”’)\]]*$/.test(cleaned) ? cleaned : `${cleaned}.`, 200, 232)
        : `${clampAtWordBoundary(title, 120)}.`
    }
    socialContent.caption = repairSocialCopyAgainstSource(
      socialContent.caption,
      title,
      bodyText || spot,
    )
    if (!overrides?.caption?.trim() && isGarbledSocialCopy(socialContent.caption)) {
      socialContent.caption = spot ? `📰 ${title}\n\n${spot.trim()}` : `📰 ${title}`
    }

    // Hikâye özeti: daima tam cümle (override dahil) — OG mid-word clip önlemi
    socialContent.storySummary = clampCompleteSentences(
      socialContent.storySummary.replace(/\s+/g, ' ').trim(),
      200,
      232,
    )

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

    const ogVersionFields = {
      title,
      socialHeadline: socialContent.headline,
      socialStorySummary: socialContent.storySummary,
      imageUrl: extractImageUrl(data),
      updatedAt: typeof data.updatedAt === 'number' || typeof data.updatedAt === 'string'
        ? data.updatedAt
        : undefined,
    }
    const socialImageUrl = buildOgSocialUrl(newsId, ogVersionFields)
    const storyOgUrl = buildOgStoryUrl(newsId, ogVersionFields)

    // Hybrid carousel: 2+ kaynak görsel → slide1 branded OG + orijinaller
    // Markalı OG Storage'a sabitlenir; lacivert/kapaksız kart Meta'ya gitmez.
    const imagePayload = shouldPost
      ? await buildSocialImagePayload(newsId, socialImageUrl, data, {
          fallbackImageUrl: coverImage,
        })
      : { imageUrl: socialImageUrl, mode: 'single' as const }

    const storyImageUrl = shouldStory
      ? await materializeBrandedOgForPublish(storyOgUrl, newsId, coverImage, 'story')
      : storyOgUrl

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
        imageUrl: imagePayload.imageUrl,
        ...(imagePayload.imageUrls ? { imageUrls: imagePayload.imageUrls } : {}),
        articleUrl,
        hashtags: socialContent.hashtags,
        cityName,
        citySlug: typeof data.citySlug === 'string' ? data.citySlug : undefined,
      }

      console.log(
        `[publishOneSocial] POST ${imagePayload.mode} — ${newsId}` +
          (imagePayload.imageUrls ? ` (${imagePayload.imageUrls.length} slides)` : '')
      )

      let fbResult: SocialPublishResult = { success: false, error: wantFb ? 'not attempted' : 'skipped' }
      let igResult: SocialPublishResult = { success: false, error: wantIg ? 'not attempted' : 'skipped' }
      let twResult: SocialPublishResult = { success: false, error: wantTw ? 'not attempted' : 'skipped' }
      let thResult: SocialPublishResult = { success: false, error: wantTh ? 'not attempted' : 'skipped' }

      if (wantFb) {
        try { fbResult = await publishToFacebook(payload) }
        catch (err) { fbResult = { success: false, error: err instanceof Error ? err.message : String(err) } }
        await new Promise(r => setTimeout(r, 2000))
      }

      if (wantIg) {
        try { igResult = await publishToInstagram(payload) }
        catch (err) { igResult = { success: false, error: err instanceof Error ? err.message : String(err) } }
        await new Promise(r => setTimeout(r, 2000))
      }

      if (wantTw) {
        try { twResult = await publishToTwitter(payload) }
        catch (err) { twResult = { success: false, error: err instanceof Error ? err.message : String(err) } }
        if (wantTh) await new Promise(r => setTimeout(r, 2000))
      }

      if (wantTh) {
        try { thResult = await publishToThreads(payload) }
        catch (err) { thResult = { success: false, error: err instanceof Error ? err.message : String(err) } }
      }

      result.post = { attempted: true, facebook: fbResult, instagram: igResult, twitter: twResult, threads: thResult }

      // Threads TEXT fallback "başarı" sayılınca socialPublished=true oluyordu → IG/FB bir daha denenmiyordu.
      // Tamamlama: FB veya IG başarılı (veya ikisi de istenmiyor ve X/Threads oldu).
      const primaryOk = fbResult.success || igResult.success
      const textOnlyOk =
        !wantFb &&
        !wantIg &&
        (twResult.success || thResult.success)
      const alreadyHadPrimary = hasMetaFeedPublish(data)

      if (primaryOk || textOnlyOk || twResult.success || thResult.success || alreadyHadPrimary) {
        const update: Record<string, unknown> = {
          socialHeadline:      socialContent.headline,
          socialStorySummary:  socialContent.storySummary,
          socialCaption:       socialContent.caption,
          socialHashtags:      socialContent.hashtags,
        }
        if (imagePayload.imageUrl || socialImageUrl) {
          update.socialImageUrl = imagePayload.imageUrl || socialImageUrl
        }
        if (fbResult.platformId) update.facebookPostId   = fbResult.platformId
        if (igResult.platformId) update.instagramMediaId = igResult.platformId
        if (twResult.platformId) update.twitterTweetId   = twResult.platformId
        if (thResult.platformId) update.threadsPostId    = thResult.platformId

        if (primaryOk || textOnlyOk || alreadyHadPrimary) {
          update.socialPublished = true
          update.socialPublishedAt = FieldValue.serverTimestamp()
        } else {
          // Yalnızca Threads/X oldu — IG/FB için cron tekrar denesin
          console.warn(
            `[publishOneSocial] POST partial (TH/X only) — ${newsId}; socialPublished bırakılmadı (IG/FB retry)`,
          )
        }

        await db.collection(Collections.NEWS).doc(newsId).update(update)
        console.log(`[publishOneSocial] POST ✓ ${newsId} — FB:${fbResult.success} IG:${igResult.success} X:${twResult.success} TH:${thResult.success}`)
      } else {
        console.warn(`[publishOneSocial] POST ✗ ${newsId} — FB: ${fbResult.error} | IG: ${igResult.error} | X: ${twResult.error} | TH: ${thResult.error}`)
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
      result.post.twitter?.success  ||
      result.post.threads?.success
    ))
    const storyOk = !!(result.story && (result.story.facebook.success || result.story.instagram.success))
    result.ok = postOk || storyOk

    if (!result.ok) {
      const parts: string[] = []
      if (result.post) {
        parts.push(
          `Post FB: ${result.post.facebook.error ?? '—'} | IG: ${result.post.instagram.error ?? '—'}` +
          (result.post.twitter ? ` | X: ${result.post.twitter.error ?? '—'}` : '') +
          (result.post.threads ? ` | TH: ${result.post.threads.error ?? '—'}` : '')
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
