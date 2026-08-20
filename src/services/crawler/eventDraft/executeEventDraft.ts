/**
 * Phase 4D.1 — single canonical paid event writer.
 * Used by: manual_canary, controlled_auto_draft, manual_retry.
 * Reuses Phase 4C.4 prompts + DeepSeek provider + validator. No duplicate writer.
 */

import { getDeepSeekModel } from '@/lib/ai/deepseekClient'
import { estimateUsageCost, getDeepSeekPricing } from '@/lib/ai/usage/pricing'
import { buildCanarySystemPrompt, buildCanaryUserPrompt } from '../canary/prompt'
import { validateCanaryDraft, repairDraftDeterministically, extractJsonObject } from '../canary/validate'
import { canaryRetryDecision } from '../canary/retryPolicy'
import { shouldAttemptPaidSchemaRepair } from '../canary/repairPolicy'
import { buildDeterministicFactFlags } from '../canary/factFlags'
import { canaryConfig } from '../canary/flags'
import type {
  CanaryDraftFields,
  CanaryEvidencePack,
  CanaryProvider,
  CanaryProviderResult,
  CanaryValidationResult,
} from '../canary/types'
import { CANARY_DRAFT_STATUS } from '../canary/types'

export type EventDraftLane = 'manual_canary' | 'controlled_auto_draft' | 'manual_retry'

export type ExecuteEventDraftInput = {
  pack: CanaryEvidencePack
  provider: CanaryProvider
  lane: EventDraftLane
  /** Event content fingerprint / revision id for linkage. */
  eventRevision?: string | null
  jobId?: string | null
  estimatedCostUsd?: number | null
  model?: string
  /**
   * controlled_auto_draft: false (one request, no paid repair).
   * manual_canary: true (one structural repair allowed per 4C.4).
   */
  allowPaidSchemaRepair?: boolean
  maxRequests?: number
}

export type ExecuteEventDraftResult = {
  ok: boolean
  paidCallExecuted: boolean
  requestCount: number
  repairUsed: boolean
  providersInvoked: Array<'deepseek'>
  otherProvidersInvoked: []
  autoPublished: false
  draftStatus: typeof CANARY_DRAFT_STATUS
  draft: CanaryDraftFields | null
  validation: CanaryValidationResult | null
  factFlags: ReturnType<typeof buildDeterministicFactFlags>
  draftId: string | null
  model: string
  provider: 'deepseek'
  lane: EventDraftLane
  eventRevision: string | null
  jobId: string | null
  actualInputTokens: number | null
  actualOutputTokens: number | null
  actualCostUsd: number | null
  finishReason: string | null
  statusCode: number | null
  failureReason: string | null
  blockedReason: string | null
  messageTr: string
}

/**
 * Canonical paid generation for one event pack.
 * Never publishes. Never calls non-DeepSeek providers.
 */
export async function executeEventDraft(
  input: ExecuteEventDraftInput
): Promise<ExecuteEventDraftResult> {
  const cfg = canaryConfig()
  const model = getDeepSeekModel(input.model || cfg.model)
  const allowRepair =
    input.allowPaidSchemaRepair ?? (input.lane === 'manual_canary' || input.lane === 'manual_retry')
  const maxRequests = input.maxRequests ?? (allowRepair ? cfg.maxRequestsWithRepair : 1)

  const base: Omit<ExecuteEventDraftResult, 'ok' | 'messageTr'> = {
    paidCallExecuted: false,
    requestCount: 0,
    repairUsed: false,
    providersInvoked: [],
    otherProvidersInvoked: [],
    autoPublished: false,
    draftStatus: CANARY_DRAFT_STATUS,
    draft: null,
    validation: null,
    factFlags: [],
    draftId: null,
    model,
    provider: 'deepseek',
    lane: input.lane,
    eventRevision: input.eventRevision ?? null,
    jobId: input.jobId ?? null,
    actualInputTokens: null,
    actualOutputTokens: null,
    actualCostUsd: null,
    finishReason: null,
    statusCode: null,
    failureReason: null,
    blockedReason: null,
  }

  const system = buildCanarySystemPrompt(input.pack)
  const user = buildCanaryUserPrompt(input.pack)
  let requestCount = 0
  let lastResult: CanaryProviderResult | null = null
  let retried = false
  let paidRepairUsed = false
  let totalInputTokens = 0
  let totalOutputTokens = 0

  const callOnce = async (requestType: 'generation' | 'schema_repair' = 'generation') => {
    requestCount += 1
    const result = await input.provider.chat({ system, user, model, pack: input.pack })
    totalInputTokens += result.inputTokens ?? 0
    totalOutputTokens += result.outputTokens ?? 0
    if (requestType === 'schema_repair') paidRepairUsed = true
    return result
  }

  try {
    lastResult = await callOnce('generation')
    if (lastResult.provider && lastResult.provider !== 'deepseek') {
      return {
        ...base,
        ok: false,
        paidCallExecuted: true,
        requestCount,
        providersInvoked: ['deepseek'],
        statusCode: lastResult.statusCode ?? null,
        blockedReason: 'PROVIDER_NOT_DEEPSEEK',
        failureReason: 'non_deepseek_provider',
        messageTr: 'Yalnızca DeepSeek izinli.',
      }
    }

    const retry = canaryRetryDecision(lastResult.statusCode, { alreadyRetried: false })
    // Empty-body transport retry only for canary lanes — auto-draft stays single-shot
    if (!lastResult.text && retry.retry && !retried && allowRepair && requestCount < maxRequests) {
      retried = true
      lastResult = await callOnce('generation')
    }

    if (lastResult.statusCode === 401 || lastResult.statusCode === 402) {
      return {
        ...base,
        ok: false,
        paidCallExecuted: true,
        requestCount,
        providersInvoked: ['deepseek'],
        statusCode: lastResult.statusCode,
        blockedReason: lastResult.statusCode === 401 ? 'AUTH_401' : 'INSUFFICIENT_BALANCE_402',
        failureReason: retry.adminWarningTr || String(lastResult.statusCode),
        actualInputTokens: totalInputTokens || lastResult.inputTokens || null,
        actualOutputTokens: totalOutputTokens || lastResult.outputTokens || null,
        messageTr: retry.adminWarningTr || 'Sağlayıcı hatası',
      }
    }

    if (!lastResult.text) {
      return {
        ...base,
        ok: false,
        paidCallExecuted: true,
        requestCount,
        providersInvoked: ['deepseek'],
        statusCode: lastResult.statusCode ?? null,
        failureReason: lastResult.errorCode || 'empty_response',
        finishReason: lastResult.finishReason ?? null,
        messageTr: 'Boş sağlayıcı yanıtı.',
      }
    }

    let validation = validateCanaryDraft(lastResult.text, {
      allowRepair: true,
      pack: input.pack,
      truncated: lastResult.truncated === true,
    })

    const parsed = extractJsonObject(lastResult.text)
    const repairDecision =
      allowRepair && requestCount < maxRequests
        ? shouldAttemptPaidSchemaRepair({
            validationOk: validation.ok,
            issueCodes: validation.issues.map((i) => i.code),
            jsonParseOk: parsed.ok,
            alreadyRepaired: paidRepairUsed,
            requestCount,
            maxRequests,
          })
        : { repair: false as const, reason: allowRepair ? 'cap' : 'auto_draft_no_repair' }

    if (repairDecision.repair) {
      const repairResult = await callOnce('schema_repair')
      if (repairResult.text) {
        lastResult = repairResult
        validation = validateCanaryDraft(repairResult.text, {
          allowRepair: true,
          pack: input.pack,
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

    if (!validation.ok || !validation.draft) {
      const primaryCode = validation.issues.find((i) => i.severity === 'error')?.code
      return {
        ...base,
        ok: false,
        paidCallExecuted: true,
        requestCount,
        repairUsed: paidRepairUsed,
        providersInvoked: ['deepseek'],
        statusCode: lastResult.statusCode ?? 200,
        validation,
        actualInputTokens: totalInputTokens || lastResult.inputTokens || null,
        actualOutputTokens: totalOutputTokens || lastResult.outputTokens || null,
        actualCostUsd: actualCost,
        finishReason: lastResult.finishReason ?? null,
        failureReason:
          primaryCode === 'OUTPUT_TRUNCATED'
            ? 'output_truncated'
            : primaryCode === 'INSUFFICIENT_SOURCE_MATERIAL'
              ? 'insufficient_source_material'
              : primaryCode === 'BODY_TOO_SHORT' || primaryCode === 'BODY_ABSOLUTE_TOO_SHORT'
                ? primaryCode.toLowerCase()
                : 'schema_validation_failed',
        messageTr:
          primaryCode === 'INSUFFICIENT_SOURCE_MATERIAL'
            ? 'Kaynak materyali yetersiz — ücretli retry yok.'
            : primaryCode === 'OUTPUT_TRUNCATED'
              ? 'Çıktı kesildi (truncation) — uzunluk repair yok.'
              : 'Şema doğrulaması başarısız (ücretli semantic repair yok).',
      }
    }

    const repaired = repairDraftDeterministically(validation.draft)
    const laneShort =
      input.lane === 'controlled_auto_draft' ? 'cad' : input.lane === 'manual_retry' ? 'mr' : 'mc'
    // Keep under crawler_ai_jobs.editorial_news_id varchar width (was 64; widened to 128 in 4D.3).
    const draftId = `d_${laneShort}_${input.pack.clusterId}`
    const factFlags = buildDeterministicFactFlags(repaired.draft, input.pack)

    return {
      ...base,
      ok: true,
      paidCallExecuted: true,
      requestCount,
      repairUsed: paidRepairUsed,
      providersInvoked: ['deepseek'],
      draft: repaired.draft,
      validation,
      factFlags,
      draftId,
      actualInputTokens: totalInputTokens || lastResult.inputTokens || null,
      actualOutputTokens: totalOutputTokens || lastResult.outputTokens || null,
      actualCostUsd: actualCost,
      finishReason: lastResult.finishReason ?? null,
      statusCode: lastResult.statusCode ?? 200,
      messageTr: 'AI taslağı hazır (AI_DRAFT). Otomatik yayın KAPALI. Editöryal onay ayrıdır.',
    }
  } catch (err) {
    return {
      ...base,
      ok: false,
      paidCallExecuted: requestCount > 0,
      requestCount,
      repairUsed: paidRepairUsed,
      providersInvoked: requestCount > 0 ? ['deepseek'] : [],
      failureReason: err instanceof Error ? err.message : 'provider_error',
      messageTr: 'Event draft başarısız; crawler etkilenmez.',
    }
  }
}

/** Publication is never performed by the shared writer. */
export function eventDraftPublicationAllowed(): false {
  return false
}
