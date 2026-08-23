/** Minimum char length above which "ends with a letter" is not treated as RSS clip. */
export const RSS_TRUNCATION_SHORT_CLIP_CHARS = 500

/**
 * Detects RSS content truncated mid-sentence.
 *
 * Pattern "ends with alphanumeric" applies only to short clips — full Turkish
 * articles often end without a terminal period and must not be flagged.
 */
export function isRssContentTruncated(
  text: string,
  shortClipChars = RSS_TRUNCATION_SHORT_CLIP_CHARS
): boolean {
  if (!text || text.length < 10) return false
  const t = text.trimEnd()

  if (t.endsWith('…') || t.endsWith('...') || t.endsWith('[…]') || t.endsWith('[...]')) return true

  const lastChar = t[t.length - 1]
  if (t.length < shortClipChars && lastChar && /[a-zA-ZğüşıöçĞÜŞİÖÇ0-9]/.test(lastChar)) {
    return true
  }

  if (t.endsWith(',') || t.endsWith(';')) return true

  if (/\s(ve|ile|da|de|ya|ki|ama|fakat|lakin|ancak|çünkü|zira|hem|ne|veya|ya da)$/i.test(t)) {
    return true
  }

  return false
}
