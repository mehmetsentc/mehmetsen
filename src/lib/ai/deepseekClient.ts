/**
 * Shared DeepSeek Chat Completions client (OpenAI-compatible).
 *
 * DeepSeek V4 (`deepseek-v4-flash` / `deepseek-v4-pro`) defaults to thinking mode.
 * With thinking on, `message.content` is often empty while tokens go to
 * `reasoning_content` — which surfaced as "DeepSeek JSON parse hatası (0 karakter)".
 * Editorial / JSON calls must disable thinking.
 */

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

/**
 * One DeepSeek chat completion. Throws on HTTP / empty content.
 */
export async function deepseekChatCompletion(opts: DeepSeekChatOptions): Promise<string> {
  const apiKey = getDeepSeekApiKey()
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY eksik')

  const model = getDeepSeekModel(opts.model)
  const disableThinking = opts.disableThinking !== false
  const jsonMode = opts.jsonMode !== false

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

  const res = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`DeepSeek HTTP ${res.status}: ${err.slice(0, 240)}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>
    error?: { message?: string }
  }

  if (data.error?.message) {
    throw new Error(`DeepSeek error: ${data.error.message}`)
  }

  const text = extractMessageText(data)
  if (!text) {
    throw new Error('DeepSeek boş yanıt döndürdü (0 karakter)')
  }
  return text
}

/**
 * Retry once with thinking disabled + slightly lower max_tokens on empty/timeout.
 */
export async function deepseekChatCompletionWithRetry(
  opts: DeepSeekChatOptions
): Promise<string> {
  try {
    return await deepseekChatCompletion({ ...opts, disableThinking: true })
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
    })
  }
}
