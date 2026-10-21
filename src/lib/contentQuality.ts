/**
 * Haber gövdesi kalite eşikleri — AdSense / editoryal ortak kaynak.
 * Kısa gövdeler hem SEO hem yayıncı incelemesinde “yetersiz içerik” riski taşır.
 */

/** Canlı yayına uygun minimum gövde (spot hariç content/description). */
export const MIN_NEWS_BODY_WORDS = 220

/**
 * AI prompt hedef bandı (SEO-13, 21 Eki 2026): 450–650 kelime.
 * SEO index kapısı ≥400 kelimelik AI haberlerini Google'a açık bırakır
 * (src/lib/seo/aiQualityGate.ts → AI_QUALITY_MIN_WORDS). Hedef bunun biraz üstünde.
 * MIN_NEWS_BODY_WORDS yayın tabanı olarak kalır (yeniden deneme / maliyet değişmez).
 */
export const TARGET_NEWS_BODY_WORDS_MIN = 450
export const TARGET_NEWS_BODY_WORDS_MAX = 650
/** Google'a açık kalmak için gereken gövde (aiQualityGate ile aynı). */
export const SEO_INDEXABLE_BODY_WORDS = 400

/** Chief/reviewer: bunun altı rejected / needs_revision. */
export const REVIEW_REJECT_BELOW_WORDS = 120
export const REVIEW_APPROVE_MIN_WORDS = 200

export function countPlainWords(text: string | null | undefined): number {
  if (!text) return 0
  const plain = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return 0
  return plain.split(/\s+/).filter(Boolean).length
}

export function isNewsBodyTooShort(text: string | null | undefined, min = MIN_NEWS_BODY_WORDS): boolean {
  return countPlainWords(text) < min
}

/**
 * Kaynak gövde + özet birleşimi — aynı RSS snippet iki kez sayılmaz.
 * Habertürk vb. feed'lerde content fallback = description olunca
 * `content + summary` 500+ kar görünüp enrichment atlanıyordu.
 */
export function combinedSourceText(
  content: string | null | undefined,
  summary: string | null | undefined
): string {
  const c = (content || '').trim()
  const s = (summary || '').trim()
  if (!c) return s
  if (!s) return c
  if (c === s) return c
  if (c.includes(s)) return c
  if (s.includes(c)) return s
  return `${c}\n${s}`
}
