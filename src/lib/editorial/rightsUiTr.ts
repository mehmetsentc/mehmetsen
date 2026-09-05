/** Turkish editorial labels for rights center (UI only — DB enums unchanged). */

export const RIGHTS_PAGE = {
  title: 'Yayın Hakları',
  subtitle:
    "Bu alan, kaynak haber ile NaHaber'de hazırlanmış metin arasındaki telif ve yeniden kullanım risklerini kontrol etmek için kullanılır. Buradaki karar haberi otomatik yayımlamaz.",
  rightsVsPublish:
    'Hak kararı yayın kararı değildir. Hak durumu kaydedilince haber otomatik yayınlanmaz.',
  sidebar: 'Yayın Hakları',
  loading: 'Hak kontrolü listesi yükleniyor…',
  empty: 'İncelenecek içerik bulunamadı.',
  error: 'Hak kontrolü verileri yüklenemedi.',
  retry: 'Tekrar Dene',
  techDetails: 'Teknik ayrıntılar',
  whyReview: 'Neden inceleme gerekiyor',
  recommendedAction: 'Önerilen işlem',
  searchPlaceholder: 'Başlık, kaynak veya haber ID ara…',
  groupBySource: 'Kaynağa göre grupla',
  filterStatus: 'Hak durumu',
  filterRisk: 'Risk',
  filterSource: 'Kaynak',
  selectVisible: 'Görünenleri seç',
  clearSelection: 'Seçimi temizle',
  bulkRewrite: 'Yeniden yazılmalı olarak işaretle',
  bulkDoNotPublish: 'Yayınlanmamalı olarak işaretle',
  bulkPending: 'Tekrar hak kontrolüne gönder',
  saveDecision: 'Kararı kaydet',
  publish: 'Yayınla',
  published: 'Yayında',
  bulkConfirmTitle: 'Toplu işlem onayı',
  noBulkPublish: 'Bu ekrandan toplu yayın yapılamaz.',
} as const

export const RIGHTS_STATUS_TR: Record<string, string> = {
  PENDING: 'Hak Kontrolü Bekliyor',
  CLEARED: 'Hakları Uygun',
  REWRITE_REQUIRED: 'Yeniden Yazılmalı',
  DO_NOT_PUBLISH: 'Yayınlanmamalı',
}

export const RISK_TR: Record<string, string> = {
  HIGH_SOURCE_OVERLAP: 'Yüksek',
  MEDIUM_OVERLAP: 'Orta',
  LOW_OVERLAP: 'Düşük',
  SOURCE_NOT_EVALUABLE: 'Değerlendirilemedi',
}

export function riskRecommendationTr(risk: string): string {
  if (risk === 'HIGH_SOURCE_OVERLAP') return 'Yeniden yazılmalı'
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
    return 'Yayında — Hak Kontrolü Gerekli'
  }
  if (opts.status === 'draft') return 'Taslak'
  return opts.status
}
