import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const limit = vi.fn(() => ({ get }))
const where = vi.fn(() => ({ limit }))
const collection = vi.fn(() => ({ where }))
const updateRawArticle = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/firebase/admin', () => ({
  getAdminFirestore: () => ({ collection }),
  Collections: { NEWS: 'news' },
}))

vi.mock('@/db', () => ({
  hasDatabaseUrl: () => true,
}))

vi.mock('../store/drizzle', () => ({
  DrizzleCrawlerStore: vi.fn().mockImplementation(() => ({ updateRawArticle })),
}))

import { reconcilePublishedRawArticles } from './newsLink'

describe('reconcilePublishedRawArticles', () => {
  beforeEach(() => {
    get.mockReset()
    updateRawArticle.mockClear()
  })

  it('hides a draft row once the linked news is live', async () => {
    get.mockResolvedValue({
      empty: false,
      docs: [{ id: 'news_1', data: () => ({ status: 'published', slug: 'haber', title: 'Başlık' }) }],
    })
    const result = await reconcilePublishedRawArticles([
      { id: 'raw_live', editorialStatus: 'DRAFT' },
      { id: 'raw_wait', editorialStatus: 'NEW' },
    ])
    expect(result.hidden).toBe(1)
    expect(result.articles.map((row) => row.id)).toEqual(['raw_wait'])
    expect(updateRawArticle).toHaveBeenCalledWith('raw_live', {
      editorialNewsId: 'news_1',
      editorialStatus: 'PUBLISHED',
    })
  })

  it('keeps a draft that is still waiting for review', async () => {
    get.mockResolvedValue({ empty: true, docs: [] })
    const result = await reconcilePublishedRawArticles([{ id: 'raw_wait', editorialStatus: 'DRAFT' }])
    expect(result.hidden).toBe(0)
    expect(result.articles).toHaveLength(1)
    expect(updateRawArticle).not.toHaveBeenCalled()
  })
})
