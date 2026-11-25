/**
 * GET  /api/admin/social/media-projects/{id}/share?clipId=&format=reel|video_story
 *      → video-capable accounts, each with `selectable` + the reason (platform limits, rights)
 * POST /api/admin/social/media-projects/{id}/share { clipId, accountId, format }
 *      → background publish of ONE rendered clip to ONE account through the shared
 *        ledger (record key media_<project>_<clip>); the client calls once per account.
 *      GET ?job=… polls it (only its starter).
 * Central social-account managers only. «İnternetten bulundu» media is never shared.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { actorFromCms } from '@/lib/social/accounts/actor'
import { supportsReel, supportsVideoStory } from '@/lib/social/accounts/capabilities'
import { listManualTargetAccounts } from '@/lib/social/accounts/manualTargets'
import { publishToTarget } from '@/lib/social/accounts/targetedPublish'
import type { FacebookPublishTarget, InstagramPublishTarget, ThreadsPublishTarget, YouTubePublishTarget } from '@/lib/social/accounts/targetTypes'
import { publishFacebookReel, publishFacebookVideoStory, publishInstagramReel, publishInstagramVideoStory, publishThreadsVideo } from '@/lib/social/reelAdapters'
import { publishYouTubeShort } from '@/lib/social/youtubeShorts'
import { buildPublicArticleUrl } from '@/lib/social/articleUrl'
import { withSocialUtm } from '@/lib/social/utm'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { isReelJobId, readReelJob, reelJobId, startReelJob } from '@/lib/reels/reelJobs'
import { isClipId, mediaCaption, mediaLedgerKey, shareProblem, type MediaClip, type MediaProject, type MediaShareFormat, type MediaSharePlatform } from '@/lib/media/mediaProject'
import { getProject } from '@/lib/media/mediaStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 800

type Ctx = { params: Promise<{ id: string }> }
const fmtOf = (v: unknown): MediaShareFormat => (v === 'video_story' ? 'video_story' : 'reel')
const PLATFORMS = new Set<string>(['facebook', 'instagram', 'threads', 'youtube'])

async function accountsFor(ctx: Parameters<typeof actorFromCms>[1] & { uid: string }, p: MediaProject, clip: MediaClip, format: MediaShareFormat) {
  const list = await listManualTargetAccounts(actorFromCms(ctx.uid, ctx))
  return list
    .filter((a) => PLATFORMS.has(a.platform) && a.status === 'active' && a.connectionMethod !== 'legacy' && (format === 'reel' ? supportsReel(a) : supportsVideoStory(a)))
    .map((a) => {
      const problem = shareProblem(p, clip, a.platform as MediaSharePlatform, format)
      return { accountId: a.id, platform: a.platform as MediaSharePlatform, displayName: a.displayName, username: a.username ?? null, selectable: !problem, reason: problem }
    })
}

export async function GET(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const url = new URL(request.url)
  const job = url.searchParams.get('job')
  if (job !== null) {
    if (!isReelJobId(job)) return json({ error: 'job geçersiz' }, 400)
    const j = await readReelJob(job)
    if (!j || j.by !== auth.ctx.uid) return json({ error: 'İş bulunamadı' }, 404)
    return json({ job: { jobId: j.jobId, status: j.status, result: j.result, error: j.error, httpStatus: j.httpStatus } })
  }
  const p = await getProject((await params).id)
  if (!p) return json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
  const clipId = url.searchParams.get('clipId')
  const clip = isClipId(clipId) ? p.clips.find((c) => c.id === clipId) : undefined
  if (!clip) return json({ error: 'Bölüm bulunamadı', code: 'clip_not_found' }, 404)
  return json({ accounts: await accountsFor(auth.ctx, p, clip, fmtOf(url.searchParams.get('format'))) })
}

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  const body = await readJsonBody(request)
  const format = fmtOf(body.format)
  const p = await getProject(id)
  if (!p) return json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
  const clip = isClipId(body.clipId) ? p.clips.find((c) => c.id === body.clipId) : undefined
  if (!clip) return json({ error: 'Bölüm bulunamadı', code: 'clip_not_found' }, 404)
  const acc = (await accountsFor(auth.ctx, p, clip, format)).find((a) => a.accountId === body.accountId)
  if (!acc) return json({ error: 'Bu hesap bu biçim için kullanılamaz', code: 'account_unavailable' }, 409)
  if (!acc.selectable) return json({ error: acc.reason, code: 'not_allowed' }, 409)

  let articleUrl: string | null = null
  if (p.linkedNewsId) {
    const n = await getAdminFirestore().collection(Collections.NEWS).doc(p.linkedNewsId).get()
    if (n.exists) articleUrl = withSocialUtm(buildPublicArticleUrl(p.linkedNewsId, n.data() as Record<string, unknown>), { platform: acc.platform, format, accountId: acc.accountId }) ?? null
  }
  const key = mediaLedgerKey(p.id, clip.id)
  const caption = mediaCaption(p, clip, articleUrl)
  const input = { newsId: key, videoUrl: clip.outputUrl!, caption, coverUrl: clip.coverUrl }
  const uid = auth.ctx.uid
  const job = await startReelJob({
    jobId: reelJobId(['mshare', p.id, clip.id, acc.accountId, format]),
    kind: 'share',
    newsId: key,
    by: uid,
    run: async () => {
      const res = await publishToTarget({
        newsId: key,
        platform: acc.platform,
        format,
        mode: format,
        accountId: acc.accountId,
        force: false,
        actorUid: uid,
        trigger: 'studio_media',
        publish: (t) => {
          if (acc.platform === 'youtube') {
            const title = (clip.title || p.title).slice(0, 95)
            return publishYouTubeShort({ newsId: key, videoUrl: input.videoUrl, title, description: `${caption}\n\n#Shorts`, tags: ['NaHaber', 'haber'] }, t as YouTubePublishTarget)
          }
          if (acc.platform === 'threads') return publishThreadsVideo(input, t as ThreadsPublishTarget)
          if (format === 'video_story') {
            return acc.platform === 'instagram' ? publishInstagramVideoStory(input, t as InstagramPublishTarget) : publishFacebookVideoStory(input, t as FacebookPublishTarget)
          }
          return acc.platform === 'instagram' ? publishInstagramReel(input, t as InstagramPublishTarget) : publishFacebookReel(input, t as FacebookPublishTarget)
        },
      })
      return { result: { result: res, platform: acc.platform, accountId: acc.accountId, format }, httpStatus: res.success ? 200 : 502 }
    },
  })
  return json({ job }, 202)
}
