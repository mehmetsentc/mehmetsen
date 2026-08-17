import { getDeepSeekModel } from '@/lib/ai/deepseekClient'
import { recordDirectDeepSeekObservation } from '@/lib/ai/deepseekClient'
import type { ChatMessage, ProviderAttemptResult } from '@/lib/ai/router/types'
import { parseDeepSeekUsage } from '@/lib/ai/usage/parseUsage'

/** One-shot DeepSeek fetch — no client-level 429 retry storm. */
export async function deepseekOneShotChat(opts: {
  messages: ChatMessage[]
  temperature: number
  maxTokens: number
  timeoutMs: number
  jsonMode: boolean
  agentName: string
  operation: string
  promptVersion: string
  attempt: number
  retryCount?: number
}): Promise<ProviderAttemptResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY eksik')
  const model = getDeepSeekModel()
  const startedAt = Date.now()
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      thinking: { type: 'disabled' },
      messages: opts.messages,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs),
  })
  if (!res.ok) {
    recordDirectDeepSeekObservation({
      agentName: opts.agentName,
      operation: opts.operation,
      promptVersion: opts.promptVersion,
      model,
      startedAt,
      success: false,
      statusCode: res.status,
      attempt: opts.attempt,
      retryCount: opts.retryCount,
    })
    throw new Error(`DeepSeek HTTP ${res.status}`)
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: unknown
  }
  const text = json.choices?.[0]?.message?.content?.trim() ?? ''
  recordDirectDeepSeekObservation({
    agentName: opts.agentName,
    operation: opts.operation,
    promptVersion: opts.promptVersion,
    model,
    startedAt,
    success: Boolean(text),
    statusCode: 200,
    body: json,
    attempt: opts.attempt,
    retryCount: opts.retryCount,
    errorMessage: text ? undefined : 'empty_content',
  })
  if (!text) throw new Error('DeepSeek boş yanıt döndürdü (0 karakter)')
  return {
    text,
    usage: parseDeepSeekUsage(json.usage),
    latencyMs: Date.now() - startedAt,
    statusCode: 200,
    model,
  }
}
