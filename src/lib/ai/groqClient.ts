/**
 * Groq Chat Completions client (OpenAI-compatible).
 * Does not change DeepSeek return contracts. No automatic retry storm —
 * callers decide fallback (typically one Groq attempt → DeepSeek).
 */

import { hashAiInput } from '@/lib/ai/usage/hash'
import {
  classifyGroqErrorCode,
  parseGroqHttpStatus,
  parseGroqUsage,
} from '@/lib/ai/usage/parseUsage'
import { recordAiRequestUsage } from '@/lib/ai/usage/telemetry'
import type { AiUsageTelemetryMeta, NormalizedAiUsage } from '@/lib/ai/usage/types'
import { getGroqApiKey, getGroqFastModel } from '@/lib/ai/groqRouting'
import { extractJsonObject } from '@/lib/ai/router/validation'

export const GROQ_API_BASE = 'https://api.groq.com/openai/v1'

type ChatMessage = { role: string; content: string }

export type GroqJsonSchema = {
  name: string
  strict?: boolean
  schema: Record<string, unknown>
}

export interface GroqChatOptions {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  jsonMode?: boolean
  jsonSchema?: GroqJsonSchema
  telemetry?: AiUsageTelemetryMeta
  /** HTTP success is recorded by the caller after JSON/schema validation. */
  skipSuccessTelemetry?: boolean
  /** Skip all Groq-client telemetry (caller records its own event). */
  skipTelemetry?: boolean
}

export type GroqChatResult = {
  text: string
  usage?: NormalizedAiUsage
  latencyMs: number
  statusCode: number
  model: string
}

function isGptOss(model: string): boolean {
  return /gpt-oss/i.test(model)
}

function extractMessageText(data: {
  choices?: Array<{
    message?: {
      content?: string | null
      reasoning?: string | null
      reasoning_content?: string | null
    }
  }>
}): string {
  const message = data.choices?.[0]?.message
  const content = message?.content?.trim() ?? ''
  const reasoning = (message?.reasoning_content || message?.reasoning || '').trim()
  const fromContent = content ? extractJsonObject(content) : null
  if (fromContent) return fromContent
  const fromReasoning = reasoning ? extractJsonObject(reasoning) : null
  if (fromReasoning) return fromReasoning
  return content || reasoning
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
      provider: 'groq',
      model: opts.model,
      usage: opts.usage,
      latencyMs: opts.latencyMs,
      attempt: opts.telemetry?.attempt ?? opts.attempt,
      retryCount: opts.telemetry?.retryCount,
      success: opts.success,
      statusCode: opts.statusCode,
      errorCode: opts.errorCode,
      inputHash: opts.telemetry?.inputHash ?? opts.inputHash,
    })
  } catch (error) {
    console.warn(
      '[AI_USAGE] groq noteAttempt failed:',
      error instanceof Error ? error.message : error
    )
  }
}

/**
 * One Groq chat completion. Throws on HTTP / empty content.
 * Return type matches DeepSeek: Promise<string>.
 */
export async function groqChatCompletion(opts: GroqChatOptions): Promise<string> {
  const result = await groqChatCompletionDetailed(opts)
  return result.text
}

export async function groqChatCompletionDetailed(opts: GroqChatOptions): Promise<GroqChatResult> {
  const apiKey = getGroqApiKey()
  if (!apiKey) throw new Error('GROQ_API_KEY eksik')

  const model = opts.model?.trim() || getGroqFastModel()
  const jsonMode = opts.jsonMode !== false
  const attempt = opts.telemetry?.attempt ?? 1
  const inputHash = opts.telemetry?.inputHash ?? inputHashFromMessages(opts.messages)
  const startedAt = Date.now()
  const gptOss = isGptOss(model)
  const maxTokens = gptOss && jsonMode ? Math.max(opts.maxTokens ?? 200, 512) : (opts.maxTokens ?? 200)
  const record = (row: Parameters<typeof noteAttempt>[0]) => {
    if (opts.skipTelemetry) return
    noteAttempt(row)
  }

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.1,
    max_tokens: maxTokens,
    max_completion_tokens: maxTokens,
  }
  if (gptOss) {
    // json_object + default reasoning on gpt-oss returns HTTP 400 ("JSON") in production.
    body.include_reasoning = false
    body.reasoning_effort = 'low'
  }
  if (jsonMode && opts.jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: opts.jsonSchema.name,
        strict: opts.jsonSchema.strict !== false,
        schema: opts.jsonSchema.schema,
      },
    }
  } else if (jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  let res: Response
  try {
    res = await fetch(`${GROQ_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    record({
      telemetry: opts.telemetry,
      model,
      latencyMs: Date.now() - startedAt,
      success: false,
      errorCode: classifyGroqErrorCode(message),
      attempt,
      inputHash,
    })
    throw err
  }

  if (!res.ok) {
    const message = `Groq HTTP ${res.status}`
    record({
      telemetry: opts.telemetry,
      model,
      latencyMs: Date.now() - startedAt,
      success: false,
      statusCode: res.status,
      errorCode: classifyGroqErrorCode(message),
      attempt,
      inputHash,
    })
    throw new Error(message)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string; reasoning?: string } }>
    error?: { message?: string }
    usage?: unknown
  }
  const usage = parseGroqUsage(data.usage)
  const latencyMs = Date.now() - startedAt

  if (data.error?.message) {
    const message = `Groq error: ${data.error.message}`
    record({
      telemetry: opts.telemetry,
      model,
      usage,
      latencyMs,
      success: false,
      statusCode: 200,
      errorCode: classifyGroqErrorCode(message),
      attempt,
      inputHash,
    })
    throw new Error(message)
  }

  const text = extractMessageText(data)
  if (!text) {
    const message = 'Groq boş yanıt döndürdü (0 karakter)'
    record({
      telemetry: opts.telemetry,
      model,
      usage,
      latencyMs,
      success: false,
      statusCode: 200,
      errorCode: classifyGroqErrorCode(message),
      attempt,
      inputHash,
    })
    throw new Error(message)
  }

  if (!opts.skipTelemetry && !opts.skipSuccessTelemetry) {
    record({
      telemetry: opts.telemetry,
      model,
      usage,
      latencyMs,
      success: true,
      statusCode: 200,
      attempt,
      inputHash,
    })
  }
  return { text, usage, latencyMs, statusCode: 200, model }
}

export function recordGroqObservation(opts: {
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
}): void {
  const model = opts.model?.trim() || getGroqFastModel()
  const usage =
    opts.body && typeof opts.body === 'object'
      ? parseGroqUsage((opts.body as { usage?: unknown }).usage)
      : undefined
  const errorCode = opts.success
    ? undefined
    : classifyGroqErrorCode(opts.errorMessage || `Groq HTTP ${opts.statusCode ?? 0}`)
  try {
    recordAiRequestUsage({
      agentName: opts.agentName,
      operation: opts.operation,
      promptVersion: opts.promptVersion,
      provider: 'groq',
      model,
      usage,
      latencyMs: Date.now() - opts.startedAt,
      attempt: opts.attempt ?? 1,
      retryCount: opts.retryCount,
      success: opts.success,
      statusCode: opts.statusCode ?? parseGroqHttpStatus(opts.errorMessage || ''),
      errorCode,
    })
  } catch (error) {
    console.warn(
      '[AI_USAGE] groq observation failed:',
      error instanceof Error ? error.message : error
    )
  }
}
