/**
 * AI / RSS occasionally emit raw HTML (<p>, <div>…).
 * CMS “İçerik” is a plain textarea — tags must become readable news text.
 */
export function stripHtmlToNewsPlainText(text: string): string {
  if (!text) return ''

  return text
    .replace(/\r\n/g, '\n')
    // Decode common entities first so &lt;p&gt; also gets stripped
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<\/?(p|div|section|article|span|strong|b|em|i|ul|ol|li|br|hr)(?:\s[^>]*)?\/?>/gi, (tag) => {
      const name = tag.replace(/[<>/]/g, '').split(/\s/)[0]?.toLowerCase() ?? ''
      if (name === 'br' || name === 'hr' || name === 'p' || name === 'div' || name === 'li') {
        return '\n'
      }
      return ''
    })
    .replace(/<\/?h([1-6])(?:\s[^>]*)?>/gi, (_, level) => `\n${'#'.repeat(Number(level))} `)
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function looksLikeHtmlContent(text: string): boolean {
  return /<\/?(p|div|br|h[1-6]|span|ul|ol|li)\b/i.test(text) || /&lt;\/?p&gt;/i.test(text)
}
