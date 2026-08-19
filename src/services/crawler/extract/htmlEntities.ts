/** Decode HTML entities for comparison/display. Does not mutate stored source HTML. */
export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ''
    })
    .replace(/&#(\d{1,7});/g, (_, num: string) => {
      const code = Number.parseInt(num, 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ''
    })
}

export function decodeForDisplay(input: string | null | undefined): string {
  if (!input) return ''
  try {
    return decodeHtmlEntities(input).normalize('NFC')
  } catch {
    return input
  }
}
