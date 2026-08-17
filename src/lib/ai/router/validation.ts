export type JsonExtractFailure =
  | 'empty_content'
  | 'markdown_fenced_json'
  | 'reasoning_before_json'
  | 'reasoning_after_json'
  | 'malformed_json'
  | 'truncated_json'
  | 'invalid_json'

function sliceFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]!
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return raw.slice(start, i + 1)
    }
  }
  return null
}

function tryParseObject(raw: string): string | null {
  try {
    const value = JSON.parse(raw) as unknown
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return JSON.stringify(value)
    }
  } catch {
    /* try embedded object */
  }
  const sliced = sliceFirstJsonObject(raw)
  if (!sliced || sliced === raw) return null
  try {
    const value = JSON.parse(sliced) as unknown
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return JSON.stringify(value)
    }
  } catch {
    return null
  }
  return null
}

/**
 * Pull a JSON object out of model text without logging the payload.
 * Accepts raw JSON, markdown fences, and reasoning prose around the object.
 */
export function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]?.trim()) {
    const fromFence = tryParseObject(fence[1].trim())
    if (fromFence) return fromFence
  }

  const direct = tryParseObject(trimmed)
  if (direct) return direct

  const embedded = sliceFirstJsonObject(trimmed)
  if (embedded) {
    try {
      const value = JSON.parse(embedded) as unknown
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return JSON.stringify(value)
      }
    } catch {
      return null
    }
  }
  return null
}

export function looksLikeJsonObject(raw: string): boolean {
  return extractJsonObject(raw) !== null
}

/** Shape-only classification — never include the raw text in the code. */
export function classifyJsonFailure(raw: string): JsonExtractFailure {
  const trimmed = raw.trim()
  if (!trimmed) return 'empty_content'
  const hasFence = /```(?:json)?/i.test(trimmed)
  const open = trimmed.indexOf('{')
  const close = trimmed.lastIndexOf('}')
  if (open >= 0 && close < open) return 'truncated_json'
  if (open >= 0 && close < 0) return 'truncated_json'
  if (hasFence) return 'markdown_fenced_json'
  if (open > 0) return 'reasoning_before_json'
  if (open === 0 && close >= 0 && close < trimmed.length - 1) return 'reasoning_after_json'
  if (open >= 0) return 'malformed_json'
  return 'invalid_json'
}

export function classifyGeminiError(status: number | undefined, message: string): string {
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|prepayment credits/i.test(message)) return 'quota_429'
  if (status === 401 || status === 403 || /API_KEY|UNAUTHENTICATED|permission|auth/i.test(message)) {
    return 'auth'
  }
  if (status === 404 || /not found|invalid.?model|NOT_FOUND/i.test(message)) return 'invalid_model'
  if (/timeout|aborted|AbortError/i.test(message)) return 'timeout'
  if (/schema|invalid_json|JSON/i.test(message)) return 'schema'
  if (status && status >= 400) return `http_${status}`
  return 'other'
}

export function classifyProviderFailure(message: string): string {
  if (/timeout|aborted|AbortError/i.test(message)) return 'timeout'
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) return 'http_429'
  if (/HTTP 404|model.?unavailable|not found/i.test(message)) return 'http_404'
  if (/HTTP 5\d\d/i.test(message)) {
    const m = message.match(/HTTP (5\d\d)/)
    return m?.[1] ? `http_${m[1]}` : 'http_500'
  }
  if (/HTTP 400/i.test(message)) return 'http_400'
  if (/invalid_json|JSON/i.test(message)) return 'invalid_json'
  if (/schema/i.test(message)) return 'schema_validation'
  if (/empty|boş yanıt/i.test(message)) return 'empty_content'
  if (/API_KEY|eksik/i.test(message)) return 'missing_api_key'
  return 'error'
}
