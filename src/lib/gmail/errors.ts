/**
 * Normalized Gmail errors — no tokens/secrets in messages.
 */

export type GmailErrorCode =
  | 'NOT_CONNECTED'
  | 'RECONNECT_REQUIRED'
  | 'INVALID_GRANT'
  | 'INVALID_CLIENT'
  | 'INSUFFICIENT_SCOPE'
  | 'GMAIL_API_DISABLED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'TOKEN_REFRESH_FAILED'
  | 'GOOGLE_API_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'UNKNOWN_ERROR'

export const GMAIL_USER_MESSAGES: Record<GmailErrorCode, string> = {
  NOT_CONNECTED: 'Gmail hesabı henüz bağlı değil.',
  RECONNECT_REQUIRED: 'Google erişimi sona ermiş. Gmail hesabını yeniden bağlayın.',
  INVALID_GRANT: 'Google erişimi sona ermiş. Gmail hesabını yeniden bağlayın.',
  INVALID_CLIENT: 'Gmail bağlantı yapılandırmasında hatalı istemci ayarı var.',
  INSUFFICIENT_SCOPE: 'Gmail yazma izni eksik. Okundu işaretlemek için hesabı yeniden bağlayın.',
  GMAIL_API_DISABLED: 'Gmail API bu Google Cloud projesinde etkin değil.',
  PERMISSION_DENIED: 'Bu Gmail hesabına erişim izniniz yok.',
  RATE_LIMITED: 'Google geçici olarak istekleri sınırladı. Bir süre sonra tekrar deneyin.',
  TOKEN_REFRESH_FAILED: 'Google erişimi yenilenemedi. Gmail hesabını yeniden bağlayın.',
  GOOGLE_API_ERROR: 'Gmail isteği başarısız oldu. Bir süre sonra tekrar deneyin.',
  CONFIGURATION_ERROR: 'Gmail bağlantı yapılandırmasında eksik ayar var.',
  UNKNOWN_ERROR: 'Gmail isteği beklenmeyen bir hatayla sonuçlandı.',
}

export class GmailError extends Error {
  readonly code: GmailErrorCode
  readonly httpStatus: number
  readonly reconnectRequired: boolean
  readonly googleStatus?: number

  constructor(
    code: GmailErrorCode,
    opts?: { cause?: unknown; httpStatus?: number; googleStatus?: number; detail?: string },
  ) {
    super(opts?.detail ? `${code}: ${opts.detail}` : code)
    this.name = 'GmailError'
    this.code = code
    this.googleStatus = opts?.googleStatus
    this.httpStatus = opts?.httpStatus ?? defaultHttpStatus(code)
    this.reconnectRequired = isReconnectCode(code)
    if (opts?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = opts.cause
    }
  }

  get userMessage(): string {
    return GMAIL_USER_MESSAGES[this.code]
  }
}

export function isReconnectCode(code: GmailErrorCode): boolean {
  return (
    code === 'RECONNECT_REQUIRED' ||
    code === 'INVALID_GRANT' ||
    code === 'INSUFFICIENT_SCOPE' ||
    code === 'TOKEN_REFRESH_FAILED'
  )
}

function defaultHttpStatus(code: GmailErrorCode): number {
  switch (code) {
    case 'NOT_CONNECTED': return 400
    case 'CONFIGURATION_ERROR':
    case 'INVALID_CLIENT': return 503
    case 'RATE_LIMITED': return 429
    case 'PERMISSION_DENIED': return 403
    case 'RECONNECT_REQUIRED':
    case 'INVALID_GRANT':
    case 'INSUFFICIENT_SCOPE':
    case 'TOKEN_REFRESH_FAILED': return 401
    default: return 502
  }
}

function stripSecrets(text: string): string {
  return text
    .replace(/ya29\.[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(/1\/\/[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(/GOCSPX-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/4\/[0-9A-Za-z_-]+/g, '[redacted]')
    .slice(0, 400)
}

export function parseGoogleErrorBody(body: string): {
  error?: string; description?: string; message?: string; status?: string; reason?: string
} {
  try {
    const json = JSON.parse(body) as {
      error?: string | { message?: string; status?: string; code?: number; errors?: Array<{ reason?: string }> }
      error_description?: string
    }
    if (typeof json.error === 'string') {
      return { error: json.error, description: json.error_description }
    }
    if (json.error && typeof json.error === 'object') {
      return {
        message: json.error.message,
        status: json.error.status,
        reason: json.error.errors?.[0]?.reason,
      }
    }
  } catch { /* not JSON */ }
  return { message: stripSecrets(body) }
}

export function gmailErrorFromGoogleHttp(status: number, body: string): GmailError {
  const parsed = parseGoogleErrorBody(body)
  const blob = `${parsed.error ?? ''} ${parsed.description ?? ''} ${parsed.message ?? ''} ${parsed.status ?? ''} ${parsed.reason ?? ''}`.toLowerCase()

  if (status === 401 || blob.includes('invalid_grant') || blob.includes('unauthenticated')) {
    if (blob.includes('invalid_grant')) {
      return new GmailError('INVALID_GRANT', { googleStatus: status, detail: 'invalid_grant' })
    }
    return new GmailError('RECONNECT_REQUIRED', { googleStatus: status, detail: 'http_401' })
  }
  if (blob.includes('invalid_client')) {
    return new GmailError('INVALID_CLIENT', { googleStatus: status, detail: 'invalid_client' })
  }
  if (blob.includes('accessnotconfigured') || blob.includes('gmail api has not been used') || blob.includes('api has not been enabled')) {
    return new GmailError('GMAIL_API_DISABLED', { googleStatus: status })
  }
  if (blob.includes('insufficient') || blob.includes('insufficientpermissions') || blob.includes('access_denied')) {
    return new GmailError('INSUFFICIENT_SCOPE', { googleStatus: status })
  }
  if (status === 403) {
    return new GmailError('PERMISSION_DENIED', { googleStatus: status })
  }
  if (status === 429 || blob.includes('ratelimit') || blob.includes('quota')) {
    return new GmailError('RATE_LIMITED', { googleStatus: status })
  }
  return new GmailError('GOOGLE_API_ERROR', {
    googleStatus: status,
    detail: stripSecrets(parsed.message || parsed.error || `http_${status}`),
  })
}

export function normalizeGmailError(err: unknown): GmailError {
  if (err instanceof GmailError) return err
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  if (lower.includes('not connected')) return new GmailError('NOT_CONNECTED', { cause: err })
  if (lower.includes('gmail_client') || lower.includes('missing gmail_') || lower.includes('encryption_key')) {
    return new GmailError('CONFIGURATION_ERROR', { cause: err })
  }
  if (lower.includes('invalid ciphertext') || lower.includes('too short')) {
    return new GmailError('CONFIGURATION_ERROR', { cause: err, detail: 'token_decrypt' })
  }
  if (lower.includes('invalid_grant')) return new GmailError('INVALID_GRANT', { cause: err })
  if (lower.includes('invalid_client')) return new GmailError('INVALID_CLIENT', { cause: err })
  if (lower.includes('insufficient')) return new GmailError('INSUFFICIENT_SCOPE', { cause: err })

  return new GmailError('UNKNOWN_ERROR', { cause: err, detail: stripSecrets(msg) })
}

export function gmailClientErrorPayload(err: unknown): {
  error: GmailErrorCode
  message: string
  reconnectRequired: boolean
} {
  const n = normalizeGmailError(err)
  return { error: n.code, message: n.userMessage, reconnectRequired: n.reconnectRequired }
}
