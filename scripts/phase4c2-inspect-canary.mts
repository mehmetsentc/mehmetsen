/**
 * Phase 4C.2 — inspect failed canary + event pack metrics (NO paid AI).
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

const EVENT_ID = 'cl_7457f2e8-d45f-44e2-a50c-dbc467a3454c'

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

async function main() {
  const { getDb } = await import('../src/db')
  const {
    crawlerAiCanaryRuns,
    crawlerAiCostLedger,
    crawlerNewsClusters,
  } = await import('../src/db/schema')
  const { eq, desc, sql } = await import('drizzle-orm')
  const { DrizzleCrawlerStore } = await import('../src/services/crawler/store/drizzle')
  const { buildCanaryEvidencePack } = await import('../src/services/crawler/canary/pack')
  const { buildCanaryPreflight } = await import('../src/services/crawler/canary/preflight')
  const { validateCanaryDraft, extractJsonObject, coerceDraft } = await import(
    '../src/services/crawler/canary/validate'
  )
  const { wordCount: wc } = await import('../src/services/crawler/canary/schema')
  const { isCrawlerAiDispatchEnabled } = await import('../src/services/crawler/dispatch')
  const { isLegacyDirectAiEnabled } = await import('../src/services/crawler/legacyFlags')

  const db = getDb()

  const runs = await db
    .select()
    .from(crawlerAiCanaryRuns)
    .orderBy(desc(crawlerAiCanaryRuns.createdAt))
    .limit(5)

  console.log('=== FLAGS ===')
  console.log({
    crawlerAiDispatchEnabled: isCrawlerAiDispatchEnabled(),
    legacyDirectAiEnabled: isLegacyDirectAiEnabled(),
  })

  console.log('=== CANARY RUNS ===')
  for (const r of runs) {
    const draft = r.draftSnapshot as Record<string, unknown> | null
    const validation = r.validationSnapshot as {
      ok?: boolean
      issues?: Array<{ code: string; messageTr?: string }>
      draft?: { body?: string }
    } | null
    const bodyFromDraft = typeof draft?.body === 'string' ? draft.body : ''
    const bodyFromValidation =
      typeof validation?.draft?.body === 'string' ? validation.draft.body : ''
    console.log(
      JSON.stringify(
        {
          id: r.id,
          clusterId: r.clusterId,
          state: r.state,
          requestCount: r.requestCount,
          model: r.model,
          failureReason: r.failureReason,
          blockedReason: r.blockedReason,
          actualInputTokens: r.actualInputTokens,
          actualOutputTokens: r.actualOutputTokens,
          actualCostUsd: r.actualCostUsd,
          estimatedInputTokens: r.estimatedInputTokens,
          estimatedOutputTokens: r.estimatedOutputTokens,
          estimatedCostUsd: r.estimatedCostUsd,
          editorialDraftId: r.editorialDraftId,
          validationOk: validation?.ok ?? null,
          validationIssues: validation?.issues ?? null,
          draftTitle: draft?.title ?? null,
          draftBodyWords: bodyFromDraft ? wordCount(bodyFromDraft) : 0,
          validationDraftBodyWords: bodyFromValidation ? wordCount(bodyFromValidation) : 0,
          draftBodyChars: bodyFromDraft.length,
          draftBodyPreview: bodyFromDraft.slice(0, 400),
          createdAt: r.createdAt,
          completedAt: r.completedAt,
        },
        null,
        2
      )
    )
  }

  const ledgers = await db
    .select()
    .from(crawlerAiCostLedger)
    .where(eq(crawlerAiCostLedger.lane, 'manual_canary'))
    .orderBy(desc(crawlerAiCostLedger.timestamp))
    .limit(20)

  console.log('=== LEDGER ===')
  for (const l of ledgers) {
    console.log(
      JSON.stringify(
        {
          id: l.id,
          jobId: l.jobId,
          clusterId: l.clusterId,
          requestType: l.requestType,
          status: l.status,
          inputTokens: l.inputTokens,
          outputTokens: l.outputTokens,
          actualCostUsd: l.actualCostUsd,
          estimatedCostUsd: l.estimatedCostUsd,
          timestamp: l.timestamp,
        },
        null,
        2
      )
    )
  }

  const approved = await db.execute(
    sql`SELECT count(*)::int AS c FROM news_clusters WHERE editorial_decision = 'APPROVED_FOR_AI'`
  )
  const aiDraftCanary = await db.execute(
    sql`SELECT count(*)::int AS c FROM crawler_ai_canary_runs WHERE editorial_draft_id IS NOT NULL AND state = 'SUCCEEDED'`
  )
  const runningJobs = await db.execute(
    sql`SELECT count(*)::int AS c FROM crawler_ai_jobs WHERE state IN ('QUEUED','RUNNING','DISPATCHED')`
  )
  console.log('=== INVENTORY ===')
  console.log({
    APPROVED_FOR_AI: (approved as { rows?: Array<{ c: number }> }).rows?.[0]?.c ?? approved,
    successfulCanaryDrafts:
      (aiDraftCanary as { rows?: Array<{ c: number }> }).rows?.[0]?.c ?? aiDraftCanary,
    activeAiJobs: (runningJobs as { rows?: Array<{ c: number }> }).rows?.[0]?.c ?? runningJobs,
  })

  // Prefer stored pack snapshot from failed canary (no wipe)
  const failed = runs.find((r) => r.clusterId === EVENT_ID) || runs[0]
  const packSnap = failed?.packSnapshot as {
    metrics?: Record<string, unknown>
    sources?: Array<{ role: string; sourceName: string; body: string }>
    canonicalTitle?: string
  } | null

  if (packSnap?.sources) {
    const sourceWords = packSnap.sources.map((s) => ({
      role: s.role,
      sourceName: s.sourceName,
      words: wordCount(s.body || ''),
      chars: (s.body || '').length,
    }))
    console.log('=== STORED PACK (failed canary) ===')
    console.log(
      JSON.stringify(
        {
          title: packSnap.canonicalTitle,
          metrics: packSnap.metrics,
          sourceWords,
          usableSourceWords: sourceWords.reduce((a, s) => a + s.words, 0),
        },
        null,
        2
      )
    )
  }

  if (failed?.draftSnapshot) {
    const raw = JSON.stringify(failed.draftSnapshot)
    const coerced = coerceDraft(failed.draftSnapshot)
    const validated = validateCanaryDraft(failed.draftSnapshot, { allowRepair: true })
    console.log('=== WORD COUNT PIPELINE (stored draft) ===')
    console.log(
      JSON.stringify(
        {
          stage1_rawJsonStringWords: wordCount(raw),
          stage2_parsedBodyWords: coerced.body ? wc(coerced.body) : 0,
          stage3_normalizedAfterRepair: validated.draft ? wc(validated.draft.body) : 0,
          stage4_validatorInputWords: coerced.body ? wc(coerced.body) : 0,
          issues: validated.issues,
          ok: validated.ok,
          fullBody: coerced.body,
        },
        null,
        2
      )
    )
  }

  // Live event pack + preflight (no paid)
  if (!process.env.DEEPSEEK_INPUT_COST_PER_1M) process.env.DEEPSEEK_INPUT_COST_PER_1M = '0.44'
  if (!process.env.DEEPSEEK_OUTPUT_COST_PER_1M) process.env.DEEPSEEK_OUTPUT_COST_PER_1M = '1.32'

  const store = new DrizzleCrawlerStore()
  const cluster = await store.getCluster(EVENT_ID)
  if (!cluster) {
    console.log('EVENT NOT FOUND for live preflight')
    return
  }
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

  const pack = buildCanaryEvidencePack(
    {
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
    members
  )
  const liveSourceWords = pack.sources.map((s) => ({
    role: s.role,
    sourceName: s.sourceName,
    words: wordCount(s.body),
  }))
  console.log('=== LIVE PACK ===')
  console.log(
    JSON.stringify(
      {
        metrics: pack.metrics,
        liveSourceWords,
        usableSourceWords: liveSourceWords.reduce((a, s) => a + s.words, 0),
      },
      null,
      2
    )
  )

  const { preflight } = buildCanaryPreflight({
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
  })
  console.log('=== CURRENT PREFLIGHT (no paid) ===')
  console.log(
    JSON.stringify(
      {
        state: preflight.state,
        ready: preflight.ready,
        blockedReason: preflight.blockedReason,
        estimatedInputTokens: preflight.estimatedInputTokens,
        estimatedOutputTokens: preflight.estimatedOutputTokens,
        estimatedCostUsd: preflight.estimatedCostUsd,
        maxCostUsdPerEvent: preflight.maxCostUsdPerEvent,
        model: preflight.model,
        packMetrics: preflight.packMetrics,
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
