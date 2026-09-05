/** Turkish editorial labels for rights center (UI only — DB enums unchanged). */

export const RIGHTS_PAGE = {
  title: 'Yayın Hakları',
  subtitle:
    "Bu alan, kaynaklardan alınan içeriklerin NaHaber'de yayınlanmadan önce kaynak kullanımı ve metin benzerliği açısından kontrol edilmesini sağlar.",
  sidebar: 'Yayın Hakları',
  loading: 'Hak kontrolü listesi yükleniyor…',
  empty: 'İncelenecek içerik bulunamadı.',
  error: 'Hak kontrolü verileri yüklenemedi.',
  retry: 'Tekrar Dene',
  techDetails: 'Teknik Ayrıntılar',
  whyReview: 'Neden inceleme gerekiyor?',
  saveDecision: 'Kararı kaydet',
  publish: 'Yayınla',
  published: 'Yayında',
  bulkConfirmTitle: 'Toplu işlem onayı',
  noBulkPublish: 'Bu ekrandan toplu yayın yapılamaz.',
} as const

export const RIGHTS_STATUS_TR: Record<string, string> = {
  PENDING: 'İnceleme Bekleyen',
  CLEARED: 'İncelendi',
  REWRITE_REQUIRED: 'Yeniden Yazılacak',
  DO_NOT_PUBLISH: 'Yayınlanmayacak',
}

export const RISK_TR: Record<string, string> = {
  HIGH_SOURCE_OVERLAP: 'YÜKSEK RİSK',
  MEDIUM_OVERLAP: 'ORTA RİSK',
  LOW_OVERLAP: 'DÜŞÜK RİSK',
  SOURCE_NOT_EVALUABLE: 'DEĞERLENDİRİLEMEDİ',
}

export function riskRecommendationTr(risk: string): string {
  if (risk === 'HIGH_SOURCE_OVERLAP') return 'Yeniden yazılması önerilir'
  if (risk === 'MEDIUM_OVERLAP') return 'Dikkatli inceleyin'
  if (risk === 'LOW_OVERLAP') return 'İnsan incelemesi yeterli olabilir'
  return 'Kaynak metin karşılaştırılamadı — insan kararı gerekir'
}

export function publicationStateTr(opts: {
  status: string
  rightsStatus: string | null
  hasPublishedBy: boolean
}): string {
  if (opts.status === 'published') return 'Yayında'
  if (opts.hasPublishedBy && (opts.rightsStatus === 'PENDING' || !opts.rightsStatus)) {
    return 'Yayında (eski kayıt) — Hak Kontrolü Gerekli'
  }
  if (opts.status === 'draft') return 'Taslak'
  return opts.status
}
