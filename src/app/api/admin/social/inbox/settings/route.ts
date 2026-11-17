/**
 * GET  /api/admin/social/inbox/settings   accounts + reply/DM capability + settings + global switch
 * POST /api/admin/social/inbox/settings
 *   { action: 'save', accountId, settings: { commentMode, dmMode, autoCategories, dailyLimit, minIntervalSec, paused } }
 *   { action: 'subscribe', accountId }      turn on the `messages` webhook for the account
 *   { action: 'global_pause', paused }      emergency stop for every automatic reply
 */
import { getSocialAccount, isWellFormedAccountId } from '@/lib/social/accounts/accountStore'
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { listInboxAccounts, saveInboxSettings, setAutoReplyPaused, subscribeAccountMessages } from '@/lib/social/inbox/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  return json(await listInboxAccounts())
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const b = await readJsonBody(request)
  const now = Date.now()
  if (b.action === 'global_pause') {
    if (typeof b.paused !== 'boolean') return json({ error: 'Geçersiz değer', code: 'invalid' }, 400)
    await setAutoReplyPaused(b.paused, auth.ctx.uid, now)
    return json({ ok: true })
  }
  const accountId = isWellFormedAccountId(b.accountId) ? b.accountId : null
  if (!accountId) return json({ error: 'Geçersiz hesap', code: 'invalid_account_id' }, 400)
  if (!(await getSocialAccount(accountId).catch(() => null))) return json({ error: 'Hesap bulunamadı', code: 'not_found' }, 404)
  if (b.action === 'save') return json({ settings: await saveInboxSettings(accountId, b.settings, auth.ctx.uid, now) })
  if (b.action === 'subscribe') {
    const r = await subscribeAccountMessages(accountId, auth.ctx.uid, now)
    return r.ok ? json(r) : json({ error: r.code, code: r.code }, r.code === 'not_found' ? 404 : 422)
  }
  return json({ error: 'Geçersiz işlem', code: 'invalid_action' }, 400)
}
