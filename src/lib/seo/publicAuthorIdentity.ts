import { TURKISH_PROVINCES } from '@/constants/cities'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { PROVINCE_DISTRICTS } from '@/constants/turkishDistricts'
import { isGenericEditorName, isSourceLikeName } from '@/lib/feed/resolveFeedEditorByline'

const AI_PREFIX = 'ai_editor_'

export type PublicAuthorType = 'Person' | 'Organization'

export interface PublicAuthorInput {
  authorDisplayName?: string | null
  authorUsername?: string | null
  authorId?: string | null
  aiEditorId?: string | null
  authorIsAI?: boolean | null
  /** Ignored. Publish-gate authority is not content authorship. */
  publicationAuthority?: string | null
  source?: string | null
}

export interface PublicAuthorIdentity {
  type: PublicAuthorType
  name: string
  profileSlug: string | null
  aiDisclosure: boolean
}

function siteName(): string {
  return process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
}

export function stripAiEditorPrefix(slug: string): string {
  return slug.startsWith(AI_PREFIX) ? slug.slice(AI_PREFIX.length) : slug
}

function isMachineDeskSlug(slug: string): boolean {
  return /^(?:ulke|il|ilce|yerel)-/.test(slug)
}

function isLinkableSlug(slug: string): boolean {
  if (!slug || slug.startsWith(AI_PREFIX)) return false
  return /^[a-z0-9._-]{2,40}$/i.test(slug)
}

function titleToken(token: string): string {
  const clean = token.replace(/-/g, ' ').trim()
  if (!clean) return clean
  return clean.charAt(0).toLocaleUpperCase('tr-TR') + clean.slice(1)
}

function provinceName(slug: string): string {
  return TURKISH_PROVINCES.find((p) => p.slug === slug)?.name ?? titleToken(slug)
}

function districtName(provinceSlug: string, districtSlug: string): string {
  const list = PROVINCE_DISTRICTS[provinceSlug]
  return list?.find((d) => d.slug === districtSlug)?.name ?? titleToken(districtSlug)
}

function categoryLabel(token: string): string | null {
  if (!token) return null
  return DEFAULT_CATEGORIES.find((c) => c.id === token)?.name ?? null
}

/** Stable organization name for an existing desk slug. Not a person's name. */
export function aiDeskPublicName(slug: string, brand = siteName()): string {
  const s = stripAiEditorPrefix(slug.trim().toLowerCase())
  if (s.startsWith('ulke-')) {
    const bits = s.slice('ulke-'.length).split('-').filter(Boolean)
    const last = bits[bits.length - 1] ?? ''
    const cat = bits.length > 1 ? categoryLabel(last) : null
    const countryBits = cat ? bits.slice(0, -1) : bits
    const country = titleToken(countryBits.join(' '))
    return cat ? `${brand} ${country} ${cat} Masası` : `${brand} ${country} Masası`
  }
  if (s.startsWith('ilce-')) {
    const bits = s.slice('ilce-'.length).split('-').filter(Boolean)
    const city = bits[0] ?? ''
    const rest = bits.slice(1)
    const last = rest[rest.length - 1] ?? ''
    const cat = rest.length > 1 ? categoryLabel(last) : null
    const districtSlug = (cat ? rest.slice(0, -1) : rest).join('-')
    const place = `${provinceName(city)} ${districtName(city, districtSlug)}`.trim()
    return cat ? `${brand} ${place} ${cat} Masası` : `${brand} ${place} Masası`
  }
  if (s.startsWith('il-')) {
    const bits = s.slice('il-'.length).split('-').filter(Boolean)
    const city = bits[0] ?? ''
    const rest = bits.slice(1)
    const last = rest[rest.length - 1] ?? ''
    const cat = categoryLabel(last)
    const desk = cat ?? (rest.length ? titleToken(rest.join(' ')) : '')
    const cityLabel = provinceName(city)
    return desk ? `${brand} ${cityLabel} ${desk} Masası` : `${brand} ${cityLabel} Masası`
  }
  if (s.startsWith('yerel-')) {
    return `${brand} ${provinceName(s.slice('yerel-'.length))} Masası`
  }
  return `${brand} AI Editörlüğü`
}

function aiAssignment(input: PublicAuthorInput): boolean {
  if (input.aiEditorId?.trim()) return true
  if (input.authorIsAI === true) return true
  const id = input.authorId?.trim() ?? ''
  const username = input.authorUsername?.trim() ?? ''
  if (id.startsWith(AI_PREFIX) || username.startsWith(AI_PREFIX)) return true
  return isMachineDeskSlug(stripAiEditorPrefix(username))
}

function deskProfileSlug(input: PublicAuthorInput): string | null {
  const username = stripAiEditorPrefix((input.authorUsername ?? '').trim().toLowerCase())
  const fromId = stripAiEditorPrefix((input.authorId ?? '').trim().toLowerCase())
  for (const candidate of [username, fromId]) {
    if (!isLinkableSlug(candidate) || candidate === 'mehmetsentc' || candidate === 'nahaber') continue
    if (isMachineDeskSlug(candidate)) return candidate
  }
  const authorId = (input.authorId ?? '').trim()
  if (
    isLinkableSlug(username) &&
    username !== 'mehmetsentc' &&
    username !== 'nahaber' &&
    authorId.startsWith(AI_PREFIX)
  ) {
    return username
  }
  // Feed rows often store only authorId (`ai_editor_{slug}`) and not authorUsername.
  // Use that slug when no public username is present. A stored mehmetsentc username
  // stays excluded above so this does not attach a different profile.
  if (
    !isLinkableSlug(username) &&
    isLinkableSlug(fromId) &&
    fromId !== 'mehmetsentc' &&
    fromId !== 'nahaber' &&
    authorId.startsWith(AI_PREFIX)
  ) {
    return fromId
  }
  return null
}

/** Feed card name and profile slug. Same entity as the article byline and JSON-LD. */
export function publicFeedAuthor(input: PublicAuthorInput): { name: string; slug: string | null } {
  const identity = resolvePublicAuthorIdentity(input)
  return { name: identity.name, slug: identity.profileSlug }
}

/**
 * One public author entity for the visible byline, the author link,
 * NewsArticle JSON-LD, and the author profile.
 * Publication authority is not read.
 */
export function resolvePublicAuthorIdentity(input: PublicAuthorInput): PublicAuthorIdentity {
  const brand = siteName()
  if (aiAssignment(input)) {
    const profileSlug = deskProfileSlug(input)
    return {
      type: 'Organization',
      name: profileSlug ? aiDeskPublicName(profileSlug, brand) : `${brand} AI Editörlüğü`,
      profileSlug,
      aiDisclosure: true,
    }
  }

  const display = input.authorDisplayName?.trim() || ''
  const username = (input.authorUsername ?? '').trim()
  const realPerson =
    Boolean(display) &&
    !isGenericEditorName(display) &&
    !isSourceLikeName(display, input.source) &&
    display.toLocaleLowerCase('tr-TR') !== brand.toLocaleLowerCase('tr-TR')

  if (realPerson) {
    const slug = username.toLowerCase()
    return {
      type: 'Person',
      name: display,
      profileSlug: isLinkableSlug(slug) ? slug : null,
      aiDisclosure: false,
    }
  }

  return {
    type: 'Organization',
    name: brand,
    profileSlug: null,
    aiDisclosure: false,
  }
}

export function publicAuthorPath(identity: PublicAuthorIdentity): string {
  if (!identity.profileSlug) return '/'
  return `/yazar/${encodeURIComponent(identity.profileSlug)}`
}

export function publicAuthorUrl(identity: PublicAuthorIdentity, siteUrl: string): string {
  const origin = siteUrl.replace(/\/$/, '')
  if (!identity.profileSlug) return origin
  return `${origin}${publicAuthorPath(identity)}`
}
