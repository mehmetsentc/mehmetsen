/**
 * Hard safety: crawler must never enter the newsroom AI pipeline unless
 * CRAWLER_AI_DISPATCH_ENABLED is explicitly true. Phase 1 does not wire
 * newsQueue / DeepSeek even when that flag is true.
 */
export function isCrawlerAiDispatchEnabled(): boolean {
  const raw = process.env.CRAWLER_AI_DISPATCH_ENABLED?.trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'on'
}

export type CrawlerDispatchResult = {
  dispatched: false
  aiRequests: 0
  reason: string
}

export function dispatchCrawlerArticleToNewsroom(_input?: {
  articleId?: string
  sourceId?: string
}): CrawlerDispatchResult {
  if (!isCrawlerAiDispatchEnabled()) {
    return {
      dispatched: false,
      aiRequests: 0,
      reason: 'CRAWLER_AI_DISPATCH_ENABLED=false',
    }
  }
  return {
    dispatched: false,
    aiRequests: 0,
    reason: 'phase1_dispatch_not_wired',
  }
}
