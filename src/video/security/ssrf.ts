import { isIP } from 'node:net'
import { lookup as dnsLookup } from 'node:dns/promises'

export type DnsLookup = (hostname: string) => Promise<{ address: string; family: number }>

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
  'kubernetes.default.svc',
])

export class UnsafeDownloadUrlError extends Error {
  readonly code: string
  constructor(code: string, message = code) {
    super(message)
    this.name = 'UnsafeDownloadUrlError'
    this.code = code
  }
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const v = ip.trim().toLowerCase()
  if (!v) return true
  if (v === '::1' || v === '0:0:0:0:0:0:0:1') return true
  if (v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')) return true
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  const ipv4 = mapped?.[1] ?? (isIP(v) === 4 ? v : null)
  if (!ipv4) {
    if (isIP(v) === 6) return v === '::' || v.startsWith('::1')
    return true
  }
  const parts = ipv4.split('.').map((n) => Number(n))
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  return false
}

export function parseDownloadUrl(raw: string): URL {
  const trimmed = raw.trim()
  if (!trimmed) throw new UnsafeDownloadUrlError('INVALID_URL')
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new UnsafeDownloadUrlError('INVALID_URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UnsafeDownloadUrlError('INVALID_PROTOCOL')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new UnsafeDownloadUrlError('BLOCKED_HOST')
  }
  if (isIP(host) && isPrivateOrReservedIp(host)) {
    throw new UnsafeDownloadUrlError('PRIVATE_IP')
  }
  return url
}

export async function assertPublicDownloadUrl(
  raw: string,
  lookup: DnsLookup = (hostname) => dnsLookup(hostname)
): Promise<URL> {
  const url = parseDownloadUrl(raw)
  if (isIP(url.hostname.replace(/^\[|\]$/g, ''))) return url
  try {
    const resolved = await lookup(url.hostname)
    if (isPrivateOrReservedIp(resolved.address)) {
      throw new UnsafeDownloadUrlError('PRIVATE_IP')
    }
  } catch (err) {
    if (err instanceof UnsafeDownloadUrlError) throw err
    throw new UnsafeDownloadUrlError('DNS_FAILED')
  }
  return url
}
