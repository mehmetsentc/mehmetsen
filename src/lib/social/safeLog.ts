/**
 * Safe operational logging + errors for social platform calls.
 *
 * Logs carry ONLY: platform, operation, outcome, HTTP status, Meta error
 * code/subcode/type, an internal correlation id (newsId / attempt) and
 * non-sensitive ids. Never: request URLs, raw platform responses, tokens,
 * authorization codes, app secrets or Meta error MESSAGES (untrusted text).
 */
import { redactSecrets } from './redact'

export type SocialPlatformName = 'facebook' | 'instagram' | 'threads' | 'twitter'

const LABEL: Record<SocialPlatformName, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  threads: 'Threads',
  twitter: 'X',
}

export interface PlatformErrorFields {
  status: number
  code: number | null
  subcode: number | null
  type: string | null
}

const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : null

/** Extract only numeric/typed fields from a platform error body. */
export function platformErrorFields(status: number, body: unknown): PlatformErrorFields {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const e = (b.error && typeof b.error === 'object' ? b.error : b) as Record<string, unknown>
  const type = typeof e.type === 'string' ? e.type : typeof e.error_type === 'string' ? e.error_type : null
  return {
    status,
    code: num(e.code),
    subcode: num(e.error_subcode),
    type: type && /^[A-Za-z_]{1,40}$/.test(type) ? type : null,
  }
}

/** Error whose message is built from codes only — never the platform's text. */
export class PlatformApiError extends Error {
  constructor(
    readonly platform: SocialPlatformName,
    readonly op: string,
    readonly fields: PlatformErrorFields,
  ) {
    const code = fields.code !== null ? `, kod ${fields.code}${fields.subcode !== null ? `/${fields.subcode}` : ''}` : ''
    super(`${LABEL[platform]} ${op} reddedildi (HTTP ${fields.status}${code})`)
    this.name = 'PlatformApiError'
  }
}

export function platformError(platform: SocialPlatformName, op: string, status: number, body: unknown): PlatformApiError {
  return new PlatformApiError(platform, op, platformErrorFields(status, body))
}

const URL_QUERY_RE = /(https?:\/\/[^\s?#"']+)[?#][^\s"']*/gi

/** Untrusted free text (non-platform errors such as network failures) → safe, short. */
export function sanitizeFreeText(text: string, max = 200): string {
  const redacted = String(redactSecrets(text))
  return redacted.replace(URL_QUERY_RE, '$1?…').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Any thrown value → message safe for logs, browser responses and audit. */
export function safeErrorText(err: unknown): string {
  if (err instanceof PlatformApiError) return err.message
  if (err instanceof Error) return sanitizeFreeText(err.message || err.name)
  if (typeof err === 'string') return sanitizeFreeText(err)
  return 'Bilinmeyen hata'
}

type LogValue = string | number | boolean | null | undefined

/** One-line structured log. String values are sanitized and truncated. */
export function socialLog(
  level: 'log' | 'warn' | 'error',
  platform: SocialPlatformName | 'publish' | 'cron',
  op: string,
  fields: Record<string, LogValue> = {},
): void {
  const parts = [`[social:${platform}] op=${op}`]
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue
    const val = typeof v === 'string' ? sanitizeFreeText(v, 120) : String(v)
    parts.push(`${k}=${val}`)
  }
  console[level](parts.join(' '))
}

/** Fields to log for a caught error (code-level only). */
export function errorLogFields(err: unknown): Record<string, LogValue> {
  if (err instanceof PlatformApiError) {
    return { status: err.fields.status, code: err.fields.code, subcode: err.fields.subcode, type: err.fields.type }
  }
  return { error: err instanceof Error ? err.name : typeof err }
}
