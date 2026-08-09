const NATIONAL_HOSTS = new Set([
  'nahaber.com',
  'www.nahaber.com',
  'localhost',
  '127.0.0.1',
])

/**
 * Resolve city tenant slug from Host / x-forwarded-host.
 * Returns null on the national site or when the host is not a city subdomain.
 */
export function getCitySlugFromHost(host: string): string | null {
  const clean = host.split(':')[0].toLowerCase()
  if (NATIONAL_HOSTS.has(clean)) return null

  const prodMatch = clean.match(/^([a-z0-9-]+)\.nahaber\.com$/)
  if (prodMatch && prodMatch[1] !== 'www') return prodMatch[1]

  const localMatch = clean.match(/^([a-z0-9-]+)\.localhost$/)
  if (localMatch) return localMatch[1]

  return null
}

export async function getCitySlugFromHeaders(): Promise<string | null> {
  const { headers } = await import('next/headers')
  const h = await headers()
  return getCitySlugFromHost(h.get('x-forwarded-host') || h.get('host') || '')
}
