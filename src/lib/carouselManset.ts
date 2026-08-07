/**
 * Picks the best short headline for carousel overlay from available fields.
 *
 * Priority: seoTitle (55-65 chars) → title truncated at word boundary.
 * The result is uppercase in CSS so we keep natural casing here.
 */

const MAX_MANSET_LENGTH = 72

/**
 * Truncate at a word boundary, avoiding mid-word cuts.
 * Prefers sentence-end punctuation (: | – .) when it falls within budget.
 */
function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text

  const breakChars = [':', '|', '–', '.', '!', '?']
  let bestBreak = -1
  for (const ch of breakChars) {
    const idx = text.lastIndexOf(ch, max)
    if (idx > max * 0.4) {
      bestBreak = Math.max(bestBreak, idx)
    }
  }

  if (bestBreak > 0) {
    const after = text.slice(bestBreak + 1).trim()
    const before = text.slice(0, bestBreak).trim()
    if (after.length > 0 && before.length >= 20) {
      return before + text[bestBreak]
    }
  }

  const spaceIdx = text.lastIndexOf(' ', max)
  if (spaceIdx > max * 0.5) {
    return text.slice(0, spaceIdx).trim()
  }

  return text.slice(0, max).trim()
}

export function getCarouselManset(
  title: string,
  seoTitle?: string,
): string {
  const t = title.trim()

  if (seoTitle) {
    const seo = seoTitle.trim()
    if (seo.length > 10 && seo.length <= MAX_MANSET_LENGTH && seo !== t) {
      return seo
    }
  }

  if (t.length <= MAX_MANSET_LENGTH) return t

  return truncateAtWord(t, MAX_MANSET_LENGTH)
}
