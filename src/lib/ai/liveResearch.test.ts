import { describe, expect, it } from 'vitest'
import {
  parseGroundedResearch,
  sanitizeGroundingSources,
} from '@/lib/ai/liveResearch'

describe('liveResearch', () => {
  it('parses grounded text, queries and unique sources', () => {
    const result = parseGroundedResearch('örnek haber', {
      candidates: [{
        content: {
          parts: [{
            text: 'Bu, güncel gelişmeleri ve farklı kaynaklarda doğrulanan ayrıntıları açıklayan yeterince uzun bir araştırma notudur. Yeni açıklamanın bugün yapıldığı iki kaynak tarafından bildirildi.',
          }],
        },
        groundingMetadata: {
          webSearchQueries: ['örnek haber bugün'],
          groundingChunks: [
            { web: { title: 'Kaynak A', uri: 'https://example.com/a#detail' } },
            { web: { title: 'Kaynak A tekrar', uri: 'https://example.com/a' } },
            { web: { title: 'Kaynak B', uri: 'https://news.example.org/b' } },
          ],
        },
      }],
    })

    expect(result?.sources).toHaveLength(2)
    expect(result?.sources[0]).toEqual({
      title: 'Kaynak A',
      url: 'https://example.com/a',
    })
    expect(result?.searchQueries).toEqual(['örnek haber bugün'])
  })

  it('rejects ungrounded answers and unsafe source schemes', () => {
    expect(parseGroundedResearch('konu', {
      candidates: [{
        content: { parts: [{ text: 'Kısa ve kaynaksız yanıt.' }] },
      }],
    })).toBeNull()

    expect(sanitizeGroundingSources([
      { title: 'Dosya', url: 'file:///etc/passwd' },
      { title: 'JS', url: 'javascript:alert(1)' },
      { title: 'Güvenli', url: 'https://example.com/news' },
    ])).toEqual([{ title: 'Güvenli', url: 'https://example.com/news' }])
  })
})
