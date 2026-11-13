import { describe, expect, it } from 'vitest'
import { toMirrorJson, toNewsMirrorRow } from './newsMirrorRow'
import { docToNewsItem } from '@/lib/newsItemUtils'

const ts = (ms: number) => ({ toDate: () => new Date(ms), toMillis: () => ms })

describe('FinOps Neon phase 1: Firestore news -> news_read_mirror row', () => {
  const data = {
    slug: 'ankara-deprem',
    title: 'Ankara’da deprem',
    description: 'Ankara’da 4,2 büyüklüğünde deprem',
    status: 'published',
    publishedAt: 1_762_990_000_000,
    createdAt: ts(1_762_980_000_000),
    updatedAt: ts(1_762_995_000_000),
    categoryId: 'gundem',
    citySlug: 'Ankara',
    authorId: 'u1',
    tags: ['deprem', '', 3, 'ankara'],
    viewsCount: 1234.6,
    content: '<p>gövde</p>',
    location: { district: 'Çankaya' },
    undefinedField: undefined,
  } as Record<string, unknown>

  it('maps the indexed columns', () => {
    const row = toNewsMirrorRow('n1', data)
    expect(row).toMatchObject({
      id: 'n1',
      slug: 'ankara-deprem',
      status: 'published',
      categoryId: 'gundem',
      citySlug: 'ankara',
      authorId: 'u1',
      tags: ['deprem', 'ankara'],
      views: 1235,
    })
    expect(row.publishedAt?.getTime()).toBe(1_762_990_000_000)
    expect(row.createdAt?.toISOString()).toBe(new Date(1_762_980_000_000).toISOString())
  })

  it('stores Timestamps as ISO strings and drops undefined fields', () => {
    const doc = toMirrorJson(data) as Record<string, unknown>
    expect(doc.updatedAt).toBe(new Date(1_762_995_000_000).toISOString())
    expect('undefinedField' in doc).toBe(false)
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc)
  })

  it('the stored doc renders the same card as the Firestore doc', () => {
    const fromFirestore = docToNewsItem('n1', data, { mode: 'list' })
    const fromMirror = docToNewsItem('n1', toNewsMirrorRow('n1', data).doc as Record<string, unknown>, { mode: 'list' })
    expect(fromMirror).toEqual(fromFirestore)
  })

  it('falls back to the id for a missing slug', () => {
    expect(toNewsMirrorRow('abc', { title: 'x' }).slug).toBe('abc')
  })
})
