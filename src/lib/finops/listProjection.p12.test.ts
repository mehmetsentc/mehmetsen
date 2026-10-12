import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * FinOps 12 Oct: list/sitemap reads must not ship article body HTML.
 * Every Firestore `.limit(` in these files has to sit behind a field mask.
 */
const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

function firestoreLimitLines(src: string): string[] {
  const lines = src.split('\n')
  return lines.filter((line, i) => {
    if (!line.includes('.limit(')) return false
    const back = lines.slice(Math.max(0, i - 8), i + 1).join('\n')
    return /collection\((NEWS_COLLECTION|Collections\.NEWS)\)|q\.orderBy\('publishedAt'/.test(back) &&
      !/drizzle|\.from\(/.test(back)
  })
}

describe('FinOps list projections (12 Oct)', () => {
  it('city news Firestore reads use CITY_NEWS_CARD_FIELDS', () => {
    const src = read('src/services/cityNewsService.server.ts')
    const lines = firestoreLimitLines(src)
    expect(lines.length).toBeGreaterThanOrEqual(9)
    for (const line of lines) expect(line).toContain('.select(...CITY_NEWS_CARD_FIELDS)')
    expect(src).not.toMatch(/CITY_NEWS_CARD_FIELDS[^\n]*'content'/)
  })

  it('image and video sitemaps read only sitemap + classifier fields', () => {
    for (const [file, mask] of [
      ['src/app/images-sitemap.xml/route.ts', 'IMAGE_SITEMAP_FIELDS'],
      ['src/app/video-sitemap.xml/route.ts', 'VIDEO_SITEMAP_FIELDS'],
    ] as const) {
      const src = read(file)
      expect(src).toContain(`.select(...${mask})`)
      for (const f of ['seoNoindex', 'publicationAuthority', 'needsAdminReview', 'slug', 'title']) {
        expect(src).toMatch(new RegExp(`${mask} = \\[[^\\]]*'${f}'`))
      }
      expect(src).not.toMatch(new RegExp(`${mask} = \\[[^\\]]*'content'`))
    }
  })

  it('home featured scans use the card field mask', () => {
    const src = read('src/services/newsService.server.ts')
    const fn = src.slice(src.indexOf('async function fetchFeaturedNews('), src.indexOf('const getFeaturedNewsCached'))
    expect(fn.match(/selectNewsCardFields\(/g)?.length).toBe(3)
  })
})
