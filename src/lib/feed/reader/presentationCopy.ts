/**
 * Reader presentation copy — never invent, never presentation-truncate.
 * Feed cards may stay abbreviated; Reader shows the fullest available text.
 */
import { looksTruncatedMidWord } from '@/lib/feed/smartFeedSummary'

export function normalizeReaderCopy(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length ? t : null
}

/** Upstream storage/AI cut — do not repair by inventing the missing sentence. */
export function looksLikeUpstreamTruncation(text: string | null | undefined): boolean {
  const t = normalizeReaderCopy(text)
  if (!t) return false
  if (/(?:\.{3}|…)\s*$/u.test(t)) return true
  return looksTruncatedMidWord(t)
}

/**
 * Prefer the complete canonical string. If one value is a prefix/subset of the
 * other, keep the longer. If one looks cut and the other does not, keep the
 * complete one. Never slice/substring the result.
 */
export function pickFullReaderCopy(
  preferred: string | null | undefined,
  fallback: string | null | undefined
): string | null {
  const a = normalizeReaderCopy(preferred)
  const b = normalizeReaderCopy(fallback)
  if (!a) return b
  if (!b) return a
  if (a === b) return a
  if (a.includes(b) && a.length > b.length) return a
  if (b.includes(a) && b.length > a.length) return b
  const aCut = looksLikeUpstreamTruncation(a)
  const bCut = looksLikeUpstreamTruncation(b)
  if (aCut && !bCut) return b
  if (bCut && !aCut) return a
  return a.length >= b.length ? a : b
}

const CATEGORY_META: Record<string, string> = {
  gundem: 'GÜNDEM',
  'son-dakika': 'SON DAKİKA',
  ekonomi: 'EKONOMİ',
  spor: 'SPOR',
  dunya: 'DÜNYA',
  teknoloji: 'TEKNOLOJİ',
  kultur: 'KÜLTÜR',
  saglik: 'SAĞLIK',
  yerel: 'YEREL',
  gastronomi: 'GASTRONOMİ',
  magazin: 'MAGAZİN',
  siyaset: 'SİYASET',
  voleybol: 'VOLEYBOL',
}

export function formatReaderCategoryLabel(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const key = raw.trim().toLowerCase()
  return CATEGORY_META[key] || raw.trim().toLocaleUpperCase('tr-TR')
}
