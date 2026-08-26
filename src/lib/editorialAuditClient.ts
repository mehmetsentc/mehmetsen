/**
 * Editör kararlarını arka planda loglayan client helper.
 * "Yayın Yönetmeni Ajan" için eğitim verisi toplar.
 * Fire-and-forget — hiçbir zaman hata fırlatmaz.
 */
import { auth } from '@/lib/firebase/auth'

export interface EditorialAuditPayload {
  /** 'approve' | 'reject' | 'delete' | 'mark_duplicate' | 'edit' | 'category_change' | 'city_change' */
  action: string
  /** Firebase news/draft ID */
  entityId: string
  /** Haber başlığı (not olarak kaydedilir) */
  entityTitle?: string
  /** 'firestore_news' | 'firestore_draft' */
  entityType?: string
  /** Önceki durum, örn: 'pending' */
  previousState?: string
  /** Yeni durum, örn: 'published' */
  newState?: string
  /** Kısa neden (max 80 karakter) */
  reason?: string
  /** Editörün bu haber üzerinde geçirdiği süre (ms) */
  durationMs?: number
}

/** Editör kararını arka planda loglar. Hiçbir zaman hata fırlatmaz. */
export function logEditorialAction(payload: EditorialAuditPayload): void {
  void (async () => {
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      if (!token) return
      await fetch('/api/admin/editorial-audit/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
    } catch {
      // Sessiz — logging hiçbir zaman editör iş akışını engellemez
    }
  })()
}
