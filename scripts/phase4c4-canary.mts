/**
 * Phase 4C.4 — length-calibration final single-event DeepSeek canary.
 * Usage:
 *   npx tsx scripts/phase4c4-canary.mts              # Stage 0–1 preflight only
 *   npx tsx scripts/phase4c4-canary.mts --execute    # ONE paid request (requires gates)
 *
 * Hard caps: max 1 provider request, max estimated $0.01, BODY_TOO_SHORT → no repair.
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
if (!process.env.DEEPSEEK_CACHE_HIT_COST_PER_1M) process.env.DEEPSEEK_CACHE_HIT_COST_PER_1M = '0.014'
if (!process.env.DEEPSEEK_CACHE_MISS_COST_PER_1M) process.env.DEEPSEEK_CACHE_MISS_COST_PER_1M = '0.44'

/** Phase 4C.4 tighter cost ceiling than default $0.05 */
process.env.CANARY_MAX_COST_USD_PER_EVENT = '0.01'

const execute = process.argv.includes('--execute')
if (execute) {
  process.env.CANARY_PAID_EXECUTION_ENABLED = 'true'
}

const EVENT_ID = 'cl_7457f2e8-d45f-44e2-a50c-dbc467a3454c'
const PHASE_MAX_COST_USD = 0.01

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

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
  const { computeSourceContentMetrics } = await import('../src/services/crawler/canary/sourcePolicy')
  const { extractJsonObject, coerceDraft, repairDraftDeterministically } = await import(
    '../src/services/crawler/canary/validate'
  )
  const { wordCount: wc } = await import('../src/services/crawler/canary/schema')
  const { canaryConfig } = await import('../src/services/crawler/canary/flags')
  const { estimateUsageCost, getDeepSeekPricing } = await import('../src/lib/ai/usage/pricing')
  const { buildCanarySystemPrompt, buildCanaryUserPrompt } = await import(
    '../src/services/crawler/canary/prompt'
  )
  const { getDb } = await import('../src/db')
  const { crawlerAiCostLedger, crawlerAiCanaryRuns } = await import('../src/db/schema')
  const { eq, desc, sql } = await import('drizzle-orm')

  if (!isAuthorizedPaidCanaryEvent(EVENT_ID)) {
    throw new Error('EVENT_NOT_AUTHORIZED')
  }

  const store = new DrizzleCrawlerStore()
  const canaryStore = new DrizzleCanaryStore()
  const existingBefore = await canaryStore.getJobByCluster(EVENT_ID)

  if (existingBefore?.state === 'RUNNING') {
    console.log(
      JSON.stringify({
        verdict: 'PHASE 4C.4 BLOCKED — FINAL CANARY NOT EXECUTED',
        reason: 'duplicate_active_execution',
        existingJobId: existingBefore.id,
      })
    )
    process.exit(3)
  }
  if (existingBefore?.state === 'SUCCEEDED' && existingBefore.editorialDraftId) {
    console.log(
      JSON.stringify({
        verdict: 'PHASE 4C.4 BLOCKED — FINAL CANARY NOT EXECUTED',
        reason: 'already_succeeded_no_silent_regenerate',
        existingJobId: existingBefore.id,
        editorialDraftId: existingBefore.editorialDraftId,
      })
    )
    process.exit(3)
  }

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
  const cfg = canaryConfig()

  if (isCrawlerAiDispatchEnabled() || isLegacyDirectAiEnabled()) {
    throw new Error('GLOBAL_AI_GATES_MUST_STAY_OFF')
  }
  if (!pricing.known) throw new Error('COST_UNKNOWN')
  if (cfg.maxCostUsdPerEvent > PHASE_MAX_COST_USD + 1e-12) {
    throw new Error(`COST_CEILING_TOO_HIGH:${cfg.maxCostUsdPerEvent}`)
  }

  let providerCalls = 0
  let lastProviderMeta: {
    statusCode?: number
    finishReason?: string | null
    truncated?: boolean
    latencyMs?: number
    rawText?: string
    model?: string
    inputTokens?: number
    outputTokens?: number
  } = {}
  let lastPrompts: { system: string; user: string } | null = null

  const baseProvider = createDeepSeekCanaryProvider()
  const strictProvider = {
    async chat(input: Parameters<typeof baseProvider.chat>[0]) {
      providerCalls += 1
      if (providerCalls > 1) {
        return {
          called: false,
          errorCode: 'strict_one_request_cap',
          provider: 'deepseek' as const,
          model: input.model,
        }
      }
      lastPrompts = { system: input.system, user: input.user }
      const t0 = Date.now()
      const result = await baseProvider.chat(input)
      lastProviderMeta = {
        statusCode: result.statusCode,
        finishReason: result.finishReason ?? null,
        truncated: result.truncated,
        latencyMs: Date.now() - t0,
        rawText: result.text,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }
      return result
    },
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

  console.log(
    JSON.stringify(
      {
        mode: execute ? 'EXECUTE_PAID_4C4' : 'PREFLIGHT_4C4',
        eventId: EVENT_ID,
        title: cluster.canonicalTitle,
        existingJobState: existingBefore?.state ?? null,
        crawlerAiDispatchEnabled: isCrawlerAiDispatchEnabled(),
        legacyDirectAiEnabled: isLegacyDirectAiEnabled(),
        pricing,
        maxOutputTokens: cfg.maxOutputTokens,
        maxCostUsdPerEvent: cfg.maxCostUsdPerEvent,
        phaseMaxCostUsd: PHASE_MAX_COST_USD,
        autoPublish: cfg.autoPublish,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  )

  const result = await runCanaryStage({
    cluster: clusterInput,
    members,
    store: canaryStore,
    executePaid: execute,
    confirmation: execute ? APPROVED_FOR_REAL_CANARY_EXECUTION : null,
    provider: execute ? strictProvider : undefined,
  })

  const pre = result.preflight
  const pack = result.job?.packSnapshot
  const content = pack ? computeSourceContentMetrics(pack) : null

  // Dry-run prompt inspection (preflight path may still build pack on job)
  let promptSnippets: Record<string, unknown> | null = null
  if (pack) {
    const system = lastPrompts?.system ?? buildCanarySystemPrompt(pack)
    const user = lastPrompts?.user ?? buildCanaryUserPrompt(pack)
    promptSnippets = {
      systemHasHardMin300: /en az 300/i.test(system),
      systemHasTarget400550: /400–550|400-550/.test(system),
      systemRejectsShortArticleBias: /kısa MAKALE demek değildir|Kısa paragraflar ≠ kısa haber/i.test(
        system
      ),
      systemHasLegacyShortMobileLine: /^- Kısa mobil paragraflar/m.test(system),
      userHasHardMin300: /en az 300/i.test(user),
      bodyFieldHintPreview: user.match(/"body":\s*"[^"]{0,120}/)?.[0] ?? null,
    }
  }

  let wordPipeline: Record<string, unknown> | null = null
  if (lastProviderMeta.rawText) {
    const raw = lastProviderMeta.rawText
    const extracted = extractJsonObject(raw)
    const coerced = extracted.ok ? coerceDraft(extracted.value) : coerceDraft(null)
    const local = coerced ? repairDraftDeterministically(coerced) : null
    const validatedBody = result.job?.validation?.draft?.body ?? result.job?.draft?.body ?? ''
    wordPipeline = {
      rawBodyWords: coerced?.body ? wc(coerced.body) : 0,
      parsedBodyWords: coerced?.body ? wc(coerced.body) : 0,
      normalizedBodyWords: local?.draft.body ? wc(local.draft.body) : 0,
      validatorBodyWords: validatedBody ? wc(validatedBody) : 0,
      localRepairs: local?.changes ?? [],
      jsonParseOk: extracted.ok,
    }
  }

  const model = result.job?.model || pre.model
  const dsPricing = getDeepSeekPricing(model)
  const inTok = result.job?.actualInputTokens ?? lastProviderMeta.inputTokens ?? 0
  const outTok = result.job?.actualOutputTokens ?? lastProviderMeta.outputTokens ?? 0
  const costBreakdown =
    inTok || outTok
      ? estimateUsageCost(
          { inputTokens: inTok, outputTokens: outTok, totalTokens: inTok + outTok },
          dsPricing
        )
      : null

  const db = getDb()
  const ledgers = await db
    .select()
    .from(crawlerAiCostLedger)
    .where(eq(crawlerAiCostLedger.lane, 'manual_canary'))
    .orderBy(desc(crawlerAiCostLedger.timestamp))
    .limit(50)

  const paidLedgers = ledgers.filter(
    (l) => l.requestType === 'generation' || l.requestType === 'schema_repair'
  )
  const totalCanaryCost = paidLedgers.reduce((s, l) => s + (l.actualCostUsd ?? 0), 0)
  const totalRequests = paidLedgers.length

  const runs = await db
    .select()
    .from(crawlerAiCanaryRuns)
    .where(eq(crawlerAiCanaryRuns.clusterId, EVENT_ID))
    .limit(5)

  const finalJob = runs[0] || null

  const approvedRow = await db.execute(
    sql`SELECT count(*)::int AS c FROM news_clusters WHERE editorial_decision = 'APPROVED_FOR_AI'`
  )
  const publishedFromCanary = await db.execute(
    sql`SELECT count(*)::int AS c FROM crawler_ai_canary_runs WHERE state = 'SUCCEEDED' AND auto_publish = 1`
  )
  const activeCanary = await db.execute(
    sql`SELECT count(*)::int AS c FROM crawler_ai_canary_runs WHERE state = 'RUNNING'`
  )

  const ageHours = cluster.firstSeenAt
    ? Math.round((Date.now() - new Date(cluster.firstSeenAt).getTime()) / 3_600_000)
    : null

  const est = pre.estimatedCostUsd
  const costGate =
    !pre.pricingKnown
      ? 'COST_UNKNOWN'
      : est != null && est > PHASE_MAX_COST_USD
        ? 'OVER_PHASE_CAP'
        : 'OK'

  console.log(
    JSON.stringify(
      {
        paidCallExecuted: result.paidCallExecuted,
        autoPublished: result.autoPublished,
        idempotentReuse: result.idempotentReuse,
        messageTr: result.messageTr,
        providerCalls,
        costGate,
        lastProviderMeta: {
          statusCode: lastProviderMeta.statusCode,
          finishReason: lastProviderMeta.finishReason,
          truncated: lastProviderMeta.truncated,
          latencyMs: lastProviderMeta.latencyMs,
          model: lastProviderMeta.model,
          inputTokens: lastProviderMeta.inputTokens,
          outputTokens: lastProviderMeta.outputTokens,
        },
        costBreakdown: costBreakdown
          ? {
              inputCostUsd: costBreakdown.estimatedInputCostUsd,
              outputCostUsd: costBreakdown.estimatedOutputCostUsd,
              totalCostUsd: costBreakdown.estimatedTotalCostUsd,
            }
          : null,
        wordPipeline,
        promptSnippets,
        contentMetrics: content,
        preflight: {
          state: pre.state,
          blockedReason: pre.blockedReason,
          ready: pre.ready,
          model: pre.model,
          provider: pre.provider,
          estimatedInputTokens: pre.estimatedInputTokens,
          estimatedOutputTokens: pre.estimatedOutputTokens,
          estimatedCostUsd: pre.estimatedCostUsd,
          maxCostUsdPerEvent: pre.maxCostUsdPerEvent,
          pricingKnown: pre.pricingKnown,
          inputCostPer1M: pre.inputCostPer1M,
          outputCostPer1M: pre.outputCostPer1M,
          sources: pre.sources,
          packMetrics: pre.packMetrics,
        },
        clusterMeta: {
          title: cluster.canonicalTitle,
          city: cluster.city,
          district: cluster.district,
          region: cluster.region,
          countryCode: cluster.countryCode,
          topic: cluster.normalizedTopic,
          editorialDecision: cluster.editorialDecision,
          publishedNewsId: cluster.publishedNewsId,
          firstSeenAt: cluster.firstSeenAt,
          lastSeenAt: cluster.lastSeenAt,
          ageHours,
          uniqueSourceCount: cluster.uniqueSourceCount,
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
              autoPublish: result.job.autoPublish,
              draftTitle: result.job.draft?.title ?? null,
              draftCategory: result.job.draft?.category ?? null,
              draftBodyWords: result.job.draft?.body ? wordCount(result.job.draft.body) : 0,
              validationOk: result.job.validation?.ok ?? null,
              validationIssues: result.job.validation?.issues ?? null,
              factFlags: result.job.factFlags ?? [],
            }
          : null,
        ledgerSummary: {
          paidEntries: paidLedgers.map((l) => ({
            id: l.id,
            jobId: l.jobId,
            requestType: l.requestType,
            status: l.status,
            inputTokens: l.inputTokens,
            outputTokens: l.outputTokens,
            actualCostUsd: l.actualCostUsd,
            timestamp: l.timestamp,
          })),
          totalRequests,
          totalCanaryCost,
        },
        inventory: {
          APPROVED_FOR_AI:
            (approvedRow as { rows?: Array<{ c: number }> }).rows?.[0]?.c ?? approvedRow,
          canaryAutoPublishOnes:
            (publishedFromCanary as { rows?: Array<{ c: number }> }).rows?.[0]?.c ??
            publishedFromCanary,
          runningCanaryJobs:
            (activeCanary as { rows?: Array<{ c: number }> }).rows?.[0]?.c ?? activeCanary,
          finalJobState: finalJob?.state ?? null,
          finalDraftId: finalJob?.editorialDraftId ?? null,
        },
      },
      null,
      2
    )
  )

  if (execute && costGate !== 'OK' && !result.paidCallExecuted) {
    process.exit(4)
  }
  if (execute && result.paidCallExecuted && result.job?.actualCostUsd != null && result.job.actualCostUsd > PHASE_MAX_COST_USD) {
    console.error(`ALARM: actual cost exceeded $${PHASE_MAX_COST_USD} — do NOT open global dispatch`)
    process.exit(2)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
