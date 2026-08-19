import { createHash } from 'node:crypto'

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_cid',
  'utm_reader',
  'utm_name',
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'si',
  'ncid',
  'ref',
  'ref_src',
  'sref',
  'ocid',
  'gad_source',
  'gad_campaignid',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'wickedid',
  'twclid',
  'ttclid',
  'li_fat_id',
  'yclid',
  'srsltid',
  'spm',
  'scm',
  'from',
  'share',
  'shared',
  'at_campaign',
  'at_medium',
  'at_emailtype',
])

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase()
  if (TRACKING_PARAMS.has(key)) return true
  if (key.startsWith('utm_')) return true
  return false
}

/**
 * Canonicalize an article URL: http(s) only, lowercase host, drop tracking
 * query params, drop hash, drop default ports, drop trailing slash (except root).
 */
export function normalizeArticleUrl(raw: string, baseUrl?: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  parsed.hash = ''
  parsed.hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = ''
  }

  const kept = [...parsed.searchParams.entries()]
    .filter(([key]) => !isTrackingParam(key))
    .sort(([aKey, aVal], [bKey, bVal]) => aKey.localeCompare(bKey) || aVal.localeCompare(bVal))

  parsed.search = ''
  for (const [key, value] of kept) {
    parsed.searchParams.append(key, value)
  }

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1)
  }
  return parsed.toString()
}

export function urlHashFor(normalizedUrl: string): string {
  return sha256Hex(normalizedUrl)
}

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}
