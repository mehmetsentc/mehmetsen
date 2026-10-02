import { describe, expect, it, vi } from 'vitest'
import { loadArticlesTextByIds, loadSourcesByIds } from './batchLoad'
import type { CrawlerStore } from './types'

describe('FinOps batch member loads', () => {
  it('uses one batched call when the store supports it', async () => {
    const getRawArticlesTextByIds = vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, { id } as never])))
    const getRawArticleText = vi.fn()
    const store = { getRawArticlesTextByIds, getRawArticleText } as unknown as CrawlerStore
    const out = await loadArticlesTextByIds(store, ['a', 'b', 'a', ''])
    expect(getRawArticlesTextByIds).toHaveBeenCalledTimes(1)
    expect(getRawArticlesTextByIds).toHaveBeenCalledWith(['a', 'b'])
    expect(getRawArticleText).not.toHaveBeenCalled()
    expect([...out.keys()]).toEqual(['a', 'b'])
  })

  it('falls back to per-id reads and skips missing rows', async () => {
    const store = {
      getRawArticle: vi.fn(async (id: string) => (id === 'x' ? null : ({ id } as never))),
      getSource: vi.fn(async (id: string) => ({ id }) as never),
    } as unknown as CrawlerStore
    const arts = await loadArticlesTextByIds(store, ['x', 'y'])
    expect([...arts.keys()]).toEqual(['y'])
    const srcs = await loadSourcesByIds(store, ['s1', 's1', 's2'])
    expect(store.getSource).toHaveBeenCalledTimes(2)
    expect([...srcs.keys()]).toEqual(['s1', 's2'])
  })
})
