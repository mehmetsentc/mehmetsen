/**
 * publishOneSocial — tek haber için sosyal medya yayın pipeline'ı.
 *
 * Admin panelinde Çanakkale haberi ilk kez yayınlandığında
 * `after()` ile çağrılır; cron'u beklemeden anında paylaşım yapar.
 *
 * Fire-and-forget güvenli: hataları loglar, fırlatmaz.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue } from 'firebase-admin/firestore'
import { publishToFacebook, publishFacebookStory } from '@/lib/social/facebook'
import { publishToInstagram, publishInstagramStory } from '@/lib/social/instagram'
import { generateSocialContent } from '@/lib/social/aiSocialEditor'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import type { SocialPublishPayload } from '@/lib/social/types'

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
 * Harici sourceUrl (RSS, scraper) olan haberler sosyal medyaya gitmez —
 * sadece kendi editörlerimizin yazdığı veya kendi sitemizden gelen haberler yayınlanır.
 */
export function isOwnContent(data: Record<string, unknown>): boolean {
  const sourceUrl = String(data.sourceUrl ?? '').trim().toLowerCase()
  // sourceUrl yoksa veya http ile başlamıyorsa → kendi içeriğimiz ✓
  if (!sourceUrl || !sourceUrl.startsWith('http')) return true
  // sourceUrl kendi sitemizi gösteriyorsa → kendi içeriğimiz ✓
  if (sourceUrl.includes('nahaber.com') || sourceUrl.includes('onyeditivi.com')) return true
  // Harici URL → başka kaynaktan gelmiş, yayınlama ✗
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

// ── Ana fonksiyon ─────────────────────────────────────────────────────────────

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
 * İki kanal bağımsız; bir haber her ikisine de girebilir.
 * Fire-and-forget: hataları loglar, fırlatmaz.
 * next/server `after()` içinde çağrılmak için tasarlanmıştır.
 */
export async function publishOneSocial(newsId: string): Promise<void> {
  try {
    const db  = getAdminFirestore()
    const doc = await db.collection(Collections.NEWS).doc(newsId).get()
    if (!doc.exists) {
      console.log(`[publishOneSocial] Haber bulunamadı: ${newsId}`)
      return
    }

    const data = doc.data() as Record<string, unknown>

    // Video haberler atla
    if (data.hasVideo || data.isVideo) return
    // Kendi haberimiz değil (harici RSS/scraper kaynağı)
    if (!isOwnContent(data)) {
      console.log(`[publishOneSocial] Harici kaynak — sosyal medyaya gönderilmedi: ${newsId}`)
      return
    }
    // Canlı yayın / boş içerik / sosyal medya tanıtım haberi
    if (isSkippableForSocial(data)) {
      console.log(`[publishOneSocial] Canlı yayın/boş içerik — atlandı: ${newsId}`)
      return
    }

    const title = typeof data.title === 'string' ? data.title : ''
    if (!title) return

    // ── Ne yayınlanacak? ─────────────────────────────────────────────────────
    const shouldPost  = isCanakkaleArticle(data) && data.socialPublished !== true
    const shouldStory = isStoryEligible(data)    && data.storyPublished  !== true
    if (!shouldPost && !shouldStory) {
      console.log(`[publishOneSocial] Post+Story zaten yayınlandı veya uygun değil — atlandı: ${newsId}`)
      return
    }

    // ── Görsel zorunluluğu ───────────────────────────────────────────────────
    const coverImage = extractImageUrl(data)
    if (!coverImage) {
      console.log(`[publishOneSocial] Görsel yok — paylaşım atlandı: ${newsId}`)
      return
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

    // ── AI içerik üretimi ────────────────────────────────────────────────────
    const aiContext = bodyText.length > 100 ? bodyText : spot
    let socialContent = await generateSocialContent(title, aiContext, cityName)
    if (!socialContent) {
      socialContent = {
        headline: title.slice(0, 60),
        caption:  spot ? `📰 ${spot}` : `📰 ${title}`,
        hashtags: ['#NaHaber', '#Çanakkale', '#SonDakika', '#Haber', '#Türkiye'],
        altText:  title,
      }
    }

    const socialImageUrl = `https://nahaber.com/api/og/social/${newsId}?v=${Date.now()}`
    const storyImageUrl  = `https://nahaber.com/api/og/story/${newsId}?v=${Date.now()}`
    const hashtagStr     = socialContent.hashtags.join(' ')
    const fullCaption    = [
      socialContent.caption, '',
      `🔗 Haberin devamı: ${articleUrl}`, '',
      hashtagStr,
    ].join('\n')

    // ── POST (Çanakkale) ─────────────────────────────────────────────────────
    if (shouldPost) {
      const payload: SocialPublishPayload = {
        newsId, title: socialContent.headline || title,
        description: fullCaption, imageUrl: socialImageUrl, articleUrl,
      }

      let fbResult: { success: boolean; error?: string; platformId?: string } =
        { success: false, error: 'not attempted' }
      let igResult: { success: boolean; error?: string; platformId?: string } =
        { success: false, error: 'not attempted' }

      try { fbResult = await publishToFacebook(payload) }
      catch (err) { fbResult = { success: false, error: err instanceof Error ? err.message : String(err) } }

      await new Promise(r => setTimeout(r, 2000))

      try { igResult = await publishToInstagram(payload) }
      catch (err) { igResult = { success: false, error: err instanceof Error ? err.message : String(err) } }

      if (fbResult.success || igResult.success) {
        const update: Record<string, unknown> = {
          socialPublished:   true,
          socialPublishedAt: FieldValue.serverTimestamp(),
          socialImageUrl,
          socialHeadline:    socialContent.headline,
          socialHashtags:    socialContent.hashtags,
        }
        if (fbResult.platformId) update.facebookPostId   = fbResult.platformId
        if (igResult.platformId) update.instagramMediaId = igResult.platformId
        await db.collection(Collections.NEWS).doc(newsId).update(update)
        console.log(`[publishOneSocial] POST ✓ ${newsId} — FB:${fbResult.success} IG:${igResult.success}`)
      } else {
        console.warn(`[publishOneSocial] POST ✗ ${newsId} — FB: ${fbResult.error} | IG: ${igResult.error}`)
      }

      await new Promise(r => setTimeout(r, 2000))
    }

    // ── HİKAYE (güncel + öne çıkan) ─────────────────────────────────────────
    if (shouldStory) {
      const storyPayload: SocialPublishPayload = {
        newsId, title: socialContent.headline || title,
        description: undefined, imageUrl: storyImageUrl, articleUrl,
      }

      let igStoryResult: { success: boolean; error?: string; platformId?: string } =
        { success: false, error: 'not attempted' }
      let fbStoryResult: { success: boolean; error?: string; platformId?: string } =
        { success: false, error: 'not attempted' }

      try {
        igStoryResult = await publishInstagramStory(storyPayload)
        console.log(`[publishOneSocial] IG Story → ${newsId}: ${igStoryResult.success ? '✓' : igStoryResult.error}`)
      } catch (err) {
        igStoryResult = { success: false, error: err instanceof Error ? err.message : String(err) }
      }

      await new Promise(r => setTimeout(r, 2000))

      try {
        fbStoryResult = await publishFacebookStory(storyPayload)
        console.log(`[publishOneSocial] FB Story → ${newsId}: ${fbStoryResult.success ? '✓' : fbStoryResult.error}`)
      } catch (err) {
        fbStoryResult = { success: false, error: err instanceof Error ? err.message : String(err) }
      }

      if (igStoryResult.success || fbStoryResult.success) {
        const storyUpdate: Record<string, unknown> = {
          storyPublished:   true,
          storyPublishedAt: FieldValue.serverTimestamp(),
        }
        if (igStoryResult.platformId) storyUpdate.instagramStoryId = igStoryResult.platformId
        if (fbStoryResult.platformId) storyUpdate.facebookStoryId  = fbStoryResult.platformId
        await db.collection(Collections.NEWS).doc(newsId).update(storyUpdate)
        console.log(`[publishOneSocial] STORY ✓ ${newsId} — IG:${igStoryResult.success} FB:${fbStoryResult.success}`)
      } else {
        console.warn(`[publishOneSocial] STORY ✗ ${newsId} — IG: ${igStoryResult.error} | FB: ${fbStoryResult.error}`)
      }
    }
  } catch (err) {
    // Fire-and-forget: hata yutulur, cron bir sonraki çalışmada tekrar dener
    console.error('[publishOneSocial] Beklenmeyen hata:', err)
  }
}

// ── Görsel URL yardımcısı (harici kullanım için) ──────────────────────────────
export { extractImageUrl }
