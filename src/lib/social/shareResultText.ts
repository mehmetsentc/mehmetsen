/**
 * Browser-safe text for manual share results (admin news + social composer).
 *
 * Input is the already-sanitized server result: `error` is built from codes
 * only (PlatformApiError: "… reddedildi (HTTP 400, kod 190/460)") and `code` /
 * `ledgerStatus` are machine codes. No token or raw platform text is produced.
 */
export interface ShareResultLike {
  success: boolean
  error?: string
  accountId?: string
  code?: string
  ledgerStatus?: string
}

export type ShareState =
  | 'published'
  | 'already_published'
  | 'in_progress'
  | 'uncertain'
  | 'uncertain_previous_attempt'
  | 'token_invalid'
  | 'permission'
  | 'rate_limited'
  | 'failed'
  | 'not_attempted'

const STATE_TEXT: Record<ShareState, string> = {
  published: 'yayımlandı',
  already_published: 'zaten paylaşılmış — tekrar gönderilmedi',
  in_progress: 'aynı paylaşım şu an sürüyor (aktif kilit) — tekrar gönderilmedi',
  uncertain: 'sonuç belirsiz — platformda kontrol edin; otomatik tekrar yok',
  uncertain_previous_attempt: 'önceki deneme belirsiz — önce platformda kontrol edin',
  token_invalid: 'erişim anahtarı geçersiz — hesabı yeniden bağlayın',
  permission: 'yayın izni yok',
  rate_limited: 'platform hız sınırı — daha sonra deneyin',
  failed: 'başarısız',
  not_attempted: 'denenmedi',
}

const MARK: Record<ShareState, string> = {
  published: '✓',
  already_published: '=',
  in_progress: '…',
  uncertain: '?',
  uncertain_previous_attempt: '?',
  token_invalid: '✗',
  permission: '✗',
  rate_limited: '✗',
  failed: '✗',
  not_attempted: '—',
}

/** Meta error code parsed from the safe error text ("kod 190/460"). */
export function metaCodeFromSafeError(error?: string): { code: number; subcode: number | null } | null {
  const m = error?.match(/kod (\d{1,6})(?:\/(\d{1,8}))?/)
  if (!m) return null
  return { code: Number(m[1]), subcode: m[2] ? Number(m[2]) : null }
}

export function shareState(r?: ShareResultLike | null): ShareState {
  if (!r) return 'not_attempted'
  if (r.success) return 'published'
  if (r.ledgerStatus === 'uncertain') return 'uncertain'
  if (r.code === 'already_published') return 'already_published'
  if (r.code === 'in_progress') return 'in_progress'
  if (r.code === 'uncertain_previous_attempt') return 'uncertain_previous_attempt'
  if (r.error === 'not attempted') return 'not_attempted'
  const meta = metaCodeFromSafeError(r.error)
  if (meta) {
    if (meta.code === 190 || meta.code === 102) return 'token_invalid'
    if (meta.code === 10 || meta.code === 200 || (meta.code >= 200 && meta.code <= 299)) return 'permission'
    if (meta.code === 4 || meta.code === 17 || meta.code === 32 || meta.code === 613) return 'rate_limited'
  }
  return 'failed'
}

/** One platform line, e.g. "IG (Onyeditivi eski bağlantı): ✗ erişim anahtarı geçersiz …". */
export function describeShareResult(label: string, r?: ShareResultLike | null): string {
  const st = shareState(r)
  const via = r?.accountId ? 'seçilen hesap' : 'Onyeditivi eski bağlantı'
  const detail = st === 'failed' && r?.error ? `${STATE_TEXT.failed} (${r.error})` : STATE_TEXT[st]
  return `${label} (${via}): ${MARK[st]} ${detail}`
}

/** Read a fetch Response as JSON without throwing on HTML / empty bodies. */
export async function readJsonResponse<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const text = await res.text()
    return { ok: true, data: JSON.parse(text) as T }
  } catch {
    return { ok: false, status: res.status }
  }
}

/** Message for a response whose body was not JSON (never the generic "Bağlantı hatası"). */
export function unreadableResponseText(status: number): string {
  return status
    ? `Sunucu yanıtı okunamadı (HTTP ${status}). Paylaşımın sonucu için platformu ve “Sonucu belirsiz paylaşımlar” listesini kontrol edin; tekrar göndermeden önce doğrulayın.`
    : 'İstek sunucuya ulaşmadı (ağ hatası). Paylaşım başlamamış olabilir; sayfayı yenileyip durumu kontrol edin.'
}
