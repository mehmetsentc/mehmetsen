import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FEED_V2_BRAND_MARK_SRC } from '@/components/feed/smart/FeedV2BrandLoader'

describe('Feed 2 brand loader', () => {
  it('uses the app favicon mark', () => {
    expect(FEED_V2_BRAND_MARK_SRC).toBe('/apple-touch-icon.png')
  })

  it('route loading and first-load skeleton mount the brand loader', () => {
    const loading = readFileSync(join(process.cwd(), 'src/app/(main)/feed-v2/loading.tsx'), 'utf8')
    const skeleton = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCardSkeleton.tsx'),
      'utf8'
    )
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

    expect(loading).toContain('FeedV2BrandLoader')
    expect(skeleton).toContain('FeedV2BrandLoader')
    expect(skeleton).toContain('smart-feed-skeleton')
    expect(skeleton).toContain('FEED_READER_SURFACE_CLASS')
    expect(css).toContain('.feed-v2-brand-loader')
    expect(css).toContain('@keyframes feed-v2-brand-breathe')
  })
})
