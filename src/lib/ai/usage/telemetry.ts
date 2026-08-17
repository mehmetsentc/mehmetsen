import { Collections } from '@/lib/firebase/collections'
import { getAiUsageContext } from '@/lib/ai/usage/context'
import { estimateUsageCost, getModelPricing } from '@/lib/ai/usage/pricing'
import type { AiUsageEventDoc, RecordAiRequestUsageInput } from '@/lib/ai/usage/types'

const SCHEMA_VERSION = 1

export function isAiUsageTelemetryEnabled(): boolean {
  const raw = process.env.AI_USAGE_TELEMETRY_ENABLED
  if (raw === '0' || raw === 'false' || raw === 'off') return false
  return true
}

function newRequestId(): string {
  return crypto.randomUUID()
}

function compact<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue
    out[key] = value
  }
  return out
}

function debugLog(doc: Record<string, unknown>) {
  if (process.env.AI_USAGE_DEBUG !== '1') return
  console.log(
    `[AI_USAGE] agent=${String(doc.agentName ?? '—')} op=${String(doc.operation ?? '—')}` +
      ` model=${String(doc.model ?? '—')} input=${String(doc.inputTokens ?? '—')}` +
      ` output=${String(doc.outputTokens ?? '—')} latency=${String(doc.latencyMs ?? '—')}` +
      ` success=${String(doc.success)} attempt=${String(doc.attempt ?? 1)}`
  )
}

function buildEventDoc(input: RecordAiRequestUsageInput): Record<string, unknown> {
  const ctx = getAiUsageContext()
  const now = Date.now()
  const provider = input.provider ?? 'deepseek'
  const model = input.model ?? 'unknown'
  const usage = input.usage
  const costs = estimateUsageCost(usage, getModelPricing(provider, model))
  const attempt = input.attempt ?? ctx?.attempt ?? 1
  const retryCount = input.retryCount ?? Math.max(0, attempt - 1)

  const doc: AiUsageEventDoc = {
    requestId: input.requestId || newRequestId(),
    traceId: input.traceId ?? ctx?.traceId,
    newsId: input.newsId ?? ctx?.newsId,
    queueId: input.queueId ?? ctx?.queueId,
    sourceItemId: input.sourceItemId ?? ctx?.sourceItemId,
    agentName: input.agentName ?? ctx?.agentName ?? 'deepseek_client',
    operation: input.operation ?? ctx?.operation ?? 'chat_completion',
    promptVersion: input.promptVersion ?? ctx?.promptVersion,
    provider,
    model,
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
    cacheHitTokens: usage?.cacheHitTokens,
    cacheMissTokens: usage?.cacheMissTokens,
    latencyMs: input.latencyMs ?? input.durationMs,
    retryCount,
    attempt,
    success: input.success,
    statusCode: input.statusCode,
    errorCode: input.errorCode,
    estimatedInputCostUsd: costs.estimatedInputCostUsd,
    estimatedOutputCostUsd: costs.estimatedOutputCostUsd,
    estimatedCacheCostUsd: costs.estimatedCacheCostUsd,
    estimatedTotalCostUsd: costs.estimatedTotalCostUsd,
    inputHash: input.inputHash,
    schemaVersion: SCHEMA_VERSION,
    editorId: input.editorId,
    task: input.task,
    published: input.published,
    createdAt: now,
    timestamp: now,
    routeId: input.routeId,
    taskType: input.taskType,
    fallbackFrom: input.fallbackFrom,
    fallbackReason: input.fallbackReason,
    providerRank: input.providerRank,
    canaryBucket: input.canaryBucket,
  }

  return compact(doc as unknown as Record<string, unknown>)
}

async function persistUsageEvent(doc: Record<string, unknown>): Promise<void> {
  try {
    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    await getAdminFirestore().collection(Collections.AI_USAGE_EVENTS).add(doc)
  } catch (error) {
    console.warn(
      '[AI_USAGE] telemetry write failed:',
      error instanceof Error ? error.message : error
    )
  }
}

function scheduleUsageWrite(doc: Record<string, unknown>): void {
  const write = () => persistUsageEvent(doc)
  try {
    // next/server `after` keeps the write alive after the response on Vercel.
    // Outside a request (scripts / tests) it throws — fall back to void.
    void import('next/server')
      .then(({ after }) => {
        try {
          after(() => {
            void write()
          })
        } catch {
          void write()
        }
      })
      .catch(() => {
        void write()
      })
  } catch {
    void write()
  }
}

/**
 * Best-effort usage log. Never throws to callers.
 * Kill switch: AI_USAGE_TELEMETRY_ENABLED=false
 */
export function recordAiRequestUsage(input: RecordAiRequestUsageInput): void {
  try {
    if (!isAiUsageTelemetryEnabled()) return
    const doc = buildEventDoc(input)
    debugLog(doc)
    scheduleUsageWrite(doc)
  } catch (error) {
    console.warn(
      '[AI_USAGE] record failed:',
      error instanceof Error ? error.message : error
    )
  }
}

/** Test helper — builds the Firestore payload without I/O. */
export function buildAiUsageEventForTest(input: RecordAiRequestUsageInput): Record<string, unknown> {
  return buildEventDoc(input)
}
