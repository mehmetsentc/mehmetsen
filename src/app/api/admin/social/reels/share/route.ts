/**
 * GET  /api/admin/social/reels/share → Instagram / Facebook accounts that can take a reel.
 * POST /api/admin/social/reels/share { newsId, accountId, force? } → build (or reuse) the
 * reel and publish it to that one account through the shared ledger
 * (publishOneSocial mode 'reel', trigger 'studio').
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { actorFromCms } from '@/lib/social/accounts/actor'
import { supportsReel } from '@/lib/social/accounts/capabilities'
import { listManualTargetAccounts } from '@/lib/social/accounts/manualTargets'
import { publishOneSocial } from '@/lib/social/publishOneSocial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function reelAccounts(ctx: Parameters<typeof actorFromCms>[1] & { uid: string }) {
  const list = await listManualTargetAccounts(actorFromCms(ctx.uid, ctx))
  return list
    .filter((a) => (a.platform === 'instagram' || a.platform === 'facebook') && supportsReel(a))
    .map((a) => ({ accountId: a.id, platform: a.platform, displayName: a.displayName, username: a.username ?? null }))
}

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  return json({ accounts: await reelAccounts(auth.ctx) })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const newsId = typeof body.newsId === 'string' ? body.newsId.trim() : ''
  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : ''
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(newsId)) return json({ error: 'newsId gerekli' }, 400)
  const account = (await reelAccounts(auth.ctx)).find((a) => a.accountId === accountId)
  if (!account) return json({ error: 'Bu hesap Reels paylaşımı için uygun değil' }, 409)
  const result = await publishOneSocial(newsId, {
    mode: 'reel',
    targets: { [account.platform]: account.accountId },
    actorUid: auth.ctx.uid,
    force: body.force === true,
    trigger: 'studio',
  })
  return json({ result }, result.ok ? 200 : result.skipped ? 409 : 502)
}
