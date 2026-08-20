/**
 * Phase 4C.2 — SECOND CANARY PREFLIGHT ONLY (no paid DeepSeek).
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
if (!process.env.DEEPSEEK_INPUT_COST_PER_1M) process.env.DEEPSEEK_INPUT_COST_PER_1M = '0.44'
if (!process.env.DEEPSEEK_OUTPUT_COST_PER_1M) process.env.DEEPSEEK_OUTPUT_COST_PER_1M = '1.32'
// NEVER enable paid for this script
delete process.env.CANARY_PAID_EXECUTION_ENABLED

const EVENT_ID = 'cl_7457f2e8-d45f-44e2-a50c-dbc467a3454c'

async function main() {
  const { DrizzleCrawlerStore } = await import('../src/services/crawler/store/drizzle')
  const { buildCanaryPreflight, probeCanaryPricing } = await import(
    '../src/services/crawler/canary/preflight'
  )
  const { buildCanaryEvidencePack } = await import('../src/services/crawler/canary/pack')
  const { computeSourceContentMetrics } = await import('../src/services/crawler/canary/sourcePolicy')
  const { shouldAttemptPaidSchemaRepair } = await import('../src/services/crawler/canary/repairPolicy')
  const { canaryConfig } = await import('../src/services/crawler/canary/flags')
  const { isCrawlerAiDispatchEnabled } = await import('../src/services/crawler/dispatch')
  const { isLegacyDirectAiEnabled } = await import('../src/services/crawler/legacyFlags')
  const { isAuthorizedPaidCanaryEvent } = await import('../src/services/crawler/canary/authorizedEvent')

  if (!isAuthorizedPaidCanaryEvent(EVENT_ID)) throw new Error('EVENT_NOT_AUTHORIZED')
  if (isCrawlerAiDispatchEnabled() || isLegacyDirectAiEnabled()) {
    throw new Error('GLOBAL_AI_GATES_MUST_STAY_OFF')
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

  const clusterInput = {
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
  }

  const pack = buildCanaryEvidencePack(clusterInput, members)
  const content = computeSourceContentMetrics(pack)
  const { preflight } = buildCanaryPreflight({ cluster: clusterInput, members })
  const pricing = probeCanaryPricing()
  const cfg = canaryConfig()

  const bodyShortRepair = shouldAttemptPaidSchemaRepair({
    validationOk: false,
    issueCodes: ['BODY_TOO_SHORT'],
    jsonParseOk: true,
    alreadyRepaired: false,
    requestCount: 1,
    maxRequests: 2,
  })

  console.log(
    JSON.stringify(
      {
        mode: 'PREFLIGHT_ONLY',
        paidSecondCanaryExecuted: false,
        eventId: EVENT_ID,
        title: cluster.canonicalTitle,
        sources: pack.sources.map((s) => ({ role: s.role, name: s.sourceName, words: content.usableSourceWords })),
        sourceDetails: pack.sources.map((s) => ({
          role: s.role,
          name: s.sourceName,
          words: s.body.trim().split(/\s+/).filter(Boolean).length,
        })),
        usableSourceWords: content.usableSourceWords,
        independentSourceCount: content.independentSourceCount,
        uniqueFactDensity: content.uniqueFactDensity,
        sourceRichness: content.richness,
        bodyTargetMinWords: content.bodyTargetMinWords,
        bodyRequiredMinWords: content.bodyRequiredMinWords,
        estimatedInputTokens: preflight.estimatedInputTokens,
        maxOutputTokens: cfg.maxOutputTokens,
        estimatedOutputTokens: preflight.estimatedOutputTokens,
        estimatedCostUsd: preflight.estimatedCostUsd,
        maxCostUsdPerEvent: preflight.maxCostUsdPerEvent,
        pricing,
        preflight: {
          state: preflight.state,
          ready: preflight.ready,
          blockedReason: preflight.blockedReason,
          model: preflight.model,
          packMetrics: preflight.packMetrics,
        },
        repairPolicy: {
          bodyTooShortTriggersPaidRepair: bodyShortRepair.repair,
          reason: bodyShortRepair.reason,
          expectedRequestsTarget: 1,
          expectedRequestsCap: 2,
        },
        flags: {
          crawlerAiDispatchEnabled: isCrawlerAiDispatchEnabled(),
          legacyDirectAiEnabled: isLegacyDirectAiEnabled(),
          paidExecutionEnabled: cfg.paidExecutionEnabled,
        },
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
