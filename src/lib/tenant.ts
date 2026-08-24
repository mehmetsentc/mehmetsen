/**
 * City Network tenant resolution.
 *
 * Resolves the current city tenant from hostname (subdomain) or query param.
 * Gated behind CITY_NETWORK_ENABLED — returns null when the flag is off.
 */

import type { NextRequest } from 'next/server'

export interface CityTenant {
  slug: string
  displayName: string
  provinceSlug: string
  domain: string
}

const CANAKKALE_TENANT: CityTenant = {
  slug: 'canakkale',
  displayName: 'Çanakkale',
  provinceSlug: 'canakkale',
  domain: 'canakkale.nahaber.com',
}

const ANTALYA_TENANT: CityTenant = {
  slug: 'antalya',
  displayName: 'Antalya',
  provinceSlug: 'antalya',
  domain: 'antalya.nahaber.com',
}

const HARDCODED_TENANTS: Record<string, CityTenant> = {
  canakkale: CANAKKALE_TENANT,
  antalya: ANTALYA_TENANT,
}

/** Edge-safe / test helper — hardcoded city tenants only (no DB). */
export function getHardcodedTenant(slug: string): CityTenant | null {
  return HARDCODED_TENANTS[slug] ?? null
}

const NATIONAL_HOSTS = new Set([
  'nahaber.com',
  'www.nahaber.com',
  'localhost',
  '127.0.0.1',
])

/**
 * Extract the city subdomain from a hostname.
 * Returns null for national hosts or non-matching patterns.
 *
 * Examples:
 *   canakkale.nahaber.com  → "canakkale"
 *   antalya.nahaber.com    → "antalya"
 *   canakkale.localhost    → "canakkale"
 *   www.nahaber.com        → null
 *   localhost              → null
 */
function extractCitySubdomain(hostname: string): string | null {
  const host = hostname.split(':')[0].toLowerCase()

  if (NATIONAL_HOSTS.has(host)) return null

  // canakkale.localhost → canakkale
  const localhostMatch = host.match(/^([a-z0-9-]+)\.localhost$/)
  if (localhostMatch) return localhostMatch[1]

  // canakkale.nahaber.com → canakkale
  const prodMatch = host.match(/^([a-z0-9-]+)\.nahaber\.com$/)
  if (prodMatch && prodMatch[1] !== 'www') return prodMatch[1]

  return null
}

/**
 * Resolve tenant from Postgres city_sites table.
 * Falls back to hardcoded config if DATABASE_URL is unavailable.
 */
async function resolveTenantFromDb(slug: string): Promise<CityTenant | null> {
  try {
    if (!process.env.DATABASE_URL) return null

    const { getDb, schema } = await import('@/db')
    const { eq, and } = await import('drizzle-orm')
    const db = getDb()

    const [row] = await db
      .select({
        slug: schema.citySites.slug,
        displayName: schema.citySites.displayName,
        domain: schema.citySites.domain,
        provinceSlug: schema.citySites.provinceSlug,
        isActive: schema.citySites.isActive,
      })
      .from(schema.citySites)
      .where(and(eq(schema.citySites.slug, slug), eq(schema.citySites.isActive, true)))
      .limit(1)

    if (!row || !row.provinceSlug) return null

    return {
      slug: row.slug,
      displayName: row.displayName,
      provinceSlug: row.provinceSlug,
      domain: row.domain,
    }
  } catch (err) {
    console.warn('[tenant] DB lookup failed, falling back to config:', err)
    return null
  }
}

/**
 * Resolve a CityTenant from a slug.
 * Priority: Postgres (if DATABASE_URL set) → hardcoded fallback.
 */
export async function resolveTenant(slug: string): Promise<CityTenant | null> {
  const dbTenant = await resolveTenantFromDb(slug)
  if (dbTenant) return dbTenant

  return getHardcodedTenant(slug)
}

/**
 * Edge-safe tenant resolve for middleware — hardcoded map only.
 * Never import drizzle/DB on the Edge runtime (crashes the whole middleware).
 */
function resolveTenantEdgeSafe(slug: string): CityTenant | null {
  return getHardcodedTenant(slug)
}

/**
 * Resolve city tenant from an incoming request.
 * Checks subdomain first, then ?tenant= query param (dev fallback).
 * Middleware must stay edge-safe (no DB); server components use resolveTenant().
 */
export async function resolveTenantFromRequest(
  request: NextRequest
): Promise<CityTenant | null> {
  const hostname = request.headers.get('host') ?? ''

  // 1. Subdomain detection
  const subdomain = extractCitySubdomain(hostname)
  if (subdomain) {
    return resolveTenantEdgeSafe(subdomain)
  }

  // 2. Dev fallback: ?tenant=canakkale
  const tenantParam = request.nextUrl.searchParams.get('tenant')
  if (tenantParam) {
    return resolveTenantEdgeSafe(tenantParam.toLowerCase())
  }

  return null
}

/** Tenant header/cookie name constants */
export const TENANT_HEADER = 'x-nahaber-tenant'
export const TENANT_PROVINCE_HEADER = 'x-nahaber-province'
export const TENANT_COOKIE = 'nahaber_tenant'
export const TENANT_PROVINCE_COOKIE = 'nahaber_province'
