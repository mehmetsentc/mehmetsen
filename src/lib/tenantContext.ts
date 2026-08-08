/**
 * Server-side tenant helpers for reading the resolved city tenant
 * from request headers (set by middleware).
 */

import { headers, cookies } from 'next/headers'
import { TENANT_HEADER, TENANT_PROVINCE_HEADER, TENANT_COOKIE } from './tenant'

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
    const slug = h.get(TENANT_HEADER)
    const province = h.get(TENANT_PROVINCE_HEADER)
    if (slug && province) {
      return { slug, provinceSlug: province }
    }
  } catch {
    // headers() fails in static generation — expected
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
