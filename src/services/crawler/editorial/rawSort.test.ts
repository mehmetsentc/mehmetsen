import { describe, expect, it } from 'vitest'
import type { RawArticleRecord } from '../types'
import { sortRawArticleRows, sortRawArticles, storyTime } from './query'

// RAW-SORT-1: «En Yeni Haber» follows the story's own time, not the fetch time.
const row = (id: string, publishedAt: string | null, fetchedAt: string) =>
  ({ id, publishedAt: publishedAt ? new Date(publishedAt) : null, fetchedAt: new Date(fetchedAt) }) as unknown as RawArticleRecord

describe('RAW-SORT-1 raw article ordering', () => {
  const manisa = row('manisa-19-50', '2026-10-21T16:50:00Z', '2026-10-21T22:01:00Z') // fetched late
  const haberturk = row('haberturk-00-39', '2026-10-21T21:39:59Z', '2026-10-21T22:00:50Z')
  const future = row('future-stamp', '2026-10-23T09:00:00Z', '2026-10-21T20:00:00Z')
  const noDate = row('no-date', null, '2026-10-21T21:00:00Z')

  it('newest puts the latest story first even when an older story was fetched later', () => {
    const ids = sortRawArticles([manisa, haberturk, noDate], 'newest').map((r) => r.id)
    expect(ids).toEqual(['haberturk-00-39', 'no-date', 'manisa-19-50'])
  })

  it('a future source date cannot jump to the top', () => {
    expect(storyTime(future)).toBe(new Date('2026-10-21T20:00:00Z').getTime())
    expect(sortRawArticles([future, haberturk], 'newest')[0].id).toBe('haberturk-00-39')
  })

  it('oldest is the exact reverse', () => {
    const ids = sortRawArticles([manisa, haberturk, noDate], 'oldest').map((r) => r.id)
    expect(ids).toEqual(['manisa-19-50', 'no-date', 'haberturk-00-39'])
  })

  it('default list rows (no column) use the same order', () => {
    const rows = [manisa, haberturk].map((r) => ({ ...r, sourceName: 'x' })) as never[]
    expect(sortRawArticleRows(rows, { sort: 'newest' }).map((r: { id: string }) => r.id)).toEqual(['haberturk-00-39', 'manisa-19-50'])
  })
})
