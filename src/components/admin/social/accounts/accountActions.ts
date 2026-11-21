'use client'

/**
 * Account actions for the «Sosyal hesaplar» workspace — thin wrappers over the
 * EXISTING /api/social/accounts/* endpoints (same server checks, same audit).
 * Nothing here runs on its own: every call is a click by the user.
 * Reconnect / extra permissions always go through the platform's own OAuth
 * screen; tokens never reach the browser.
 */
import toast from 'react-hot-toast'
import { RESULT_MESSAGES } from '@/components/admin/social/SocialAccountsPanel'
import { TARGET_BLOCKER_TEXT } from '@/lib/social/accounts/capabilities'
import { allEngagementScopes } from '@/lib/social/engagement/model'
import { allInboxScopes } from '@/lib/social/inbox/model'
import { socialApi, type SocialAccountRow } from '@/components/social/socialClient'

/** Optional engagement permissions (counts / insights / comment texts) not granted yet. */
export function engagementMissing(a: SocialAccountRow): string[] {
  const granted = new Set(a.grantedPermissions ?? [])
  return allEngagementScopes(a.platform, a.connectionMethod).filter((p) => !granted.has(p))
}

/** Optional inbox permissions (reply to comments, direct messages) not granted yet. */
export function inboxMissing(a: SocialAccountRow): string[] {
  const granted = new Set(a.grantedPermissions ?? [])
  return allInboxScopes(a.platform, a.connectionMethod).filter((p) => !granted.has(p))
}

/** «Yeniden bağla» / extra permission → platform login (navigates away on success). */
export async function startReconnect(a: SocialAccountRow, extra: false | 'engagement' | 'inbox' = false): Promise<void> {
  const r = await socialApi<{ authorizeUrl: string }>(`/api/social/accounts/${encodeURIComponent(a.id)}/reconnect`, {
    method: 'POST',
    body: JSON.stringify(extra === 'engagement' ? { engagement: true } : extra === 'inbox' ? { inbox: true } : {}),
  })
  if (!r.ok) {
    toast.error(RESULT_MESSAGES[r.code ?? '']?.text ?? (r.code === 'not_configured' ? 'Bu platform için bağlantı henüz yapılandırılmadı.' : 'Bağlantı başlatılamadı.'))
    return
  }
  window.location.assign(r.data.authorizeUrl)
}

/** «Bağlantıyı kontrol et» — read-only request to the platform; never posts. */
export async function checkConnection(a: SocialAccountRow): Promise<boolean> {
  const r = await socialApi<{ state: string; message: string }>(`/api/social/accounts/${encodeURIComponent(a.id)}/check`, { method: 'POST', body: '{}' })
  if (!r.ok) {
    toast.error('Bağlantı kontrol edilemedi.')
    return false
  }
  if (r.data.state === 'ok') toast.success(r.data.message)
  else toast.error(r.data.message, { duration: 10000 })
  return true
}

export async function setAccountStatus(a: SocialAccountRow, action: 'pause' | 'activate'): Promise<boolean> {
  const r = await socialApi<{ status: string }>(`/api/social/accounts/${encodeURIComponent(a.id)}`, { method: 'PATCH', body: JSON.stringify({ action }) })
  if (!r.ok) {
    toast.error(
      r.code === 'reconnect_required' || r.code === 'token_expired'
        ? 'Hesap etkinleştirilemedi: önce platform girişiyle yeniden bağlayın.'
        : r.code && r.code in TARGET_BLOCKER_TEXT
          ? `Hesap etkinleştirilemedi: ${TARGET_BLOCKER_TEXT[r.code as keyof typeof TARGET_BLOCKER_TEXT]}.`
          : 'Durum değiştirilemedi.',
    )
    return false
  }
  toast.success(action === 'pause' ? 'Hesap duraklatıldı (yayın ve otomasyon durur).' : 'Hesap etkinleştirildi.')
  return true
}

/** «Bağlantıyı kaldır» — same explicit confirmation as before; history is kept. */
export async function disconnectAccount(a: SocialAccountRow): Promise<boolean> {
  if (
    !window.confirm(
      `«${a.displayName}» bağlantısı kaldırılsın mı?\n\nErişim anahtarı ve platform profil bilgileri silinir, otomasyon kuralları kapatılır. Paylaşım geçmişi korunur. Yeniden kullanmak için platform girişiyle tekrar bağlamanız gerekir.`,
    )
  )
    return false
  const r = await socialApi<{ disconnected: boolean }>(`/api/social/accounts/${encodeURIComponent(a.id)}`, { method: 'DELETE' })
  if (!r.ok) {
    toast.error(r.error)
    return false
  }
  toast.success('Bağlantı kaldırıldı; erişim anahtarı silindi.')
  return true
}

/**
 * «Hesabı listeden sil» — only for an account whose connection is already
 * removed. Deletes the record and its closed rules; publish history is kept.
 */
export async function deleteDisconnectedAccount(a: SocialAccountRow): Promise<boolean> {
  if (
    !window.confirm(
      `«${a.displayName}» kaydı listeden kalıcı olarak silinsin mi?\n\nHesabın kaydı ve kapalı otomasyon kuralları silinir; bu işlem geri alınamaz. Paylaşım geçmişi ve denetim kayıtları korunur. Aynı hesabı daha sonra «Yeni hesap ekle» ile yeniden bağlayabilirsiniz.`,
    )
  )
    return false
  const r = await socialApi<{ deleted: boolean }>(`/api/social/accounts/${encodeURIComponent(a.id)}?remove=1`, { method: 'DELETE' })
  if (!r.ok) {
    toast.error(r.code === 'disconnect_first' ? 'Önce bağlantıyı kaldırın; yalnız bağlantısı kaldırılmış hesap silinebilir.' : r.error)
    return false
  }
  toast.success('Hesap listeden silindi.')
  return true
}
