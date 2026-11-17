import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  NEWS_CARD_FIRESTORE_FIELDS,
  NEWS_DAY_FEED_FIRESTORE_FIELDS,
  isArticleBodyField,
} from '@/lib/news/cardFirestoreFields'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('FinOps 17 Nov: day feed projection', () => {
  const news = read('src/services/newsService.server.ts')
  const dayFeed = news.slice(
    news.indexOf('async function hasPublishedBefore('),
    news.indexOf('/**\n * Load one Turkey calendar day')
  )

  it('never reads article bodies for the day feed', () => {
    expect(NEWS_DAY_FEED_FIRESTORE_FIELDS.some((f) => isArticleBodyField(f))).toBe(false)
    for (const f of NEWS_CARD_FIRESTORE_FIELDS) expect(NEWS_DAY_FEED_FIRESTORE_FIELDS).toContain(f)
    for (const f of ['readingTimeMinutes', 'views', 'likesCount', 'commentsCount', 'sharesCount', 'seoTitle', 'articleFormat']) {
      expect(NEWS_DAY_FEED_FIRESTORE_FIELDS).toContain(f)
    }
  })

  it('projects both day queries and the existence check', () => {
    expect(dayFeed.match(/selectNewsDayFeedFields\(q\)\.get\(\)/g)?.length).toBe(2)
    expect(dayFeed).not.toMatch(/const snap = await q\.get\(\)/)
    expect(dayFeed).toContain("q.select('publishedAt')")
  })
})

describe('FinOps 17 Nov: Neon phase 2.2 (tag + author lists)', () => {
  const news = read('src/services/newsService.server.ts')
  const tagBlock = news.slice(news.indexOf('const getPostsByTagCached'), news.indexOf('export async function getPostsByTag('))
  const authorBlock = news.slice(news.indexOf('const getPostsByAuthorIdCached'), news.indexOf('export async function getPostsByAuthorId('))

  it('reads the mirror first behind its own flag and falls back to Firestore', () => {
    for (const block of [tagBlock, authorBlock]) {
      expect(block).toContain("isMirrorReadEnabled('tagAuthor')")
      expect(block.indexOf("isMirrorReadEnabled('tagAuthor')")).toBeLessThan(block.indexOf('getAdminFirestore()'))
      expect(block).toMatch(/catch \(mirrorError\)/)
    }
    expect(tagBlock).toContain('loadMirrorTagDocs(variants, TAG_LIST_LIMIT, NEWS_CARD_FIRESTORE_FIELDS)')
    expect(authorBlock).toContain('loadMirrorAuthorDocs(authorId, limitCount, NEWS_CARD_FIRESTORE_FIELDS)')
  })

  it('mirror flag is NEWS_PG_READ_TAG_AUTHOR', () => {
    const reads = read('src/services/newsMirror/newsMirrorReads.ts')
    expect(reads).toContain("tagAuthor: 'NEWS_PG_READ_TAG_AUTHOR'")
    expect(reads).toContain('tags && ${arr}')
    expect(reads).toContain('author_id = ${id}')
  })
})

describe('FinOps 17 Nov: city events cached across instances', () => {
  it('wraps the paginated scan in a 10 min data cache', () => {
    const ev = read('src/services/eventService.server.ts')
    expect(ev).toContain('CITY_EVENTS_REVALIDATE_S = 600')
    expect(ev).toContain("['city-events-server-v1']")
    expect(ev).toMatch(/export async function getCityEventsServer\([\s\S]*?getCityEventsServerCached\(/)
  })
})
