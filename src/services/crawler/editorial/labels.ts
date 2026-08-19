import type { CrawlerEditorialStatus } from '../types'
import { classifyCrawlerFailure, type CrawlerFailureClass } from '../failures/classify'

export const EDITORIAL_STATUS_LABELS: Record<CrawlerEditorialStatus, string> = {
  NEW: 'Yeni',
  DRAFT: 'Taslak Oluşturuldu',
  EDITING: 'Düzenleniyor',
  PUBLISHED: 'Yayınlandı',
  SKIPPED: 'Atlandı',
}

export const QUALITY_STATUS_LABELS: Record<string, string> = {
  EXTRACTED: 'Çıkarıldı',
  LOW_CONFIDENCE: 'Düşük güven',
  FAILED: 'Başarısız',
}

export const CRAWLER_STATUS_LABELS: Record<string, string> = {
  stored: 'Kayıtlı',
  duplicate: 'Mükerrer',
  extracted: 'Çıkarıldı',
  failed: 'Başarısız',
  ACTIVE: 'Aktif',
  PAUSED: 'Duraklatıldı',
  DEGRADED: 'Zayıf',
  DISABLED: 'Kapalı',
  WATCHING: 'İzleniyor',
  ELIGIBLE: 'Uygun',
  HIGH_PRIORITY: 'Yüksek öncelik',
  REJECTED: 'Reddedildi',
  OPEN: 'Açık',
  BORDERLINE: 'Sınırda',
  CLOSED: 'Kapalı',
}

export const FAILURE_REASON_TR: Record<CrawlerFailureClass, string> = {
  discovery: 'Kaynak keşif hatası',
  robots_policy: 'Robots / politika',
  http_error: 'HTTP hatası',
  http_403: '403 yasak',
  http_404: '404 bulunamadı',
  http_429: '429 çok fazla istek',
  timeout: 'Zaman aşımı',
  extraction: 'Metin çıkarma hatası',
  low_confidence: 'Düşük güvenli çıkarım',
  image_extraction: 'Görsel çıkarma hatası',
  other: 'Diğer',
}

export function crawlerStatusLabel(article: { isExactDuplicate: boolean; qualityStatus: string }): string {
  if (article.isExactDuplicate) return 'Mükerrer'
  return QUALITY_STATUS_LABELS[article.qualityStatus] || article.qualityStatus
}

export function failureReasonLabel(input: {
  failureReason?: string | null
  status?: string | null
  httpStatus?: number | null
  qualityStatus?: string | null
}): string {
  return FAILURE_REASON_TR[classifyCrawlerFailure(input)]
}
