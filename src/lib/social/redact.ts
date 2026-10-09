/**
 * Pure redaction helpers (no Firebase / server-only imports) shared by the
 * audit log, platform adapters and safe logging. Platform error text is
 * treated as untrusted: tokens, OAuth params and opaque values are removed.
 */
export const REDACTED = '[redacted]'

const SECRET_KEY_RE =
  /(token|secret|password|passwd|authorization|cookie|cipher|encrypted|nonce|binding|credential|^code$|auth_?code|^state$|oauth_?url|client_secret|api_?key)/i

/** Long opaque strings that look like Meta/OAuth tokens. */
const TOKEN_VALUE_RE = /^(EAA|EAAG|IGQ|IGA|IGAA|THA|THQ|TH)[A-Za-z0-9_.\-]{16,}$/
const OPAQUE_VALUE_RE = /^[A-Za-z0-9_\-.:+/=]{60,}$/
const URL_SECRET_PARAM_RE =
  /([?&](access_token|input_token|code|state|client_secret|fb_exchange_token|token|signature|x-goog-signature|googleaccessid)=)[^&\s]+/gi

/** Meta token shapes embedded inside free text (error messages etc.). */
const EMBEDDED_TOKEN_RE = /\b(?:EAA|IGQ|IGA|THA|THQ)[A-Za-z0-9_.\-]{12,}/g

function redactValue(v: string): string {
  const t = v.trim()
  if (TOKEN_VALUE_RE.test(t) || OPAQUE_VALUE_RE.test(t)) return REDACTED
  return v.replace(URL_SECRET_PARAM_RE, `$1${REDACTED}`).replace(EMBEDDED_TOKEN_RE, REDACTED)
}

export function redactSecrets(input: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED
  if (typeof input === 'string') return redactValue(input)
  if (Array.isArray(input)) return input.slice(0, 50).map((x) => redactSecrets(x, depth + 1))
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      // Boolean "has…/…Configured" flags are status, not secrets.
      if (SECRET_KEY_RE.test(k) && typeof v !== 'boolean') {
        out[k] = REDACTED
        continue
      }
      out[k] = redactSecrets(v, depth + 1)
    }
    return out
  }
  return input
}

