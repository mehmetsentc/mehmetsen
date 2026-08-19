import { describe, expect, it } from 'vitest'
import { isTrackingParam, normalizeArticleUrl, urlHashFor } from './normalize'

describe('URL normalization', () => {
  it('strips utm and click ids', () => {
    const url = normalizeArticleUrl(
      'https://News.Example.com:443/world/story/?utm_source=twitter&utm_medium=social&fbclid=abc&gclid=1&id=42'
    )
    expect(url).toBe('https://news.example.com/world/story?id=42')
  })

  it('drops trailing slash and hash', () => {
    expect(normalizeArticleUrl('https://example.com/a/b/#section')).toBe('https://example.com/a/b')
  })

  it('rejects non-http schemes', () => {
    expect(normalizeArticleUrl('file:///etc/passwd')).toBeNull()
    expect(normalizeArticleUrl('javascript:alert(1)')).toBeNull()
  })

  it('resolves relative URLs', () => {
    expect(normalizeArticleUrl('/news/hello-world', 'https://site.test')).toBe(
      'https://site.test/news/hello-world'
    )
  })

  it('stable hash for equivalent tracking variants', () => {
    const a = normalizeArticleUrl('https://a.test/x?utm_campaign=1')!
    const b = normalizeArticleUrl('https://a.test/x')!
    expect(urlHashFor(a)).toBe(urlHashFor(b))
  })

  it('detects tracking params', () => {
    expect(isTrackingParam('utm_source')).toBe(true)
    expect(isTrackingParam('page')).toBe(false)
  })
})
