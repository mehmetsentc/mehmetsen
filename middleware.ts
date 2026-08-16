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
  TENANT_PROVINCE_COOKIE,
} from '@/lib/tenant'

const COOKIE_MAX_AGE_YEAR = 60 * 60 * 24 * 365
const CMS_SESSION_COOKIE = 'cms_session'

/**
 * City tenant path → internal rewrite target.
 * Keys are the public URL paths; values are the internal /city-site/* target.
 * `/feed`, `/yerel` resolve to the city homepage feed; `/kategori/[slug]` rewrites to city-site.
 */
const CITY_PATH_REWRITES: Record<string, string> = {
  '/': '/city-site',
  '/feed': '/city-site',
  '/yerel': '/city-site',
  '/etkinlik': '/city-site/etkinlik',
  '/is-ilanlari': '/city-site/is-ilanlari',
  '/spor': '/city-site/spor',
  '/ilceler': '/city-site/ilceler',
  '/nobetci-eczaneler': '/city-site/nobetci-eczaneler',
}

/**
 * National browsing paths that should NOT render on city subdomains.
 * These get redirected to city home (`/`) so users never see national content.
 * Article pages (/haber/[slug]) pass through; /kategori/[slug] rewrites to city-site.
 */
const CITY_REDIRECT_TO_HOME = new Set([
  '/discover',
  '/cok-okunanlar',
  '/reels',
  '/skor',
  '/futbol-canli',
  '/influencer',
  '/kategori',
])

function isCityRedirectPath(pathname: string): boolean {
  return CITY_REDIRECT_TO_HOME.has(pathname)
}

function detectCountry(request: NextRequest): string {
  const fromHeader =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    request.headers.get('x-country-code') ||
    request.headers.get('x-geo-country') ||
    ''
  return fromHeader.trim().toUpperCase()
}

interface TenantInfo { slug: string; provinceSlug: string }

/**
 * Build a city-site rewrite response with tenant headers, cookies, and geo.
 */
function buildCityRewrite(
  request: NextRequest,
  targetPath: string,
  tenant: TenantInfo
): NextResponse {
  const rewriteUrl = request.nextUrl.clone()
  rewriteUrl.pathname = targetPath

  const country = detectCountry(request)
  const existingLang = request.cookies.get(LANGUAGE_COOKIE)?.value
  const existingCountry = request.cookies.get(COUNTRY_COOKIE)?.value

  const rewriteHeaders = new Headers(request.headers)
  rewriteHeaders.set(TENANT_HEADER, tenant.slug)
  rewriteHeaders.set(TENANT_PROVINCE_HEADER, tenant.provinceSlug)

  const existingCookieStr = rewriteHeaders.get('Cookie') || ''
  const tenantCookies = `${TENANT_COOKIE}=${tenant.slug}; ${TENANT_PROVINCE_COOKIE}=${tenant.provinceSlug}`
  rewriteHeaders.set(
    'Cookie',
    existingCookieStr ? `${existingCookieStr}; ${tenantCookies}` : tenantCookies
  )

  if (country && existingCountry !== country) {
    rewriteHeaders.set(COUNTRY_COOKIE, country)
  }
  if (!isLanguage(existingLang) && country) {
    rewriteHeaders.set(LANGUAGE_COOKIE, resolveDefaultLanguage(country))
  }

  const response = NextResponse.rewrite(rewriteUrl, {
    request: { headers: rewriteHeaders },
  })

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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

  if (request.nextUrl.searchParams.get('debugmw') === '1') {
    return NextResponse.json({
      host: request.headers.get('host'),
      pathname,
      CITY_NETWORK_ENABLED: process.env.CITY_NETWORK_ENABLED ?? '(not set)',
      tenant: tenant ? { slug: tenant.slug, provinceSlug: tenant.provinceSlug } : null,
    })
  }

  if (tenant) {
    // Normalise trailing slash
    const cleanPath = pathname.endsWith('/') && pathname !== '/'
      ? pathname.slice(0, -1)
      : pathname

    // National-only paths on city subdomain → redirect to city home
    if (isCityRedirectPath(cleanPath)) {
      const homeUrl = request.nextUrl.clone()
      homeUrl.pathname = '/'
      return NextResponse.redirect(homeUrl, 302)
    }

    // District sub-route: /ilceler/gelibolu → /city-site/ilceler/gelibolu
    const districtMatch = cleanPath.match(/^\/ilceler\/([a-z0-9-]+)$/)
    if (districtMatch) {
      return buildCityRewrite(request, `/city-site/ilceler/${districtMatch[1]}`, tenant)
    }

    // Duty pharmacies by district: /nobetci-eczaneler/biga
    const pharmacyDistrictMatch = cleanPath.match(/^\/nobetci-eczaneler\/([a-z0-9-]+)$/)
    if (pharmacyDistrictMatch) {
      return buildCityRewrite(
        request,
        `/city-site/nobetci-eczaneler/${pharmacyDistrictMatch[1]}`,
        tenant
      )
    }

    // Job classified forms: /is-ilanlari/eleman-ariyorum | is-ariyorum
    const jobsFormMatch = cleanPath.match(/^\/is-ilanlari\/(eleman-ariyorum|is-ariyorum)$/)
    if (jobsFormMatch) {
      return buildCityRewrite(request, `/city-site/is-ilanlari/${jobsFormMatch[1]}`, tenant)
    }

    // Category page: /kategori/siyaset → /city-site/kategori/siyaset (city-scoped family)
    const categoryMatch = cleanPath.match(/^\/kategori\/([a-z0-9-]+)$/)
    if (categoryMatch) {
      return buildCityRewrite(request, `/city-site/kategori/${categoryMatch[1]}`, tenant)
    }

    // Direct path rewrites (/, /feed, /etkinlik, /spor, /ilceler, /yerel)
    const rewriteTarget = CITY_PATH_REWRITES[cleanPath]
    if (rewriteTarget) {
      return buildCityRewrite(request, rewriteTarget, tenant)
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
