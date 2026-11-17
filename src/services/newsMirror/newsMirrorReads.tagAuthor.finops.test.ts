import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const st = vi.hoisted(() => ({ queries: [] as unknown[], rows: [] as unknown[] }))

vi.mock('@/db', () => ({
  hasDatabaseUrl: () => true,
  getDb: () => ({
    execute: async (q: unknown) => {
      st.queries.push(q)
      return { rows: st.rows }
    },
  }),
}))

import { PgDialect } from 'drizzle-orm/pg-core'
import { isMirrorReadEnabled, loadMirrorAuthorDocs, loadMirrorTagDocs } from './newsMirrorReads'

const dialect = new PgDialect()
const render = (q: unknown) => dialect.sqlToQuery(q as never)

describe('news_read_mirror tag/author reads', () => {
  beforeEach(() => {
    st.queries = []
    st.rows = [{ id: 'a1', data: { title: 'T', status: 'published' } }]
    delete process.env.NEWS_PG_READ_TAG_AUTHOR
  })

  it('is off unless NEWS_PG_READ_TAG_AUTHOR=1', () => {
    expect(isMirrorReadEnabled('tagAuthor')).toBe(false)
    process.env.NEWS_PG_READ_TAG_AUTHOR = '1'
    expect(isMirrorReadEnabled('tagAuthor')).toBe(true)
  })

  it('tag query: published, array overlap with every variant, newest first, limited', async () => {
    const rows = await loadMirrorTagDocs(['ekonomi', 'Ekonomi', ''], 20, ['title', 'slug'])
    expect(rows).toEqual([{ id: 'a1', data: { title: 'T', status: 'published' } }])
    const { sql, params } = render(st.queries[0])
    expect(sql).toMatch(/status = 'published'/)
    expect(sql).toMatch(/tags && ARRAY\[\$1, \$2\]::text\[\]/)
    expect(sql).toMatch(/order by published_at desc nulls last, id desc/)
    expect(params).toEqual(['ekonomi', 'Ekonomi', 20])
  })

  it('tag query with no usable variants does not hit the database', async () => {
    expect(await loadMirrorTagDocs(['', '  '], 20, ['title'])).toEqual([])
    expect(st.queries).toHaveLength(0)
  })

  it('author query: exact author id, publishedAt required, newest first', async () => {
    await loadMirrorAuthorDocs(' u1 ', 40, ['title'])
    const { sql, params } = render(st.queries[0])
    expect(sql).toMatch(/author_id = \$1/)
    expect(sql).toMatch(/published_at is not null/)
    expect(sql).toMatch(/order by published_at desc, id desc/)
    expect(params).toEqual(['u1', 40])
  })

  it('rejects unsafe field names', async () => {
    await expect(loadMirrorAuthorDocs('u1', 5, ["title'--"])).rejects.toThrow('bad field name')
  })
})
