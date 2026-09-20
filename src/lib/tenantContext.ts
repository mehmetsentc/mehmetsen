/**
 * Server-side tenant helpers for reading the resolved city tenant
 * from request headers (set by middleware).
 */

import { headers, cookies } from 'next/headers'
import { TENANT_HEADER, TENANT_PROVINCE_HEADER, TENANT_COOKIE, TENANT_PROVINCE_COOKIE } from './tenant'

export interface ActiveTenant {
  slug: string
  provinceSlug: string
}

/**
 * Read the active city tenant from request headers (server components).
 * Returns null when running on the national site or when city network is off.
 */
export async function getActiveTenant(): Promise<ActiveTenant | null> {
  try {
    const h = await headers()

    // 1. x-headers (set by middleware via NextResponse.rewrite request headers)
    const slug = h.get(TENANT_HEADER)
    const province = h.get(TENANT_PROVINCE_HEADER)
    if (slug && province) return { slug, provinceSlug: province }

    // 2. Dev query — check every URL-like header. An empty next-url (`/`)
    // must not hide `?tenant=` on the referer or invoke query.
    const { getHardcodedTenant } = await import('./tenant')
    const urlCandidates = [
      h.get('next-url'),
      h.get('x-url'),
      h.get('referer'),
      h.get('x-invoke-query') ? `/?${decodeURIComponent(h.get('x-invoke-query') || '')}` : null,
    ]
    for (const rawUrl of urlCandidates) {
      if (!rawUrl) continue
      try {
        const queryTenant = rawUrl.includes('=') && !rawUrl.includes('://') && !rawUrl.startsWith('/')
          ? new URLSearchParams(rawUrl).get('tenant')
          : new URL(rawUrl, 'http://localhost').searchParams.get('tenant')
        if (queryTenant) {
          const fromQuery = getHardcodedTenant(queryTenant.toLowerCase())
          if (fromQuery) return { slug: fromQuery.slug, provinceSlug: fromQuery.provinceSlug }
        }
      } catch {
        /* ignore invalid url */
      }
    }

    // 3. Cookie fallback — middleware bakes tenant into Cookie header so
    // server components can resolve the tenant reliably even when x-header
    // forwarding is dropped on the Next.js 15 edge→serverless boundary.
    const c = await cookies()
    const cookieSlug = c.get(TENANT_COOKIE)?.value
    const cookieProvince = c.get(TENANT_PROVINCE_COOKIE)?.value
    if (cookieSlug) {
      const fromCookie = getHardcodedTenant(cookieSlug.toLowerCase())
      if (fromCookie) return { slug: fromCookie.slug, provinceSlug: fromCookie.provinceSlug }
      if (cookieProvince) return { slug: cookieSlug, provinceSlug: cookieProvince }
    }

    // 4. Direct host detection — middleware-independent fallback.
    // If middleware didn't run (e.g. build mismatch, edge config issue),
    // we can still detect the city subdomain from the Host header.
    // Prefer x-forwarded-host (Vercel proxy) over host (may be internal).
    const host = ((h.get('x-forwarded-host') || h.get('host')) ?? '').replace(/:.*/, '').toLowerCase()
    const prodMatch = host.match(/^([a-z0-9-]+)\.nahaber\.com$/)
    const localhostMatch = host.match(/^([a-z0-9-]+)\.localhost$/)
    const subdomainSlug = (prodMatch?.[1] !== 'www' && prodMatch?.[1]) ||
                          localhostMatch?.[1] || null
    if (subdomainSlug) {
      const { resolveTenant } = await import('./tenant')
      const tenant = await resolveTenant(subdomainSlug)
      if (tenant) return { slug: tenant.slug, provinceSlug: tenant.provinceSlug }
    }
  } catch {
    // headers()/cookies() fail in static generation — expected
  }
  return null
}

/**
 * Read tenant slug from cookie (client-side fallback / static pages).
 */
export async function getTenantFromCookie(): Promise<string | null> {
  try {
    const c = await cookies()
    return c.get(TENANT_COOKIE)?.value ?? null
  } catch {
    return null
  }
}
