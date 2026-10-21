/**
 * REELS-1 — publish the rendered news reel to ONE explicit Instagram / Facebook
 * account through the shared ledger (publishToTarget). Entry point for
 * publishOneSocial(mode: 'reel'): automation jobs and the Reels studio.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { buildPublicArticleUrl } from './articleUrl'
import { publishToTarget } from './accounts/targetedPublish'
import type { FacebookPublishTarget, InstagramPublishTarget, YouTubePublishTarget } from './accounts/targetTypes'
import { publishYouTubeShort } from './youtubeShorts'
import type { PublishOneSocialOptions, PublishOneSocialResult } from './publishOneSocial'
import { publishFacebookReel, publishFacebookVideoStory, publishInstagramReel, publishInstagramVideoStory } from './reelAdapters'
import { safeErrorText } from './safeLog'
import { buildSeoDescription, buildSeoHashtags, socialLocationFromDoc, type SocialLocation } from './socialSeo'
import { resolveFacebookPlaceId } from './placeResolver'
import { FACEBOOK_GRAPH_BASE } from './graphConfig'
import { getCategoryLabel } from '@/lib/newsMapper'

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** SOCIAL-SEO-1: the story's 5 discovery hashtags (city, district, category, topics). */
export function reelSeoHashtags(d: Record<string, unknown>, loc: SocialLocation = socialLocationFromDoc(d)): string[] {
  return buildSeoHashtags({
    location: loc,
    categoryLabel: (str(d.categoryId) ? getCategoryLabel(str(d.categoryId)) : '') || str(d.categoryName) || str(d.category),
    tags: d.tags,
    keywords: d.seoKeywords,
    breaking: d.isBreaking === true,
  })
}

/** Body text of the story (for the longer description). */
function storyBody(d: Record<string, unknown>): string {
  const raw = str(d.content) || str(d.description)
  return raw.replace(/<[^>]+>/g, ' ').replace(/[#*_`>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2500)
}

/** Caption: headline, a longer search-friendly description with «📍 place», link, 5 SEO hashtags. */
export function buildReelCaption(d: Record<string, unknown>, articleUrl: string | null): string {
  const title = str(d.title)
  const loc = socialLocationFromDoc(d)
  const desc = buildSeoDescription({ title, spot: str(d.spot) || str(d.summary), body: storyBody(d), location: loc, maxChars: 900 })
  const tags = reelSeoHashtags(d, loc)
  return [title, desc, articleUrl ? `Haberin tamamı: ${articleUrl}` : '', tags.join(' ')].filter(Boolean).join('\n\n').slice(0, 2200)
}

/** YouTube Short metadata: headline as title; summary, article link and hashtags as description. */
export function buildYouTubeShortMeta(
  d: Record<string, unknown>,
  articleUrl: string | null,
): { title: string; description: string; tags: string[]; location?: { latitude: number; longitude: number; description?: string } } {
  const title = str(d.title)
  const loc = socialLocationFromDoc(d)
  const summary = buildSeoDescription({ title, spot: str(d.spot) || str(d.summary), body: storyBody(d), location: loc, maxChars: 1500 })
  const seo = reelSeoHashtags(d, loc)
  const category = str(d.categoryName) || str(d.category)
  const hashtags = ['#Shorts', ...seo]
  return {
    title,
    description: [summary, articleUrl ? `Haberin tamamı: ${articleUrl}` : '', hashtags.join(' ')].filter(Boolean).join('\n\n'),
    tags: [...seo.map((t) => t.slice(1)), 'haber', 'NaHaber', ...(loc.city ? [loc.city] : []), ...(loc.district ? [loc.district] : []), ...(category ? [category] : [])],
    ...(loc.lat != null && loc.lng != null ? { location: { latitude: loc.lat, longitude: loc.lng, description: loc.label ?? undefined } } : {}),
  }
}

export async function publishReelOne(newsId: string, options: PublishOneSocialOptions): Promise<PublishOneSocialResult> {
  const format = options.mode === 'video_story' ? 'video_story' : 'reel'
  const skip = (reason: string): PublishOneSocialResult => ({ ok: false, newsId, skipped: true, reason })
  const entries = Object.entries(options.targets ?? {}).filter(([, v]) => !!v) as Array<[string, string]>
  if (entries.length !== 1) return skip('Video yalnızca tek bir hedef hesaba paylaşılır')
  const [platform, accountId] = entries[0]!
  if (platform !== 'instagram' && platform !== 'facebook' && platform !== 'youtube') return skip('Reels yalnızca Instagram, Facebook ve YouTube hesaplarında')
  if (platform === 'youtube' && format !== 'reel') return skip('YouTube yalnızca Shorts (reel) biçimini destekler')
  if (!options.actorUid) return skip('Reels paylaşımı için yetkili kullanıcı gerekli')

  const snap = await getAdminFirestore().collection(Collections.NEWS).doc(newsId).get()
  if (!snap.exists) return skip('Haber bulunamadı')
  const d = snap.data() as Record<string, unknown>
  if (str(d.status) !== 'published') return skip('Haber yayında değil')

  let videoUrl: string
  let coverUrl: string | null = null
  try {
    const { buildReelForNews } = await import('@/lib/reels/reelService')
    const built = await buildReelForNews(newsId, { by: options.actorUid })
    videoUrl = built.url
    coverUrl = built.coverUrl ?? null
  } catch (err) {
    // Includes the TTS free-tier guard: no reel, nothing published, no ledger claim.
    return skip(`Reels videosu üretilemedi: ${safeErrorText(err).slice(0, 200)}`)
  }

  const articleUrl = buildPublicArticleUrl(newsId, d)
  const caption = buildReelCaption(d, articleUrl)
  const res = await publishToTarget({
    newsId,
    platform,
    format,
    mode: format,
    accountId,
    force: options.ledgerForce ?? options.force ?? false,
    acknowledgeUncertainRecordId: options.acknowledgeUncertainRecordId ?? null,
    acknowledgeUncertainAttemptId: options.acknowledgeUncertainAttemptId ?? null,
    actorUid: options.actorUid,
    trigger: options.trigger ?? (options.automation ? 'automation' : 'studio'),
    publish: (t) =>
      platform === 'youtube'
        ? publishYouTubeShort({ newsId, videoUrl, ...buildYouTubeShortMeta(d, articleUrl) }, t as YouTubePublishTarget)
        : format === 'video_story'
        ? platform === 'instagram'
          ? publishInstagramVideoStory({ newsId, videoUrl, caption }, t as InstagramPublishTarget)
          : publishFacebookVideoStory({ newsId, videoUrl, caption }, t as FacebookPublishTarget)
        : platform === 'instagram'
          ? (async () => {
              const ig = t as InstagramPublishTarget
              const locationId = await resolveFacebookPlaceId(
                socialLocationFromDoc(d),
                ig.apiBase === FACEBOOK_GRAPH_BASE ? ig.accessToken : null,
              )
              return publishInstagramReel({ newsId, videoUrl, caption, coverUrl, locationId }, ig)
            })()
          : publishFacebookReel({ newsId, videoUrl, caption }, t as FacebookPublishTarget),
  })
  return {
    ok: res.success,
    newsId,
    skipped: false,
    title: str(d.title).slice(0, 120),
    reel: { attempted: true, [platform]: res, videoUrl },
  }
}
