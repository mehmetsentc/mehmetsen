/**
 * Classifier LLM router: optional Groq GPT-OSS 20B with hard DeepSeek fallback.
 * Prompts stay at the call site. One Groq attempt, then existing DeepSeek fetch.
 */

import { recordDirectDeepSeekObservation, getDeepSeekModel } from '@/lib/ai/deepseekClient'
import { groqChatCompletionDetailed, type GroqChatResult } from '@/lib/ai/groqClient'
import { getGroqFastModel, shouldUseGroqClassifier } from '@/lib/ai/groqRouting'
import { recordAiRequestUsage } from '@/lib/ai/usage/telemetry'
import type { NormalizedAiUsage } from '@/lib/ai/usage/types'

export type ClassifierLlmMeta = {
  agentName: string
  operation: string
  promptVersion: string
  system: string
  user: string
  cohortKey?: string
}

export type ClassifierProvider = 'groq' | 'deepseek'

async function deepseekClassifierChat(
  meta: ClassifierLlmMeta,
  attempt: number,
  retryCount?: number
): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null
  const model = getDeepSeekModel()
  const startedAt = Date.now()
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        max_tokens: 200,
        messages: [
          { role: 'system', content: meta.system },
          { role: 'user', content: meta.user },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      recordDirectDeepSeekObservation({
        agentName: meta.agentName,
        operation: meta.operation,
        promptVersion: meta.promptVersion,
        model,
        startedAt,
        success: false,
        statusCode: res.status,
        attempt,
        retryCount,
      })
      return null
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: unknown
    }
    const raw = json.choices?.[0]?.message?.content?.trim()
    recordDirectDeepSeekObservation({
      agentName: meta.agentName,
      operation: meta.operation,
      promptVersion: meta.promptVersion,
      model,
      startedAt,
      success: Boolean(raw),
      statusCode: 200,
      body: json,
      attempt,
      retryCount,
      errorMessage: raw ? undefined : 'empty_content',
    })
    return raw || null
  } catch (err) {
    recordDirectDeepSeekObservation({
      agentName: meta.agentName,
      operation: meta.operation,
      promptVersion: meta.promptVersion,
      model,
      startedAt,
      success: false,
      attempt,
      retryCount,
      errorMessage: err instanceof Error ? err.message : 'deepseek_classifier_failed',
    })
    return null
  }
}

async function groqClassifierChat(meta: ClassifierLlmMeta): Promise<GroqChatResult | null> {
  try {
    return await groqChatCompletionDetailed({
      model: getGroqFastModel(),
      temperature: 0.1,
      maxTokens: 200,
      timeoutMs: 10_000,
      jsonMode: true,
      skipSuccessTelemetry: true,
      messages: [
        { role: 'system', content: meta.system },
        { role: 'user', content: meta.user },
      ],
      telemetry: {
        agentName: meta.agentName,
        operation: meta.operation,
        promptVersion: meta.promptVersion,
        attempt: 1,
      },
    })
  } catch {
    return null
  }
}

function looksLikeJsonObject(raw: string): boolean {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{') && trimmed.includes('}')) return true
  return /```(?:json)?\s*\{/i.test(trimmed)
}

function noteGroqOutcome(opts: {
  meta: ClassifierLlmMeta
  usage?: NormalizedAiUsage
  latencyMs?: number
  success: boolean
  errorCode?: string
}) {
  try {
    recordAiRequestUsage({
      agentName: opts.meta.agentName,
      operation: opts.meta.operation,
      promptVersion: opts.meta.promptVersion,
      provider: 'groq',
      model: getGroqFastModel(),
      usage: opts.usage,
      latencyMs: opts.latencyMs,
      success: opts.success,
      statusCode: opts.success ? 200 : undefined,
      errorCode: opts.errorCode,
      attempt: 1,
    })
  } catch (error) {
    console.warn(
      '[AI_USAGE] groq classifier outcome failed:',
      error instanceof Error ? error.message : error
    )
  }
}

/**
 * Groq (if eligible) then DeepSeek. Schema/JSON failure on Groq also falls back.
 * Never throws to the news pipeline.
 */
export async function completeClassifierJson<T>(
  meta: ClassifierLlmMeta,
  validate: (raw: string) => T | null
): Promise<T | null> {
  const useGroq = shouldUseGroqClassifier(meta.cohortKey)

  if (useGroq) {
    const groq = await groqClassifierChat(meta)
    if (groq) {
      if (!looksLikeJsonObject(groq.text)) {
        noteGroqOutcome({
          meta,
          usage: groq.usage,
          latencyMs: groq.latencyMs,
          success: false,
          errorCode: 'invalid_json',
        })
      } else {
        const parsed = validate(groq.text)
        if (parsed) {
          noteGroqOutcome({
            meta,
            usage: groq.usage,
            latencyMs: groq.latencyMs,
            success: true,
          })
          return parsed
        }
        noteGroqOutcome({
          meta,
          usage: groq.usage,
          latencyMs: groq.latencyMs,
          success: false,
          errorCode: 'schema_validation',
        })
      }
    }
    const dsRaw = await deepseekClassifierChat(meta, 2, 1)
    if (!dsRaw) return null
    return validate(dsRaw)
  }

  const dsRaw = await deepseekClassifierChat(meta, 1)
  if (!dsRaw) return null
  return validate(dsRaw)
}

/** Test helper — orchestration only, no network. */
export async function routeClassifierWithProviders<T>(opts: {
  useGroq: boolean
  groq: () => Promise<string | null>
  deepseek: () => Promise<string | null>
  validate: (raw: string) => T | null
}): Promise<{ value: T | null; used: ClassifierProvider | null; fallback: boolean }> {
  if (opts.useGroq) {
    let groqRaw: string | null = null
    try {
      groqRaw = await opts.groq()
    } catch {
      groqRaw = null
    }
    if (groqRaw) {
      const parsed = opts.validate(groqRaw)
      if (parsed) return { value: parsed, used: 'groq', fallback: false }
    }
    let dsRaw: string | null = null
    try {
      dsRaw = await opts.deepseek()
    } catch {
      dsRaw = null
    }
    if (!dsRaw) return { value: null, used: null, fallback: true }
    return { value: opts.validate(dsRaw), used: 'deepseek', fallback: true }
  }
  let dsRaw: string | null = null
  try {
    dsRaw = await opts.deepseek()
  } catch {
    dsRaw = null
  }
  if (!dsRaw) return { value: null, used: null, fallback: false }
  return { value: opts.validate(dsRaw), used: 'deepseek', fallback: false }
}
