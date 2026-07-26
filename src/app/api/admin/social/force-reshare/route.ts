/**
 * POST /api/admin/social/force-reshare
 *
 * Son N adet Çanakkale haberinin socialPublished bayrağını sıfırlar
 * ve hepsini yeniden FB + IG + X'e paylaşır.
 *
 * Body (opsiyonel):
 *   { "limit": 2 }   — kaç haber (varsayılan 2, maks 5)
 *
 * Auth: CMS token (news:publish yetkisi gerekli)
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue, DocumentSnapshot } from 'firebase-admin/firestore'
import { publishToFacebook } from '@/lib/social/facebook'
import { publishToInstagram } from '@/lib/social/instagram'
import { publishToTwitter } from '@/lib/social/twitter'
import { generateSocialContent } from '@/lib/social/aiSocialEditor'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import type { SocialPublishPayload } from '@/lib/social/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Çanakkale ve ilçeleri
const CANAKKALE_SLUGS = new Set([
  'canakkale',
  'biga', 'can', 'yenice', 'bayramic', 'ezine',
  'ayvacik', 'gokceada', 'bozcaada', 'gelibolu', 'eceabat', 'lapseki',
])

function isCanakkale(data: Record<string, unknown>): boolean {
  const citySlug     = String(data.citySlug     ?? '').toLowerCase()
  const districtSlug = String(data.districtSlug ?? data.district ?? '').toLowerCase()
  const city         = String(data.city         ?? '').toLowerCase()
  const category     = String(data.category     ?? '').toLowerCase()
  const categoryId   = String(data.categoryId   ?? '').toLowerCase()
  return (
    CANAKKALE_SLUGS.has(citySlug)  ||
    CANAKKALE_SLUGS.has(districtSlug) ||
    city.includes('çanakkale') || city.includes('canakkale') ||
    city.includes('biga') || city.includes('gelibolu') || city.includes('gökçeada') ||
    category === 'canakkale' || categoryId === 'canakkale'
  )
}

function extractImageUrl(data: Record<string, unknown>): string | undefined {
  for (const k of ['thumbnail', 'coverImageUrl', 'imageUrl', 'featuredImage', 'image']) {
    const v = data[k]
    if (typeof v === 'string' && v.trim().length > 10) return v.trim()
  }
  return undefined
}

function buildArticleUrl(id: string, data: Record<string, unknown>): string {
  const base = getSiteUrl()
  const url  = typeof data.url  === 'string' ? data.url.trim()  : ''
  const slug = typeof data.slug === 'string' ? data.slug.trim() : ''
  if (url) return url.replace('nahaber.vercel.app', 'www.nahaber.com').replace('https://nahaber.com', 'https://www.nahaber.com')
  if (slug) return `${base}${ROUTES.NEWS_DETAIL(slug)}`
  return `${base}${ROUTES.POST_DETAIL(id)}`
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ').trim()
}

export async function POST(request: Request) {
  // CMS token VEYA CRON_SECRET ile çalışır
  const cronSecret = process.env.CRON_SECRET?.trim()
  const authHeader = request.headers.get('authorization') ?? ''
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isCron) {
    const auth = await verifyCmsToken(request, 'news:publish')
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let requestedLimit = 2
  let specificIds: string[] = []
  try {
    const body = await request.json() as { limit?: number; ids?: string[] }
    if (body.limit && typeof body.limit === 'number') {
      requestedLimit = Math.min(Math.max(1, body.limit), 5)
    }
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      specificIds = body.ids.slice(0, 5)
    }
  } catch { /* varsayılan 2 */ }

  const db = getAdminFirestore()

  let targets: DocumentSnapshot[]

  if (specificIds.length > 0) {
    // Belirli ID'leri direkt getir — Çanakkale filtresi yok
    const docs = await Promise.all(
      specificIds.map(id => db.collection(Collections.NEWS).doc(id).get())
    )
    targets = docs.filter(d => d.exists)
  } else {
    // Son N Çanakkale haberini bul (socialPublished olup olmadığına bakılmaz)
    const snap = await db
      .collection(Collections.NEWS)
      .where('citySlug', '==', 'canakkale')
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .limit(30)
      .get()

    // Görseli olan haberleri önceliklendir
    const candidates = snap.docs
      .filter(d => {
        const data = d.data() as Record<string, unknown>
        return !data.hasVideo && !data.isVideo && isCanakkale(data)
      })

    const withImage = candidates.filter(d => !!extractImageUrl(d.data() as Record<string, unknown>))
    const pool = withImage.length >= requestedLimit ? withImage : candidates
    targets = pool.slice(0, requestedLimit)
  }

  if (targets.length === 0) {
    return NextResponse.json({ error: 'Çanakkale haberi bulunamadı' }, { status: 404 })
  }

  // socialPublished bayrağını sıfırla
  await Promise.all(
    targets.map(doc =>
      db.collection(Collections.NEWS).doc(doc.id).update({
        socialPublished: false,
        socialPublishedAt: FieldValue.delete(),
        facebookPostId: FieldValue.delete(),
        instagramMediaId: FieldValue.delete(),
        twitterTweetId: FieldValue.delete(),
      }).catch(() => {})
    )
  )

  const results = []

  for (const doc of targets) {
    const data = doc.data() as Record<string, unknown>
    const id = doc.id
    const title = typeof data.title === 'string' ? data.title : ''

    const spot: string =
      typeof data.spot === 'string' ? data.spot :
      typeof data.summary === 'string' ? data.summary :
      typeof data.description === 'string' ? data.description : ''

    const rawContent: string =
      typeof data.content === 'string' ? data.content :
      typeof data.body === 'string' ? data.body : ''

    const fullText = rawContent ? stripHtml(rawContent) : spot
    const bodyText = fullText.slice(0, 2000)
    const articleUrl = buildArticleUrl(id, data)
    const cityName = typeof data.cityName === 'string' ? data.cityName : 'Çanakkale'

    const aiContext = bodyText.length > 100 ? bodyText : spot
    let socialContent = await generateSocialContent(title, aiContext, cityName)
    if (!socialContent) {
      socialContent = {
        headline: title.slice(0, 60),
        caption: spot ? `📰 ${spot}` : `📰 ${title}`,
        hashtags: ['#NaHaber', '#Çanakkale', '#SonDakika', '#Haber', '#Türkiye'],
        altText: title,
      }
    }

    // Yeni OG görseli — fix sonrası doğru görsel gelir
    const socialImageUrl = `https://nahaber.com/api/og/social/${id}`
    const hashtagStr = socialContent.hashtags.join(' ')
    const fullCaption = [
      socialContent.caption,
      '',
      `🔗 Haberin devamı: ${articleUrl}`,
      '',
      hashtagStr,
    ].join('\n')

    const payload: SocialPublishPayload = {
      newsId: id,
      title: socialContent.headline || title,
      description: fullCaption,
      imageUrl: socialImageUrl,
      articleUrl,
    }

    let fbResult: { success: boolean; error?: string; platformId?: string } = { success: false, error: 'not attempted' }
    let igResult: { success: boolean; error?: string; platformId?: string } = { success: false, error: 'not attempted' }
    let twResult: { success: boolean; error?: string; platformId?: string } = { success: false, error: 'not attempted' }

    try { fbResult = await publishToFacebook(payload) }
    catch (e) { fbResult = { success: false, error: String(e) } }

    await new Promise(r => setTimeout(r, 2000))

    try { igResult = await publishToInstagram(payload) }
    catch (e) { igResult = { success: false, error: String(e) } }

    await new Promise(r => setTimeout(r, 2000))

    try { twResult = await publishToTwitter(payload) }
    catch (e) { twResult = { success: false, error: String(e) } }

    const anySuccess = fbResult.success || igResult.success || twResult.success

    if (anySuccess) {
      const update: Record<string, unknown> = {
        socialPublished: true,
        socialPublishedAt: FieldValue.serverTimestamp(),
        socialImageUrl,
        socialHeadline: socialContent.headline,
        socialHashtags: socialContent.hashtags,
      }
      if ('platformId' in fbResult && fbResult.platformId) update.facebookPostId   = fbResult.platformId
      if ('platformId' in igResult && igResult.platformId) update.instagramMediaId = igResult.platformId
      if ('platformId' in twResult && twResult.platformId) update.twitterTweetId   = twResult.platformId
      await db.collection(Collections.NEWS).doc(id).update(update).catch(() => {})
    }

    results.push({
      newsId: id,
      title: title.slice(0, 80),
      facebook: fbResult,
      instagram: igResult,
      twitter: twResult,
    })

    await new Promise(r => setTimeout(r, 2000))
  }

  return NextResponse.json({
    reshared: results.length,
    results,
  })
}
