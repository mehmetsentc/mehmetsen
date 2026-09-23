const GENERIC_PATHS = [
  /^\/?$/,
  /^\/tr\/?$/i,
  /^\/turkiye\/?$/i,
  /^\/etkinlik-ara\/?$/i,
  /^\/etkinlik-takvimi\/?$/i,
  /^\/etkinlik-takvimi-[a-z0-9-]+-\d{2}\/?$/i,
  /^\/sehir-etkinlikleri\/?$/i,
  /^\/sehir-etkinlikleri\/[a-z0-9-]+\/?$/i,
  /^\/arama\/?$/i,
  /^\/search\/?$/i,
]

export function isEventSpecificTicketUrl(url: string | null | undefined): boolean {
  const value = url?.trim()
  if (!value) return false
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false

  const path = parsed.pathname.replace(/\/+$/, '') || '/'
  if (GENERIC_PATHS.some((re) => re.test(path))) return false

  const host = parsed.hostname.toLowerCase()
  if (host.endsWith('bubilet.com.tr')) {
    return /\/etkinlik\/[^/]+/i.test(path)
  }
  if (host.endsWith('biletimgo.com')) {
    return /\/etkinlik\/[a-z0-9-]+-\d+$/i.test(path)
  }
  if (host.endsWith('biletix.com') || host.endsWith('ticketmaster.com')) {
    return /\/(performance|etkinlik)\/[A-Za-z0-9]+/i.test(path)
  }
  return path !== '/'
}

/** Event code from /performance/CODE/NNN or /etkinlik/CODE. Null if unparseable. */
export function parseBiletixEventCode(url: string | null | undefined): string | null {
  const perf = parseBiletixPerformanceUrl(url)
  if (perf) return perf.eventCode
  const value = url?.trim() ?? ''
  const eventMatch = value.match(/\/etkinlik\/([A-Za-z0-9]+)/i)
  return eventMatch?.[1] ?? null
}

/**
 * True when stored vs incoming Biletix URLs encode a different event code.
 * Same-code /etkinlik/CODE vs /performance/CODE/NNN is not a destination change.
 * Unparseable mismatched strings are treated as different (never assumed equal).
 */
export function isMaterialBiletixDestinationChange(
  storedUrl: string | null | undefined,
  incomingUrl: string | null | undefined
): boolean {
  const storedCode = parseBiletixEventCode(storedUrl)
  const incomingCode = parseBiletixEventCode(incomingUrl)
  if (storedCode && incomingCode) {
    return storedCode.toUpperCase() !== incomingCode.toUpperCase()
  }
  const stored = storedUrl?.trim() ?? ''
  const incoming = incomingUrl?.trim() ?? ''
  if (stored === incoming) return false
  if (!stored || !incoming) return false
  return true
}

export function parseBiletixPerformanceUrl(url: string | null | undefined): {
  eventCode: string
  performanceIndex: string
} | null {
  const value = url?.trim()
  if (!value) return null
  const match = value.match(/\/performance\/([A-Za-z0-9]+)\/(\d{3})\/TURKIYE\/(?:tr|en)/i)
  if (!match) return null
  return { eventCode: match[1], performanceIndex: match[2] }
}

export function biletixPerformanceUrl(eventCode: string, performanceIndex = '001'): string {
  return `https://www.biletix.com/performance/${eventCode}/${performanceIndex}/TURKIYE/tr`
}

export function biletixEventUrl(eventCode: string): string {
  return `https://www.biletix.com/etkinlik/${eventCode}/TURKIYE/tr`
}

export type BiletixTicketEvidence =
  | 'SITEMAP_UNIQUE_PERFORMANCE'
  | 'EVENT_SPECIFIC_URL'
  | 'UNVERIFIED_001'
  | 'GENERIC_INVALID'
  | 'MISSING'

/** /001 is proven only when the sitemap has exactly one TR loc for that code. */
export function classifyBiletixTicketEvidence(
  url: string | null | undefined,
  sitemapUniqueUrl?: string | null
): BiletixTicketEvidence {
  const value = url?.trim()
  if (!value) return 'MISSING'
  const parsed = parseBiletixPerformanceUrl(value)
  if (parsed) {
    if (sitemapUniqueUrl && parseBiletixPerformanceUrl(sitemapUniqueUrl)?.eventCode === parsed.eventCode) {
      return 'SITEMAP_UNIQUE_PERFORMANCE'
    }
    if (parsed.performanceIndex === '001') return 'UNVERIFIED_001'
    return 'UNVERIFIED_001'
  }
  if (isEventSpecificTicketUrl(value)) return 'EVENT_SPECIFIC_URL'
  return 'GENERIC_INVALID'
}
