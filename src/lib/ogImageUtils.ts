import { isKnownNewsImageHost, NEWS_IMAGE_DOMAIN_SUFFIXES } from '@/constants/imageHosts'

/** Hostnames allowed for /api/og-image article fetches (SSRF guard). */
export function isAllowedOgFetchHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'nahaber.com' || h === 'www.nahaber.com') return true
  if (isKnownNewsImageHost(h)) return true
  return NEWS_IMAGE_DOMAIN_SUFFIXES.some((suffix) => h === suffix || h.endsWith(`.${suffix}`))
}

export function isAllowedOgFetchUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return isAllowedOgFetchHost(parsed.hostname)
  } catch {
    return false
  }
}
