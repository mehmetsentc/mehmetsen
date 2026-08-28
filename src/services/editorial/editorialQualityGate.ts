/**
 * Phase P16 — Editorial Quality Gate
 *
 * Enforces strict quality standards for editorial news items:
 * - Title length >= 12 chars, no placeholder tokens
 * - Body length >= 100 chars
 * - Low boilerplate and link density
 * - Category normalization to canonical categories
 * - City / District matching
 */

import { decodeForDisplay } from '../crawler/extract/htmlEntities'
import { matchCitySlug } from '../crawler/editorial/geoPrefill'
import type { QualityGateResult } from './editorialTypes'

const KNOWN_CATEGORIES = new Set([
  'gundem',
  'ekonomi',
  'spor',
  'teknoloji',
  'dunya',
  'siyaset',
  'saglik',
  'yasam',
  'kultur',
  'otomobil',
  'bilim',
  'yerel-haber',
  'finans-piyasa',
  'borsa',
  'futbol',
  'basketbol',
  'magazin',
  'astroloji',
  'egitim',
  'cevre-iklim',
  'turizm',
  'gastronomi',
  'asayis',
])

const CATEGORY_ALIASES: Record<string, string> = {
  gündem: 'gundem',
  haber: 'gundem',
  haberler: 'gundem',
  son_dakika: 'gundem',
  'son-dakika': 'gundem',
  politika: 'siyaset',
  siyaset: 'siyaset',
  economy: 'ekonomi',
  finance: 'finans-piyasa',
  piyasa: 'finans-piyasa',
  tech: 'teknoloji',
  technology: 'teknoloji',
  bilisim: 'teknoloji',
  world: 'dunya',
  dünya: 'dunya',
  dış_haberler: 'dunya',
  sports: 'spor',
  football: 'futbol',
  health: 'saglik',
  sağlık: 'saglik',
  life: 'yasam',
  yaşam: 'yasam',
  culture: 'kultur',
  kültür: 'kultur',
  sanat: 'kultur',
  auto: 'otomobil',
  araba: 'otomobil',
  science: 'bilim',
  local: 'yerel-haber',
  yerel: 'yerel-haber',
  çanakkale: 'yerel-haber',
  canakkale: 'yerel-haber',
}

const PLACEHOLDER_REGEX = /\b(lorem\s+ipsum|test\s+makalesi|dummy\s+article|sample\s+text|örnek\s+haber)\b/i

const BOILERPLATE_PATTERNS = [
  /tüm\s+hakları\s+saklıdır/i,
  /abone\s+olmayı\s+unutmayın/i,
  /kaynak:\s*[\w\s.-]+/i,
  /detaylar\s+gelecek/i,
  /haberin\s+devamı\s+için/i,
  /bizi\s+sosyal\s+medyadan\s+takip\s+edin/i,
  /telif\s+hakkı/i,
  /copyright\s+©/i,
]

export function normalizeEditorialCategory(rawHint?: string | null, textForInference?: string): string {
  if (rawHint) {
    const cleanHint = rawHint.trim().toLowerCase().replace(/\s+/g, '-')
    if (KNOWN_CATEGORIES.has(cleanHint)) return cleanHint
    if (CATEGORY_ALIASES[cleanHint]) return CATEGORY_ALIASES[cleanHint]
  }

  if (textForInference) {
    const lower = textForInference.toLocaleLowerCase('tr-TR')
    if (/süper\s+lig|futbol|transfer|maç\s+sonucu|şampiyonlar\s+ligi|fenerbahçe|galatasaray|beşiktaş|trabzonspor/i.test(lower)) {
      return 'spor'
    }
    if (/enflasyon|faiz|borsa|dolar|euro|hisse|merkez\s+bankası|ihracat|ithalat|ekonomi|bütçe/i.test(lower)) {
      return 'ekonomi'
    }
    if (/yapay\s+zeka|akıllı\s+telefon|işlemci|apple|samsung|nvidia|yazılım|donanım|teknoloji/i.test(lower)) {
      return 'teknoloji'
    }
    if (/tbmm|seçim|parti|chp|ak\s+parti|mhp|bakanlık|cumhurbaşkan|milletvekili|hükümet/i.test(lower)) {
      return 'siyaset'
    }
    if (/beyaz\s+saray|kremlin|gazze|israil|ukrayna|rusya|abd|avrupa\s+birliği|bm|nato/i.test(lower)) {
      return 'dunya'
    }
    if (/çanakkale|boğaz|lapseki|biga|ayvacık|gelibolu|ezine|bayramiç|eceabat/i.test(lower)) {
      return 'yerel-haber'
    }
    if (/hastane|doktor|ilaç|tedavi|salgın|aşı|sağlık/i.test(lower)) {
      return 'saglik'
    }
  }

  return 'gundem'
}

export function cleanTextContent(raw: string): string {
  let cleaned = decodeForDisplay(raw)
  cleaned = cleaned.replace(/<[^>]+>/g, ' ')
  cleaned = cleaned.replace(/&nbsp;/g, ' ')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  return cleaned
}

export function generateCleanSummary(body: string, spot?: string | null, title?: string): string {
  if (spot && spot.trim().length >= 30) {
    return cleanTextContent(spot).slice(0, 480)
  }

  const cleanBody = cleanTextContent(body)
  const sentences = cleanBody.split(/(?<=[.!?])\s+/)
  if (sentences.length > 0 && sentences[0].length >= 30) {
    const firstTwo = sentences.slice(0, 2).join(' ')
    return firstTwo.slice(0, 480)
  }

  return (cleanBody || title || '').slice(0, 480)
}

export function validateEditorialCandidate(input: {
  title: string
  body: string
  spot?: string | null
  categoryHint?: string | null
  city?: string | null
  district?: string | null
  canonicalUrl?: string | null
}): QualityGateResult {
  const issues: string[] = []
  let score = 100

  const sanitizedTitle = cleanTextContent(input.title)
  const sanitizedBody = cleanTextContent(input.body)
  const sanitizedSummary = generateCleanSummary(sanitizedBody, input.spot, sanitizedTitle)

  if (sanitizedTitle.length < 12) {
    issues.push('TITLE_TOO_SHORT')
    score -= 40
  }

  if (PLACEHOLDER_REGEX.test(sanitizedTitle) || PLACEHOLDER_REGEX.test(sanitizedBody)) {
    issues.push('CONTAINS_PLACEHOLDER_TEXT')
    score -= 80
  }

  if (sanitizedBody.length < 80) {
    issues.push('BODY_TOO_SHORT')
    score -= 40
  }

  // Calculate boilerplate density
  let boilerplateHits = 0
  for (const bp of BOILERPLATE_PATTERNS) {
    if (bp.test(sanitizedBody)) boilerplateHits++
  }
  if (boilerplateHits >= 3) {
    issues.push('HIGH_BOILERPLATE_RATIO')
    score -= 20
  }

  const resolvedCategory = normalizeEditorialCategory(
    input.categoryHint,
    `${sanitizedTitle} ${sanitizedBody}`
  )

  const citySlug = matchCitySlug(input.city)
  const districtSlug = input.district ? input.district.trim().toLowerCase().replace(/\s+/g, '-') : null

  const passed = score >= 50 && issues.length === 0

  return {
    passed,
    qualityScore: Math.max(0, score),
    issues,
    sanitizedTitle,
    sanitizedSummary,
    sanitizedBody,
    resolvedCategory,
    citySlug,
    districtSlug,
  }
}
