import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export type HostLookup = (hostname: string) => Promise<string[]>

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
  'kubernetes.default',
  'kubernetes.default.svc',
])

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (BLOCKED_HOSTS.has(host)) return true
  if (host.endsWith('.localhost')) return true
  if (host.endsWith('.internal')) return true
  if (host.endsWith('.local')) return true
  return false
}

export function isPrivateOrReservedIp(ip: string): boolean {
  if (ip.includes('%')) ip = ip.split('%')[0]
  const version = isIP(ip)
  if (version === 4) return isPrivateV4(ip)
  if (version === 6) return isPrivateV6(ip)
  return true
}

function isPrivateV4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10))
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return true
  }
  const [a, b] = parts
  if (a === 0) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 192 && b === 0 && parts[2] === 2) return true
  if (a >= 224) return true
  return false
}

function isPrivateV6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fe80:') || normalized.startsWith('fe80::')) return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (normalized.startsWith('ff')) return true
  if (normalized.startsWith('::ffff:')) {
    const v4 = normalized.slice('::ffff:'.length)
    if (isIP(v4) === 4) return isPrivateV4(v4)
  }
  return false
}

export class UnsafeUrlError extends Error {
  readonly code = 'SSRF_BLOCKED'
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

export async function defaultLookup(hostname: string): Promise<string[]> {
  const result = await dnsLookup(hostname, { all: true, verbatim: true })
  return result.map((row) => row.address)
}

/**
 * SSRF guard: http(s) only, block localhost / private ranges / cloud metadata.
 * Caller must re-run after every redirect hop.
 */
export async function assertSafeUrl(
  raw: string,
  lookup: HostLookup = defaultLookup
): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new UnsafeUrlError('invalid_url')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UnsafeUrlError('scheme_not_allowed')
  }
  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError('userinfo_not_allowed')
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (!hostname || isBlockedHostname(hostname)) {
    throw new UnsafeUrlError('host_blocked')
  }

  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) throw new UnsafeUrlError('private_ip')
    return parsed
  }

  let addresses: string[]
  try {
    addresses = await lookup(hostname)
  } catch {
    throw new UnsafeUrlError('dns_failed')
  }
  if (!addresses.length) throw new UnsafeUrlError('dns_empty')
  for (const address of addresses) {
    if (isPrivateOrReservedIp(address)) throw new UnsafeUrlError('private_ip')
  }
  return parsed
}
