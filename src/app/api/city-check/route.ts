/**
 * Diagnostic endpoint — safe to keep in prod, no secrets exposed.
 * Tells us whether CITY_NETWORK_ENABLED is set and what subdomain the
 * edge sees. Useful when the Vercel dashboard is inaccessible.
 *
 * Usage: GET canakkale.nahaber.com/api/city-check
 * (API routes are excluded from middleware rewrites so this always runs
 * server-side without tenant magic.)
 */
import { type NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const cityEnabled = process.env.CITY_NETWORK_ENABLED ?? '(not set)'
  const subdomainMatch = host.replace(/:.*/, '').match(/^([a-z0-9-]+)\.nahaber\.com$/)
  const subdomain = subdomainMatch && subdomainMatch[1] !== 'www' ? subdomainMatch[1] : null

  return NextResponse.json({
    host,
    CITY_NETWORK_ENABLED: cityEnabled,
    subdomain,
    tenantWouldResolve: cityEnabled === 'true' && subdomain !== null,
  })
}
