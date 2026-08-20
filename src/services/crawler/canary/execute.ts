import { getDeepSeekModel } from '@/lib/ai/deepseekClient'
import { estimateUsageCost, getDeepSeekPricing } from '@/lib/ai/usage/pricing'
import { buildCanaryPreflight } from './preflight'
import { buildCanarySystemPrompt, buildCanaryUserPrompt } from './prompt'
import { validateCanaryDraft, repairDraftDeterministically, extractJsonObject } from './validate'
import { canaryRetryDecision } from './retryPolicy'
import { shouldAttemptPaidSchemaRepair } from './repairPolicy'
import { buildDeterministicFactFlags } from './factFlags'
import { assertCanarySafetyFlags, canaryConfig } from './flags'
import { MemoryCanaryStore, newCanaryId, type CanaryStore } from './store'
import { recordCanaryAttempt } from './measurement'
import type {
  CanaryBlockReason,
  CanaryClusterInput,
  CanaryJobRecord,
  CanaryMemberInput,
  CanaryPreflight,
  CanaryProvider,
  CanaryProviderResult,
} from './types'
import {
  APPROVED_FOR_REAL_CANARY_EXECUTION,
  CANARY_COST_LANE,
  CANARY_DRAFT_STATUS,
  CANARY_OUTPUT_TARGET,
} from './types'

export type RunCanaryInput = {
  cluster: CanaryClusterInput
  members: CanaryMemberInput[]
  store?: CanaryStore
  /** Required for paid path. Historical APPROVED_FOR_AI is rejected. */
  confirmation?: string | null
  /**
   * When true, attempts a real provider call.
   * Stage 1 default: false — preflight + controls only.
   * Even if true, requires confirmation + paidExecutionEnabled + provider.
   */
  executePaid?: boolean
  provider?: CanaryProvider
  now?: Date
}

export type RunCanaryResult = {
  preflight: CanaryPreflight
  job: CanaryJobRecord | null
  paidCallExecuted: false | true
  providersInvoked: Array<'deepseek'>
  otherProvidersInvoked: []
  autoPublished: false
  idempotentReuse: boolean
  messageTr: string
}

function emptyJob(partial: Partial<CanaryJobRecord> & Pick<CanaryJobRecord, 'id' | 'clusterId'>): CanaryJobRecord {
  const now = new Date()
  return {
    eventKey: null,
    state: 'PREFLIGHT',
    provider: 'deepseek',
    model: canaryConfig().model,
    requestCount: 0,
    maxRequests: 2,
    estimatedInputTokens: null,
    estimatedOutputTokens: null,
    estimatedCostUsd: null,
    actualInputTokens: null,
    actualOutputTokens: null,
    actualCostUsd: null,
    blockedReason: null,
    failureReason: null,
    editorialDraftId: null,
    outputTarget: CANARY_OUTPUT_TARGET,
    draftStatus: CANARY_DRAFT_STATUS,
    autoPublish: false,
    lane: CANARY_COST_LANE,
    packSnapshot: null,
    draft: null,
    validation: null,
    factFlags: [],
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    ...partial,
  }
}

/**
 * Stage 1 orchestration:
 * - Always builds preflight
 * - Never auto-publishes
 * - Never invokes Gemini/OpenAI/Groq/OpenRouter
 * - Paid DeepSeek only when executePaid + confirmation + paidExecutionEnabled + provider
 */
export async function runCanaryStage(input: RunCanaryInput): Promise<RunCanaryResult> {
  const store = input.store ?? new MemoryCanaryStore()
  const cfg = canaryConfig()
  const existing = await store.getJobByCluster(input.cluster.id)
  const existingDraft = await store.getDraftId(input.cluster.id)

  // Idempotency: existing SUCCEEDED draft → return existing, no new paid gen
  if (existing?.state === 'SUCCEEDED' && (existing.editorialDraftId || existing.draft)) {
    const { preflight } = buildCanaryPreflight({
      cluster: input.cluster,
      members: input.members,
      now: input.now,
      existingJob: true,
      existingDraftId: existing.editorialDraftId,
    })
    return {
      preflight: { ...preflight, state: 'SUCCEEDED', ready: false, blockedReason: 'EXISTING_DRAFT' },
      job: existing,
      paidCallExecuted: false,
      providersInvoked: [],
      otherProvidersInvoked: [],
      autoPublished: false,
      idempotentReuse: true,
      messageTr: 'Mevcut AI taslağı döndürüldü; yeni ücretli üretim yok.',
    }
  }

  // Double-click / concurrent: existing RUNNING → reuse
  if (existing?.state === 'RUNNING') {
    const { preflight } = buildCanaryPreflight({
      cluster: input.cluster,
      members: input.members,
      now: input.now,
      existingJob: true,
    })
    return {
      preflight: { ...preflight, state: 'RUNNING', ready: false, blockedReason: 'EXISTING_JOB' },
      job: existing,
      paidCallExecuted: false,
      providersInvoked: [],
      otherProvidersInvoked: [],
      autoPublished: false,
      idempotentReuse: true,
      messageTr: 'Çalışan canary işi zaten var; ikinci istek yok sayıldı.',
    }
  }

  // One event → one initial job: reuse READY/PREFLIGHT/BLOCKED without a second job row
  if (existing && !input.executePaid) {
    const { preflight, pack } = buildCanaryPreflight({
      cluster: input.cluster,
      members: input.members,
      now: input.now,
      existingDraftId: existingDraft,
      confirmation: input.confirmation,
    })
    const reused = {
      ...existing,
      state: preflight.state === 'BLOCKED' ? ('BLOCKED' as const) : existing.state === 'READY' || preflight.ready ? ('READY' as const) : existing.state,
      estimatedInputTokens: preflight.estimatedInputTokens,
      estimatedOutputTokens: preflight.estimatedOutputTokens,
      estimatedCostUsd: preflight.estimatedCostUsd,
      blockedReason: preflight.blockedReason,
      packSnapshot: pack ?? existing.packSnapshot,
      updatedAt: new Date(),
    }
    await store.upsertJob(reused)
    return {
      preflight,
      job: reused,
      paidCallExecuted: false,
      providersInvoked: [],
      otherProvidersInvoked: [],
      autoPublished: false,
      idempotentReuse: true,
      messageTr: 'Mevcut canary işi yeniden kullanıldı; yeni iş oluşturulmadı.',
    }
  }

  const { preflight, pack } = buildCanaryPreflight({
    cluster: input.cluster,
    members: input.members,
    now: input.now,
    existingJob: false,
    existingDraftId: existingDraft,
    confirmation: input.confirmation,
  })

  // Preflight-only ledger (no actual spend)
  const job = emptyJob({
    id: existing?.id || newCanaryId(),
    clusterId: input.cluster.id,
    eventKey: input.cluster.eventKey,
    state: preflight.state === 'BLOCKED' ? 'BLOCKED' : preflight.ready ? 'READY' : 'PREFLIGHT',
    model: preflight.model,
    estimatedInputTokens: preflight.estimatedInputTokens,
    estimatedOutputTokens: preflight.estimatedOutputTokens,
    estimatedCostUsd: preflight.estimatedCostUsd,
    blockedReason: preflight.blockedReason,
    packSnapshot: pack,
  })
  await store.upsertJob(job)
  await store.appendLedger({
    id: newCanaryId('ldg'),
    timestamp: new Date(),
    provider: 'deepseek',
    model: preflight.model,
    lane: CANARY_COST_LANE,
    jobId: job.id,
    clusterId: job.clusterId,
    requestType: 'preflight',
    inputTokens: preflight.estimatedInputTokens,
    outputTokens: preflight.estimatedOutputTokens,
    estimatedCostUsd: preflight.estimatedCostUsd,
    actualCostUsd: null,
    status: preflight.blockedReason ? 'BLOCKED' : 'PREFLIGHT',
  })

  if (!preflight.ready || !pack) {
    return {
      preflight,
      job,
      paidCallExecuted: false,
      providersInvoked: [],
      otherProvidersInvoked: [],
      autoPublished: false,
      idempotentReuse: false,
      messageTr: preflight.blockedReason
        ? `Canary engellendi: ${preflight.blockedReason}`
        : 'Preflight tamam; ücretli çağrı yok.',
    }
  }

  const wantPaid = input.executePaid === true
  if (!wantPaid) {
    return {
      preflight,
      job,
      paidCallExecuted: false,
      providersInvoked: [],
      otherProvidersInvoked: [],
      autoPublished: false,
      idempotentReuse: false,
      messageTr: 'Preflight READY. Ücretli DeepSeek çağrısı yapılmadı (Stage 1).',
    }
  }

  // Paid path gates
  if (input.confirmation !== APPROVED_FOR_REAL_CANARY_EXECUTION) {
    job.state = 'BLOCKED'
    job.blockedReason =
      input.confirmation === 'APPROVED_FOR_AI'
        ? 'APPROVED_FOR_AI_NOT_SUFFICIENT'
        : 'MISSING_CONFIRMATION'
    job.updatedAt = new Date()
    await store.upsertJob(job)
    return {
      preflight: {
        ...preflight,
        state: 'BLOCKED',
        blockedReason: job.blockedReason as CanaryBlockReason,
        ready: false,
      },
      job,
      paidCallExecuted: false,
      providersInvoked: [],
      otherProvidersInvoked: [],
      autoPublished: false,
      idempotentReuse: false,
      messageTr: 'Ücretli canary için APPROVED_FOR_REAL_CANARY_EXECUTION onayı gerekir.',
    }
  }

  if (!cfg.paidExecutionEnabled) {
    job.state = 'BLOCKED'
    job.blockedReason = 'PAID_CALL_DISABLED'
    job.updatedAt = new Date()
    await store.upsertJob(job)
    return {
      preflight: { ...preflight, state: 'BLOCKED', blockedReason: 'PAID_CALL_DISABLED', ready: false },
      job,
      paidCallExecuted: false,
      providersInvoked: [],
      otherProvidersInvoked: [],
      autoPublished: false,
      idempotentReuse: false,
      messageTr: 'CANARY_PAID_EXECUTION_ENABLED kapalı — Stage 1 ücretli çağrı yok.',
    }
  }

  const safety = assertCanarySafetyFlags()
  if (!safety.ok) {
    job.state = 'BLOCKED'
    job.blockedReason = safety.crawlerAiDispatchEnabled ? 'DISPATCH_MUST_STAY_OFF' : 'LEGACY_AI_MUST_STAY_OFF'
    await store.upsertJob(job)
    return {
      preflight: {
        ...preflight,
        state: 'BLOCKED',
        blockedReason: job.blockedReason as CanaryBlockReason,
        ready: false,
      },
      job,
      paidCallExecuted: false,
      providersInvoked: [],
      otherProvidersInvoked: [],
      autoPublished: false,
      idempotentReuse: false,
      messageTr: safety.reasons.join('; '),
    }
  }

  const running = await store.listRunning()
  if (running.length >= cfg.concurrency) {
    job.state = 'BLOCKED'
    job.blockedReason = 'CONCURRENCY_LIMIT'
    await store.upsertJob(job)
    return {
      preflight: { ...preflight, state: 'BLOCKED', blockedReason: 'CONCURRENCY_LIMIT', ready: false },
      job,
      paidCallExecuted: false,
      providersInvoked: [],
      otherProvidersInvoked: [],
      autoPublished: false,
      idempotentReuse: false,
      messageTr: 'Eşzamanlılık limiti (1).',
    }
  }

  if (!input.provider) {
    job.state = 'BLOCKED'
    job.blockedReason = 'PAID_CALL_DISABLED'
    job.failureReason = 'provider_adapter_missing'
    await store.upsertJob(job)
    return {
      preflight: { ...preflight, state: 'BLOCKED', blockedReason: 'PAID_CALL_DISABLED', ready: false },
      job,
      paidCallExecuted: false,
      providersInvoked: [],
      otherProvidersInvoked: [],
      autoPublished: false,
      idempotentReuse: false,
      messageTr: 'Provider adaptörü yok — gerçek DeepSeek çağrısı yapılmadı.',
    }
  }

  // Execute DeepSeek-only path (tests inject mock provider)
  job.state = 'RUNNING'
  job.startedAt = new Date()
  job.updatedAt = job.startedAt
  await store.upsertJob(job)

  const system = buildCanarySystemPrompt(pack)
  const user = buildCanaryUserPrompt(pack)
  const model = getDeepSeekModel(cfg.model)
  let requestCount = 0
  let lastResult: CanaryProviderResult | null = null
  let retried = false
  let paidRepairUsed = false
  let totalInputTokens = 0
  let totalOutputTokens = 0

  const callOnce = async (requestType: 'generation' | 'schema_repair' = 'generation') => {
    requestCount += 1
    const result = await input.provider!.chat({ system, user, model, pack })
    totalInputTokens += result.inputTokens ?? 0
    totalOutputTokens += result.outputTokens ?? 0
    if (requestType === 'schema_repair') paidRepairUsed = true
    return result
  }

  try {
    lastResult = await callOnce('generation')
    if (lastResult.provider && lastResult.provider !== 'deepseek') {
      job.state = 'FAILED'
      job.blockedReason = 'PROVIDER_NOT_DEEPSEEK'
      job.failureReason = 'non_deepseek_provider'
      job.requestCount = requestCount
      job.completedAt = new Date()
      await store.upsertJob(job)
      return {
        preflight: { ...preflight, state: 'FAILED', ready: false },
        job,
        paidCallExecuted: true,
        providersInvoked: ['deepseek'],
        otherProvidersInvoked: [],
        autoPublished: false,
        idempotentReuse: false,
        messageTr: 'Yalnızca DeepSeek izinli.',
      }
    }

    const retry = canaryRetryDecision(lastResult.statusCode, { alreadyRetried: false })
    if (!lastResult.text && retry.retry && !retried) {
      retried = true
      lastResult = await callOnce('generation')
    }

    if (lastResult.statusCode === 401 || lastResult.statusCode === 402) {
      job.state = 'FAILED'
      job.blockedReason = lastResult.statusCode === 401 ? 'AUTH_401' : 'INSUFFICIENT_BALANCE_402'
      job.failureReason = retry.adminWarningTr || String(lastResult.statusCode)
      job.requestCount = requestCount
      job.completedAt = new Date()
      job.actualInputTokens = totalInputTokens || lastResult.inputTokens || null
      job.actualOutputTokens = totalOutputTokens || lastResult.outputTokens || null
      await store.upsertJob(job)
      await store.appendLedger({
        id: newCanaryId('ldg'),
        timestamp: new Date(),
        provider: 'deepseek',
        model,
        lane: CANARY_COST_LANE,
        jobId: job.id,
        clusterId: job.clusterId,
        requestType: 'generation',
        inputTokens: lastResult.inputTokens ?? null,
        outputTokens: lastResult.outputTokens ?? null,
        estimatedCostUsd: preflight.estimatedCostUsd,
        actualCostUsd: null,
        status: 'FAILED',
      })
      recordCanaryAttempt({
        providerRequests: requestCount,
        successful: false,
        repairRequests: paidRepairUsed ? 1 : 0,
        actualCostUsd: null,
      })
      return {
        preflight: {
          ...preflight,
          state: 'FAILED',
          ready: false,
          blockedReason: job.blockedReason as CanaryBlockReason,
        },
        job,
        paidCallExecuted: true,
        providersInvoked: ['deepseek'],
        otherProvidersInvoked: [],
        autoPublished: false,
        idempotentReuse: false,
        messageTr: retry.adminWarningTr || 'Sağlayıcı hatası',
      }
    }

    if (!lastResult.text) {
      job.state = 'FAILED'
      job.failureReason = lastResult.errorCode || 'empty_response'
      job.requestCount = requestCount
      job.completedAt = new Date()
      await store.upsertJob(job)
      recordCanaryAttempt({
        providerRequests: requestCount,
        successful: false,
        repairRequests: paidRepairUsed ? 1 : 0,
        actualCostUsd: null,
      })
      return {
        preflight: { ...preflight, state: 'FAILED', ready: false },
        job,
        paidCallExecuted: true,
        providersInvoked: ['deepseek'],
        otherProvidersInvoked: [],
        autoPublished: false,
        idempotentReuse: false,
        messageTr: 'Boş sağlayıcı yanıtı.',
      }
    }

    let validation = validateCanaryDraft(lastResult.text, {
      allowRepair: true,
      pack,
      truncated: lastResult.truncated === true,
    })

    const parsed = extractJsonObject(lastResult.text)
    const repairDecision = shouldAttemptPaidSchemaRepair({
      validationOk: validation.ok,
      issueCodes: validation.issues.map((i) => i.code),
      jsonParseOk: parsed.ok,
      alreadyRepaired: paidRepairUsed,
      requestCount,
      maxRequests: cfg.maxRequestsWithRepair,
    })

    // One structural AI repair only — NEVER for BODY_TOO_SHORT / insufficient / cost-auth
    if (repairDecision.repair) {
      const repairResult = await callOnce('schema_repair')
      if (repairResult.text) {
        lastResult = repairResult
        validation = validateCanaryDraft(repairResult.text, {
          allowRepair: true,
          pack,
          truncated: repairResult.truncated === true,
        })
      }
    }

    const pricing = getDeepSeekPricing(model)
    const actualCost =
      totalInputTokens > 0 || totalOutputTokens > 0
        ? estimateUsageCost(
            {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              totalTokens: totalInputTokens + totalOutputTokens,
            },
            pricing
          ).estimatedTotalCostUsd ?? null
        : lastResult.inputTokens != null && lastResult.outputTokens != null
          ? estimateUsageCost(
              {
                inputTokens: lastResult.inputTokens,
                outputTokens: lastResult.outputTokens,
                totalTokens: lastResult.inputTokens + lastResult.outputTokens,
              },
              pricing
            ).estimatedTotalCostUsd ?? null
          : null

    job.requestCount = requestCount
    job.actualInputTokens = totalInputTokens || lastResult.inputTokens || null
    job.actualOutputTokens = totalOutputTokens || lastResult.outputTokens || null
    job.actualCostUsd = actualCost
    job.validation = validation
    job.draft = validation.draft
    job.completedAt = new Date()
    job.updatedAt = job.completedAt

    if (!validation.ok || !validation.draft) {
      const primaryCode = validation.issues.find((i) => i.severity === 'error')?.code
      job.state = 'FAILED'
      job.failureReason =
        primaryCode === 'OUTPUT_TRUNCATED'
          ? 'output_truncated'
          : primaryCode === 'INSUFFICIENT_SOURCE_MATERIAL'
            ? 'insufficient_source_material'
            : primaryCode === 'BODY_TOO_SHORT' || primaryCode === 'BODY_ABSOLUTE_TOO_SHORT'
              ? primaryCode.toLowerCase()
              : 'schema_validation_failed'
      await store.upsertJob(job)
      await store.appendLedger({
        id: newCanaryId('ldg'),
        timestamp: new Date(),
        provider: 'deepseek',
        model,
        lane: CANARY_COST_LANE,
        jobId: job.id,
        clusterId: job.clusterId,
        requestType: paidRepairUsed ? 'schema_repair' : 'generation',
        inputTokens: job.actualInputTokens,
        outputTokens: job.actualOutputTokens,
        estimatedCostUsd: preflight.estimatedCostUsd,
        actualCostUsd: actualCost,
        status: 'FAILED',
      })
      recordCanaryAttempt({
        providerRequests: requestCount,
        successful: false,
        repairRequests: paidRepairUsed ? 1 : 0,
        actualCostUsd: actualCost,
      })
      return {
        preflight: { ...preflight, state: 'FAILED', ready: false },
        job,
        paidCallExecuted: true,
        providersInvoked: ['deepseek'],
        otherProvidersInvoked: [],
        autoPublished: false,
        idempotentReuse: false,
        messageTr:
          primaryCode === 'INSUFFICIENT_SOURCE_MATERIAL'
            ? 'Kaynak materyali yetersiz — ücretli retry yok.'
            : primaryCode === 'OUTPUT_TRUNCATED'
              ? 'Çıktı kesildi (truncation) — uzunluk repair yok.'
              : 'Şema doğrulaması başarısız (ücretli semantic repair yok).',
      }
    }

    // Prefer deterministic repair already done; ensure final shape
    const repaired = repairDraftDeterministically(validation.draft)
    job.draft = repaired.draft
    job.factFlags = buildDeterministicFactFlags(repaired.draft, pack)
    job.state = 'SUCCEEDED'
    const draftId = `draft_canary_${job.clusterId}`
    job.editorialDraftId = draftId
    job.autoPublish = false
    job.outputTarget = CANARY_OUTPUT_TARGET
    job.draftStatus = CANARY_DRAFT_STATUS
    await store.setDraftId(job.clusterId, draftId)
    await store.upsertJob(job)
    await store.appendLedger({
      id: newCanaryId('ldg'),
      timestamp: new Date(),
      provider: 'deepseek',
      model,
      lane: CANARY_COST_LANE,
      jobId: job.id,
      clusterId: job.clusterId,
      requestType: 'generation',
      inputTokens: job.actualInputTokens,
      outputTokens: job.actualOutputTokens,
      estimatedCostUsd: preflight.estimatedCostUsd,
      actualCostUsd: actualCost,
      status: 'SUCCEEDED',
    })
    recordCanaryAttempt({
      providerRequests: requestCount,
      successful: true,
      repairRequests: paidRepairUsed ? 1 : 0,
      actualCostUsd: actualCost,
    })

    return {
      preflight: { ...preflight, state: 'SUCCEEDED', ready: false },
      job,
      paidCallExecuted: true,
      providersInvoked: ['deepseek'],
      otherProvidersInvoked: [],
      autoPublished: false,
      idempotentReuse: false,
      messageTr: 'AI taslağı hazır (AI_DRAFT). Otomatik yayın KAPALI. Editöryal onay ayrıdır.',
    }
  } catch (err) {
    // Never leave stuck RUNNING
    job.state = 'FAILED'
    job.failureReason = err instanceof Error ? err.message : 'provider_error'
    job.requestCount = requestCount
    job.completedAt = new Date()
    job.updatedAt = job.completedAt
    await store.upsertJob(job)
    recordCanaryAttempt({
      providerRequests: requestCount,
      successful: false,
      repairRequests: paidRepairUsed ? 1 : 0,
      actualCostUsd: null,
    })
    return {
      preflight: { ...preflight, state: 'FAILED', ready: false },
      job,
      paidCallExecuted: requestCount > 0,
      providersInvoked: requestCount > 0 ? ['deepseek'] : [],
      otherProvidersInvoked: [],
      autoPublished: false,
      idempotentReuse: false,
      messageTr: 'Canary başarısız; crawler etkilenmez.',
    }
  }
}

/** Ensure crawler ingestion is independent of canary failures. */
export function canaryFailureStopsCrawler(): false {
  return false
}

export function buildMockValidDraftJson(overrides?: Record<string, unknown>): string {
  const body = Array.from({ length: 320 }, (_, i) => `kelime${i + 1}`).join(' ')
  return JSON.stringify({
    title: 'Çanakkale Belediyesi yol çalışması duyurusu',
    slug: 'canakkale-belediyesi-yol-calismasi-duyurusu',
    spot: 'Belediye merkezde yol çalışması başlatacağını duyurdu.',
    summary: 'Çanakkale Belediyesi bugün merkezde yol çalışması başlatacağını açıkladı. Vatandaşlar alternatif güzergah kullanacak.',
    body,
    tags: ['canakkale', 'belediye', 'ulasim'],
    category: 'yerel-haber',
    seoTitle: 'Çanakkale yol çalışması duyurusu',
    seoDescription: 'Çanakkale Belediyesi merkezdeki yol çalışması hakkında bilgilendirme yaptı.',
    seoKeywords: ['canakkale', 'yol', 'belediye'],
    socialTitle: 'Çanakkale’de yol çalışması',
    socialDescription: 'Belediye merkezde yol çalışması başlatıyor.',
    pushTitle: 'Yol çalışması başladı',
    pushText: 'Çanakkale merkezde yol çalışması duyuruldu.',
    imageAlt: 'Çanakkale yol çalışması',
    imageFilename: 'canakkale-yol-calismasi.jpg',
    readingTime: 2,
    ...overrides,
  })
}
