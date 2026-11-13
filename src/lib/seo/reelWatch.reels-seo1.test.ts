import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildReelVideoJsonLd, isoDuration, reelWatchPath } from './reelWatch'
import { utmLandingProps } from '@/components/layout/UtmLandingTracker'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('REELS-SEO-1 reel watch pages', () => {
  it('watch path, ISO duration and VideoObject', () => {
    expect(reelWatchPath('sadik-karayel')).toBe('/video/sadik-karayel')
    expect(isoDuration(42.4)).toBe('PT42S')
    expect(isoDuration(null)).toBeNull()
    const ld = buildReelVideoJsonLd({
      title: 'Başlık', description: 'Özet', pageUrl: 'https://www.nahaber.com/video/x',
      articleUrl: 'https://www.nahaber.com/haber/x', videoUrl: 'https://storage.googleapis.com/b/videos/reels/x.mp4',
      thumbnailUrl: 'https://cdn/x.jpg', uploadDate: '2026-10-30T10:00:00Z', seconds: 38,
      siteUrl: 'https://www.nahaber.com', siteName: 'NaHaber',
    })
    expect(ld['@type']).toBe('VideoObject')
    expect(ld.contentUrl).toContain('/videos/reels/')
    expect(ld.duration).toBe('PT38S')
    expect(ld.mainEntityOfPage).toBe('https://www.nahaber.com/video/x')
  })

  it('page follows the story robots, sitemap lists indexable reels, article links to the watch page', () => {
    const page = read('src/app/(main)/video/[slug]/page.tsx')
    expect(page).toContain('articleRobots(post)')
    expect(page).toContain("robots.index ? { index: true, follow: true }")
    expect(page).toContain('alternates: { canonical: url }')
    expect(read('src/app/video-sitemap.xml/route.ts')).toContain('listIndexableReels(200)')
    expect(read('src/lib/seo/reelWatch.server.ts')).toContain('if (!articleRobots(post).index) return')
    expect(read('src/components/news/NewsArticleStatic.tsx')).toContain('reelWatchPath(post.slug)')
  })
})

describe('SOCIAL-UTM-2 social landing event', () => {
  it('only tagged social links produce an event', () => {
    expect(utmLandingProps('?utm_source=instagram&utm_medium=social&utm_campaign=reel&utm_content=instagram_1')).toEqual({
      source: 'instagram', campaign: 'reel', account: 'instagram_1',
    })
    expect(utmLandingProps('?utm_source=newsletter&utm_medium=email')).toBeNull()
    expect(utmLandingProps('')).toBeNull()
  })
})

describe('SEO-17 /yerel/{il} crawl links', () => {
  it('news-sitemap entries carry citySlug and the province page renders the filtered list', () => {
    expect(read('src/lib/sitemap/newsSitemap.ts')).toContain('...(citySlug ? { citySlug } : {})')
    expect(read('src/components/category/LatestNewsLinkList.tsx')).toContain('entries.filter((e) => e.citySlug === opts.citySlug)')
    expect(read('src/app/(main)/yerel/[citySlug]/page.tsx')).toContain('loadLatestNewsLinks({ citySlug, limit: 30 })')
  })
})
