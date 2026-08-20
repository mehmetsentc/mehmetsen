import { buildCanaryPreflight } from './preflight'
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

  // Execute DeepSeek-only path via shared Phase 4D.1 writer (tests inject mock provider)
  job.state = 'RUNNING'
  job.startedAt = new Date()
  job.updatedAt = job.startedAt
  await store.upsertJob(job)

  const { executeEventDraft } = await import('../eventDraft/executeEventDraft')
  const draftResult = await executeEventDraft({
    pack,
    provider: input.provider!,
    lane: 'manual_canary',
    jobId: job.id,
    estimatedCostUsd: preflight.estimatedCostUsd,
    allowPaidSchemaRepair: true,
  })

  job.requestCount = draftResult.requestCount
  job.actualInputTokens = draftResult.actualInputTokens
  job.actualOutputTokens = draftResult.actualOutputTokens
  job.actualCostUsd = draftResult.actualCostUsd
  job.validation = draftResult.validation
  job.draft = draftResult.draft
  job.factFlags = draftResult.factFlags
  job.completedAt = new Date()
  job.updatedAt = job.completedAt

  if (draftResult.blockedReason === 'PROVIDER_NOT_DEEPSEEK') {
    job.state = 'FAILED'
    job.blockedReason = 'PROVIDER_NOT_DEEPSEEK'
    job.failureReason = draftResult.failureReason
    await store.upsertJob(job)
    return {
      preflight: { ...preflight, state: 'FAILED', ready: false },
      job,
      paidCallExecuted: true,
      providersInvoked: ['deepseek'],
      otherProvidersInvoked: [],
      autoPublished: false,
      idempotentReuse: false,
      messageTr: draftResult.messageTr,
    }
  }

  if (draftResult.blockedReason === 'AUTH_401' || draftResult.blockedReason === 'INSUFFICIENT_BALANCE_402') {
    job.state = 'FAILED'
    job.blockedReason = draftResult.blockedReason as CanaryBlockReason
    job.failureReason = draftResult.failureReason
    await store.upsertJob(job)
    await store.appendLedger({
      id: newCanaryId('ldg'),
      timestamp: new Date(),
      provider: 'deepseek',
      model: draftResult.model,
      lane: CANARY_COST_LANE,
      jobId: job.id,
      clusterId: job.clusterId,
      requestType: 'generation',
      inputTokens: draftResult.actualInputTokens,
      outputTokens: draftResult.actualOutputTokens,
      estimatedCostUsd: preflight.estimatedCostUsd,
      actualCostUsd: null,
      status: 'FAILED',
    })
    recordCanaryAttempt({
      providerRequests: draftResult.requestCount,
      successful: false,
      repairRequests: draftResult.repairUsed ? 1 : 0,
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
      messageTr: draftResult.messageTr,
    }
  }

  if (!draftResult.ok || !draftResult.draft) {
    job.state = 'FAILED'
    job.failureReason = draftResult.failureReason
    await store.upsertJob(job)
    if (draftResult.paidCallExecuted && draftResult.draft === null && draftResult.validation) {
      await store.appendLedger({
        id: newCanaryId('ldg'),
        timestamp: new Date(),
        provider: 'deepseek',
        model: draftResult.model,
        lane: CANARY_COST_LANE,
        jobId: job.id,
        clusterId: job.clusterId,
        requestType: draftResult.repairUsed ? 'schema_repair' : 'generation',
        inputTokens: job.actualInputTokens,
        outputTokens: job.actualOutputTokens,
        estimatedCostUsd: preflight.estimatedCostUsd,
        actualCostUsd: draftResult.actualCostUsd,
        status: 'FAILED',
      })
    }
    recordCanaryAttempt({
      providerRequests: draftResult.requestCount,
      successful: false,
      repairRequests: draftResult.repairUsed ? 1 : 0,
      actualCostUsd: draftResult.actualCostUsd,
    })
    return {
      preflight: { ...preflight, state: 'FAILED', ready: false },
      job,
      paidCallExecuted: draftResult.paidCallExecuted,
      providersInvoked: draftResult.providersInvoked,
      otherProvidersInvoked: [],
      autoPublished: false,
      idempotentReuse: false,
      messageTr: draftResult.messageTr,
    }
  }

  job.state = 'SUCCEEDED'
  job.editorialDraftId = draftResult.draftId
  job.autoPublish = false
  job.outputTarget = CANARY_OUTPUT_TARGET
  job.draftStatus = CANARY_DRAFT_STATUS
  if (draftResult.draftId) await store.setDraftId(job.clusterId, draftResult.draftId)
  await store.upsertJob(job)
  await store.appendLedger({
    id: newCanaryId('ldg'),
    timestamp: new Date(),
    provider: 'deepseek',
    model: draftResult.model,
    lane: CANARY_COST_LANE,
    jobId: job.id,
    clusterId: job.clusterId,
    requestType: 'generation',
    inputTokens: job.actualInputTokens,
    outputTokens: job.actualOutputTokens,
    estimatedCostUsd: preflight.estimatedCostUsd,
    actualCostUsd: draftResult.actualCostUsd,
    status: 'SUCCEEDED',
  })
  recordCanaryAttempt({
    providerRequests: draftResult.requestCount,
    successful: true,
    repairRequests: draftResult.repairUsed ? 1 : 0,
    actualCostUsd: draftResult.actualCostUsd,
  })

  return {
    preflight: { ...preflight, state: 'SUCCEEDED', ready: false },
    job,
    paidCallExecuted: true,
    providersInvoked: ['deepseek'],
    otherProvidersInvoked: [],
    autoPublished: false,
    idempotentReuse: false,
    messageTr: draftResult.messageTr,
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
