import { describe, expect, it } from 'vitest'
import {
  clampImageWidth,
  newsImageProxyPath,
  parsePublicImageUrl,
  widthHintFromSizes,
} from '@/lib/newsImageProxy'

describe('newsImageProxy', () => {
  it('caps resize width', () => {
    expect(clampImageWidth(16)).toBe(64)
    expect(clampImageWidth(326)).toBe(326)
    expect(clampImageWidth(4000)).toBe(1200)
  })

  it('derives a 2x width from a css px size', () => {
    expect(widthHintFromSizes('163px', false)).toBe(326)
    expect(widthHintFromSizes('(max-width: 768px) 100vw, 768px', true)).toBe(1200)
    expect(widthHintFromSizes('100vw', true)).toBe(828)
  })

  it('builds a same-origin proxy path', () => {
    expect(newsImageProxyPath('https://indyturk.com/a.png', 828)).toBe(
      '/api/img?url=https%3A%2F%2Findyturk.com%2Fa.png&w=828'
    )
  })

  it('allows publisher https hosts and blocks private targets', () => {
    expect(parsePublicImageUrl('https://indyturk.com/a.png')?.hostname).toBe('indyturk.com')
    expect(parsePublicImageUrl('https://cdn.example.com/x.jpg')).not.toBeNull()
    expect(parsePublicImageUrl('http://127.0.0.1/a.jpg')).toBeNull()
    expect(parsePublicImageUrl('https://169.254.169.254/latest')).toBeNull()
    expect(parsePublicImageUrl('https://10.0.0.5/a.jpg')).toBeNull()
    expect(parsePublicImageUrl('https://www.nahaber.com/api/img?url=1')).toBeNull()
    expect(parsePublicImageUrl('file:///etc/passwd')).toBeNull()
    expect(parsePublicImageUrl('https://user:pass@evil.com/a.jpg')).toBeNull()
  })
})
