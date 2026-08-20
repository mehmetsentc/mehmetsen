/**
 * Phase 4C.2 — single source of truth for NaHaber canary draft field contracts.
 * Aligns with contentQuality.ts where sensible; canary body target is richer (300–900)
 * when sources support it. Never invent facts to hit length.
 */

import { DEFAULT_CATEGORIES } from '@/constants/config'
import {
  MIN_NEWS_BODY_WORDS,
  TARGET_NEWS_BODY_WORDS_MIN,
  TARGET_NEWS_BODY_WORDS_MAX,
} from '@/lib/contentQuality'
import type { CanaryDraftFields } from './types'

export const CANARY_CATEGORY_IDS = new Set(DEFAULT_CATEGORIES.map((c) => c.id))

/** Absolute floor — below this always fails (broken/truncated), never invent to pad. */
export const CANARY_BODY_ABSOLUTE_MIN_WORDS = 80

/** Publishable-length target when sources are rich enough. */
export const CANARY_BODY_TARGET_MIN_WORDS = 300
export const CANARY_BODY_TARGET_MAX_WORDS = 900

/** Thin-source accurate short article band (aligned with site min, not forced 300). */
export const CANARY_BODY_THIN_MIN_WORDS = Math.min(MIN_NEWS_BODY_WORDS, 150)

export const CANARY_FIELD_LIMITS = {
  title: { min: 12, max: 110 },
  slug: { min: 6, max: 120 },
  spot: { min: 20, max: 220 },
  summary: { min: 40, max: 400 },
  /** Soft contract: target band when rich; source-aware mins applied in validate. */
  body: {
    min: CANARY_BODY_TARGET_MIN_WORDS,
    max: CANARY_BODY_TARGET_MAX_WORDS,
    absoluteMin: CANARY_BODY_ABSOLUTE_MIN_WORDS,
    thinMin: CANARY_BODY_THIN_MIN_WORDS,
    unit: 'words' as const,
  },
  tags: { min: 2, max: 8 },
  seoTitle: { min: 12, max: 70 },
  seoDescription: { min: 40, max: 160 },
  seoKeywords: { min: 2, max: 12 },
  socialTitle: { min: 12, max: 100 },
  socialDescription: { min: 20, max: 200 },
  pushTitle: { min: 8, max: 60 },
  pushText: { min: 12, max: 120 },
  imageAlt: { min: 8, max: 140 },
  imageFilename: { min: 8, max: 120 },
  readingTime: { min: 1, max: 30 },
} as const

/** Editorial reference (legacy multi-stage) — not canary hard mins. */
export const LEGACY_EDITORIAL_BODY = {
  minNewsBodyWords: MIN_NEWS_BODY_WORDS,
  targetMin: TARGET_NEWS_BODY_WORDS_MIN,
  targetMax: TARGET_NEWS_BODY_WORDS_MAX,
} as const

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function slugifyTr(input: string): string {
  const map: Record<string, string> = {
    ç: 'c',
    ğ: 'g',
    ı: 'i',
    İ: 'i',
    ö: 'o',
    ş: 's',
    ü: 'u',
    Ç: 'c',
    Ğ: 'g',
    Ö: 'o',
    Ş: 's',
    Ü: 'u',
  }
  return input
    .split('')
    .map((c) => map[c] ?? c)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 6 && slug.length <= 120
}

export function isValidImageFilename(name: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{5,118}\.(jpg|jpeg|png|webp)$/i.test(name)
}

export function emptyDraft(): CanaryDraftFields {
  return {
    title: '',
    slug: '',
    spot: '',
    summary: '',
    body: '',
    tags: [],
    category: '',
    seoTitle: '',
    seoDescription: '',
    seoKeywords: [],
    socialTitle: '',
    socialDescription: '',
    pushTitle: '',
    pushText: '',
    imageAlt: '',
    imageFilename: '',
    readingTime: 0,
  }
}
