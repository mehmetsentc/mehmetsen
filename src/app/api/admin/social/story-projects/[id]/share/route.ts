/**
 * GET  /api/admin/social/story-projects/{id}/share?format=reel|video_story
 *      (YouTube: vertical ≤ 3 min goes up as a Short, horizontal / longer as a regular video)
 *      → video-capable accounts with `selectable` + reason (platform duration limits)
 * POST /api/admin/social/story-projects/{id}/share { accountId, format }
 *      → background publish of the rendered video to ONE account through the shared
 *        ledger (record key story_<id>_<renderKey>); the client calls once per account.
 *      GET ?job=… polls it (only its starter).
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { actorFromCms } from '@/lib/social/accounts/actor'
import { supportsReel, supportsVideoStory } from '@/lib/social/accounts/capabilities'
import { listManualTargetAccounts } from '@/lib/social/accounts/manualTargets'
import { publishToTarget } from '@/lib/social/accounts/targetedPublish'
import type { FacebookPublishTarget, InstagramPublishTarget, ThreadsPublishTarget, YouTubePublishTarget } from '@/lib/social/accounts/targetTypes'
import { publishFacebookReel, publishFacebookVideoStory, publishInstagramReel, publishInstagramVideoStory, publishThreadsVideo } from '@/lib/social/reelAdapters'
import { publishYouTubeShort } from '@/lib/social/youtubeShorts'
import { reelJobId, startReelJob } from '@/lib/reels/reelJobs'
import type { MediaShareFormat, MediaSharePlatform } from '@/lib/media/mediaProject'
import { storyCaption, storyLedgerKey, storyShareProblem, youtubeKind, type StoryProject } from '@/lib/story/storyProject'
import { getStory } from '@/lib/story/storyStore'
import { pollStoryJob } from '@/lib/story/storyJobRoute'
import { manualVideoBlocked, SENSITIVE_VIDEO_BLOCK_MESSAGE } from '@/lib/social/sensitiveNews'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 800

type Ctx = { params: Promise<{ id: string }> }
const fmtOf = (v: unknown): MediaShareFormat => (v === 'video_story' ? 'video_story' : 'reel')
const PLATFORMS = new Set<string>(['facebook', 'instagram', 'threads', 'youtube'])

async function accountsFor(ctx: Parameters<typeof actorFromCms>[1] & { uid: string }, p: StoryProject, format: MediaShareFormat) {
  const list = await listManualTargetAccounts(actorFromCms(ctx.uid, ctx))
  return list
    .filter((a) => PLATFORMS.has(a.platform) && a.status === 'active' && a.connectionMethod !== 'legacy' && (format === 'reel' ? supportsReel(a) : supportsVideoStory(a)))
    .map((a) => {
      const problem = storyShareProblem(p, a.platform as MediaSharePlatform, format)
      return { accountId: a.id, platform: a.platform as MediaSharePlatform, displayName: a.displayName, username: a.username ?? null, selectable: !problem, reason: problem }
    })
}

export async function GET(request: Request, { params }: Ctx) {
  const url = new URL(request.url)
  if (url.searchParams.get('job') !== null) return pollStoryJob(request)
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const p = await getStory((await params).id)
  if (!p) return json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
  return json({ accounts: await accountsFor(auth.ctx, p, fmtOf(url.searchParams.get('format'))), caption: storyCaption(p) })
}

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  const body = await readJsonBody(request)
  const format = fmtOf(body.format)
  const p = await getStory(id)
  if (!p) return json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
  if (p.newsId) {
    // HASSAS-VIDEO: düzey 3 haberden hazırlanmış (kural öncesi) video da paylaşılmaz
    const n = await getAdminFirestore().collection(Collections.NEWS).doc(p.newsId).get()
    if (n.exists && manualVideoBlocked(n.data() as Record<string, unknown>)) return json({ error: SENSITIVE_VIDEO_BLOCK_MESSAGE, code: 'sensitive_blocked' }, 422)
  }
  const acc = (await accountsFor(auth.ctx, p, format)).find((a) => a.accountId === body.accountId)
  if (!acc) return json({ error: 'Bu hesap bu biçim için kullanılamaz', code: 'account_unavailable' }, 409)
  if (!acc.selectable) return json({ error: acc.reason, code: 'not_allowed' }, 409)
  const key = storyLedgerKey(p.id, p.render.key!)
  const caption = storyCaption(p)
  const input = { newsId: key, videoUrl: p.render.outputUrl!, caption, coverUrl: p.render.coverUrl }
  const uid = auth.ctx.uid
  const job = await startReelJob({
    jobId: reelJobId(['sshare', p.id, p.render.key!, acc.accountId, format]),
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
            // vertical ≤ 3 min → Short; horizontal or longer → a regular video
            const long = youtubeKind(p) === 'video'
            return publishYouTubeShort({ newsId: key, videoUrl: input.videoUrl, title: p.title.slice(0, 95), description: long ? caption : `${caption}\n\n#Shorts`, tags: ['NaHaber'], long }, t as YouTubePublishTarget)
          }
          if (acc.platform === 'threads') return publishThreadsVideo(input, t as ThreadsPublishTarget)
          if (format === 'video_story') return acc.platform === 'instagram' ? publishInstagramVideoStory(input, t as InstagramPublishTarget) : publishFacebookVideoStory(input, t as FacebookPublishTarget)
          return acc.platform === 'instagram' ? publishInstagramReel(input, t as InstagramPublishTarget) : publishFacebookReel(input, t as FacebookPublishTarget)
        },
      })
      return { result: { result: res, platform: acc.platform, accountId: acc.accountId, format }, httpStatus: res.success ? 200 : 502 }
    },
  })
  return json({ job }, 202)
}
