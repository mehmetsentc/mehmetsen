import { describe, expect, it } from 'vitest'
import { looksLikeHtmlContent, stripHtmlToNewsPlainText } from '@/lib/stripHtmlToNewsPlainText'

describe('stripHtmlToNewsPlainText', () => {
  it('removes paragraph tags and keeps readable news text', () => {
    const input =
      'CHP ilçe yönetimi istifa etti.</p><p>CHP İskenderun İlçe Başkanı Hüseyin Derin de ayrıldığını bildirdi.'
    const out = stripHtmlToNewsPlainText(input)
    expect(out).not.toMatch(/<\/?p>/i)
    expect(out).toContain('istifa etti.')
    expect(out).toContain('Hüseyin Derin')
    expect(looksLikeHtmlContent(input)).toBe(true)
    expect(looksLikeHtmlContent(out)).toBe(false)
  })

  it('converts headings to markdown', () => {
    const out = stripHtmlToNewsPlainText('<h2>Gelişmeler</h2><p>Detaylar açıklandı.</p>')
    expect(out).toContain('## Gelişmeler')
    expect(out).toContain('Detaylar açıklandı.')
  })
})
