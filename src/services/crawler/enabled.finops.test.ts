import { afterEach, describe, expect, it, vi } from 'vitest'
import { isGlobalCrawlerEnabled } from '@/services/crawler/enabled'
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

  it('leaves paid AI closed unless a flag is explicitly true', () => {
    vi.stubEnv('LEGACY_DIRECT_AI_ENABLED', '')
    vi.stubEnv('MANUAL_EDITOR_AI_ENABLED', '')
    expect(isLegacyDirectAiEnabled()).toBe(false)
    expect(isManualEditorAiEnabled()).toBe(false)
  })
})
