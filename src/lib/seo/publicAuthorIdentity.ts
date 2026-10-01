import { TURKISH_PROVINCES } from '@/constants/cities'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { PROVINCE_DISTRICTS } from '@/constants/turkishDistricts'
import { SEED_CITY_CATEGORY_AI_EDITORS } from '@/lib/ai/editorial/seedCityCategoryEditors'
import { personaNameForKey, SEED_CITY_AI_EDITORS } from '@/lib/ai/editorial/seedCityEditors'
import { SEED_AI_EDITORS } from '@/lib/ai/editorial/seedEditors'
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

function isPublicDeskLabel(name: string): boolean {
  return /ai\s*edit[oö]r|yapay\s*zeka|masası|editörlüğü|(?:^|\s)ai$/i.test(name)
}

/** A stored journalist name. Desk labels and “AI Editör” titles are not public names. */
export function cleanPublicPersonaName(name?: string | null, source?: string | null): string | null {
  const display = name?.trim() || ''
  if (!display) return null
  if (isGenericEditorName(display) || isPublicDeskLabel(display)) return null
  const words = display.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return display
  if (isSourceLikeName(display, source)) return null
  return display
}

function seedPersonaName(slug?: string | null): string | null {
  const key = stripAiEditorPrefix((slug ?? '').trim().toLowerCase())
  if (!key) return null
  const hit = [...SEED_AI_EDITORS, ...SEED_CITY_AI_EDITORS, ...SEED_CITY_CATEGORY_AI_EDITORS].find(
    (editor) => editor.slug === key
  )
  const name = hit?.name
  return name && !isPublicDeskLabel(name) ? name : null
}

function generatedDeskName(slug?: string | null): string | null {
  const key = stripAiEditorPrefix((slug ?? '').trim().toLowerCase())
  if (!/^(?:ulke|il|ilce|yerel)-/.test(key)) return null
  return personaNameForKey(key)
}

/** Public byline: the editor's own name, never an AI or desk label. */
export function publicEditorName(
  displayName?: string | null,
  slug?: string | null,
  source?: string | null
): string {
  return (
    cleanPublicPersonaName(displayName, source) ||
    seedPersonaName(slug) ||
    generatedDeskName(slug) ||
    siteName()
  )
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
  return brand
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
    const name = publicEditorName(
      input.authorDisplayName,
      profileSlug,
      input.source
    )
    if (cleanPublicPersonaName(name, input.source)) {
      return {
        type: 'Person',
        name,
        profileSlug,
        aiDisclosure: true,
      }
    }
    return {
      type: 'Organization',
      name: brand,
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
