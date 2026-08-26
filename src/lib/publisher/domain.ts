/** Normalize URL or host → bare domain (example.com). Strips www only — subdomains preserved. */
export function normalizeDomain(input: string): string {
  const raw = input.trim().toLowerCase()
  if (!raw) return ''

  let host = raw
  if (raw.includes('://') || raw.startsWith('//')) {
    try {
      const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw)
      host = url.hostname.toLowerCase()
    } catch {
      host = raw.replace(/^https?:\/\//, '').split('/')[0] ?? raw
    }
  } else {
    host = raw.split('/')[0] ?? raw
  }

  if (host.startsWith('www.')) host = host.slice(4)
  return host.replace(/\.+$/, '')
}

/** Apex domain (example.com) — used to detect subdomain ambiguity, not for auto-merge. */
export function apexDomain(domain: string): string {
  const normalized = normalizeDomain(domain)
  if (!normalized) return ''
  const parts = normalized.split('.').filter(Boolean)
  if (parts.length <= 2) return normalized
  return parts.slice(-2).join('.')
}

/** True when child is a proper subdomain of parent (news.example.com ⊂ example.com). */
export function isSubdomainOf(child: string, parent: string): boolean {
  const c = normalizeDomain(child)
  const p = normalizeDomain(parent)
  if (!c || !p || c === p) return false
  return c.endsWith(`.${p}`)
}
