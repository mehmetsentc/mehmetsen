/**
 * POST /api/admin/social/force-reshare
 *
 * Manuel / toplu sosyal medya paylaşımı.
 *
 * Body:
 *   { "ids": ["newsId"], "mode": "post"|"story"|"both", "force": true }
 *   { "slugs": ["slug"], "mode": "post" }
 *   { "limit": 2 }   — eski davranış: son N Çanakkale haberini post olarak yeniden paylaş
 *
 * Auth: CMS token (news:publish) veya CRON_SECRET
 */
import { NextResponse } from 'next/server'
import { safeErrorText } from '@/lib/social/safeLog'
import { singleCoverPayload } from '@/lib/social/imagePolicy'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue, DocumentSnapshot } from 'firebase-admin/firestore'
import { publishToFacebook } from '@/lib/social/facebook'
import { publishToInstagram } from '@/lib/social/instagram'
import { publishToTwitter } from '@/lib/social/twitter'
import { publishToThreads } from '@/lib/social/threads'
import { generateSocialContent } from '@/lib/social/aiSocialEditor'
import type { SocialPublishPayload } from '@/lib/social/types'
import { clampAtWordBoundary, clampCompleteSentences, overlayHeadlineFromTitle } from '@/lib/social/feedCaption'
import {
  publishOneSocial,
  type PublishSocialMode,
  type PublishOneSocialResult,
  type SocialPublishOverrides,
} from '@/lib/social/publishOneSocial'
import { buildSocialImagePayload } from '@/lib/social/carouselImages'
import { buildOgSocialUrl } from '@/lib/social/ogCacheVersion'
import { buildPublicArticleUrl, isPublicShareArticleUrl } from '@/lib/social/articleUrl'
import { isPlaceholderDraftSlug } from '@/lib/newsSlug'
import { ensurePublicNewsSlug } from '@/services/newsDraftService'
import { parseTargetsInput, preflightTargets, type PublishTargets } from '@/lib/social/accounts/targetedPublish'
import { canManageSocialAccounts } from '@/lib/social/accounts/authz'
import { isSameOriginRequest } from '@/lib/social/accounts/connect/routeHelpers'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { imageModeProblem, parseImageMode } from '@/lib/social/accounts/capabilities'

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

function buildArticleUrl(id: string, data: Record<string, unknown>): string | null {
  return buildPublicArticleUrl(id, data)
}

async function resolveShareUrl(
  id: string,
  data: Record<string, unknown>,
  title: string
): Promise<string | null> {
  let slug = typeof data.slug === 'string' ? data.slug.trim() : ''
  if (!slug || isPlaceholderDraftSlug(slug)) {
    try {
      const db = getAdminFirestore()
      slug = await ensurePublicNewsSlug(db, id, title, slug)
      data.slug = slug
    } catch {
      return null
    }
  }
  const url = buildArticleUrl(id, data)
  if (!url || !isPublicShareArticleUrl(url)) return null
  return url
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ').trim()
}

function parseMode(raw: unknown): PublishSocialMode | undefined {
  if (raw === 'post' || raw === 'story' || raw === 'both') return raw
  return undefined
}

function parseOverrides(body: Record<string, unknown>): SocialPublishOverrides | undefined {
  const out: SocialPublishOverrides = {}
  if (typeof body.headline === 'string' && body.headline.trim()) {
    out.headline = body.headline.trim()
  }
  if (typeof body.caption === 'string' && body.caption.trim()) {
    out.caption = body.caption.trim()
  }
  if (typeof body.storySummary === 'string' && body.storySummary.trim()) {
    out.storySummary = body.storySummary.trim()
  }
  const tagsRaw = body.hashtags
  if (Array.isArray(tagsRaw)) {
    out.hashtags = tagsRaw.map(String).map((t) => t.trim()).filter(Boolean)
  } else if (typeof tagsRaw === 'string' && tagsRaw.trim()) {
    out.hashtags = tagsRaw
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
  }
  const platforms = body.platforms
  if (platforms && typeof platforms === 'object' && !Array.isArray(platforms)) {
    const p = platforms as Record<string, unknown>
    out.platforms = {
      facebook: p.facebook !== false,
      instagram: p.instagram !== false,
      twitter: p.twitter === true,
      threads: p.threads !== false,
    }
  }
  const im = parseImageMode(body.imageMode)
  if (im === 'single' || im === 'carousel') out.imageMode = im
  if (
    !out.headline &&
    !out.caption &&
    !out.storySummary &&
    !out.hashtags &&
    !out.platforms &&
    !out.imageMode
  ) {
    return undefined
  }
  return out
}

export async function POST(request: Request) {
  // CMS token VEYA CRON_SECRET ile çalışır
  const cronSecret = process.env.CRON_SECRET?.trim()
  const authHeader = request.headers.get('authorization') ?? ''
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`

  let actor: Awaited<ReturnType<typeof verifyCmsToken>> = null
  if (!isCron) {
    actor = await verifyCmsToken(request, 'news:publish')
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let requestedLimit = 2
  let specificIds: string[] = []
  let specificSlugs: string[] = []
  let mode: PublishSocialMode | undefined
  let force = true // manuel/toplu yeniden paylaşımda varsayılan force
  let manual = false
  let overrides: SocialPublishOverrides | undefined
  let targetsRaw: unknown = undefined
  let imageModeInvalid = false

  try {
    const body = await request.json() as Record<string, unknown>
    if (typeof body.limit === 'number') {
      requestedLimit = Math.min(Math.max(1, body.limit), 5)
    }
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      specificIds = (body.ids as string[]).slice(0, 5)
    }
    if (Array.isArray(body.slugs) && body.slugs.length > 0) {
      specificSlugs = (body.slugs as string[]).slice(0, 5)
    }
    mode = parseMode(body.mode)
    if (typeof body.force === 'boolean') force = body.force
    if (typeof body.manual === 'boolean') manual = body.manual
    overrides = parseOverrides(body)
    if (parseImageMode(body.imageMode) === 'invalid') imageModeInvalid = true
    targetsRaw = body.targets
  } catch { /* varsayılan 2 */ }

  // ── Görsel biçimi: platform yeteneği ∩ adaptör uygulaması (UI ile aynı kural) ──
  if (imageModeInvalid) {
    return NextResponse.json({ error: 'Geçersiz görsel biçimi', code: 'image_mode_invalid' }, { status: 400 })
  }
  if (overrides?.imageMode === 'carousel' && (mode ?? 'post') !== 'story') {
    const pl = overrides.platforms
    const postPlatforms = (['facebook', 'instagram', 'threads'] as const).filter((p) => (pl ? pl[p] !== false : true))
    const wantsX = pl?.twitter === true
    if (wantsX || imageModeProblem('carousel', [...postPlatforms])) {
      return NextResponse.json(
        {
          error: 'Kaydırmalı gönderi yalnızca Instagram’da destekleniyor — Facebook / Threads / X için tek görsel seçin',
          code: 'carousel_unsupported',
        },
        { status: 400 },
      )
    }
  }

  // ── Açık hedef hesaplar (çoklu hesap) ─────────────────────────────────────
  // Yalnızca merkez yönetici, tek haber, açık mod, aynı origin. Hedefi olmayan
  // platformlar eski Onyeditivi yolunu kullanır; hedef hatası legacy'ye düşmez.
  const parsedTargets = parseTargetsInput(targetsRaw)
  if (!parsedTargets.ok) {
    return NextResponse.json({ error: parsedTargets.code, code: parsedTargets.code, platform: parsedTargets.platform }, { status: 400 })
  }
  const publishTargets: PublishTargets = { ...parsedTargets.targets }
  // Platform anahtarı kapalıysa o platformun hedefi yok sayılır (yayın zaten denenmez).
  if (overrides?.platforms) {
    for (const k of Object.keys(publishTargets) as Array<keyof PublishTargets>) {
      if (overrides.platforms[k] === false) delete publishTargets[k]
    }
  }
  const hasTargets = Object.keys(publishTargets).length > 0
  if (hasTargets) {
    if (isCron || !actor) return NextResponse.json({ error: 'targets_require_cms_user', code: 'targets_require_cms_user' }, { status: 403 })
    if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'bad_origin', code: 'bad_origin' }, { status: 403 })
    if (!canManageSocialAccounts(actor)) {
      return NextResponse.json({ error: 'Hedef hesaba paylaşım için merkez yönetici yetkisi gerekli', code: 'forbidden' }, { status: 403 })
    }
    if (specificIds.length !== 1 || specificSlugs.length > 0) {
      return NextResponse.json({ error: 'Hedef hesapla yalnızca tek haber paylaşılabilir', code: 'single_news_required' }, { status: 400 })
    }
    if (!mode) return NextResponse.json({ error: 'Paylaşım biçimi gerekli', code: 'mode_required' }, { status: 400 })
    const pre = await preflightTargets(publishTargets, mode, Date.now())
    if (!pre.ok) {
      return NextResponse.json({ error: pre.code, code: pre.code, platform: pre.platform }, { status: 409 })
    }
  }

  // Belirli ID/slug ile çağrı → publishOneSocial pipeline (post/story/both)
  const isTargeted = specificIds.length > 0 || specificSlugs.length > 0
  if (isTargeted) {
    // Admin UI'dan gelen tekil paylaşım: manual + mode varsayılanları
    if (manual || mode) {
      manual = true
      if (!mode) mode = 'post'
    }

    const db = getAdminFirestore()
    let targetIds = [...specificIds]

    if (specificSlugs.length > 0) {
      const snaps = await Promise.all(
        specificSlugs.map(slug =>
          db.collection(Collections.NEWS).where('slug', '==', slug).limit(1).get()
        )
      )
      targetIds = [...targetIds, ...snaps.flatMap(s => s.docs.map(d => d.id))]
    }

    // dedupe
    targetIds = [...new Set(targetIds)].slice(0, 5)

    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'Haber bulunamadı' }, { status: 404 })
    }

    const results: PublishOneSocialResult[] = []
    for (const id of targetIds) {
      const r = await publishOneSocial(id, {
        mode: mode ?? 'post',
        force,
        manual: true,
        overrides,
        trigger: 'composer',
        ...(actor ? { actorUid: actor.uid } : {}),
        // Belirsiz kayıt onayı burada YOK: yalnızca kayıt-bazlı
        // /api/admin/social/publish-records/[id]/republish uç noktası verir.
        ...(hasTargets ? { targets: publishTargets } : {}),
      })
      results.push(r)
      if (actor) {
        const summarize = (x?: { success: boolean; accountId?: string; code?: string; ledgerStatus?: string; platformId?: string }) =>
          x ? { ok: x.success, account: x.accountId ?? 'legacy', code: x.code ?? null, status: x.ledgerStatus ?? null, externalPostId: x.platformId ?? null } : null
        await writeSocialAudit({
          actorId: actor.uid,
          action: 'social.publish.manual',
          entityType: 'socialAccount',
          entityId: id,
          meta: {
            newsId: id,
            mode: mode ?? 'post',
            force,
            targets: hasTargets ? publishTargets : {},
            skipped: r.skipped,
            post: r.post
              ? { facebook: summarize(r.post.facebook), instagram: summarize(r.post.instagram), threads: summarize(r.post.threads), twitter: summarize(r.post.twitter) }
              : null,
            story: r.story ? { facebook: summarize(r.story.facebook), instagram: summarize(r.story.instagram) } : null,
          },
        })
      }
      if (targetIds.length > 1) await new Promise(res => setTimeout(res, 1500))
    }

    const succeeded = results.filter(r => r.ok).length
    const failed = results.filter(r => !r.ok).length

    // Tek haber paylaşımında daha net HTTP status
    if (targetIds.length === 1) {
      const r = results[0]
      if (r.skipped) {
        return NextResponse.json({
          reshared: 0,
          succeeded: 0,
          failed: 1,
          error: r.reason,
          results,
        }, { status: 422 })
      }
      if (!r.ok) {
        return NextResponse.json({
          reshared: 0,
          succeeded: 0,
          failed: 1,
          error: r.reason ?? 'Paylaşım başarısız',
          results,
        }, { status: 502 })
      }
    }

    return NextResponse.json({
      reshared: results.length,
      succeeded,
      failed,
      mode: mode ?? 'post',
      results,
    })
  }

  // ── Eski toplu Çanakkale post yeniden paylaşımı ────────────────────────────
  const db = getAdminFirestore()

  let targets: DocumentSnapshot[]

  // İki sorgu: citySlug ile (yeni haberler) + city adıyla (citySlug bug'dan etkilenmiş eski haberler)
  const [snap1, snap2] = await Promise.all([
    db.collection(Collections.NEWS)
      .where('citySlug', '==', 'canakkale')
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .limit(30)
      .get(),
    db.collection(Collections.NEWS)
      .where('city', '==', 'Çanakkale')
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .limit(30)
      .get(),
  ])

  // Merge + deduplicate
  const seen = new Set<string>()
  const merged = [...snap1.docs, ...snap2.docs].filter(d => {
    if (seen.has(d.id)) return false
    seen.add(d.id)
    return true
  })

  // Görseli olan haberleri önceliklendir
  const candidates = merged
    .filter(d => {
      const data = d.data() as Record<string, unknown>
      return !data.hasVideo && !data.isVideo && isCanakkale(data)
    })
    .sort((a, b) => {
      const pa = (a.data() as Record<string, unknown>).publishedAt as number ?? 0
      const pb = (b.data() as Record<string, unknown>).publishedAt as number ?? 0
      return pb - pa
    })

  const withImage = candidates.filter(d => !!extractImageUrl(d.data() as Record<string, unknown>))
  const pool = withImage.length >= requestedLimit ? withImage : candidates
  targets = pool.slice(0, requestedLimit)

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
        threadsPostId: FieldValue.delete(),
      }).catch(() => {})
    )
  )

  const results = []
  // Toplu yeniden paylaşım "force" anlamını korur; aktif kilit / belirsiz kayıt yine engeller.
  const bulkLegacy = { force: true, trigger: 'force_reshare_bulk', ...(actor ? { actorUid: actor.uid } : {}) }

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
    const articleUrl = await resolveShareUrl(id, data, title)
    if (!articleUrl) {
      results.push({
        newsId: id,
        title,
        facebook: { success: false, error: 'articleUrl missing or draft slug' },
        instagram: { success: false, error: 'articleUrl missing or draft slug' },
      })
      continue
    }
    const cityName = typeof data.cityName === 'string' ? data.cityName : 'Çanakkale'

    const aiContext = bodyText.length > 100 ? bodyText : spot
    let socialContent = await generateSocialContent(title, aiContext, cityName)
    if (!socialContent) {
      socialContent = {
        headline: overlayHeadlineFromTitle(title),
        storySummary: spot
          ? clampCompleteSentences(
              /[.!?]$/.test(spot.trim()) ? spot.trim() : `${spot.trim()}.`,
              170
            )
          : `${clampAtWordBoundary(title, 120)}.`,
        caption: spot ? `📰 ${spot.trim()}` : `📰 ${title.trim()}`,
        hashtags: ['#NaHaber', '#Çanakkale', '#SonDakika', '#Haber', '#Türkiye'],
        altText: title,
      }
    }

    socialContent.headline = overlayHeadlineFromTitle(title)

    try {
      await db.collection(Collections.NEWS).doc(id).update({
        socialHeadline: socialContent.headline,
        socialStorySummary: socialContent.storySummary || null,
        socialCaption: socialContent.caption,
        socialHashtags: socialContent.hashtags,
      })
    } catch (err) {
      console.warn(`[force-reshare] social fields pre-save failed ${id}:`, safeErrorText(err))
    }

    const socialImageUrl = buildOgSocialUrl(id, {
      title,
      socialHeadline: socialContent.headline,
      socialStorySummary: socialContent.storySummary,
      imageUrl: extractImageUrl(data),
      updatedAt: typeof data.updatedAt === 'number' || typeof data.updatedAt === 'string'
        ? data.updatedAt
        : undefined,
    })
    const imagePayload = await buildSocialImagePayload(id, socialImageUrl, data, {
      fallbackImageUrl: extractImageUrl(data),
    })

    const payload: SocialPublishPayload = {
      newsId: id,
      title,
      description: socialContent.caption,
      imageUrl: imagePayload.imageUrl,
      ...(imagePayload.imageUrls ? { imageUrls: imagePayload.imageUrls } : {}),
      articleUrl,
      hashtags: socialContent.hashtags,
      cityName: typeof data.cityName === 'string' ? data.cityName : 'Çanakkale',
      citySlug: typeof data.citySlug === 'string' ? data.citySlug : undefined,
    }
    console.log(
      `[force-reshare] POST ${imagePayload.mode} — ${id}` +
        (imagePayload.imageUrls ? ` (${imagePayload.imageUrls.length} slides)` : '')
    )

    let fbResult: { success: boolean; error?: string; platformId?: string } = { success: false, error: 'not attempted' }
    let igResult: { success: boolean; error?: string; platformId?: string } = { success: false, error: 'not attempted' }
    let twResult: { success: boolean; error?: string; platformId?: string } = { success: false, error: 'not attempted' }
    let thResult: { success: boolean; error?: string; platformId?: string } = { success: false, error: 'not attempted' }

    try { fbResult = await publishToFacebook(singleCoverPayload(payload, 'facebook'), undefined, bulkLegacy) }
    catch (e) { fbResult = { success: false, error: safeErrorText(e) } }

    await new Promise(r => setTimeout(r, 2000))

    try { igResult = await publishToInstagram(payload, undefined, bulkLegacy) }
    catch (e) { igResult = { success: false, error: safeErrorText(e) } }

    await new Promise(r => setTimeout(r, 2000))

    try { twResult = await publishToTwitter(payload) }
    catch (e) { twResult = { success: false, error: safeErrorText(e) } }

    await new Promise(r => setTimeout(r, 2000))

    try { thResult = await publishToThreads(singleCoverPayload(payload, 'threads'), undefined, bulkLegacy) }
    catch (e) { thResult = { success: false, error: safeErrorText(e) } }

    // Threads/X-only "başarı" socialPublished=true yazmamalı — IG/FB retry kilitlenir.
    const primaryOk = fbResult.success || igResult.success
    const anySuccess = primaryOk || twResult.success || thResult.success

    if (anySuccess) {
      const update: Record<string, unknown> = {
        socialImageUrl: imagePayload.imageUrl || socialImageUrl,
        socialHeadline: socialContent.headline,
        socialStorySummary: socialContent.storySummary,
        socialHashtags: socialContent.hashtags,
      }
      if ('platformId' in fbResult && fbResult.platformId) update.facebookPostId   = fbResult.platformId
      if ('platformId' in igResult && igResult.platformId) update.instagramMediaId = igResult.platformId
      if ('platformId' in twResult && twResult.platformId) update.twitterTweetId   = twResult.platformId
      if ('platformId' in thResult && thResult.platformId) update.threadsPostId    = thResult.platformId
      if (primaryOk) {
        update.socialPublished = true
        update.socialPublishedAt = FieldValue.serverTimestamp()
      } else {
        console.warn(
          `[force-reshare] POST partial (TH/X only) — ${id}; socialPublished bırakılmadı (IG/FB retry)`,
        )
      }
      await db.collection(Collections.NEWS).doc(id).update(update).catch(() => {})
    }

    results.push({
      newsId: id,
      title: title.slice(0, 80),
      facebook: fbResult,
      instagram: igResult,
      twitter: twResult,
      threads: thResult,
    })

    await new Promise(r => setTimeout(r, 2000))
  }

  return NextResponse.json({
    reshared: results.length,
    results,
  })
}
