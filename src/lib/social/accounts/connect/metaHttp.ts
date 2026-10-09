/**
 * Safe HTTP for Meta OAuth / Graph calls.
 *
 * - URLs (which may carry tokens/secrets/codes) are never logged.
 * - Meta error bodies are reduced to numeric code/subcode/type; the raw
 *   message never reaches logs or the browser.
 */
import 'server-only'
import { platformErrorFields } from '../../safeLog'

export interface MetaErrorInfo {
  status: number
  code: number | null
  subcode: number | null
  type: string | null
}

export type MetaResult<T> = { ok: true; data: T } | { ok: false; error: MetaErrorInfo }

export class MetaCallError extends Error {
  constructor(
    readonly step: string,
    readonly info: MetaErrorInfo,
  ) {
    super(`meta_call_failed:${step}`)
  }
}

function errorInfo(status: number, body: unknown): MetaErrorInfo {
  return platformErrorFields(status, body)
}

export async function metaRequest<T>(
  step: string,
  url: string,
  init?: { method?: 'GET' | 'POST'; form?: Record<string, string> },
): Promise<MetaResult<T>> {
  let res: Response
  try {
    res = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: init?.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
      body: init?.form ? new URLSearchParams(init.form).toString() : undefined,
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    console.warn(`[social-connect] ${step} network_error`)
    return { ok: false, error: { status: 0, code: null, subcode: null, type: 'network' } }
  }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  const hasError = !!(body && typeof body === 'object' && ('error' in body || 'error_type' in body))
  if (!res.ok || hasError) {
    const info = errorInfo(res.status, body)
    console.warn(`[social-connect] ${step} failed status=${info.status} code=${info.code ?? '-'} subcode=${info.subcode ?? '-'}`)
    return { ok: false, error: info }
  }
  return { ok: true, data: body as T }
}

export async function metaRequired<T>(
  step: string,
  url: string,
  init?: { method?: 'GET' | 'POST'; form?: Record<string, string> },
): Promise<T> {
  const r = await metaRequest<T>(step, url, init)
  if (!r.ok) throw new MetaCallError(step, r.error)
  return r.data
}

/** Strip the `#_` suffix Meta may append to authorization codes. */
export function cleanAuthCode(raw: string | null): string {
  return (raw ?? '').replace(/#_$/, '').trim()
}

export function query(base: string, params: Record<string, string>): string {
  return `${base}?${new URLSearchParams(params).toString()}`
}
