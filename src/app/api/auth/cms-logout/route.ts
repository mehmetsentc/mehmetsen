import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CMS_SESSION_COOKIE = 'cms_session'

/**
 * POST /api/auth/cms-logout
 * Logout sırasında CMS session cookie'sini temizler. Middleware'in
 * `/admin/*` koruması için kullanılan tek session sinyali budur.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(CMS_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return res
}
