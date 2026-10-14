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
  accountName?: string
  platformId?: string
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
  | 'time_budget'
  | 'not_attempted_after_error'

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
  time_budget: 'süre sınırı doldu — gönderilmedi (kilit alınmadı, platforma gidilmedi); yeniden seçip güvenle gönderebilirsiniz',
  not_attempted_after_error: 'sunucu hatası nedeniyle denenmedi (platforma gidilmedi); önce diğer sonuçları kontrol edin',
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
  time_budget: '⏸',
  not_attempted_after_error: '—',
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
  if (r.code === 'time_budget') return 'time_budget'
  if (r.code === 'not_attempted_after_error') return 'not_attempted_after_error'
  if (r.error === 'not attempted') return 'not_attempted'
  if (r.code === 'token_invalid') return 'token_invalid'
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
  const via = r?.accountId ? (r.accountName ?? 'seçilen hesap') : 'Onyeditivi eski bağlantı'
  const detail =
    st === 'failed' && r?.error
      ? `${STATE_TEXT.failed} (${r.error})`
      : st === 'token_invalid' && r?.accountId
        ? 'platform erişim anahtarını reddetti — hesap «yeniden bağlantı gerekli» durumuna alındı; «Platform girişiyle yeniden bağla»'
        : st === 'token_invalid'
          ? `${STATE_TEXT.token_invalid} (eski bağlantı: Hesaplar sayfasında aynı hesabı «Platform girişiyle yeniden bağla» ve hedef olarak seçin)`
          : STATE_TEXT[st]
  const postId = (st === 'published' || st === 'already_published') && r?.platformId ? ` · gönderi ${r.platformId}` : ''
  return `${label} (${via}): ${MARK[st]} ${detail}${postId}`
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

export type ShareOverall = 'published' | 'partial' | 'failed' | 'uncertain' | 'none'

/**
 * Overall result from per-target states (one target's failure never hides
 * another's success):
 *   published — every attempted target ✓ / =
 *   partial   — at least one ✓ / = and at least one failure or uncertain
 *   uncertain — no success, at least one uncertain (no automatic retry)
 *   failed    — nothing published
 */
export function overallShareState(results: Array<ShareResultLike | null | undefined>): ShareOverall {
  const states = results.filter((r): r is ShareResultLike => !!r && r.error !== 'skipped').map((r) => shareState(r)).filter((s) => s !== 'not_attempted')
  if (states.length === 0) return 'none'
  const ok = states.filter((s) => s === 'published' || s === 'already_published').length
  const unsure = states.some((s) => s === 'uncertain' || s === 'uncertain_previous_attempt')
  if (ok === states.length) return 'published'
  if (ok > 0) return 'partial'
  return unsure ? 'uncertain' : 'failed'
}

export const OVERALL_HEADLINE: Record<ShareOverall, string> = {
  published: 'Paylaşım tamamlandı',
  partial: '⚠ Kısmi sonuç — bazı hedefler başarısız',
  failed: 'Paylaşım başarısız',
  uncertain: '⚠ Sonuç belirsiz — otomatik tekrar yapılmadı; platformda kontrol edin',
  none: 'Paylaşım yapılmadı',
}

/** All per-target results of a force-reshare response row (post + story). */
export function resultsOf(row?: { post?: Record<string, ShareResultLike | undefined>; story?: Record<string, ShareResultLike | undefined> } | null): ShareResultLike[] {
  return [...Object.values(row?.post ?? {}), ...Object.values(row?.story ?? {})].filter((r): r is ShareResultLike => !!r)
}

/** Per-target row from the force-reshare response (Görev 18 EK). */
export interface TargetRowLike {
  platform: string
  accountId: string
  accountName: string | null
  format: 'post' | 'story' | 'reel' | 'video_story'
  success: boolean
  code: string | null
  error: string | null
  ledgerStatus: string | null
  externalPostId: string | null
}

const PLATFORM_TR: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads' }

export function rowAsResult(r: TargetRowLike): ShareResultLike {
  return {
    success: r.success,
    accountId: r.accountId,
    accountName: r.accountName ?? undefined,
    code: r.code ?? undefined,
    error: r.error ?? undefined,
    ledgerStatus: r.ledgerStatus ?? undefined,
    platformId: r.externalPostId ?? undefined,
  } as ShareResultLike
}

/** «Instagram · NaHaber Antalya · hikâye: ✓ yayımlandı · gönderi 123». */
export function describeTargetRow(r: TargetRowLike): string {
  const label = `${PLATFORM_TR[r.platform] ?? r.platform} · ${r.accountName ?? r.accountId} · ${r.format === 'story' ? 'hikâye' : r.format === 'reel' ? 'reels' : r.format === 'video_story' ? 'video hikâye' : 'gönderi'}`
  const line = describeShareResult(label, rowAsResult(r))
  // describeShareResult adds «(hesap)»; the account is already in the label.
  return line.replace(` (${r.accountName ?? 'seçilen hesap'})`, '')
}

/**
 * A failed target the operator may explicitly retry: a definite platform /
 * validation failure only. Published, already published, in progress and
 * uncertain targets are never retried from here (uncertain → its own flow).
 */
export function isSafelyRetryable(r: TargetRowLike): boolean {
  if (r.success) return false
  if (r.ledgerStatus === 'uncertain' || r.ledgerStatus === 'publishing' || r.ledgerStatus === 'succeeded') return false
  return !['already_published', 'in_progress', 'uncertain_previous_attempt', 'uncertain', 'token_invalid', 'needs_reauth', 'disabled', 'paused'].includes(r.code ?? '')
}
