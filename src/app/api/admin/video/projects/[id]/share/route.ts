/**
 * KURGU — GET  /api/admin/video/projects/{id}/share?format=reel|video_story → video-capable accounts (+ why not)
 *         POST /api/admin/video/projects/{id}/share { accountId, format } → background publish of the exported
 *              video to ONE account via the shared ledger (key edit_<project>_<render>); GET ?job=… polls it.
 * Central social-account managers only. Nothing is shared until the user presses «Paylaş» for an account.
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
import { PLATFORM_LIMITS, PLATFORM_NAME, type MediaShareFormat, type MediaSharePlatform } from '@/lib/media/mediaProject'
import { renderKeyFor, type EditProject } from '@/lib/edit/editProject'
import { getEditProject } from '@/lib/edit/editStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 800

type Ctx = { params: Promise<{ id: string }> }
const fmtOf = (v: unknown): MediaShareFormat => (v === 'video_story' ? 'video_story' : 'reel')
const PLATFORMS = new Set<string>(['facebook', 'instagram', 'threads', 'youtube'])

function editShareProblem(p: EditProject, platform: MediaSharePlatform, format: MediaShareFormat): string | null {
  if (p.render.status !== 'ready' || !p.render.outputUrl || p.render.key !== renderKeyFor(p)) return 'Önce videoyu dışa aktarın (güncel hâli)'
  const sec = p.render.seconds ?? 0
  const lim = PLATFORM_LIMITS[platform]
  if (format === 'video_story') {
    if (lim.storyMaxSec === null) return `${PLATFORM_NAME[platform]} video hikâyesi desteklemez`
    return sec > lim.storyMaxSec ? `${PLATFORM_NAME[platform]} hikâyesi en fazla ${lim.storyMaxSec} sn` : null
  }
  return sec > lim.reelMaxSec ? `${PLATFORM_NAME[platform]} için en fazla ${lim.reelMaxSec >= 120 ? `${lim.reelMaxSec / 60} dk` : `${lim.reelMaxSec} sn`}` : null
}

async function accountsFor(ctx: Parameters<typeof actorFromCms>[1] & { uid: string }, p: EditProject, format: MediaShareFormat) {
  const list = await listManualTargetAccounts(actorFromCms(ctx.uid, ctx))
  return list
    .filter((a) => PLATFORMS.has(a.platform) && a.status === 'active' && a.connectionMethod !== 'legacy' && (format === 'reel' ? supportsReel(a) : supportsVideoStory(a)))
    .map((a) => {
      const problem = editShareProblem(p, a.platform as MediaSharePlatform, format)
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
  const p = await getEditProject((await params).id)
  if (!p) return json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
  return json({ accounts: await accountsFor(auth.ctx, p, fmtOf(url.searchParams.get('format'))) })
}

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const format = fmtOf(body.format)
  const p = await getEditProject((await params).id)
  if (!p) return json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
  const acc = (await accountsFor(auth.ctx, p, format)).find((a) => a.accountId === body.accountId)
  if (!acc) return json({ error: 'Bu hesap bu biçim için kullanılamaz', code: 'account_unavailable' }, 409)
  if (!acc.selectable) return json({ error: acc.reason, code: 'not_allowed' }, 409)

  let articleUrl: string | null = null
  if (p.linkedNewsId) {
    const n = await getAdminFirestore().collection(Collections.NEWS).doc(p.linkedNewsId).get()
    if (n.exists) articleUrl = withSocialUtm(buildPublicArticleUrl(p.linkedNewsId, n.data() as Record<string, unknown>), { platform: acc.platform, format, accountId: acc.accountId }) ?? null
  }
  const key = `edit_${p.id}_${(p.render.key ?? '').slice(0, 12)}`.slice(0, 128)
  const caption = [p.caption.trim() || p.title.trim(), articleUrl ? `Haberin tamamı: ${articleUrl}` : ''].filter(Boolean).join('\n\n').slice(0, 2200)
  const input = { newsId: key, videoUrl: p.render.outputUrl!, caption, coverUrl: p.render.coverUrl }
  const uid = auth.ctx.uid
  const job = await startReelJob({
    jobId: reelJobId(['eshare', p.id, p.render.key ?? '', acc.accountId, format]),
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
          if (acc.platform === 'youtube') return publishYouTubeShort({ newsId: key, videoUrl: input.videoUrl, title: p.title.slice(0, 95), description: `${caption}\n\n#Shorts`, tags: ['NaHaber', 'haber'] }, t as YouTubePublishTarget)
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
