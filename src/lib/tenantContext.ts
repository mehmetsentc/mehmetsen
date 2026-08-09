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
  if (process.env.CITY_NETWORK_ENABLED !== 'true') return null

  try {
    const h = await headers()

    // 1. x-headers (set by middleware via NextResponse.rewrite request headers)
    const slug = h.get(TENANT_HEADER)
    const province = h.get(TENANT_PROVINCE_HEADER)
    if (slug && province) return { slug, provinceSlug: province }

    // 2. Cookie fallback — middleware bakes tenant into Cookie header so
    // server components can resolve the tenant reliably even when x-header
    // forwarding is dropped on the Next.js 15 edge→serverless boundary.
    const c = await cookies()
    const cookieSlug = c.get(TENANT_COOKIE)?.value
    const cookieProvince = c.get(TENANT_PROVINCE_COOKIE)?.value
    if (cookieSlug && cookieProvince) return { slug: cookieSlug, provinceSlug: cookieProvince }

    // 3. Direct host detection — middleware-independent fallback.
    // If middleware didn't run (e.g. build mismatch, edge config issue),
    // we can still detect the city subdomain from the Host header.
    const host = (h.get('host') ?? '').replace(/:.*/, '').toLowerCase()
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
