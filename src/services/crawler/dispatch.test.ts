import { afterEach, describe, expect, it } from 'vitest'
import { dispatchCrawlerArticleToNewsroom, isCrawlerAiDispatchEnabled } from './dispatch'

describe('crawler AI dispatch hard-block', () => {
  afterEach(() => {
    delete process.env.CRAWLER_AI_DISPATCH_ENABLED
  })

  it('defaults OFF', () => {
    expect(isCrawlerAiDispatchEnabled()).toBe(false)
    const result = dispatchCrawlerArticleToNewsroom({ articleId: 'raw_1' })
    expect(result.dispatched).toBe(false)
    expect(result.aiRequests).toBe(0)
    expect(result.reason).toContain('CRAWLER_AI_DISPATCH_ENABLED=false')
  })

  it('does not dispatch even when the flag is true (Phase 1 unwired)', () => {
    process.env.CRAWLER_AI_DISPATCH_ENABLED = 'true'
    expect(isCrawlerAiDispatchEnabled()).toBe(true)
    const result = dispatchCrawlerArticleToNewsroom({ articleId: 'raw_1' })
    expect(result.dispatched).toBe(false)
    expect(result.aiRequests).toBe(0)
    expect(result.reason).toContain('phase4a_provider_not_wired')
  })
})
