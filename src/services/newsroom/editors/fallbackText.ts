/**
 * Text trimming for the raw (non-AI) stage-1 fallback.
 *
 * When DeepSeek does not answer, the draft is built from the source item.
 * Nothing here may cut a word in half: editors were seeing titles such as
 * "… neden yıllardır t" and summaries ending in "… Borsa Para".
 */

const SENTENCE_END = /[.!?…](?=\s|$|["'”’)])/g

/** Keep whole words; never returns a partial word. Adds no ellipsis. */
export function cutAtWord(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const slice = t.slice(0, max + 1)
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace <= 0) return t.slice(0, max).trim()
  return slice.slice(0, lastSpace).replace(/[\s,;:–—-]+$/u, '').trim()
}

/**
 * Prefer complete sentences. If the first sentence alone is longer than
 * `max`, allow it up to `max * 1.6`; otherwise fall back to a word cut
 * marked with an ellipsis so the reader can see it was shortened.
 */
export function cutAtSentence(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  let best = -1
  let first = -1
  SENTENCE_END.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = SENTENCE_END.exec(t))) {
    const end = m.index + 1
    if (first < 0) first = end
    if (end <= max) best = end
    else break
  }
  if (best > 0 && best >= max * 0.4) return t.slice(0, best).trim()
  if (first > 0 && first <= Math.round(max * 1.6)) return t.slice(0, first).trim()
  return `${cutAtWord(t, Math.max(1, max - 1))}…`
}
