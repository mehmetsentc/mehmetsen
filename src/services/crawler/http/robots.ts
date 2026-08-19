import { hostnameOf } from '../url/normalize'
import { fetchDocument, type FetchImpl } from './fetchDocument'
import type { HostLookup } from '../url/ssrf'

interface RobotsRules {
  allow: string[]
  disallow: string[]
}

const cache = new Map<string, { fetchedAt: number; rules: RobotsRules }>()
const CACHE_MS = 6 * 60 * 60 * 1000

function parseRobots(text: string): RobotsRules {
  const lines = text.split(/\r?\n/)
  const groups: Array<{ agents: string[]; allow: string[]; disallow: string[] }> = []
  let current: { agents: string[]; allow: string[]; disallow: string[] } | null = null

  const flush = () => {
    if (current) groups.push(current)
    current = null
  }

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    if (key === 'user-agent') {
      if (!current || current.allow.length || current.disallow.length) {
        flush()
        current = { agents: [value.toLowerCase()], allow: [], disallow: [] }
      } else {
        current.agents.push(value.toLowerCase())
      }
      continue
    }
    if (!current) continue
    if (key === 'disallow') current.disallow.push(value)
    if (key === 'allow') current.allow.push(value)
  }
  flush()

  const matching =
    groups.find((g) => g.agents.some((a) => a === 'nahaberbot' || a === 'nahaber')) ||
    groups.find((g) => g.agents.includes('*')) ||
    { allow: [], disallow: [] }

  return { allow: matching.allow, disallow: matching.disallow }
}

function pathMatches(pathname: string, pattern: string): boolean {
  if (!pattern) return false
  if (pattern === '/') return true
  return pathname.startsWith(pattern)
}

export function isPathAllowed(pathname: string, rules: RobotsRules): boolean {
  let allowed = true
  let best = 0
  for (const rule of rules.disallow) {
    if (pathMatches(pathname, rule) && rule.length >= best) {
      allowed = false
      best = rule.length
    }
  }
  for (const rule of rules.allow) {
    if (pathMatches(pathname, rule) && rule.length >= best) {
      allowed = true
      best = rule.length
    }
  }
  return allowed
}

export async function canFetchUrl(opts: {
  url: string
  fetchImpl?: FetchImpl
  lookup?: HostLookup
  policy: 'FOLLOW' | 'STRICT' | 'IGNORE'
  sourceId?: string
}): Promise<boolean> {
  if (opts.policy === 'IGNORE') return true
  const host = hostnameOf(opts.url)
  if (!host) return false
  const origin = new URL(opts.url).origin
  const robotsUrl = `${origin}/robots.txt`
  const now = Date.now()
  let entry = cache.get(host)
  if (!entry || now - entry.fetchedAt > CACHE_MS) {
    const res = await fetchDocument({
      url: robotsUrl,
      fetchImpl: opts.fetchImpl,
      lookup: opts.lookup,
      sourceId: opts.sourceId,
      timeoutMs: 8_000,
      maxBytes: 200_000,
    })
    const rules =
      res.ok && res.status === 200 ? parseRobots(res.body) : { allow: [], disallow: [] }
    entry = { fetchedAt: now, rules }
    cache.set(host, entry)
  }
  const pathname = new URL(opts.url).pathname
  return isPathAllowed(pathname, entry.rules)
}

export function resetRobotsCacheForTests(): void {
  cache.clear()
}

export { parseRobots }
