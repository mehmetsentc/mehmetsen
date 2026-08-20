import { createHash } from 'node:crypto'
import { decodeHtmlEntities } from '../extract/htmlEntities'
import {
  jaccard,
  lightStem,
  localeLower,
  namedTokensMatch,
  normalizeNewsText,
  shingles,
  tokenizeNormalized,
  WEAK_EVENT_TOKENS,
} from './normalize'

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

export function namedTokenOverlapScore(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1
  if (!a.length || !b.length) return 0
  const used = new Set<number>()
  let inter = 0
  for (const token of a) {
    const idx = b.findIndex((other, i) => !used.has(i) && namedTokensMatch(token, other))
    if (idx >= 0) {
      used.add(idx)
      inter += 1
    }
  }
  return inter / (a.length + b.length - inter)
}

export function namedTokensFrom(title: string, language?: string | null): string[] {
  const original = decodeHtmlEntities(title)
    .normalize('NFC')
    .replace(/<[^>]+>/g, ' ')
    .replace(/['’`´]/g, ' ')
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
  // Empty strong-key sets must NOT collide across unrelated weak-keyword stories
  // (e.g. two different "yangın" headlines in different cities).
  const keyMaterial =
    keyParts.length > 0
      ? keyParts.join('+')
      : [...titleTokens.filter((t) => !WEAK_EVENT_TOKENS.has(t)).slice(0, 8), input.city || '', input.district || '']
          .filter(Boolean)
          .join('+') || `uniq:${titleTokens.slice(0, 6).join('+')}`
  const eventKey = createHash('sha256')
    .update(`${language}|${input.countryCode || ''}|${keyMaterial}`)
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
  const ja = jaccard(expand(a), expand(b))
  return Math.max(ja, namedTokenOverlapScore(a, b))
}

export function normalizeNewsPreview(title: string, language?: string | null): string {
  return normalizeNewsText(title, language)
}
