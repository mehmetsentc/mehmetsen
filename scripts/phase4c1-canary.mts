/**
 * Phase 4C.1 one-shot: preflight + optional paid canary for the authorized event.
 * Usage:
 *   npx tsx scripts/phase4c1-canary.mts              # preflight only
 *   npx tsx scripts/phase4c1-canary.mts --execute    # paid path (requires gates)
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!(k in process.env)) process.env[k] = v
  }
}

loadEnvLocal()

// Fail-closed peak rates if unset (official api-docs.deepseek.com 2026-08-20)
if (!process.env.DEEPSEEK_INPUT_COST_PER_1M) process.env.DEEPSEEK_INPUT_COST_PER_1M = '0.44'
if (!process.env.DEEPSEEK_OUTPUT_COST_PER_1M) process.env.DEEPSEEK_OUTPUT_COST_PER_1M = '1.32'
if (!process.env.DEEPSEEK_CACHE_HIT_COST_PER_1M) process.env.DEEPSEEK_CACHE_HIT_COST_PER_1M = '0.014'
if (!process.env.DEEPSEEK_CACHE_MISS_COST_PER_1M) process.env.DEEPSEEK_CACHE_MISS_COST_PER_1M = '0.44'

const execute = process.argv.includes('--execute')
if (execute) {
  process.env.CANARY_PAID_EXECUTION_ENABLED = 'true'
}

const EVENT_ID = 'cl_7457f2e8-d45f-44e2-a50c-dbc467a3454c'

async function main() {
  const { DrizzleCrawlerStore } = await import('../src/services/crawler/store/drizzle')
  const { runCanaryStage } = await import('../src/services/crawler/canary/execute')
  const { DrizzleCanaryStore } = await import('../src/services/crawler/canary/drizzleStore')
  const { createDeepSeekCanaryProvider } = await import('../src/services/crawler/canary/provider')
  const { isAuthorizedPaidCanaryEvent } = await import('../src/services/crawler/canary/authorizedEvent')
  const { APPROVED_FOR_REAL_CANARY_EXECUTION } = await import('../src/services/crawler/canary/types')
  const { isCrawlerAiDispatchEnabled } = await import('../src/services/crawler/dispatch')
  const { isLegacyDirectAiEnabled } = await import('../src/services/crawler/legacyFlags')
  const { probeCanaryPricing } = await import('../src/services/crawler/canary/preflight')

  if (!isAuthorizedPaidCanaryEvent(EVENT_ID)) {
    throw new Error('EVENT_NOT_AUTHORIZED')
  }

  const store = new DrizzleCrawlerStore()
  const cluster = await store.getCluster(EVENT_ID)
  if (!cluster) throw new Error('cluster not found')
  const memberships = await store.listMemberships(EVENT_ID)
  const members = []
  for (const m of memberships) {
    const article = await store.getRawArticle(m.articleId)
    const source = article ? await store.getSource(article.sourceId) : null
    const media = article ? await store.listArticleMedia(article.id) : []
    if (!article) continue
    members.push({
      articleId: article.id,
      sourceId: article.sourceId,
      sourceName: source?.name || article.sourceId,
      qualityTier: source?.qualityTier || 'UNTESTED',
      healthScore: source?.healthScore ?? 50,
      extractionConfidence: article.extractionConfidence,
      publishedAt: article.publishedAt,
      fetchedAt: article.fetchedAt,
      title: article.title,
      body: article.articleBodyText,
      description: article.description,
      contentHash: article.contentHash,
      wordCount: article.wordCount,
      isExactDuplicate: article.isExactDuplicate,
      editorialStatus: article.editorialStatus,
      editorialNewsId: article.editorialNewsId,
      sourceStatus: source?.status || 'ACTIVE',
      hasMedia: media.length > 0,
    })
  }

  const pricing = probeCanaryPricing()
  console.log(
    JSON.stringify(
      {
        mode: execute ? 'EXECUTE_PAID' : 'PREFLIGHT',
        eventId: EVENT_ID,
        title: cluster.canonicalTitle,
        sources: members.map((m) => m.sourceName),
        crawlerAiDispatchEnabled: isCrawlerAiDispatchEnabled(),
        legacyDirectAiEnabled: isLegacyDirectAiEnabled(),
        pricing,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  )

  if (isCrawlerAiDispatchEnabled() || isLegacyDirectAiEnabled()) {
    throw new Error('GLOBAL_AI_GATES_MUST_STAY_OFF')
  }
  if (!pricing.known) throw new Error('COST_UNKNOWN')

  const result = await runCanaryStage({
    cluster: {
      id: cluster.id,
      eventKey: cluster.eventKey,
      canonicalTitle: cluster.canonicalTitle,
      normalizedTopic: cluster.normalizedTopic,
      countryCode: cluster.countryCode,
      region: cluster.region,
      city: cluster.city,
      district: cluster.district,
      editorialDecision: cluster.editorialDecision,
      aiEligibility: cluster.aiEligibility,
      uniqueSourceCount: cluster.uniqueSourceCount,
      importanceScore: cluster.importanceScore,
      publishedNewsId: cluster.publishedNewsId,
      firstSeenAt: cluster.firstSeenAt,
      lastSeenAt: cluster.lastSeenAt,
      hasMaterialUpdate: cluster.hasMaterialUpdate,
    },
    members,
    store: new DrizzleCanaryStore(),
    executePaid: execute,
    confirmation: execute ? APPROVED_FOR_REAL_CANARY_EXECUTION : null,
    provider: execute ? createDeepSeekCanaryProvider() : undefined,
  })

  const pre = result.preflight
  const inputEst =
    pricing.inputCostPer1M != null
      ? (pre.estimatedInputTokens / 1_000_000) * pricing.inputCostPer1M
      : null
  const outputMax =
    pricing.outputCostPer1M != null
      ? (pre.estimatedOutputTokens / 1_000_000) * pricing.outputCostPer1M
      : null

  console.log(
    JSON.stringify(
      {
        paidCallExecuted: result.paidCallExecuted,
        autoPublished: result.autoPublished,
        messageTr: result.messageTr,
        preflight: {
          state: pre.state,
          blockedReason: pre.blockedReason,
          ready: pre.ready,
          model: pre.model,
          provider: pre.provider,
          estimatedInputTokens: pre.estimatedInputTokens,
          estimatedOutputTokens: pre.estimatedOutputTokens,
          estimatedCostUsd: pre.estimatedCostUsd,
          inputEstCostUsd: inputEst,
          outputMaxCostUsd: outputMax,
          maxCostUsdPerEvent: pre.maxCostUsdPerEvent,
          pricingKnown: pre.pricingKnown,
          inputCostPer1M: pre.inputCostPer1M,
          outputCostPer1M: pre.outputCostPer1M,
          sources: pre.sources,
          packMetrics: pre.packMetrics,
        },
        job: result.job
          ? {
              id: result.job.id,
              state: result.job.state,
              requestCount: result.job.requestCount,
              estimatedCostUsd: result.job.estimatedCostUsd,
              actualInputTokens: result.job.actualInputTokens,
              actualOutputTokens: result.job.actualOutputTokens,
              actualCostUsd: result.job.actualCostUsd,
              draftStatus: result.job.draftStatus,
              editorialDraftId: result.job.editorialDraftId,
              blockedReason: result.job.blockedReason,
              failureReason: result.job.failureReason,
              model: result.job.model,
              lane: result.job.lane,
              draftTitle: result.job.draft?.title ?? null,
              validationOk: result.job.validation?.ok ?? null,
            }
          : null,
      },
      null,
      2
    )
  )

  if (execute && result.paidCallExecuted && result.job?.actualCostUsd != null && result.job.actualCostUsd > 0.05) {
    console.error('ALARM: actual cost exceeded $0.05 — do NOT open global dispatch')
    process.exit(2)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
