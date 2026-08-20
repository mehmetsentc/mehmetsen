/**
 * Defensive admin API error helpers (Phase 4B P25).
 * Never treat a failed response as an empty successful list.
 */

import { parseApiResponse } from '@/lib/parseApiResponse'

export const DB_UNAVAILABLE_TR =
  'Veritabanına şu an ulaşılamıyor. Kayıtlar silinmedi; bağlantı düzelince yeniden deneyin.'

export const API_LOAD_FAILED_TR = 'Liste yüklenemedi. Lütfen yenileyin.'

export function turkishAdminApiError(status: number, raw?: string | null): string {
  if (status === 401 || status === 403) return 'Oturum süresi dolmuş veya yetkiniz yok.'
  if (status === 503 || status === 502 || status === 504) {
    if (raw && /DATABASE|postgres|Neon|connection/i.test(raw)) return DB_UNAVAILABLE_TR
    return DB_UNAVAILABLE_TR
  }
  if (status >= 500) return 'Sunucu hatası. Kayıt sayısı bilinmiyor; 0 olarak gösterme.'
  if (raw && raw.trim()) return raw.trim().slice(0, 240)
  return API_LOAD_FAILED_TR
}

export type AdminListLoadResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number }

/**
 * Fetch + parse JSON for admin list pages.
 * On failure returns ok:false — callers must NOT set rows=[] / total=0 as if empty.
 */
export async function loadAdminJson<T = Record<string, unknown>>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<AdminListLoadResult<T>> {
  try {
    const res = await fetch(input, init)
    let body: T & { error?: string }
    try {
      body = await parseApiResponse<T & { error?: string }>(res)
    } catch (err) {
      return {
        ok: false,
        status: res.status || 500,
        error: turkishAdminApiError(res.status || 500, err instanceof Error ? err.message : null),
      }
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: turkishAdminApiError(res.status, (body as { error?: string }).error || null),
      }
    }
    return { ok: true, data: body }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : API_LOAD_FAILED_TR,
    }
  }
}

/** Server-side JSON error body for DB outages. */
export function databaseUnavailableResponse(extra?: Record<string, unknown>) {
  return {
    error: DB_UNAVAILABLE_TR,
    code: 'DATABASE_UNAVAILABLE',
    ...extra,
  }
}
