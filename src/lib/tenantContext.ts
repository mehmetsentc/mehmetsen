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
    // 1. x-headers (set by middleware via NextResponse.rewrite request headers)
    const h = await headers()
    const slug = h.get(TENANT_HEADER)
    const province = h.get(TENANT_PROVINCE_HEADER)
    if (slug && province) return { slug, provinceSlug: province }

    // 2. Cookie fallback — middleware also bakes tenant into the Cookie header so
    // server components can resolve the tenant reliably even when x-header
    // forwarding is dropped on the Next.js 15 edge→serverless boundary.
    const c = await cookies()
    const cookieSlug = c.get(TENANT_COOKIE)?.value
    const cookieProvince = c.get(TENANT_PROVINCE_COOKIE)?.value
    if (cookieSlug && cookieProvince) return { slug: cookieSlug, provinceSlug: cookieProvince }
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
