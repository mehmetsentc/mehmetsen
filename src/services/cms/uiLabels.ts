/**
 * Presentation-only Turkish CMS labels. Do not rename DB enums or API contracts.
 */
export const CMS_STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak',
  active: 'Aktif',
  archived: 'Arşiv',
  preview: 'Önizleme',
  published: 'Yayında',
  APPROVED: 'Onaylandı',
  APPROVED_FOR_AI: 'AI için onaylandı',
  WATCHING: 'İzleniyor',
  ELIGIBLE: 'Uygun',
  REJECTED: 'Reddedildi',
  OPEN: 'Açık',
  HIGH: 'Yüksek',
  HIGH_PRIORITY: 'Yüksek öncelik',
  BREAKING: 'Son Dakika',
  NORMAL: 'Normal',
  LOW: 'Düşük',
  algorithmic: 'Algoritmik',
  manual: 'Manuel',
  category_rail: 'Kategori bandı',
  PROPOSED: 'Önerildi',
  TESTING: 'Testte',
  DEPLOYED: 'Yayınlandı',
  NONE: 'Karar yok',
  BORDERLINE: 'Sınırda',
  CLOSED: 'Kapalı',
  running: 'Çalışıyor',
  success: 'Başarılı',
  failed: 'Başarısız',
  skipped: 'Atlandı',
  pending: 'Bekliyor',
  disabled: 'Devre Dışı',
  schedule: 'Zamanlanmış',
  manual_trigger: 'Manuel',
}

export function cmsLabel(value: string | null | undefined, fallback?: string): string {
  if (!value) return fallback || '—'
  return CMS_STATUS_LABELS[value] || fallback || value
}
