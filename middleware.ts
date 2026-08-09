import { NextRequest, NextResponse } from 'next/server'
import {
  COUNTRY_COOKIE,
  LANGUAGE_COOKIE,
  isLanguage,
  resolveDefaultLanguage,
} from '@/lib/i18n'
import { verifyCmsSessionToken } from '@/lib/cmsSession'
import { CMS_STAFF_ROLES } from '@/types/cms'
import {
  resolveTenantFromRequest,
  TENANT_HEADER,
  TENANT_PROVINCE_HEADER,
  TENANT_COOKIE,
} from '@/lib/tenant'

const COOKIE_MAX_AGE_YEAR = 60 * 60 * 24 * 365
const CMS_SESSION_COOKIE = 'cms_session'

/**
 * City tenant routes that get rewritten to /city-site/* internally.
 * Public URLs stay clean. Unmatched paths on city subdomains fall through
 * to normal national routes (e.g. /haber/[slug] works on city subdomains).
 */
const CITY_REWRITE_PATHS = new Set(['/', '/etkinlik', '/spor', '/ilceler'])

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /admin/* için edge-level guard. Detaylı rol/permission kontrolü server
  // action ve API route'larında zaten yapılıyor; bu sadece anonim trafiği
  // login'e yönlendiren defense-in-depth.
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get(CMS_SESSION_COOKIE)?.value
    const session = await verifyCmsSessionToken(token)
    if (!session || !CMS_STAFF_ROLES.includes(session.role)) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
  }

  // ── City Network tenant resolution ──────────────────────────────────────
  const tenant = await resolveTenantFromRequest(request)

  if (tenant) {
    // Build a NEW mutable headers object — request.headers is ReadonlyHeaders
    // in Next.js 15 Edge middleware, so calling .set() on it silently fails.
    const rewriteHeaders = new Headers(request.headers)
    rewriteHeaders.set(TENANT_HEADER, tenant.slug)
    rewriteHeaders.set(TENANT_PROVINCE_HEADER, tenant.provinceSlug)

    // On city subdomains, /feed should show city news — redirect to city home.
    if (pathname === '/feed' || pathname === '/feed/') {
      const homeUrl = request.nextUrl.clone()
      homeUrl.pathname = '/'
      return NextResponse.redirect(homeUrl)
    }

    // Rewrite city-specific paths to internal /city-site/* routes.
    // Other paths (e.g. /haber/[slug]) fall through to normal routing.
    if (CITY_REWRITE_PATHS.has(pathname)) {
      const rewriteUrl = request.nextUrl.clone()
      rewriteUrl.pathname = pathname === '/' ? '/city-site' : `/city-site${pathname}`

      // Forward country/language cookies for first-time visitors
      const country = detectCountry(request)
      const existingLang = request.cookies.get(LANGUAGE_COOKIE)?.value
      const existingCountry = request.cookies.get(COUNTRY_COOKIE)?.value
      if (country && existingCountry !== country) {
        rewriteHeaders.set(COUNTRY_COOKIE, country)
      }
      if (!isLanguage(existingLang) && country) {
        rewriteHeaders.set(LANGUAGE_COOKIE, resolveDefaultLanguage(country))
      }

      const response = NextResponse.rewrite(rewriteUrl, {
        request: { headers: rewriteHeaders },
      })

      // Set country/language cookies on response
      if (country && existingCountry !== country) {
        response.cookies.set(COUNTRY_COOKIE, country, {
          path: '/',
          maxAge: COOKIE_MAX_AGE_YEAR,
          sameSite: 'lax',
        })
      }
      if (!isLanguage(existingLang) && country) {
        response.cookies.set(LANGUAGE_COOKIE, resolveDefaultLanguage(country), {
          path: '/',
          maxAge: COOKIE_MAX_AGE_YEAR,
          sameSite: 'lax',
        })
      }

      // Set tenant cookie
      const existingTenant = request.cookies.get(TENANT_COOKIE)?.value
      if (existingTenant !== tenant.slug) {
        response.cookies.set(TENANT_COOKIE, tenant.slug, {
          path: '/',
          maxAge: COOKIE_MAX_AGE_YEAR,
          sameSite: 'lax',
        })
      }

      return response
    }
  }

  const country = detectCountry(request)
  const existingLang = request.cookies.get(LANGUAGE_COOKIE)?.value
  const existingCountry = request.cookies.get(COUNTRY_COOKIE)?.value

  // CRITICAL: Only forward the cookie to the inner render when it isn't already
  // present on the request. If we always called `request.cookies.set(...)` here
  // the response would be tagged dynamic and Vercel would strip its CDN cache,
  // turning every news page into a fresh SSR + Firestore round-trip. The
  // forwarded value is only needed by the layout when the user is hitting us
  // for the very first time and the language cookie hasn't been minted yet.
  const needsCountryForward = country && existingCountry !== country
  const needsLangForward = !isLanguage(existingLang) && country
  if (needsCountryForward) {
    request.cookies.set(COUNTRY_COOKIE, country)
  }
  if (needsLangForward) {
    request.cookies.set(LANGUAGE_COOKIE, resolveDefaultLanguage(country))
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Persist to the browser only when the cookie is missing or stale. Setting a
  // Set-Cookie on every response would (a) waste bytes on every page load and
  // (b) flip Vercel's caching layer into private mode for the entire site.
  if (needsCountryForward) {
    response.cookies.set(COUNTRY_COOKIE, country, {
      path: '/',
      maxAge: COOKIE_MAX_AGE_YEAR,
      sameSite: 'lax',
    })
  }
  if (needsLangForward) {
    response.cookies.set(LANGUAGE_COOKIE, resolveDefaultLanguage(country), {
      path: '/',
      maxAge: COOKIE_MAX_AGE_YEAR,
      sameSite: 'lax',
    })
  }

  // City tenant cookie — set once, lives for 1 year (non-rewritten paths)
  if (tenant) {
    const existingTenant = request.cookies.get(TENANT_COOKIE)?.value
    if (existingTenant !== tenant.slug) {
      response.cookies.set(TENANT_COOKIE, tenant.slug, {
        path: '/',
        maxAge: COOKIE_MAX_AGE_YEAR,
        sameSite: 'lax',
      })
    }
  }

  return response
}

export const config = {
  // Pages only — skip API/cron routes (saves Edge invocations on Pro) and static assets.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
}
