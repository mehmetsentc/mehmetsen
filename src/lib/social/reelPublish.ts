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

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function clamp(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '))
  return (end > max * 0.6 ? cut.slice(0, end + 1) : cut).trim() + '…'
}

/** Caption: headline, one short summary, article link, a few plain hashtags. */
export function buildReelCaption(d: Record<string, unknown>, articleUrl: string | null): string {
  const title = str(d.title)
  const summary = clamp(str(d.summary) || str(d.spot) || str(d.description), 280)
  const city = str(d.city)
  const tags = ['#haber', '#NaHaber', ...(city ? [`#${city.replace(/\s+/g, '')}`] : [])]
  return [title, summary, articleUrl ? `Haberin tamamı: ${articleUrl}` : '', tags.join(' ')].filter(Boolean).join('\n\n')
}

/** YouTube Short metadata: headline as title; summary, article link and hashtags as description. */
export function buildYouTubeShortMeta(d: Record<string, unknown>, articleUrl: string | null): { title: string; description: string; tags: string[] } {
  const title = str(d.title)
  const summary = clamp(str(d.summary) || str(d.spot) || str(d.description), 1200)
  const city = str(d.city)
  const category = str(d.categoryName) || str(d.category)
  const hashtags = ['#Shorts', '#haber', '#NaHaber', ...(city ? [`#${city.replace(/\s+/g, '')}`] : [])]
  return {
    title,
    description: [summary, articleUrl ? `Haberin tamamı: ${articleUrl}` : '', hashtags.join(' ')].filter(Boolean).join('\n\n'),
    tags: ['haber', 'NaHaber', ...(city ? [city] : []), ...(category ? [category] : [])],
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
          ? publishInstagramReel({ newsId, videoUrl, caption, coverUrl }, t as InstagramPublishTarget)
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
