/**
 * Gemini generateContent adapter for cheap routing.
 * Uses GEMINI_FAST_MODEL only — does not read or change GEMINI_MODEL.
 */

import { getGeminiApiKey, getGeminiFastModel } from '@/lib/ai/router/policy'
import { classifyGeminiError } from '@/lib/ai/router/validation'
import { isGeminiCircuitOpen, openGeminiCircuit } from '@/lib/ai/providers/geminiCircuit'
import { parseGeminiUsage } from '@/lib/ai/usage/parseUsage'
import { recordAiRequestUsage } from '@/lib/ai/usage/telemetry'
import type { ChatMessage, ProviderAttemptResult } from '@/lib/ai/router/types'
import type { AiUsageTelemetryMeta } from '@/lib/ai/usage/types'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function extractText(data: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  error?: { message?: string; status?: string }
}): string {
  if (data.error?.message) throw new Error(data.error.message)
  return (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
    .trim()
}

export async function geminiFastChat(opts: {
  messages: ChatMessage[]
  temperature: number
  maxTokens: number
  timeoutMs: number
  jsonMode: boolean
  telemetry?: AiUsageTelemetryMeta
  skipTelemetry?: boolean
}): Promise<ProviderAttemptResult> {
  const apiKey = getGeminiApiKey()
  const model = getGeminiFastModel()
  if (!apiKey || !model) throw new Error('GEMINI_FAST_MODEL or GEMINI_API_KEY eksik')
  if (isGeminiCircuitOpen()) throw new Error('Gemini circuit open')

  const system = opts.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  const user = opts.messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n')
  const startedAt = Date.now()
  const attempt = opts.telemetry?.attempt ?? 1
  const record = (row: Parameters<typeof recordAiRequestUsage>[0]) => {
    if (opts.skipTelemetry) return
    recordAiRequestUsage(row)
  }

  let res: Response
  try {
    res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: user }] }],
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: {
          temperature: opts.temperature,
          maxOutputTokens: opts.maxTokens,
          ...(opts.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    record({
      ...opts.telemetry,
      provider: 'gemini',
      model,
      success: false,
      errorCode: classifyGeminiError(undefined, message),
      attempt,
      latencyMs: Date.now() - startedAt,
    })
    throw err
  }

  const latencyMs = Date.now() - startedAt
  if (!res.ok) {
    const message = `Gemini HTTP ${res.status}`
    const errorCode = classifyGeminiError(res.status, message)
    if (errorCode === 'quota_429') openGeminiCircuit()
    record({
      ...opts.telemetry,
      provider: 'gemini',
      model,
      success: false,
      statusCode: res.status,
      errorCode,
      attempt,
      latencyMs,
    })
    throw new Error(message)
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string; status?: string }
    usageMetadata?: unknown
  }
  const usage = parseGeminiUsage(data.usageMetadata)
  if (data.error?.status === 'RESOURCE_EXHAUSTED' || /quota|RESOURCE_EXHAUSTED/i.test(data.error?.message || '')) {
    const message = 'RESOURCE_EXHAUSTED'
    openGeminiCircuit()
    record({
      ...opts.telemetry,
      provider: 'gemini',
      model,
      usage,
      success: false,
      statusCode: 429,
      errorCode: classifyGeminiError(429, message),
      attempt,
      latencyMs,
    })
    throw new Error(message)
  }

  const text = extractText(data)
  if (!text) {
    record({
      ...opts.telemetry,
      provider: 'gemini',
      model,
      usage,
      success: false,
      statusCode: 200,
      errorCode: 'empty_content',
      attempt,
      latencyMs,
    })
    throw new Error('Gemini boş yanıt döndürdü (0 karakter)')
  }

  return { text, usage, latencyMs, statusCode: 200, model }
}
