/**
 * Shared guards for social account API routes.
 *
 * CSRF: the app authenticates admin APIs with `Authorization: Bearer <Firebase
 * ID token>` (never sent automatically by browsers). On top of that, state-
 * changing requests must come from our own origin (Origin / Sec-Fetch-Site).
 */
import 'server-only'
import { NextResponse } from 'next/server'
import { verifyCmsToken, type CmsAuthContext } from '@/lib/cmsAuthServer'
import { canManageSocialAccounts, SOCIAL_ACCOUNT_MANAGE_PERMISSION } from '../authz'
import { oauthBaseUrl } from './oauthConfig'
import type { CookieToSet } from './flows'
import type { OAuthBindingCookie } from '../oauthState'

const NO_STORE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

/** Same-origin check for mutations. */
export function isSameOriginRequest(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = request.headers.get('origin')
  if (!origin) return site === 'same-origin'
  const allowed = new Set<string>()
  const trusted = oauthBaseUrl()
  if (trusted) allowed.add(trusted)
  try {
    allowed.add(new URL(request.url).origin)
  } catch {
    /* ignore */
  }
  return allowed.has(origin)
}

export async function requireAccountManager(
  request: Request,
  options: { mutation: boolean },
): Promise<{ ctx: CmsAuthContext } | { response: NextResponse }> {
  if (options.mutation && !isSameOriginRequest(request)) {
    return { response: json({ error: 'Geçersiz istek kaynağı', code: 'bad_origin' }, 403) }
  }
  // verifyCmsToken without scopeAware → province/category-scoped staff are refused.
  const ctx = await verifyCmsToken(request, SOCIAL_ACCOUNT_MANAGE_PERMISSION)
  if (!ctx) return { response: json({ error: 'Unauthorized', code: 'unauthorized' }, 401) }
  if (!canManageSocialAccounts(ctx)) return { response: json({ error: 'Forbidden', code: 'forbidden' }, 403) }
  return { ctx }
}

export function applyCookies(res: NextResponse, cookies: Array<CookieToSet | OAuthBindingCookie>): NextResponse {
  for (const c of cookies) res.cookies.set(c.name, c.value, c.options)
  return res
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const b = (await request.json()) as unknown
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
