/**
 * GET /api/admin/social/oauth/{facebook|instagram|threads}/callback
 *
 * Platform redirect target. Validates state (binding cookie, NaHaber
 * cms_session uid, platform, expiry, single use), re-checks the initiator's
 * current authority, exchanges the code server-side and stores the encrypted
 * connection. Always redirects to the fixed panel URL with a short result
 * code; never echoes Meta error text, tokens or the authorization code.
 */
import { NextResponse } from 'next/server'
import { handleOAuthCallback } from '@/lib/social/accounts/connect/flows'
import { applyCookies } from '@/lib/social/accounts/connect/routeHelpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ platform: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { platform } = await context.params
  const url = new URL(request.url)
  const out = await handleOAuthCallback({
    platform,
    params: url.searchParams,
    cookieHeader: request.headers.get('cookie'),
  })
  // Test ortamında güvenilir kök yoksa yönlendirme göreli panel yoludur (production'a düşmez).
  const res = out.redirect.startsWith('/')
    ? new NextResponse(null, { status: 303, headers: { Location: out.redirect } })
    : NextResponse.redirect(out.redirect, { status: 303 })
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Referrer-Policy', 'no-referrer')
  return applyCookies(res, out.cookies)
}
