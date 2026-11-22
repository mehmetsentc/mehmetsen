import { describe, expect, it, vi } from 'vitest'
import { diffAiFields, isAiProducedNews, recordAiFieldCorrections, summarizeCorrections } from './aiFieldCorrections'

const aiPrev = { aiEditorId: 'ed1', citySlug: 'canakkale', districtSlug: 'biga', categoryId: 'yerel-haber', title: 'T', sourceUrl: 'https://www.ornek.com/x' }

describe('aiFieldCorrections (Görev 43)', () => {
  it('AI haberi tanınır, elle yazılan tanınmaz', () => {
    expect(isAiProducedNews(aiPrev)).toBe(true)
    expect(isAiProducedNews({ rssFingerprint: 'crawler-editor:abc' })).toBe(true)
    expect(isAiProducedNews({ title: 'elle' })).toBe(false)
  })
  it('yalnızca güncellemede olan ve değişen alanlar', () => {
    expect(diffAiFields(aiPrev, { citySlug: 'balikesir', districtSlug: '', title: 'x' })).toEqual([
      { field: 'citySlug', from: 'canakkale', to: 'balikesir' },
      { field: 'districtSlug', from: 'biga', to: '' },
    ])
    expect(diffAiFields(aiPrev, { categoryId: 'yerel-haber' })).toEqual([])
    expect(diffAiFields({ citySlug: 'a' }, { citySlug: 'b' })).toEqual([])
  })
  it('kayıt yazar; sır / e-posta alanı yok', async () => {
    const set = vi.fn().mockResolvedValue(undefined)
    const db = { collection: () => ({ doc: () => ({ set }) }) } as never
    const n = await recordAiFieldCorrections(db, { newsId: 'n1', prev: aiPrev, update: { categoryId: 'asayis' }, uid: 'u1', now: 1 })
    expect(n).toBe(1)
    const doc = set.mock.calls[0][0]
    expect(doc.sourceHost).toBe('ornek.com')
    expect(JSON.stringify(doc)).not.toMatch(/token|secret|@/i)
  })
  it('özet en sık düzeltmeyi öne alır', () => {
    const s = summarizeCorrections([
      { changes: [{ field: 'categoryId', from: 'gundem', to: 'asayis' }], sourceHost: 'a.com' },
      { changes: [{ field: 'categoryId', from: 'gundem', to: 'asayis' }], sourceHost: 'a.com' },
      { changes: [{ field: 'citySlug', from: 'x', to: 'y' }], sourceHost: 'b.com' },
    ])
    expect(s.byField.categoryId).toBe(2)
    expect(s.topPairs[0]).toMatchObject({ from: 'gundem', to: 'asayis', count: 2 })
    expect(s.topSources[0]).toEqual({ sourceHost: 'a.com', count: 2 })
  })
})
