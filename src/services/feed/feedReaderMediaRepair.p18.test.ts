/**
 * P18 — Reader hero media repair: VALID terminal, Feed reuse, stale identity.
 * AUTOMATED — NOT HUMAN GO. No Production writes.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyHeroRuntimeEvent,
  readerHeroShouldBeUnoptimized,
  resolveReaderHero,
  selectReaderHeroCandidate,
  type HeroRuntimeSnapshot,
} from '@/lib/feed/reader/mediaPolicy'

const FEED_A = 'https://cdn.example.com/feed-a.jpg'
const READER_B = 'https://cdn.example.com/reader-worse.jpg'
const FEED_BRENT =
  'https://media.cumhuriyet.com.tr/Archive//c3ddc884-fbe9-49f0-911b-6523a8e793f9.jpg'
const FEED_OZTRAK =
  'https://indyturk.com/sites/default/files/article/main_image/2026/09/06/1379216-1290994433.png'

function snap(partial: Partial<HeroRuntimeSnapshot> = {}): HeroRuntimeSnapshot {
  return {
    articleId: 'article-a',
    url: FEED_A,
    epoch: 1,
    imageLoad: 'pending',
    loadTimedOut: false,
    ...partial,
  }
}

describe('P18 media repair — URL selection + Feed reuse', () => {
  it('1. Feed image A is first-choice Reader hero (same identity)', () => {
    expect(selectReaderHeroCandidate(FEED_A, null)).toBe(FEED_A)
    expect(selectReaderHeroCandidate(FEED_A, FEED_A)).toBe(FEED_A)
    const resolved = resolveReaderHero({
      feedImage: FEED_A,
      detailImage: FEED_A,
      bodySettled: true,
      imageLoad: 'ok',
      loadTimedOut: false,
    })
    expect(resolved.state).toBe('VALID_MEDIA')
    expect(resolved.url).toBe(FEED_A)
  })

  it('7. known-good Feed image is not replaced by poorer Reader enrichment', () => {
    expect(selectReaderHeroCandidate(FEED_A, READER_B)).toBe(FEED_A)
    expect(
      resolveReaderHero({
        feedImage: FEED_BRENT,
        detailImage: READER_B,
        bodySettled: true,
        imageLoad: 'ok',
        loadTimedOut: false,
      }).url
    ).toBe(FEED_BRENT)
  })

  it('detail image fills only when Feed has no usable URL', () => {
    expect(selectReaderHeroCandidate(null, READER_B)).toBe(READER_B)
    expect(selectReaderHeroCandidate('  ', READER_B)).toBe(READER_B)
    expect(selectReaderHeroCandidate(null, null)).toBe(null)
  })

  it('live Brent / Öztrak Feed hosts need unoptimized (optimizer 400 on unknown hosts)', () => {
    expect(readerHeroShouldBeUnoptimized(FEED_BRENT)).toBe(true)
    expect(readerHeroShouldBeUnoptimized(FEED_OZTRAK)).toBe(true)
    expect(readerHeroShouldBeUnoptimized('/local/hero.jpg')).toBe(false)
  })
})

describe('P18 media repair — VALID terminal + stale identity', () => {
  it('2. timeout after successful load remains VALID', () => {
    const afterOk = applyHeroRuntimeEvent(snap({ imageLoad: 'ok' }), {
      type: 'timeout',
      articleId: 'article-a',
      url: FEED_A,
      epoch: 1,
    })
    expect(afterOk).toEqual({ imageLoad: 'ok', loadTimedOut: false })
    expect(
      resolveReaderHero({
        feedImage: FEED_A,
        detailImage: null,
        bodySettled: true,
        imageLoad: afterOk.imageLoad,
        loadTimedOut: afterOk.loadTimedOut,
      }).state
    ).toBe('VALID_MEDIA')
  })

  it('3. stale timeout from previous URL is ignored', () => {
    const current = snap({ url: READER_B, epoch: 2, imageLoad: 'pending' })
    expect(
      applyHeroRuntimeEvent(current, {
        type: 'timeout',
        articleId: 'article-a',
        url: FEED_A,
        epoch: 1,
      })
    ).toEqual({ imageLoad: 'pending', loadTimedOut: false })
  })

  it('4. stale onError from previous URL is ignored', () => {
    const current = snap({ url: READER_B, epoch: 2, imageLoad: 'pending' })
    expect(
      applyHeroRuntimeEvent(current, {
        type: 'error',
        articleId: 'article-a',
        url: FEED_A,
        epoch: 1,
      })
    ).toEqual({ imageLoad: 'pending', loadTimedOut: false })
  })

  it('5. stale onLoad from previous URL is ignored', () => {
    const current = snap({ url: READER_B, epoch: 2, imageLoad: 'pending' })
    expect(
      applyHeroRuntimeEvent(current, {
        type: 'ok',
        articleId: 'article-a',
        url: FEED_A,
        epoch: 1,
      })
    ).toEqual({ imageLoad: 'pending', loadTimedOut: false })
  })

  it('6. article A callbacks cannot mutate article B', () => {
    const b = snap({
      articleId: 'article-b',
      url: READER_B,
      epoch: 3,
      imageLoad: 'pending',
    })
    expect(
      applyHeroRuntimeEvent(b, {
        type: 'error',
        articleId: 'article-a',
        url: FEED_A,
        epoch: 1,
      })
    ).toEqual({ imageLoad: 'pending', loadTimedOut: false })
    expect(
      applyHeroRuntimeEvent(b, {
        type: 'timeout',
        articleId: 'article-a',
        url: FEED_A,
        epoch: 1,
      })
    ).toEqual({ imageLoad: 'pending', loadTimedOut: false })
    expect(
      applyHeroRuntimeEvent(b, {
        type: 'ok',
        articleId: 'article-a',
        url: FEED_A,
        epoch: 1,
      })
    ).toEqual({ imageLoad: 'pending', loadTimedOut: false })
  })

  it('onError after VALID on same identity is ignored', () => {
    expect(
      applyHeroRuntimeEvent(snap({ imageLoad: 'ok' }), {
        type: 'error',
        articleId: 'article-a',
        url: FEED_A,
        epoch: 1,
      })
    ).toEqual({ imageLoad: 'ok', loadTimedOut: false })
  })

  it('late ok after timeout stays FAILED (no resurrection)', () => {
    const afterTimeout = applyHeroRuntimeEvent(snap(), {
      type: 'timeout',
      articleId: 'article-a',
      url: FEED_A,
      epoch: 1,
    })
    expect(afterTimeout.loadTimedOut).toBe(true)
    const late = applyHeroRuntimeEvent(snap({ loadTimedOut: true }), {
      type: 'ok',
      articleId: 'article-a',
      url: FEED_A,
      epoch: 1,
    })
    expect(late).toEqual({ imageLoad: 'pending', loadTimedOut: true })
    expect(
      resolveReaderHero({
        feedImage: FEED_A,
        detailImage: null,
        bodySettled: true,
        imageLoad: late.imageLoad,
        loadTimedOut: late.loadTimedOut,
      }).state
    ).toBe('FAILED_MEDIA')
  })

  it('8. true broken image → FAILED compact fallback', () => {
    const failed = applyHeroRuntimeEvent(snap(), {
      type: 'error',
      articleId: 'article-a',
      url: FEED_A,
      epoch: 1,
    })
    expect(failed.imageLoad).toBe('error')
    expect(
      resolveReaderHero({
        feedImage: FEED_A,
        detailImage: null,
        bodySettled: true,
        imageLoad: failed.imageLoad,
        loadTimedOut: failed.loadTimedOut,
      }).state
    ).toBe('FAILED_MEDIA')
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(src).toContain('feed-reader-hero-failed')
    expect(src).toContain('Görsel yüklenemedi')
    expect(src).not.toContain('feed-reader-hero-skeleton')
  })

  it('9. no image → NO_MEDIA and no hero gap', () => {
    expect(
      resolveReaderHero({
        feedImage: null,
        detailImage: null,
        bodySettled: true,
        imageLoad: 'pending',
        loadTimedOut: false,
      }).state
    ).toBe('NO_MEDIA')
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(src).toContain('{/* NO_MEDIA: no hero container */}')
  })

  it('LOADING exists only while current identity is pending and not timed out', () => {
    expect(
      resolveReaderHero({
        feedImage: FEED_A,
        detailImage: null,
        bodySettled: false,
        imageLoad: 'pending',
        loadTimedOut: false,
      }).state
    ).toBe('LOADING')
  })
})
