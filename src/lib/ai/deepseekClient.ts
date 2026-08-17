/**
 * Shared DeepSeek Chat Completions client (OpenAI-compatible).
 *
 * DeepSeek V4 (`deepseek-v4-flash` / `deepseek-v4-pro`) defaults to thinking mode.
 * With thinking on, `message.content` is often empty while tokens go to
 * `reasoning_content` — which surfaced as "DeepSeek JSON parse hatası (0 karakter)".
 * Editorial / JSON calls must disable thinking.
 *
 * Return contract: `deepseekChatCompletion` still returns `Promise<string>`.
 * Usage telemetry is a best-effort side effect and never changes that contract.
 */

import { hashAiInput } from '@/lib/ai/usage/hash'
import {
  classifyDeepSeekErrorCode,
  parseDeepSeekHttpStatus,
  parseDeepSeekUsage,
} from '@/lib/ai/usage/parseUsage'
import { recordAiRequestUsage } from '@/lib/ai/usage/telemetry'
import type { AiUsageTelemetryMeta, NormalizedAiUsage } from '@/lib/ai/usage/types'

export const DEEPSEEK_API_BASE = 'https://api.deepseek.com/v1'

/** Safe default after deepseek-chat retirement (2026-07-24). */
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash'

export function getDeepSeekApiKey(): string | null {
  const key = process.env.DEEPSEEK_API_KEY?.trim()
  return key || null
}

export function getDeepSeekModel(explicit?: string | null): string {
  const fromEnv =
    process.env.DEEPSEEK_NEWS_MODEL?.trim() ||
    process.env.DEEPSEEK_MODEL?.trim() ||
    ''
  const raw = (explicit?.trim() || fromEnv || DEEPSEEK_DEFAULT_MODEL).trim()
  // Legacy aliases — map to V4 flash (non-thinking via request body)
  if (raw === 'deepseek-chat' || raw === 'deepseek-reasoner') {
    return DEEPSEEK_DEFAULT_MODEL
  }
  return raw
}

export function isGeminiFallbackEnabled(): boolean {
  // Gemini credits depleted — only use when explicitly re-enabled
  if (process.env.GEMINI_FALLBACK === 'true') return true
  if (process.env.GEMINI_ENABLED === 'false') return false
  // Default off while billing is empty; set GEMINI_FALLBACK=true after topping up
  return process.env.GEMINI_FALLBACK === '1'
}

export function isGeminiCreditError(message: string): boolean {
  return /prepayment credits are depleted|RESOURCE_EXHAUSTED|billing|quota/i.test(message)
}

type ChatMessage = { role: string; content: string }

export interface DeepSeekChatOptions {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  /** Default true — required for stable JSON editorial output on V4 */
  disableThinking?: boolean
  jsonMode?: boolean
  /** Observability only — does not change model/prompt/retry behavior. */
  telemetry?: AiUsageTelemetryMeta
}

function extractMessageText(data: {
  choices?: Array<{
    message?: {
      content?: string | null
      reasoning_content?: string | null
    }
  }>
}): string {
  const message = data.choices?.[0]?.message
  const content = message?.content?.trim() ?? ''
  if (content) return content

  // Last resort: some thinking responses only fill reasoning_content
  const reasoning = message?.reasoning_content?.trim() ?? ''
  if (reasoning) {
    const fence = reasoning.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence?.[1]?.trim()) return fence[1].trim()
    const obj = reasoning.match(/\{[\s\S]*\}/)
    if (obj?.[0]) return obj[0]
  }
  return ''
}

function inputHashFromMessages(messages: ChatMessage[]): string | undefined {
  try {
    return hashAiInput(messages.map((m) => `${m.role}:${m.content}`).join('\n'))
  } catch {
    return undefined
  }
}

function noteAttempt(opts: {
  telemetry?: AiUsageTelemetryMeta
  model: string
  usage?: NormalizedAiUsage
  latencyMs: number
  success: boolean
  statusCode?: number
  errorCode?: string
  attempt: number
  inputHash?: string
}) {
  try {
    recordAiRequestUsage({
      requestId: opts.telemetry?.requestId,
      traceId: opts.telemetry?.traceId,
      newsId: opts.telemetry?.newsId,
      queueId: opts.telemetry?.queueId,
      sourceItemId: opts.telemetry?.sourceItemId,
      agentName: opts.telemetry?.agentName,
      operation: opts.telemetry?.operation,
      promptVersion: opts.telemetry?.promptVersion,
      provider: 'deepseek',
      model: opts.model,
      usage: opts.usage,
      latencyMs: opts.latencyMs,
      attempt: opts.telemetry?.attempt ?? opts.attempt,
      retryCount: opts.telemetry?.retryCount,
      success: opts.success,
      statusCode: opts.statusCode,
      errorCode: opts.errorCode,
      inputHash: opts.telemetry?.inputHash ?? opts.inputHash,
      generationReason: opts.telemetry?.generationReason,
      resultCategoryId: opts.telemetry?.resultCategoryId,
    })
  } catch (error) {
    console.warn(
      '[AI_USAGE] noteAttempt failed:',
      error instanceof Error ? error.message : error
    )
  }
}

/**
 * One DeepSeek chat completion. Throws on HTTP / empty content.
 * Return type is unchanged: string only.
 */
export async function deepseekChatCompletion(opts: DeepSeekChatOptions): Promise<string> {
  const apiKey = getDeepSeekApiKey()
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY eksik')

  const model = getDeepSeekModel(opts.model)
  const disableThinking = opts.disableThinking !== false
  const jsonMode = opts.jsonMode !== false
  const attempt = opts.telemetry?.attempt ?? 1
  const inputHash = opts.telemetry?.inputHash ?? inputHashFromMessages(opts.messages)
  const startedAt = Date.now()

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 2048,
  }
  if (jsonMode) {
    body.response_format = { type: 'json_object' }
  }
  if (disableThinking) {
    // V4: without this, content is often "" and reasoning_content holds the draft
    body.thinking = { type: 'disabled' }
  }

  let res: Response
  try {
    res = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    noteAttempt({
      telemetry: opts.telemetry,
      model,
      latencyMs: Date.now() - startedAt,
      success: false,
      errorCode: classifyDeepSeekErrorCode(message),
      attempt,
      inputHash,
    })
    throw err
  }

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    const message = `DeepSeek HTTP ${res.status}: ${err.slice(0, 240)}`
    noteAttempt({
      telemetry: opts.telemetry,
      model,
      latencyMs: Date.now() - startedAt,
      success: false,
      statusCode: res.status,
      errorCode: classifyDeepSeekErrorCode(message),
      attempt,
      inputHash,
    })
    throw new Error(message)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>
    error?: { message?: string }
    usage?: unknown
  }

  const usage = parseDeepSeekUsage(data.usage)

  if (data.error?.message) {
    const message = `DeepSeek error: ${data.error.message}`
    noteAttempt({
      telemetry: opts.telemetry,
      model,
      usage,
      latencyMs: Date.now() - startedAt,
      success: false,
      statusCode: 200,
      errorCode: classifyDeepSeekErrorCode(message),
      attempt,
      inputHash,
    })
    throw new Error(message)
  }

  const text = extractMessageText(data)
  if (!text) {
    const message = 'DeepSeek boş yanıt döndürdü (0 karakter)'
    noteAttempt({
      telemetry: opts.telemetry,
      model,
      usage,
      latencyMs: Date.now() - startedAt,
      success: false,
      statusCode: 200,
      errorCode: classifyDeepSeekErrorCode(message),
      attempt,
      inputHash,
    })
    throw new Error(message)
  }

  noteAttempt({
    telemetry: opts.telemetry,
    model,
    usage,
    latencyMs: Date.now() - startedAt,
    success: true,
    statusCode: 200,
    attempt,
    inputHash,
  })
  return text
}

/**
 * Retry once with thinking disabled + slightly lower max_tokens on empty/timeout.
 * Retry policy is unchanged — only attempt numbers are recorded.
 */
export async function deepseekChatCompletionWithRetry(
  opts: DeepSeekChatOptions
): Promise<string> {
  try {
    return await deepseekChatCompletion({
      ...opts,
      disableThinking: true,
      telemetry: { ...opts.telemetry, attempt: opts.telemetry?.attempt ?? 1 },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const retryable = /boş yanıt|0 karakter|timeout|aborted|AbortError|HTTP 429|HTTP 5\d\d/i.test(
      msg
    )
    if (!retryable) throw err

    await new Promise((r) => setTimeout(r, /429/.test(msg) ? 2500 : 400))
    return deepseekChatCompletion({
      ...opts,
      disableThinking: true,
      maxTokens: Math.max(1024, Math.floor((opts.maxTokens ?? 4000) * 0.75)),
      timeoutMs: Math.min(opts.timeoutMs ?? 90_000, 70_000),
      telemetry: { ...opts.telemetry, attempt: 2, retryCount: 1 },
    })
  }
}

/** Direct-fetch call sites: record usage without changing fetch/retry. */
export function recordDirectDeepSeekObservation(opts: {
  agentName: string
  operation: string
  promptVersion: string
  model?: string
  startedAt: number
  success: boolean
  statusCode?: number
  body?: unknown
  errorMessage?: string
  attempt?: number
  retryCount?: number
  inputHash?: string
  generationReason?: string
  resultCategoryId?: string
  schemaValid?: boolean
  promptVariant?: string
  stage3CanaryBucket?: number
  canaryBucket?: number
  fallbackReason?: string
  errorCode?: string
}): void {
  const model = getDeepSeekModel(opts.model)
  const usage =
    opts.body && typeof opts.body === 'object'
      ? parseDeepSeekUsage((opts.body as { usage?: unknown }).usage)
      : undefined
  const errorCode = opts.success
    ? undefined
    : opts.errorCode || classifyDeepSeekErrorCode(opts.errorMessage || `DeepSeek HTTP ${opts.statusCode ?? 0}`)
  try {
    recordAiRequestUsage({
      agentName: opts.agentName,
      operation: opts.operation,
      promptVersion: opts.promptVersion,
      provider: 'deepseek',
      model,
      usage,
      latencyMs: Date.now() - opts.startedAt,
      attempt: opts.attempt ?? 1,
      retryCount: opts.retryCount,
      success: opts.success,
      statusCode: opts.statusCode ?? parseDeepSeekHttpStatus(opts.errorMessage || ''),
      errorCode,
      inputHash: opts.inputHash,
      generationReason: opts.generationReason,
      resultCategoryId: opts.resultCategoryId,
      schemaValid: opts.schemaValid,
      promptVariant: opts.promptVariant,
      stage3CanaryBucket: opts.stage3CanaryBucket,
      canaryBucket: opts.canaryBucket,
      fallbackReason: opts.fallbackReason,
    })
  } catch (error) {
    console.warn(
      '[AI_USAGE] direct observation failed:',
      error instanceof Error ? error.message : error
    )
  }
}
