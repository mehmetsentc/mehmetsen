import { groqChatCompletionDetailed, type GroqJsonSchema } from '@/lib/ai/groqClient'
import { getGroqFastModel } from '@/lib/ai/groqRouting'
import { groqCohortBucket, classifierCohortKey } from '@/lib/ai/groqRouting'
import { geminiFastChat } from '@/lib/ai/providers/geminiChat'
import { openRouterFastChat } from '@/lib/ai/providers/openrouter'
import { deepseekOneShotChat } from '@/lib/ai/providers/deepseekOneShot'
import {
  classifierCacheKey,
  hashMessages,
  readClassifierCache,
  writeClassifierCache,
} from '@/lib/ai/router/cache'
import {
  maxTokensForTask,
  resolveProviderChain,
  temperatureForTask,
  timeoutForTask,
} from '@/lib/ai/router/policy'
import { CLASSIFIER_JSON_SCHEMA } from '@/lib/ai/router/classifierSchema'
import { classifyJsonFailure, extractJsonObject } from '@/lib/ai/router/validation'
import { recordAiRequestUsage } from '@/lib/ai/usage/telemetry'
import { mayAutomatedCrawlerUseAi, isManualEditorAiEnabled } from '@/services/crawler/automatedAiPolicy'
import { getAiUsageContext } from '@/lib/ai/usage/context'
import type {
  ProviderAttemptResult,
  RouterProviderId,
  RunAiInput,
  RunAiResult,
} from '@/lib/ai/router/types'

async function callProvider(
  id: RouterProviderId,
  opts: RunAiInput<unknown> & { attempt: number }
): Promise<ProviderAttemptResult> {
  const temperature = opts.temperature ?? temperatureForTask(opts.taskType)
  const maxTokens = opts.maxTokens ?? maxTokensForTask(opts.taskType)
  const timeoutMs = opts.timeoutMs ?? timeoutForTask(opts.taskType)
  const jsonMode = opts.jsonMode !== false
  const telemetry = {
    agentName: opts.agent,
    operation: opts.operation,
    promptVersion: opts.promptVersion,
    attempt: opts.attempt,
  }

  if (id === 'groq') {
    return groqChatCompletionDetailed({
      model: getGroqFastModel(),
      messages: opts.messages,
      temperature,
      maxTokens,
      timeoutMs,
      jsonMode,
      jsonSchema:
        opts.taskType === 'classification'
          ? (CLASSIFIER_JSON_SCHEMA as GroqJsonSchema)
          : undefined,
      skipSuccessTelemetry: true,
      telemetry,
    })
  }
  if (id === 'gemini') {
    return geminiFastChat({
      messages: opts.messages,
      temperature,
      maxTokens,
      timeoutMs,
      jsonMode,
      telemetry,
    })
  }
  if (id === 'openrouter') {
    return openRouterFastChat({
      messages: opts.messages,
      temperature,
      maxTokens,
      timeoutMs,
      jsonMode,
      telemetry,
    })
  }
  return deepseekOneShotChat({
    messages: opts.messages,
    temperature,
    maxTokens,
    timeoutMs,
    jsonMode,
    agentName: opts.agent,
    operation: opts.operation,
    promptVersion: opts.promptVersion,
    attempt: opts.attempt,
    retryCount: Math.max(0, opts.attempt - 1),
    skipSuccessTelemetry: true,
  })
}

function noteCheapSuccess(opts: {
  input: RunAiInput<unknown>
  provider: RouterProviderId
  model: string
  result: ProviderAttemptResult
  attempt: number
  fallbackFrom?: RouterProviderId
  fallbackReason?: string
  canaryBucket: number
  value?: unknown
}) {
  const categoryId =
    opts.value &&
    typeof opts.value === 'object' &&
    'categoryId' in opts.value &&
    typeof (opts.value as { categoryId?: unknown }).categoryId === 'string'
      ? (opts.value as { categoryId: string }).categoryId
      : undefined
  try {
    recordAiRequestUsage({
      agentName: opts.input.agent,
      operation: opts.input.operation,
      promptVersion: opts.input.promptVersion,
      provider: opts.provider,
      model: opts.model,
      usage: opts.result.usage,
      latencyMs: opts.result.latencyMs,
      success: true,
      statusCode: 200,
      attempt: opts.attempt,
      retryCount: Math.max(0, opts.attempt - 1),
      taskType: opts.input.taskType,
      routeId: `${opts.input.taskType}:${opts.input.agent}:${opts.input.operation}`,
      fallbackFrom: opts.fallbackFrom,
      fallbackReason: opts.fallbackReason,
      providerRank: opts.attempt,
      canaryBucket: opts.canaryBucket,
      resultCategoryId: categoryId,
    })
  } catch (error) {
    console.warn('[AI_USAGE] router success note failed:', error instanceof Error ? error.message : error)
  }
}

function noteCheapSchemaFail(opts: {
  input: RunAiInput<unknown>
  provider: RouterProviderId
  model: string
  result: ProviderAttemptResult
  attempt: number
  errorCode: string
  canaryBucket: number
}) {
  try {
    recordAiRequestUsage({
      agentName: opts.input.agent,
      operation: opts.input.operation,
      promptVersion: opts.input.promptVersion,
      provider: opts.provider,
      model: opts.model,
      usage: opts.result.usage,
      latencyMs: opts.result.latencyMs,
      success: false,
      errorCode: opts.errorCode,
      attempt: opts.attempt,
      taskType: opts.input.taskType,
      routeId: `${opts.input.taskType}:${opts.input.agent}:${opts.input.operation}`,
      fallbackReason: opts.errorCode,
      providerRank: opts.attempt,
      canaryBucket: opts.canaryBucket,
    })
  } catch (error) {
    console.warn('[AI_USAGE] router fail note failed:', error instanceof Error ? error.message : error)
  }
}

export async function runAI<T>(input: RunAiInput<T>): Promise<RunAiResult<T>> {
  const ctx = getAiUsageContext()
  const isManual = ctx?.ingestionLane === 'manual_editor'
  if (isManual) {
    if (!isManualEditorAiEnabled()) {
      return { value: null, provider: null, fallback: false }
    }
  } else {
    if (!mayAutomatedCrawlerUseAi()) {
      return { value: null, provider: null, fallback: false }
    }
  }

  const chain = resolveProviderChain(input.taskType, input.cohortKey)
  const canaryBucket = groqCohortBucket(classifierCohortKey(input.cohortKey))
  const inputHash = hashMessages(input.messages)
  const cacheKey =
    input.taskType === 'classification'
      ? classifierCacheKey({
          operation: input.operation,
          promptVersion: input.promptVersion,
          inputHash,
        })
      : null
  const cached = readClassifierCache(cacheKey)
  if (cached && input.validate) {
    const parsed = input.validate(cached)
    if (parsed) return { value: parsed, provider: null, fallback: false }
  }

  let fallbackFrom: RouterProviderId | undefined
  let fallbackReason: string | undefined
  let lastError: string | undefined

  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i]!
    const attempt = i + 1
    let result: ProviderAttemptResult | null = null
    try {
      result = await callProvider(provider, { ...input, attempt })
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'provider_error'
      fallbackFrom = fallbackFrom ?? provider
      fallbackReason = lastError
      continue
    }

    if (input.validate) {
      const jsonText = extractJsonObject(result.text)
      if (!jsonText) {
        const errorCode = classifyJsonFailure(result.text)
        noteCheapSchemaFail({
          input,
          provider,
          model: result.model,
          result,
          attempt,
          errorCode,
          canaryBucket,
        })
        fallbackFrom = fallbackFrom ?? provider
        fallbackReason = errorCode
        continue
      }
      const parsed = input.validate(jsonText)
      if (!parsed) {
        noteCheapSchemaFail({
          input,
          provider,
          model: result.model,
          result,
          attempt,
          errorCode: 'schema_validation',
          canaryBucket,
        })
        fallbackFrom = fallbackFrom ?? provider
        fallbackReason = 'schema_validation'
        continue
      }
      noteCheapSuccess({
        input,
        provider,
        model: result.model,
        result,
        attempt,
        fallbackFrom,
        fallbackReason,
        canaryBucket,
        value: parsed,
      })
      writeClassifierCache(cacheKey, jsonText)
      return {
        value: parsed,
        provider,
        fallback: attempt > 1,
        fallbackFrom,
        fallbackReason,
      }
    }

    noteCheapSuccess({
      input,
      provider,
      model: result.model,
      result,
      attempt,
      fallbackFrom,
      fallbackReason,
      canaryBucket,
    })
    return {
      value: result.text,
      provider,
      fallback: attempt > 1,
      fallbackFrom,
      fallbackReason,
    }
  }

  return {
    value: null,
    provider: null,
    fallback: Boolean(fallbackFrom),
    fallbackFrom,
    fallbackReason: fallbackReason ?? lastError,
  }
}

/** Test helper — orchestration only. */
export async function runProviderChainForTest<T>(opts: {
  providers: Array<{
    id: RouterProviderId
    call: () => Promise<string | null>
  }>
  validate: (raw: string) => T | null
}): Promise<{ value: T | null; used: RouterProviderId | null; fallback: boolean; skipped: RouterProviderId[] }> {
  const skipped: RouterProviderId[] = []
  let fallback = false
  for (let i = 0; i < opts.providers.length; i++) {
    const step = opts.providers[i]!
    let raw: string | null = null
    try {
      raw = await step.call()
    } catch {
      raw = null
    }
    if (raw) {
      const parsed = opts.validate(raw)
      if (parsed) {
        return { value: parsed, used: step.id, fallback, skipped }
      }
    }
    skipped.push(step.id)
    if (i < opts.providers.length - 1) fallback = true
  }
  return { value: null, used: null, fallback, skipped }
}
