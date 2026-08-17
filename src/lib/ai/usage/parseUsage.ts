import type { NormalizedAiUsage } from '@/lib/ai/usage/types'

function asNonNegInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return Math.floor(value)
}

/**
 * Parse DeepSeek Chat Completions `usage` object.
 * Official fields: prompt_tokens, completion_tokens, total_tokens,
 * prompt_cache_hit_tokens, prompt_cache_miss_tokens.
 * Missing fields stay undefined — never coerced to 0.
 */
export function parseDeepSeekUsage(raw: unknown): NormalizedAiUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Record<string, unknown>

  const inputTokens = asNonNegInt(row.prompt_tokens)
  const outputTokens = asNonNegInt(row.completion_tokens)
  const totalTokens = asNonNegInt(row.total_tokens)
  const cacheHitTokens = asNonNegInt(row.prompt_cache_hit_tokens)
  const cacheMissTokens = asNonNegInt(row.prompt_cache_miss_tokens)

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    cacheHitTokens === undefined &&
    cacheMissTokens === undefined
  ) {
    return undefined
  }

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(cacheHitTokens !== undefined ? { cacheHitTokens } : {}),
    ...(cacheMissTokens !== undefined ? { cacheMissTokens } : {}),
  }
}

export function parseDeepSeekHttpStatus(errorMessage: string): number | undefined {
  const match = errorMessage.match(/DeepSeek HTTP (\d{3})/)
  if (!match?.[1]) return undefined
  const status = Number(match[1])
  return Number.isFinite(status) ? status : undefined
}

export function classifyDeepSeekErrorCode(errorMessage: string): string {
  if (/timeout|aborted|AbortError/i.test(errorMessage)) return 'timeout'
  if (/boş yanıt|0 karakter/i.test(errorMessage)) return 'empty_content'
  const status = parseDeepSeekHttpStatus(errorMessage)
  if (status) return `http_${status}`
  if (/DEEPSEEK_API_KEY/i.test(errorMessage)) return 'missing_api_key'
  return 'error'
}

/** Groq Chat Completions usage — OpenAI-compatible, plus optional cached_tokens. */
export function parseGroqUsage(raw: unknown): NormalizedAiUsage | undefined {
  const base = parseDeepSeekUsage(raw)
  if (!raw || typeof raw !== 'object') return base
  const details = (raw as { prompt_tokens_details?: { cached_tokens?: unknown } }).prompt_tokens_details
  const cached = details ? asNonNegInt(details.cached_tokens) : undefined
  if (cached === undefined) return base
  return { ...(base ?? {}), cacheHitTokens: cached }
}

export function parseGroqHttpStatus(errorMessage: string): number | undefined {
  const match = errorMessage.match(/Groq HTTP (\d{3})/)
  if (!match?.[1]) return undefined
  const status = Number(match[1])
  return Number.isFinite(status) ? status : undefined
}

export function classifyGroqErrorCode(errorMessage: string): string {
  if (/timeout|aborted|AbortError/i.test(errorMessage)) return 'timeout'
  const status = parseGroqHttpStatus(errorMessage)
  if (status) return `http_${status}`
  if (/empty|boş yanıt|0 karakter/i.test(errorMessage)) return 'empty_content'
  if (/invalid_json|JSON/i.test(errorMessage)) return 'invalid_json'
  if (/GROQ_API_KEY/i.test(errorMessage)) return 'missing_api_key'
  if (/schema/i.test(errorMessage)) return 'schema_validation'
  return 'error'
}

export function parseGeminiUsage(raw: unknown): NormalizedAiUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const row = raw as Record<string, unknown>
  const inputTokens = asNonNegInt(row.promptTokenCount)
  const outputTokens = asNonNegInt(row.candidatesTokenCount)
  const totalTokens = asNonNegInt(row.totalTokenCount)
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined
  }
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  }
}
