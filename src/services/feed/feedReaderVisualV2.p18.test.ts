/**
 * P18 — Feed Reader Visual V2: dark-first, media state machine, interactive page-turn.
 * AUTOMATED — NOT HUMAN GO. No Production writes.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  firstBodyImageSrc,
  resolveReaderHero,
  stripDuplicateHeroFromBodyHtml,
  urlsEquivalent,
} from '@/lib/feed/reader/mediaPolicy'
import { sanitizeFeedReaderHtml } from '@/lib/feed/reader/sanitizeBodyHtml'
import { FEED_READER_CSS_VARS, FEED_READER_HERO_LOAD_TIMEOUT_MS } from '@/lib/feed/reader/tokens'

describe('P18 Reader media state machine', () => {
  it('NO_MEDIA when no candidate URL', () => {
    expect(
      resolveReaderHero({
        feedImage: null,
        detailImage: null,
        bodySettled: true,
        imageLoad: 'pending',
        loadTimedOut: false,
      }).state
    ).toBe('NO_MEDIA')
  })

  it('LOADING → VALID_MEDIA / FAILED_MEDIA', () => {
    expect(
      resolveReaderHero({
        feedImage: 'https://cdn.example.com/a.jpg',
        detailImage: null,
        bodySettled: false,
        imageLoad: 'pending',
        loadTimedOut: false,
      }).state
    ).toBe('LOADING')
    expect(
      resolveReaderHero({
        feedImage: 'https://cdn.example.com/a.jpg',
        detailImage: null,
        bodySettled: true,
        imageLoad: 'ok',
        loadTimedOut: false,
      }).state
    ).toBe('VALID_MEDIA')
    expect(
      resolveReaderHero({
        feedImage: 'https://cdn.example.com/a.jpg',
        detailImage: null,
        bodySettled: true,
        imageLoad: 'pending',
        loadTimedOut: true,
      }).state
    ).toBe('FAILED_MEDIA')
    expect(
      resolveReaderHero({
        feedImage: 'https://cdn.example.com/a.jpg',
        detailImage: null,
        bodySettled: true,
        imageLoad: 'error',
        loadTimedOut: false,
      }).state
    ).toBe('FAILED_MEDIA')
  })

  it('late ok after timeout stays FAILED (no resurrection)', () => {
    expect(
      resolveReaderHero({
        feedImage: 'https://cdn.example.com/a.jpg',
        detailImage: null,
        bodySettled: true,
        imageLoad: 'ok',
        loadTimedOut: true,
      }).state
    ).toBe('FAILED_MEDIA')
  })

  it('ok before timeout remains VALID even if body already settled', () => {
    expect(
      resolveReaderHero({
        feedImage: 'https://cdn.example.com/a.jpg',
        detailImage: null,
        bodySettled: true,
        imageLoad: 'ok',
        loadTimedOut: false,
      }).state
    ).toBe('VALID_MEDIA')
  })

  it('hero load timeout is bounded', () => {
    expect(FEED_READER_HERO_LOAD_TIMEOUT_MS).toBeGreaterThanOrEqual(2000)
    expect(FEED_READER_HERO_LOAD_TIMEOUT_MS).toBeLessThanOrEqual(8000)
  })

  it('strips duplicate body hero img', () => {
    const body =
      '<figure><img src="https://cdn.example.com/a.jpg" alt=""/><figcaption>x</figcaption></figure><p>y</p>'
    expect(firstBodyImageSrc(body)).toBe('https://cdn.example.com/a.jpg')
    expect(urlsEquivalent('https://cdn.example.com/a.jpg', 'https://cdn.example.com/a.jpg')).toBe(
      true
    )
    const stripped = stripDuplicateHeroFromBodyHtml(body, 'https://cdn.example.com/a.jpg')
    expect(stripped).not.toContain('<img')
    expect(stripped).toContain('<p>y</p>')
  })
})

describe('P18 Reader dark visual + presentation override', () => {
  it('tokens are dark-first (no cream paper)', () => {
    expect(FEED_READER_CSS_VARS['--reader-page-bg']).toBe('#0c0c0e')
    expect(FEED_READER_CSS_VARS['--reader-page-text']).toBe('#f4f1ea')
    expect(FEED_READER_CSS_VARS['--reader-accent']).toBe('#e11d2e')
    expect(JSON.stringify(FEED_READER_CSS_VARS)).not.toContain('#f7f4ef')
  })

  it('sanitizer strips source color/style/class so Reader theme wins', () => {
    const dirty =
      '<h2 style="color:#fff" class="prose" color="#fff">Siyasi Kariyerini Anlattı</h2><p style="color:white">x</p>'
    const clean = sanitizeFeedReaderHtml(dirty)
    expect(clean).toContain('<h2>')
    expect(clean).toContain('Siyasi Kariyerini Anlattı')
    expect(clean).not.toContain('style=')
    expect(clean).not.toContain('class=')
    expect(clean).not.toContain('color=')
  })

  it('Reader + Feed source contracts for dark chrome and interactive progress', () => {
    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(reader).toContain('feed-reader-article')
    expect(reader).toContain('committed')
    expect(reader).toContain('visualProgress')
    expect(reader).toContain('feed-reader-hero-loading')
    expect(reader).toContain('feed-reader-hero-failed')
    expect(reader).toContain('resolveReaderHero')
    expect(reader).toContain('heroEpochRef')
    expect(reader).toContain('acceptHeroLoad')
    expect(reader).not.toContain('#f7f4ef')
    expect(reader).toContain('translate3d(${(1 - progress) * 100}%, 0, 0)')

    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('onOpenReaderProgress')
    expect(client).toContain('onOpenReaderCancel')
    expect(client).toContain('skipRamp: true')
    expect(client).toContain('readerOpenGuardRef')
    expect(client).toContain('#0c0c0e')
    expect(client).not.toContain('#f7f4ef')
    expect(client).toContain('progressAnimating: true')
    expect(client).toContain('translate3d(${-dragProgress * 100}%, 0, 0)')
  })

  it('page-turn transforms differ at 25/50/75%', () => {
    const feedAt = (p: number) => -p * 100
    const readerAt = (p: number) => (1 - p) * 100
    expect(feedAt(0.25)).toBe(-25)
    expect(readerAt(0.25)).toBe(75)
    expect(feedAt(0.5)).toBe(-50)
    expect(readerAt(0.5)).toBe(50)
    expect(feedAt(0.75)).toBe(-75)
    expect(readerAt(0.75)).toBe(25)
    expect(feedAt(0.25)).not.toBe(feedAt(0.5))
    expect(readerAt(0.25)).not.toBe(readerAt(0.75))
  })

  it('CSS forced colors are Reader-scoped only (no bare h2/h3/h4)', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    const start = css.indexOf('Feed Reader V2')
    const end = css.indexOf('Dark floating capsule', start)
    const block = css.slice(start, end)
    expect(block).toContain('.feed-reader-article .reader-body h2')
    expect(block).toContain('.feed-reader-article .feed-reader-body h2')
    expect(block).not.toMatch(/(^|\n)\s*h2\s*\{/)
    expect(block).not.toMatch(/(^|\n)\s*h3\s*\{/)
    expect(block).not.toMatch(/(^|\n)\s*\.reader-body h2/)
    // bare ".reader-body h2" without feed-reader-article prefix must not appear
    expect(block.includes('\n  .reader-body h2')).toBe(false)
    expect(block.includes('\n  .reader-body {')).toBe(false)
  })
})
