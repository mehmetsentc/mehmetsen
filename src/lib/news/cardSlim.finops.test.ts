import { afterEach, describe, expect, it } from 'vitest'
import {
  NEWS_CARD_FIRESTORE_FIELDS,
  newsCardFields,
  newsDayFeedFields,
  selectNewsCardFields,
} from '@/lib/news/cardFirestoreFields'
import { docToNewsItem } from '@/lib/newsItemUtils'
import { inferPostType } from '@/lib/newsMapper'

afterEach(() => {
  delete process.env.NEWS_CARD_SLIM
})

describe('A4: NEWS_CARD_SLIM drops the article-length description from card reads', () => {
  it('is off by default: the mask is unchanged', () => {
    expect(newsCardFields()).toEqual(NEWS_CARD_FIRESTORE_FIELDS)
    expect(newsCardFields()).toContain('description')
  })

  it('on: no description, reads readingTimeMinutes; summary/spot stay', () => {
    process.env.NEWS_CARD_SLIM = '1'
    const f = newsCardFields()
    expect(f).not.toContain('description')
    expect(f).toContain('summary')
    expect(f).toContain('spot')
    expect(f).toContain('readingTimeMinutes')
    expect(newsDayFeedFields()).not.toContain('description')
    let selected: string[] = []
    const q = { select: (...x: string[]) => ((selected = x), q) }
    selectNewsCardFields(q as never)
    expect(selected).not.toContain('description')
  })

  it('a slim card still gets its text from summary and no fake "1 dk" reading time', () => {
    const item = docToNewsItem('n1', { title: 'Başlık', summary: 'Kısa özet metni.', status: 'published' }, { mode: 'list' })
    expect(item?.description).toBe('Kısa özet metni.')
    expect(item?.readingMinutes).toBeUndefined()
    const withTime = docToNewsItem('n2', { title: 'B', summary: 'x', readingTimeMinutes: 4 }, { mode: 'list' })
    expect(withTime?.readingMinutes).toBe(4)
  })

  it('full reads keep their reading time from the body', () => {
    const body = Array.from({ length: 600 }, () => 'kelime').join(' ')
    const item = docToNewsItem('n3', { title: 'B', description: body }, { mode: 'list' })
    expect(item?.readingMinutes).toBe(3)
  })

  it('a slim card with a thumbnail and a summary is still news, not a photo post', () => {
    expect(inferPostType({ title: 't', thumbnail: 'https://x/y.jpg', summary: 'özet' } as never)).toBe('news')
    expect(inferPostType({ title: 't', thumbnail: 'https://x/y.jpg', description: '' } as never)).toBe('photo')
  })
})
