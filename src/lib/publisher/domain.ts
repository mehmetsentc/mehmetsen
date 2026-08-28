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

/** Extract normalized domain from an email string. Returns null for invalid email syntax. */
export function extractEmailDomain(email: string): string | null {
  const raw = email.trim().toLowerCase()
  const parts = raw.split('@')
  if (parts.length !== 2) return null
  const local = parts[0]
  const domainPart = parts[1]
  if (!local || !domainPart || domainPart.includes('@')) return null
  const normalized = normalizeDomain(domainPart)
  return normalized || null
}

export type DomainMatchType = 'EXACT' | 'SUBDOMAIN' | 'MISMATCH' | 'INVALID'

export interface DomainMatchResult {
  matches: boolean
  matchType: DomainMatchType
  candidateDomain: string
  primaryDomain: string
  isLegitimateMatch: boolean
  isSpoofAttempt: boolean
  reason: string
}

/**
 * Validates domain matching evidence for publisher claims against primary publisher domain.
 * - EXACT: Candidate domain or email domain strictly matches publisher primary domain.
 * - SUBDOMAIN: Candidate is a legitimate subdomain of publisher primary domain (e.g. `news.theguardian.com`).
 * - MISMATCH: Candidate does not match, with explicit spoof detection for lookalike/subdomain appendages
 *   (e.g. `theguardian.com.attacker.tld`, `theguardian-com.example`, `fake-theguardian.com`, `user@theguardian.com.evil.co`).
 *
 * NOTE: Domain matching is evidence ONLY, never automatic approval.
 */
export function matchClaimDomain(
  candidateDomainOrEmail: string,
  publisherPrimaryDomain: string | null | undefined
): DomainMatchResult {
  const normalizedPrimary = publisherPrimaryDomain ? normalizeDomain(publisherPrimaryDomain) : ''
  if (!candidateDomainOrEmail || !candidateDomainOrEmail.trim()) {
    return {
      matches: false,
      matchType: 'INVALID',
      candidateDomain: '',
      primaryDomain: normalizedPrimary,
      isLegitimateMatch: false,
      isSpoofAttempt: false,
      reason: 'Empty candidate domain or email',
    }
  }

  const rawCandidate = candidateDomainOrEmail.trim().toLowerCase()
  let candidateDomain = ''
  if (rawCandidate.includes('@')) {
    const extracted = extractEmailDomain(rawCandidate)
    if (!extracted) {
      return {
        matches: false,
        matchType: 'INVALID',
        candidateDomain: rawCandidate,
        primaryDomain: normalizedPrimary,
        isLegitimateMatch: false,
        isSpoofAttempt: false,
        reason: 'Invalid email format',
      }
    }
    candidateDomain = extracted
  } else {
    candidateDomain = normalizeDomain(rawCandidate)
  }

  if (!candidateDomain) {
    return {
      matches: false,
      matchType: 'INVALID',
      candidateDomain: '',
      primaryDomain: normalizedPrimary,
      isLegitimateMatch: false,
      isSpoofAttempt: false,
      reason: 'Invalid domain syntax',
    }
  }

  if (!normalizedPrimary) {
    return {
      matches: false,
      matchType: 'MISMATCH',
      candidateDomain,
      primaryDomain: '',
      isLegitimateMatch: false,
      isSpoofAttempt: false,
      reason: 'Publisher has no registered primary domain',
    }
  }

  // Exact match
  if (candidateDomain === normalizedPrimary) {
    return {
      matches: true,
      matchType: 'EXACT',
      candidateDomain,
      primaryDomain: normalizedPrimary,
      isLegitimateMatch: true,
      isSpoofAttempt: false,
      reason: 'Exact primary domain match',
    }
  }

  // Legitimate child subdomain (e.g. uk.theguardian.com ⊂ theguardian.com)
  if (isSubdomainOf(candidateDomain, normalizedPrimary)) {
    return {
      matches: true,
      matchType: 'SUBDOMAIN',
      candidateDomain,
      primaryDomain: normalizedPrimary,
      isLegitimateMatch: true,
      isSpoofAttempt: false,
      reason: 'Legitimate subdomain of primary domain',
    }
  }

  // Check for spoofing / lookalike domain attempts:
  // e.g. theguardian.com.attacker.tld, theguardian.com.evil.co, fake-theguardian.com, theguardian-com.example
  const isSpoof =
    candidateDomain.includes(`.${normalizedPrimary}.`) ||
    candidateDomain.endsWith(`.${normalizedPrimary}`) === false && candidateDomain.includes(normalizedPrimary) ||
    candidateDomain.includes(normalizedPrimary.replace(/\./g, '-')) ||
    candidateDomain.includes(normalizedPrimary.replace(/\./g, ''))

  return {
    matches: false,
    matchType: 'MISMATCH',
    candidateDomain,
    primaryDomain: normalizedPrimary,
    isLegitimateMatch: false,
    isSpoofAttempt: isSpoof,
    reason: isSpoof
      ? 'Spoofing / lookalike domain detected — candidate is not an authorized domain'
      : 'Candidate domain does not match publisher primary domain',
  }
}

/** Check if domain or email is a legitimate exact match or legitimate subdomain. Evidence helper. */
export function isLegitimateDomainMatch(
  candidateDomainOrEmail: string,
  publisherPrimaryDomain: string | null | undefined
): boolean {
  return matchClaimDomain(candidateDomainOrEmail, publisherPrimaryDomain).isLegitimateMatch
}

