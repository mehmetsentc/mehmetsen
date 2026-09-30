import { afterEach, describe, expect, it, vi } from 'vitest'
import { crawlerTickLimits, isGlobalCrawlerEnabled } from '@/services/crawler/enabled'
import { isLegacyDirectAiEnabled } from '@/services/crawler/legacyFlags'
import { isManualEditorAiEnabled } from '@/services/crawler/automatedAiPolicy'

describe('minimum-cost crawler switch', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('runs on Vercel production when the flag is unset', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('GLOBAL_CRAWLER_ENABLED', '')
    vi.stubEnv('NEWS_CRAWLER_ENABLED', '')
    expect(isGlobalCrawlerEnabled()).toBe(true)
  })

  it('stays off outside production when the flag is unset', () => {
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('GLOBAL_CRAWLER_ENABLED', '')
    vi.stubEnv('NEWS_CRAWLER_ENABLED', '')
    expect(isGlobalCrawlerEnabled()).toBe(false)
  })

  it('still crawls in production when the freeze left the flag false', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('GLOBAL_CRAWLER_ENABLED', 'false')
    expect(isGlobalCrawlerEnabled()).toBe(true)
  })

  it('fetches a useful batch and still finishes inside the half-hour gap', () => {
    vi.stubEnv('NEWS_CRAWLER_MAX_SOURCES_PER_TICK', '')
    vi.stubEnv('NEWS_CRAWLER_MAX_FETCH_PER_TICK', '')
    vi.stubEnv('NEWS_CRAWLER_MAX_TICK_RUNTIME_MS', '')
    const limits = crawlerTickLimits()
    expect(limits.maxSourcesPerTick).toBe(25)
    expect(limits.maxFetchPerTick).toBe(40)
    expect(limits.maxTickRuntimeMs).toBe(150_000)
    expect(limits.maxTickRuntimeMs).toBeLessThan(3 * 60_000)
  })

  it('leaves paid AI closed unless a flag is explicitly true', () => {
    vi.stubEnv('LEGACY_DIRECT_AI_ENABLED', '')
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', '')
    expect(isLegacyDirectAiEnabled()).toBe(false)
    expect(isManualEditorAiEnabled()).toBe(false)
  })
})
