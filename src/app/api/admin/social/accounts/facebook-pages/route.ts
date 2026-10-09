/**
 * Facebook page selection for a pending connection session.
 *   GET  ?session=…&offset=N  → eligible/ineligible pages (id, name only), paginated
 *   POST { session, pageId }  → verify + save; consumes the session (single use)
 * Page tokens never reach the browser. Requires the same NaHaber user and the
 * HttpOnly selection cookie set by the Facebook callback.
 */
import { applyCookies, json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { clearCookie, listSelectablePages, selectFacebookPage } from '@/lib/social/accounts/connect/flows'
import { SELECT_COOKIE_DEV, SELECT_COOKIE_SECURE } from '@/lib/social/accounts/connect/connectSessions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const url = new URL(request.url)
  const r = await listSelectablePages({
    ctx: auth.ctx,
    sessionId: url.searchParams.get('session'),
    cookieHeader: request.headers.get('cookie'),
    offset: Number(url.searchParams.get('offset') ?? 0),
  })
  if (!r.ok) return json({ error: r.code, code: r.code }, r.status)
  return json(r)
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const r = await selectFacebookPage({
    ctx: auth.ctx,
    sessionId: body.session,
    pageId: body.pageId,
    cookieHeader: request.headers.get('cookie'),
  })
  const res = r.ok ? json({ ok: true, accountId: r.accountId, status: r.status }) : json({ error: r.code, code: r.code }, r.status)
  // Clear the selection cookie once the attempt consumed (or invalidated) the session.
  if (r.ok || !['page_not_in_session', 'page_not_eligible', 'forbidden'].includes(r.code)) {
    applyCookies(res, [clearCookie(SELECT_COOKIE_SECURE), clearCookie(SELECT_COOKIE_DEV)])
  }
  return res
}
