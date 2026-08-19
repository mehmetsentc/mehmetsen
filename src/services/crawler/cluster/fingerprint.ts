import { createHash } from 'node:crypto'
import { jaccard, lightStem, localeLower, normalizeNewsText, shingles, tokenizeNormalized, WEAK_EVENT_TOKENS } from './normalize'

export interface EventFingerprint {
  language: string
  countryCode: string | null
  region: string | null
  city: string | null
  district: string | null
  titleTokens: string[]
  leadTokens: string[]
  namedTokens: string[]
  numbers: string[]
  titleShingles: string[]
  leadShingles: string[]
  simhash: string | null
  eventKey: string
  publishedAt: Date | null
}

const LEAD_CHARS = 420

export function extractNumbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.'))
}

export function namedTokensFrom(title: string, language?: string | null): string[] {
  const original = title.replace(/<[^>]+>/g, ' ').replace(/['’`]/g, ' ')
  const named = original
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}.-]+/gu, ''))
    .filter(Boolean)
    .filter((w) => {
      if (/^\d+(?:[.,]\d+)?$/.test(w)) return true
      if (/^[A-ZÇĞİÖŞÜ]{2,6}$/u.test(w)) return true
      return /\p{Lu}/u.test(w) && w.length >= 3
    })
    .map((w) => localeLower(w, language))
    .map((w) => {
      const stemmed = lightStem(w, language)
      return stemmed.length >= 3 ? stemmed : w
    })
  const tokens = tokenizeNormalized(title, language).filter((t) => t.length >= 5)
  return [...new Set([...named, ...tokens])]
}

export function buildEventFingerprint(input: {
  title: string | null
  description?: string | null
  body?: string | null
  language?: string | null
  countryCode?: string | null
  region?: string | null
  city?: string | null
  district?: string | null
  simhash?: string | null
  publishedAt?: Date | null
}): EventFingerprint {
  const language = input.language || 'tr'
  const title = input.title || ''
  const lead = `${input.description || ''} ${(input.body || '').slice(0, LEAD_CHARS)}`
  const titleTokens = tokenizeNormalized(title, language)
  const leadTokens = tokenizeNormalized(lead, language)
  const named = namedTokensFrom(title, language)
  const numbers = extractNumbers(`${title} ${lead}`)
  const keyParts = [...named.filter((t) => !WEAK_EVENT_TOKENS.has(t)).slice(0, 6)].sort()
  const eventKey = createHash('sha256')
    .update(`${language}|${input.countryCode || ''}|${keyParts.join('+')}`)
    .digest('hex')
    .slice(0, 24)

  return {
    language,
    countryCode: input.countryCode ?? null,
    region: input.region ?? null,
    city: input.city ? localeLower(input.city, language) : null,
    district: input.district ? localeLower(input.district, language) : null,
    titleTokens,
    leadTokens,
    namedTokens: named,
    numbers,
    titleShingles: shingles(titleTokens, 3),
    leadShingles: shingles(leadTokens.slice(0, 24), 3),
    simhash: input.simhash ?? null,
    eventKey,
    publishedAt: input.publishedAt ?? null,
  }
}

export function strongNamedTokens(tokens: string[]): string[] {
  return tokens.filter((t) => !WEAK_EVENT_TOKENS.has(t) && t.length >= 3)
}

export function tokenOverlapScore(a: string[], b: string[]): number {
  const expand = (tokens: string[]) => {
    const set = new Set(tokens)
    for (const t of tokens) if (t.length >= 5) set.add(t.slice(0, 5))
    return set
  }
  return jaccard(expand(a), expand(b))
}

export function normalizeNewsPreview(title: string, language?: string | null): string {
  return normalizeNewsText(title, language)
}
