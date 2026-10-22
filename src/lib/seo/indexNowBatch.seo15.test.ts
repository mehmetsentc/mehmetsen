import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => { throw new Error('no db in test') } }))
import { INDEXNOW_FIRST_RUN_LOOKBACK_MS, INDEXNOW_MAX_PER_RUN, isIndexNowBatchEnabled, pickIndexNowBatch } from './indexNowBatch'
import { withSocialUtm } from '@/lib/social/utm'

const NOW = Date.UTC(2026, 9, 23, 10)
const e = (slug: string, hoursAgo: number) => ({ slug, publishedMs: NOW - hoursAgo * 3600_000, title: slug })

describe('SEO-15 IndexNow batch', () => {
  it('first run only takes the recent hours, oldest first, and advances the cursor', () => {
    const r = pickIndexNowBatch([e('a', 1), e('b', 3), e('old', 20)], null, NOW)
    expect(r.slugs).toEqual(['b', 'a'])
    expect(r.nextCursorMs).toBe(NOW - 3600_000)
    expect(NOW - INDEXNOW_FIRST_RUN_LOOKBACK_MS).toBeLessThan(NOW - 3 * 3600_000)
  })

  it('later runs submit only stories newer than the cursor', () => {
    const r = pickIndexNowBatch([e('a', 1), e('b', 3)], NOW - 2 * 3600_000, NOW)
    expect(r.slugs).toEqual(['a'])
    expect(pickIndexNowBatch([e('b', 3)], NOW - 2 * 3600_000, NOW)).toEqual({ slugs: [], nextCursorMs: NOW - 2 * 3600_000 })
  })

  it('caps one run', () => {
    const many = Array.from({ length: INDEXNOW_MAX_PER_RUN + 20 }, (_, i) => e(`s${i}`, (i + 1) / 1000))
    expect(pickIndexNowBatch(many, null, NOW).slugs).toHaveLength(INDEXNOW_MAX_PER_RUN)
  })

  it('runs only in production and has a kill switch', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(isIndexNowBatchEnabled()).toBe(false)
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(isIndexNowBatchEnabled()).toBe(true)
    vi.stubEnv('INDEXNOW_BATCH', 'off')
    expect(isIndexNowBatchEnabled()).toBe(false)
    vi.unstubAllEnvs()
  })
})

describe('SOCIAL-UTM-1', () => {
  it('tags the article link per platform/format/account', () => {
    const u = new URL(withSocialUtm('https://www.nahaber.com/haber/x', { platform: 'instagram', format: 'reel', accountId: 'instagram_1784' })!)
    expect(u.pathname).toBe('/haber/x')
    expect(u.searchParams.get('utm_source')).toBe('instagram')
    expect(u.searchParams.get('utm_medium')).toBe('social')
    expect(u.searchParams.get('utm_campaign')).toBe('reel')
    expect(u.searchParams.get('utm_content')).toBe('instagram_1784')
  })

  it('keeps existing tags, empty links and bad URLs as they are', () => {
    expect(withSocialUtm('https://www.nahaber.com/haber/x?utm_source=a', { platform: 'facebook', format: 'post' })).toBe('https://www.nahaber.com/haber/x?utm_source=a')
    expect(withSocialUtm('', { platform: 'facebook', format: 'post' })).toBeUndefined()
    expect(withSocialUtm('not a url', { platform: 'facebook', format: 'post' })).toBe('not a url')
  })
})
