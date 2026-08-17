export function looksLikeJsonObject(raw: string): boolean {
  const trimmed = raw.trim()
  if (trimmed.startsWith('{') && trimmed.includes('}')) return true
  return /```(?:json)?\s*\{/i.test(trimmed)
}

export function classifyProviderFailure(message: string): string {
  if (/timeout|aborted|AbortError/i.test(message)) return 'timeout'
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) return 'http_429'
  if (/HTTP 404|model.?unavailable|not found/i.test(message)) return 'http_404'
  if (/HTTP 5\d\d/i.test(message)) {
    const m = message.match(/HTTP (5\d\d)/)
    return m?.[1] ? `http_${m[1]}` : 'http_500'
  }
  if (/invalid_json|JSON/i.test(message)) return 'invalid_json'
  if (/schema/i.test(message)) return 'schema_validation'
  if (/empty|boş yanıt/i.test(message)) return 'empty_content'
  if (/API_KEY|eksik/i.test(message)) return 'missing_api_key'
  return 'error'
}
