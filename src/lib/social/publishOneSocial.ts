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
import { safeErrorText } from './safeLog'
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
import { buildSocialImagePayload, collectNewsImageUrls, materializeBrandedOgForPublish } from '@/lib/social/carouselImages'
import { buildOgSocialUrl, buildOgStoryUrl } from '@/lib/social/ogCacheVersion'
import {
  buildPublicArticleUrl,
  isPublicShareArticleUrl,
} from '@/lib/social/articleUrl'
import { isPlaceholderDraftSlug } from '@/lib/newsSlug'
import { ensurePublicNewsSlug } from '@/services/newsDraftService'
import { articleBlocksToPlainText, type ArticleBlock } from '@/lib/articleBlocks'
import { publishToTarget, type PublishTargets, type TargetablePlatform } from '@/lib/social/accounts/targetedPublish'
import { imageModeProblem, type ImageMode, type PublishFormat } from '@/lib/social/accounts/capabilities'
import { singleCoverPayload } from '@/lib/social/imagePolicy'
import { isSocialTestMode, socialTestEnvStatus, TEST_ENV_TEXT } from '@/lib/social/testEnvironment'
import { isVerifiedPublish, legacyAccountId, type LegacyPublishOptions } from './accounts/legacyLock'

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
  /**
   * Post görsel biçimi (composer'da açık seçim).
   *   single   → yalnızca markalı tek görsel (kaydırmalı hazırlanmaz)
   *   carousel → yalnızca kaydırmalı; desteklemeyen platform seçiliyse veya
   *              en az 2 görsel hazırlanamazsa paylaşım YAPILMAZ (sessiz tek görsel yok)
   *   (yok)    → eski otomatik davranış (cron / after / eski istemciler)
   */
  imageMode?: ImageMode
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
  /**
   * Açık hedef hesaplar (yalnızca manuel). Hedefi verilmeyen platform eski
   * Onyeditivi yolunu kullanır. Hedef başarısızsa legacy'ye geri düşülmez.
   */
  targets?: PublishTargets
  /** Hedefli yayında denetim/ledger için işlemi yapan CMS kullanıcısı. */
  actorUid?: string
  /**
   * Yalnızca bu `socialPublishRecords` kaydı için: operatör platformda kontrol
   * etti ve yeniden yayımlamayı onayladı. Başka kayıtlara/hesaplara uygulanmaz.
   */
  acknowledgeUncertainRecordId?: string
  /** Operatörün gördüğü deneme kimliği; kayıt bu denemede değilse onay geçersizdir. */
  acknowledgeUncertainAttemptId?: string
  /** Tanılama etiketi: composer | after | uncertain_republish … */
  trigger?: string
  /**
   * Ledger kilidinde `succeeded` kaydını aşma izni. Varsayılan = `force`.
   * Belirsiz kayıt yeniden yayımı `false` verir: haber belgesi bayrakları
   * (yalnızca seçilen platform için) sıfırlanır ama arada başarıya dönmüş
   * bir kayıt yine engellenir.
   */
  ledgerForce?: boolean
  /** force sıfırlamasını yalnızca bu istekte seçili platformlarla sınırla. */
  scopedForce?: boolean
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
/**
 * Haber belgesi muhasebesi için: ledger "zaten yayımlandı" deyip doğrulanmış
 * dış kimliği döndürdüyse (yeniden yayın YAPILMADAN) eksik legacy alanı
 * uzlaştırılır. Kimlik yoksa başarı sayılmaz.
 */
function reconcileForNewsDoc(r: SocialPublishResult): SocialPublishResult {
  if (r.success) return r
  if (isVerifiedPublish(r)) return { ...r, success: true }
  // Başarısız sonuçtaki olası kimlik haber belgesine yazılmaz.
  const { platformId: _drop, ...rest } = r
  void _drop
  return rest
}

export async function publishOneSocial(
  newsId: string,
  options: PublishOneSocialOptions = {},
): Promise<PublishOneSocialResult> {
  const { mode, force = false, manual = false, overrides } = options
  const targets: PublishTargets = options.targets ?? {}
  const hasTargets = Object.keys(targets).length > 0
  // Haber belgesindeki Onyeditivi alanları için: hedefsiz çağrı ya da açık hedefin
  // legacy Onyeditivi hesabıyla aynı anahtar olması (ortak kilit, ortak alanlar).
  // legacyAccountId yalnızca hedef verilen platformlar için çözülür.
  const legacyTarget = {
    facebook: !targets.facebook || targets.facebook === (await legacyAccountId('facebook')),
    instagram: !targets.instagram || targets.instagram === (await legacyAccountId('instagram')),
    threads: !targets.threads || targets.threads === (await legacyAccountId('threads')),
  }
  if (hasTargets && (!manual || !options.actorUid)) {
    return skipped(newsId, 'Hedef hesap yalnızca yetkili manuel paylaşımda kullanılabilir')
  }
  // Test (preview) ortamı: yalnızca yetkili manuel + açık hedefli yayın; legacy,
  // X, cron/after() otomatik yayını kapalı. Yapılandırma eksikse hiç yayın yok.
  if (isSocialTestMode()) {
    if (socialTestEnvStatus().problems.length > 0) return skipped(newsId, TEST_ENV_TEXT.misconfigured)
    if (!manual || !options.actorUid) return skipped(newsId, TEST_ENV_TEXT.autoDisabled)
    const plat = overrides?.platforms
    if (!plat || plat.twitter) return skipped(newsId, plat?.twitter ? TEST_ENV_TEXT.twitterDisabled : TEST_ENV_TEXT.legacyDisabled)
    const wanted = (['facebook', 'instagram', 'threads'] as const).filter((p) => plat[p])
    if (wanted.length === 0 || wanted.some((p) => !targets[p])) return skipped(newsId, TEST_ENV_TEXT.legacyDisabled)
  }

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
        const msg = safeErrorText(err)
        console.error(`[publishOneSocial] slug upgrade failed ${newsId}:`, safeErrorText(msg))
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

    // Force değilse ve zaten yayınlandıysa atla (mode/manual açıkken).
    // Hedefli isteklerde bu haber-düzeyi Onyeditivi bayrakları hedef hesabı engellemez;
    // hedefler hesap bazlı ledger ile, legacy platformlar kendi alanlarıyla denetlenir.
    if (!force && !hasTargets) {
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
      if (wantFb && !targets.facebook && typeof data.facebookPostId === 'string' && data.facebookPostId) wantFb = false
      if (wantIg && !targets.instagram && typeof data.instagramMediaId === 'string' && data.instagramMediaId) wantIg = false
      if (wantTw && typeof data.twitterTweetId === 'string' && data.twitterTweetId) wantTw = false
      if (wantTh && !targets.threads && typeof data.threadsPostId === 'string' && data.threadsPostId) wantTh = false
    }

    if (shouldPost && !wantFb && !wantIg && !wantTw && !wantTh) {
      return skipped(newsId, 'Post için en az bir platform seçilmeli (Facebook / Instagram / X / Threads)')
    }
    if (shouldStory && !wantFb && !wantIg) {
      return skipped(newsId, 'Hikâye için Facebook veya Instagram seçilmeli')
    }

    // ── Görsel biçimi: desteklenmeyen kaydırmalı istek medya hazırlığından ÖNCE reddedilir ──
    const imageMode = overrides?.imageMode
    if (shouldPost && imageMode === 'carousel') {
      const postPlatforms = (['facebook', 'instagram', 'threads'] as const).filter((p) =>
        p === 'facebook' ? wantFb : p === 'instagram' ? wantIg : wantTh,
      )
      if (wantTw || imageModeProblem(imageMode, [...postPlatforms])) {
        return skipped(
          newsId,
          'Kaydırmalı gönderi yalnızca Instagram’da destekleniyor — Facebook / Threads / X için tek görsel seçin. Paylaşım yapılmadı.',
        )
      }
      if (collectNewsImageUrls(data).length < 2) {
        return skipped(newsId, 'Kaydırmalı gönderi için haberde en az 2 görsel gerekli. Paylaşım yapılmadı.')
      }
    }

    // Hedefli istekte, legacy hikâye platformları Onyeditivi'nin storyPublished bayrağını korur.
    const legacyStoryBlocked = hasTargets && !force && data.storyPublished === true

    // ── Force: bayrakları sıfırla ────────────────────────────────────────────
    if (force && (hasTargets || options.scopedForce === true)) {
      // Yalnızca bu istekte legacy (hedefsiz) kalan platformların Onyeditivi alanları sıfırlanır.
      const reset: Record<string, unknown> = {}
      const legacyPostFb = shouldPost && wantFb && !targets.facebook
      const legacyPostIg = shouldPost && wantIg && !targets.instagram
      if (legacyPostFb) reset.facebookPostId = FieldValue.delete()
      if (legacyPostIg) reset.instagramMediaId = FieldValue.delete()
      if (shouldPost && wantTw) reset.twitterTweetId = FieldValue.delete()
      if (legacyPostFb || legacyPostIg) {
        reset.socialPublished = false
        reset.socialPublishedAt = FieldValue.delete()
      }
      const legacyStoryFb = shouldStory && wantFb && !targets.facebook
      const legacyStoryIg = shouldStory && wantIg && !targets.instagram
      if (legacyStoryFb) reset.facebookStoryId = FieldValue.delete()
      if (legacyStoryIg) reset.instagramStoryId = FieldValue.delete()
      if (legacyStoryFb || legacyStoryIg) {
        reset.storyPublished = false
        reset.storyPublishedAt = FieldValue.delete()
      }
      if (Object.keys(reset).length > 0) {
        await db.collection(Collections.NEWS).doc(newsId).update(reset).catch(() => {})
        data = {
          ...data,
          ...(legacyPostFb || legacyPostIg ? { socialPublished: false } : {}),
          ...(legacyStoryFb || legacyStoryIg ? { storyPublished: false } : {}),
        }
      }
    } else if (force) {
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
    const storedHeadline = typeof data.socialHeadline === 'string' ? data.socialHeadline.trim() : ''
    const storedCaption = typeof data.socialCaption === 'string' ? data.socialCaption.trim() : ''
    const storedSummary = typeof data.socialStorySummary === 'string' ? data.socialStorySummary.trim() : ''
    const cmsSocialReady =
      storedHeadline.length >= 8 &&
      (storedCaption.length >= 12 || storedSummary.length >= 12) &&
      !isGarbledSocialCopy(storedHeadline)
    const hasFullOverride =
      !!(overrides?.headline?.trim()) &&
      !!(overrides?.caption?.trim() || overrides?.storySummary?.trim())

    let socialContent = hasFullOverride || cmsSocialReady
      ? null
      : await generateSocialContent(title, bodyText.length > 100 ? bodyText : spot, cityName)

    if (!socialContent) {
      const fallbackSpot = spot.replace(/\s+/g, ' ').trim()
      socialContent = {
        headline: cmsSocialReady ? storedHeadline : overlayHeadlineFromTitle(title),
        storySummary: (() => {
          if (cmsSocialReady && storedSummary) return storedSummary
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
        // caption: buildFeedCaption zaten "📰 {başlık}" ekler — gövde sadece özet olsun
        caption: (cmsSocialReady && storedCaption ? storedCaption : spot.trim()) || '',
        hashtags: ['#NaHaber', '#Çanakkale', '#SonDakika', '#Haber', '#Türkiye'],
        altText: (typeof data.imageAlt === 'string' && data.imageAlt.trim()) || title,
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
      // buildFeedCaption zaten "📰 {başlık}" ekler — fallback sadece spot özeti
      socialContent.caption = spot.trim() || ''
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
      console.warn(`[publishOneSocial] social fields pre-save failed ${newsId}:`, safeErrorText(err))
    }

    const catId = typeof data.categoryId === 'string' ? data.categoryId : String(data.category || 'gundem')
    const isBreakingNews = data.isBreaking === true || catId === 'son-dakika'

    const ogVersionFields = {
      title,
      socialHeadline: socialContent.headline,
      socialStorySummary: socialContent.storySummary,
      imageUrl: extractImageUrl(data),
      categoryId: catId,
      isBreaking: isBreakingNews,
      updatedAt: typeof data.updatedAt === 'number' || typeof data.updatedAt === 'string'
        ? data.updatedAt
        : undefined,
    }
    const socialImageUrl = buildOgSocialUrl(newsId, ogVersionFields)
    const storyOgUrl = buildOgStoryUrl(newsId, ogVersionFields)

    // Hybrid carousel: 2+ kaynak görsel → slide1 branded OG + orijinaller
    // Markalı OG Storage'a sabitlenir; lacivert/kapaksız kart Meta'ya gitmez.
    const imagePayload = shouldPost && imageMode === 'single'
      ? {
          // Açık tek görsel seçimi: kaydırmalı hazırlanmaz.
          imageUrl: await materializeBrandedOgForPublish(socialImageUrl, newsId, coverImage, 'post', {
            title: socialContent.headline || title,
            summary: socialContent.storySummary,
            categoryId: catId,
            isBreaking: isBreakingNews,
          }),
          mode: 'single' as const,
        }
      : shouldPost
      ? await buildSocialImagePayload(newsId, socialImageUrl, data, {
          fallbackImageUrl: coverImage,
          context: {
            title: socialContent.headline || title,
            summary: socialContent.storySummary,
            categoryId: catId,
            isBreaking: isBreakingNews,
          },
        })
      : { imageUrl: socialImageUrl, mode: 'single' as const }

    if (shouldPost && imageMode === 'carousel' && (imagePayload.mode !== 'carousel' || !('imageUrls' in imagePayload) || !imagePayload.imageUrls || imagePayload.imageUrls.length < 2)) {
      return skipped(newsId, 'Kaydırmalı görseller hazırlanamadı (en az 2 erişilebilir görsel gerekli). Paylaşım yapılmadı.')
    }

    const storyImageUrl = shouldStory
      ? await materializeBrandedOgForPublish(storyOgUrl, newsId, coverImage, 'story', {
          title: socialContent.headline || title,
          summary: socialContent.storySummary,
          categoryId: catId,
          isBreaking: isBreakingNews,
        })
      : storyOgUrl

    const result: PublishOneSocialResult = {
      ok: false,
      newsId,
      skipped: false,
      title: title.slice(0, 120),
    }

    /** Legacy (hedefsiz) adaptör çağrıları: ortak ledger kilidi (accounts/legacyLock). */
    const ledgerForce = options.ledgerForce ?? force
    const legacyOpts: LegacyPublishOptions = {
      force: ledgerForce,
      actorUid: options.actorUid,
      trigger: options.trigger ?? (options.manual ? 'composer' : 'after'),
      acknowledgeUncertainRecordId: options.acknowledgeUncertainRecordId ?? null,
      acknowledgeUncertainAttemptId: options.acknowledgeUncertainAttemptId ?? null,
    }
    const composerMode = (shouldPost && shouldStory ? 'both' : shouldStory ? 'story' : 'post') as 'post' | 'story' | 'both'
    /** Explicit-target publish: ledger claim → re-resolve → adapter. Never falls back to legacy. */
    const targeted = (
      platform: TargetablePlatform,
      format: PublishFormat,
      accountId: string,
      run: (target: unknown) => Promise<SocialPublishResult>,
    ) =>
      publishToTarget({
        newsId,
        platform,
        format,
        mode: composerMode,
        accountId,
        force: ledgerForce,
        acknowledgeUncertainRecordId: options.acknowledgeUncertainRecordId ?? null,
        acknowledgeUncertainAttemptId: options.acknowledgeUncertainAttemptId ?? null,
        actorUid: options.actorUid!,
        trigger: legacyOpts.trigger,
        publish: (t) => run(t),
      })

    // ── POST (Çanakkale / manuel) ────────────────────────────────────────────
    if (shouldPost) {
      const payload: SocialPublishPayload = {
        newsId,
        title,
        description: socialContent.caption,
        imageUrl: imagePayload.imageUrl,
        ...('imageUrls' in imagePayload && imagePayload.imageUrls ? { imageUrls: imagePayload.imageUrls } : {}),
        ...(imageMode ? { imageMode } : {}),
        articleUrl,
        hashtags: socialContent.hashtags,
        cityName,
        citySlug: typeof data.citySlug === 'string' ? data.citySlug : undefined,
      }

      console.log(
        `[publishOneSocial] POST ${imagePayload.mode} — ${newsId}` +
          ('imageUrls' in imagePayload && imagePayload.imageUrls ? ` (${imagePayload.imageUrls.length} slides)` : '')
      )

      let fbResult: SocialPublishResult = { success: false, error: wantFb ? 'not attempted' : 'skipped' }
      let igResult: SocialPublishResult = { success: false, error: wantIg ? 'not attempted' : 'skipped' }
      let twResult: SocialPublishResult = { success: false, error: wantTw ? 'not attempted' : 'skipped' }
      let thResult: SocialPublishResult = { success: false, error: wantTh ? 'not attempted' : 'skipped' }

      if (wantFb) {
        if (targets.facebook) fbResult = await targeted('facebook', 'post', targets.facebook, (t) => publishToFacebook(singleCoverPayload(payload, 'facebook'), t as never))
        else {
          try { fbResult = await publishToFacebook(singleCoverPayload(payload, 'facebook'), undefined, legacyOpts) }
          catch (err) { fbResult = { success: false, error: safeErrorText(err) } }
        }
        await new Promise(r => setTimeout(r, 2000))
      }

      if (wantIg) {
        if (targets.instagram) igResult = await targeted('instagram', 'post', targets.instagram, (t) => publishToInstagram(payload, t as never))
        else {
          try { igResult = await publishToInstagram(payload, undefined, legacyOpts) }
          catch (err) { igResult = { success: false, error: safeErrorText(err) } }
        }
        await new Promise(r => setTimeout(r, 2000))
      }

      if (wantTw) {
        try { twResult = await publishToTwitter(payload) }
        catch (err) { twResult = { success: false, error: safeErrorText(err) } }
        if (wantTh) await new Promise(r => setTimeout(r, 2000))
      }

      if (wantTh) {
        if (targets.threads) thResult = await targeted('threads', 'post', targets.threads, (t) => publishToThreads(singleCoverPayload(payload, 'threads'), t as never))
        else {
          try { thResult = await publishToThreads(singleCoverPayload(payload, 'threads'), undefined, legacyOpts) }
          catch (err) { thResult = { success: false, error: safeErrorText(err) } }
        }
      }

      result.post = { attempted: true, facebook: fbResult, instagram: igResult, twitter: twResult, threads: thResult }

      // Haber belgesindeki Onyeditivi alanlarına YALNIZCA legacy (hedefsiz) sonuçlar yazılır;
      // başka bir hesabın başarısı Onyeditivi'yi "paylaşıldı" saymaz (cron davranışı korunur).
      // Açık hedef Onyeditivi'nin kendi hesap anahtarıysa (aynı dış hesap) legacy sayılır.
      const notTargeted: SocialPublishResult = { success: false, error: 'targeted' }
      const lFb = legacyTarget.facebook ? reconcileForNewsDoc(fbResult) : notTargeted
      const lIg = legacyTarget.instagram ? reconcileForNewsDoc(igResult) : notTargeted
      const lTh = legacyTarget.threads ? reconcileForNewsDoc(thResult) : notTargeted
      const lWantFb = wantFb && legacyTarget.facebook
      const lWantIg = wantIg && legacyTarget.instagram
      const anyLegacy = lWantFb || lWantIg || wantTw || (wantTh && legacyTarget.threads)

      // Threads TEXT fallback "başarı" sayılınca socialPublished=true oluyordu → IG/FB bir daha denenmiyordu.
      // Tamamlama: FB veya IG başarılı (veya ikisi de istenmiyor ve X/Threads oldu).
      const primaryOk = lFb.success || lIg.success
      const textOnlyOk =
        !lWantFb &&
        !lWantIg &&
        (twResult.success || lTh.success)
      const alreadyHadPrimary = hasMetaFeedPublish(data)

      if (anyLegacy && (primaryOk || textOnlyOk || twResult.success || lTh.success || alreadyHadPrimary)) {
        const update: Record<string, unknown> = {
          socialHeadline:      socialContent.headline,
          socialStorySummary:  socialContent.storySummary,
          socialCaption:       socialContent.caption,
          socialHashtags:      socialContent.hashtags,
        }
        if (imagePayload.imageUrl || socialImageUrl) {
          update.socialImageUrl = imagePayload.imageUrl || socialImageUrl
        }
        if (lFb.platformId) update.facebookPostId   = lFb.platformId
        if (lIg.platformId) update.instagramMediaId = lIg.platformId
        if (twResult.platformId) update.twitterTweetId   = twResult.platformId
        if (lTh.platformId) update.threadsPostId    = lTh.platformId

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
      } else if (anyLegacy) {
        console.warn(`[publishOneSocial] POST ✗ ${newsId} — FB: ${safeErrorText(fbResult.error ?? '')} | IG: ${safeErrorText(igResult.error ?? '')} | X: ${safeErrorText(twResult.error ?? '')} | TH: ${safeErrorText(thResult.error ?? '')}`)
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

      if (wantIg && targets.instagram) {
        igStoryResult = await targeted('instagram', 'story', targets.instagram, (t) => publishInstagramStory(storyPayload, t as never))
        if (wantFb) await new Promise(r => setTimeout(r, 2000))
      } else if (wantIg && legacyStoryBlocked) {
        igStoryResult = { success: false, error: 'Onyeditivi hikâyesi zaten paylaşılmış (yeniden paylaşmak için force)' }
      } else if (wantIg) {
        try {
          igStoryResult = await publishInstagramStory(storyPayload, undefined, legacyOpts)
          console.log(`[publishOneSocial] IG Story → ${newsId}: ${igStoryResult.success ? '✓' : safeErrorText(igStoryResult.error ?? '')}`)
        } catch (err) {
          igStoryResult = { success: false, error: safeErrorText(err) }
        }
        if (wantFb) await new Promise(r => setTimeout(r, 2000))
      }

      if (wantFb && targets.facebook) {
        fbStoryResult = await targeted('facebook', 'story', targets.facebook, (t) => publishFacebookStory(storyPayload, t as never))
      } else if (wantFb && legacyStoryBlocked) {
        fbStoryResult = { success: false, error: 'Onyeditivi hikâyesi zaten paylaşılmış (yeniden paylaşmak için force)' }
      } else if (wantFb) {
        try {
          fbStoryResult = await publishFacebookStory(storyPayload, undefined, legacyOpts)
          console.log(`[publishOneSocial] FB Story → ${newsId}: ${fbStoryResult.success ? '✓' : safeErrorText(fbStoryResult.error ?? '')}`)
        } catch (err) {
          fbStoryResult = { success: false, error: safeErrorText(err) }
        }
      }

      result.story = { attempted: true, facebook: fbStoryResult, instagram: igStoryResult }

      const lIgStory = legacyTarget.instagram ? reconcileForNewsDoc(igStoryResult) : { success: false } as SocialPublishResult
      const lFbStory = legacyTarget.facebook ? reconcileForNewsDoc(fbStoryResult) : { success: false } as SocialPublishResult
      if (lIgStory.success || lFbStory.success) {
        const storyUpdate: Record<string, unknown> = {
          storyPublished:   true,
          storyPublishedAt: FieldValue.serverTimestamp(),
          socialHeadline: socialContent.headline,
          socialStorySummary: socialContent.storySummary,
        }
        if (lIgStory.platformId) storyUpdate.instagramStoryId = lIgStory.platformId
        if (lFbStory.platformId) storyUpdate.facebookStoryId  = lFbStory.platformId
        await db.collection(Collections.NEWS).doc(newsId).update(storyUpdate)
        console.log(`[publishOneSocial] STORY ✓ ${newsId} — IG:${igStoryResult.success} FB:${fbStoryResult.success}`)
      } else {
        console.warn(`[publishOneSocial] STORY ✗ ${newsId} — IG: ${safeErrorText(igStoryResult.error ?? '')} | FB: ${safeErrorText(fbStoryResult.error ?? '')}`)
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
    console.error('[publishOneSocial] Beklenmeyen hata:', safeErrorText(err))
    return {
      ok: false,
      newsId,
      skipped: false,
      reason: safeErrorText(err),
    }
  }
}

// ── Görsel URL yardımcısı (harici kullanım için) ──────────────────────────────
export { extractImageUrl }
