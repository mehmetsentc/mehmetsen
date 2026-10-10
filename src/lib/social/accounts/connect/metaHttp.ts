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

/**
 * JSON.parse that keeps large integer literals exact.
 *
 * Meta returns some ids as bare JSON numbers (e.g. Threads token exchange:
 * `"user_id": 17841405793187218`). Ids above Number.MAX_SAFE_INTEGER lose
 * precision in JSON.parse, so a later `String(id)` yields a different id and
 * Graph answers 400 / code 100 / subcode 33. Integer literals with 16+ digits
 * outside string values are turned into JSON strings before parsing; callers
 * already treat ids as strings. String contents are never modified.
 */
export function parseMetaJson(text: string): unknown {
  let out = ''
  let i = 0
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (ch === '"') {
      let j = i + 1
      while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
      continue
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i + 1
      while (j < n && /[0-9eE+\-.]/.test(text[j])) j++
      const tok = text.slice(i, j)
      out += /^-?[0-9]{16,}$/.test(tok) ? `"${tok}"` : tok
      i = j
      continue
    }
    out += ch
    i++
  }
  return JSON.parse(out)
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
    body = parseMetaJson(await res.text())
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
