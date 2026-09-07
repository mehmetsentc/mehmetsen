import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROUTES } from '@/constants/routes'
import { isFeedV3Pathname, isFeedV2Pathname } from '@/lib/feed/reader/shellChrome'

describe('Feed V3 bottom-sheet experiment (local)', () => {
  it('routes and chrome treat /feed-v3 as immersive feed', () => {
    expect(ROUTES.FEED_V3).toBe('/feed-v3')
    expect(isFeedV3Pathname('/feed-v3')).toBe(true)
    expect(isFeedV2Pathname('/feed-v3')).toBe(true)
  })

  it('page mounts SmartFeedClient in sheet presentation', () => {
    const page = readFileSync(
      join(process.cwd(), 'src/app/(main)/feed-v3/page.tsx'),
      'utf8'
    )
    expect(page).toContain('presentation="sheet"')
    expect(page).toContain('data-feed-v3')
  })

  it('sheet component + upward coach exist', () => {
    const sheet = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleBottomSheet.tsx'),
      'utf8'
    )
    const coach = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SheetOpenCoach.tsx'),
      'utf8'
    )
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(sheet).toContain('feed-v3-article-sheet')
    expect(sheet).toContain('feed-v3-article-sheet-scroll')
    expect(coach).toContain('Yukarı kaydır veya dokun')
    expect(client).toContain("presentation === 'sheet'")
    expect(client).toContain('onOpenSheetGesture')
    expect(client).toContain('FeedArticleBottomSheet')
  })
})
