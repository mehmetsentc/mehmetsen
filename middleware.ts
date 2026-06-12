import { NextRequest, NextResponse } from 'next/server'
import {
  COUNTRY_COOKIE,
  LANGUAGE_COOKIE,
  isLanguage,
  resolveDefaultLanguage,
} from '@/lib/i18n'

const COOKIE_MAX_AGE_YEAR = 60 * 60 * 24 * 365

// Read the visitor country from common CDN/edge headers. On Vercel this is
// `x-vercel-ip-country`; Cloudflare uses `cf-ipcountry`. `request.geo` is no
// longer populated in Next.js 15, so we rely on headers.
function detectCountry(request: NextRequest): string {
  const fromHeader =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    request.headers.get('x-country-code') ||
    request.headers.get('x-geo-country') ||
    ''
  return fromHeader.trim().toUpperCase()
}

export function middleware(request: NextRequest) {
  const country = detectCountry(request)
  const existingLang = request.cookies.get(LANGUAGE_COOKIE)?.value

  // Forward resolved cookies to the server render of THIS request so the layout
  // can pick the correct initial language (no hydration mismatch).
  if (country) {
    request.cookies.set(COUNTRY_COOKIE, country)
  }
  if (!isLanguage(existingLang) && country) {
    request.cookies.set(LANGUAGE_COOKIE, resolveDefaultLanguage(country))
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Persist to the browser for subsequent requests.
  if (country) {
    response.cookies.set(COUNTRY_COOKIE, country, {
      path: '/',
      maxAge: COOKIE_MAX_AGE_YEAR,
      sameSite: 'lax',
    })
  }

  // Only seed the default language when the user has not chosen one yet, so an
  // explicit preference always wins over the geo default.
  if (!isLanguage(existingLang) && country) {
    response.cookies.set(LANGUAGE_COOKIE, resolveDefaultLanguage(country), {
      path: '/',
      maxAge: COOKIE_MAX_AGE_YEAR,
      sameSite: 'lax',
    })
  }

  return response
}

export const config = {
  // Pages only — skip API/cron routes (saves Edge invocations on Pro) and static assets.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
}
