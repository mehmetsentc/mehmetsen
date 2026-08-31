/**
 * Hard safety: crawler must never enter the newsroom AI pipeline unless
 * CRAWLER_AI_DISPATCH_ENABLED is explicitly true. Phase 1 does not wire
 * newsQueue / DeepSeek even when that flag is true.
 */
export function isCrawlerAiDispatchEnabled(): boolean {
  const raw = process.env.CRAWLER_AI_DISPATCH_ENABLED?.trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'on'
}

export function crawlerAiDispatchDryRunStatus(): 'ON' | 'OFF' | 'TANIMSIZ' {
  const raw = process.env.CRAWLER_AI_DISPATCH_DRY_RUN
  if (raw == null || raw.trim() === '') return 'TANIMSIZ'
  const v = raw.trim().toLowerCase()
  if (v === 'true' || v === '1' || v === 'on') return 'ON'
  if (v === 'false' || v === '0' || v === 'off') return 'OFF'
  return 'TANIMSIZ'
}

export function isCrawlerAiDispatchDryRun(): boolean {
  return crawlerAiDispatchDryRunStatus() === 'ON'
}

export { mayAutomatedCrawlerUseAi, isManualEditorAiEnabled } from './automatedAiPolicy'

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
    reason: 'phase4a_provider_not_wired',
  }
}
