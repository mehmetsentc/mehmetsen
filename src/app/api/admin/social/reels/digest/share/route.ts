/**
 * GET  /api/admin/social/reels/digest/share?format=reel|video_story → central reel-capable IG/FB accounts.
 * POST /api/admin/social/reels/digest/share { digestId, accountId, format } → publish the digest video to
 *      ONE account through the shared ledger (record key digest_<id>; the digest is not one news item,
 *      so location/category scopes do not apply — central social-account managers only).
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { actorFromCms } from '@/lib/social/accounts/actor'
import { supportsReel, supportsVideoStory, type VideoFormat } from '@/lib/social/accounts/capabilities'
import { listManualTargetAccounts } from '@/lib/social/accounts/manualTargets'
import { publishToTarget } from '@/lib/social/accounts/targetedPublish'
import type { FacebookPublishTarget, InstagramPublishTarget } from '@/lib/social/accounts/targetTypes'
import { getDigest } from '@/lib/reels/digestService'
import { publishFacebookReel, publishFacebookVideoStory, publishInstagramReel, publishInstagramVideoStory } from '@/lib/social/reelAdapters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const fmtOf = (v: unknown): VideoFormat => (v === 'video_story' ? 'video_story' : 'reel')

async function accounts(ctx: Parameters<typeof actorFromCms>[1] & { uid: string }, format: VideoFormat) {
  const list = await listManualTargetAccounts(actorFromCms(ctx.uid, ctx))
  return list
    .filter((a) => (a.platform === 'instagram' || a.platform === 'facebook') && (format === 'reel' ? supportsReel(a) : supportsVideoStory(a)) && a.status === 'active')
    .map((a) => ({ accountId: a.id, platform: a.platform as 'instagram' | 'facebook', displayName: a.displayName, username: a.username ?? null }))
}

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  return json({ accounts: await accounts(auth.ctx, fmtOf(new URL(request.url).searchParams.get('format'))) })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const b = await readJsonBody(request)
  const format = fmtOf(b.format)
  const digest = await getDigest(typeof b.digestId === 'string' ? b.digestId : '')
  if (!digest) return json({ error: 'Toplu video bulunamadı' }, 404)
  const acc = (await accounts(auth.ctx, format)).find((a) => a.accountId === b.accountId)
  if (!acc) return json({ error: 'Bu hesap bu biçim için kullanılamaz' }, 409)
  const input = { newsId: `digest_${digest.id}`, videoUrl: digest.url, caption: digest.caption }
  const res = await publishToTarget({
    newsId: input.newsId,
    platform: acc.platform,
    format,
    mode: format,
    accountId: acc.accountId,
    force: false,
    actorUid: auth.ctx.uid,
    trigger: 'studio_digest',
    publish: (t) =>
      format === 'video_story'
        ? acc.platform === 'instagram' ? publishInstagramVideoStory(input, t as InstagramPublishTarget) : publishFacebookVideoStory(input, t as FacebookPublishTarget)
        : acc.platform === 'instagram' ? publishInstagramReel(input, t as InstagramPublishTarget) : publishFacebookReel(input, t as FacebookPublishTarget),
  })
  return json({ result: res, platform: acc.platform, accountId: acc.accountId, format }, res.success ? 200 : 502)
}
