/**
 * OpenRouter Chat Completions adapter.
 * Model comes only from OPENROUTER_FAST_MODEL — never hardcoded.
 */

import { getOpenRouterApiKey, getOpenRouterFastModel } from '@/lib/ai/router/policy'
import { classifyProviderFailure } from '@/lib/ai/router/validation'
import { parseDeepSeekUsage } from '@/lib/ai/usage/parseUsage'
import { recordAiRequestUsage } from '@/lib/ai/usage/telemetry'
import type { ChatMessage, ProviderAttemptResult } from '@/lib/ai/router/types'
import type { AiUsageTelemetryMeta } from '@/lib/ai/usage/types'

export const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1'

export async function openRouterFastChat(opts: {
  messages: ChatMessage[]
  temperature: number
  maxTokens: number
  timeoutMs: number
  jsonMode: boolean
  telemetry?: AiUsageTelemetryMeta
}): Promise<ProviderAttemptResult> {
  const apiKey = getOpenRouterApiKey()
  const model = getOpenRouterFastModel()
  if (!apiKey || !model) throw new Error('OPENROUTER_FAST_MODEL or OPENROUTER_API_KEY eksik')

  const startedAt = Date.now()
  const attempt = opts.telemetry?.attempt ?? 1
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  }
  if (opts.jsonMode) body.response_format = { type: 'json_object' }

  let res: Response
  try {
    res = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    recordAiRequestUsage({
      ...opts.telemetry,
      provider: 'openrouter',
      model,
      success: false,
      errorCode: classifyProviderFailure(message),
      attempt,
      latencyMs: Date.now() - startedAt,
    })
    throw err
  }

  const latencyMs = Date.now() - startedAt
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    const message = `OpenRouter HTTP ${res.status}: ${err.slice(0, 240)}`
    recordAiRequestUsage({
      ...opts.telemetry,
      provider: 'openrouter',
      model,
      success: false,
      statusCode: res.status,
      errorCode: classifyProviderFailure(message),
      attempt,
      latencyMs,
    })
    throw new Error(message)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
    usage?: unknown
  }
  const usage = parseDeepSeekUsage(data.usage)
  if (data.error?.message) {
    recordAiRequestUsage({
      ...opts.telemetry,
      provider: 'openrouter',
      model,
      usage,
      success: false,
      errorCode: classifyProviderFailure(data.error.message),
      attempt,
      latencyMs,
    })
    throw new Error(data.error.message)
  }
  const text = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (!text) {
    recordAiRequestUsage({
      ...opts.telemetry,
      provider: 'openrouter',
      model,
      usage,
      success: false,
      statusCode: 200,
      errorCode: 'empty_content',
      attempt,
      latencyMs,
    })
    throw new Error('OpenRouter boş yanıt döndürdü (0 karakter)')
  }
  return { text, usage, latencyMs, statusCode: 200, model }
}
