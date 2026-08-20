import type {
  ClusterEditorialDecision,
  CrawlerEditorialStatus,
  CrawlerRejectionReason,
} from '../types'
import { classifyCrawlerFailure, type CrawlerFailureClass } from '../failures/classify'

export const EDITORIAL_STATUS_LABELS: Record<CrawlerEditorialStatus, string> = {
  NEW: 'Yeni',
  IN_REVIEW: 'İncelemede',
  AI_CANDIDATE: 'AI Adayı',
  REJECTED: 'Reddedildi',
  ARCHIVED: 'Arşiv',
  DELETED: 'Silindi',
  DRAFT: 'Taslak Oluşturuldu',
  EDITING: 'Düzenleniyor',
  PUBLISHED: 'Yayınlandı',
  SKIPPED: 'Atlandı',
}

export const EDITORIAL_DECISION_LABELS: Record<ClusterEditorialDecision, string> = {
  NONE: 'Karar yok',
  APPROVED_FOR_AI: 'AI için onaylandı',
  WATCHING: 'İzlemeye alındı',
  REJECTED: 'Reddedildi',
  ARCHIVED: 'Arşiv',
}

export const REJECTION_REASON_LABELS: Record<CrawlerRejectionReason, string> = {
  NO_NEWS_VALUE: 'Haber değeri yok',
  DUPLICATE: 'Tekrar / mükerrer',
  AD_SPONSOR: 'Reklam / sponsor içerik',
  LOW_VALUE_MAGAZINE: 'Magazin / düşük değer',
  STALE: 'Eski haber',
  INCOMPLETE: 'Eksik içerik',
  WRONG_SOURCE: 'Yanlış kaynak',
  IMAGE_PROBLEM: 'Görsel problemi',
  OUT_OF_LOCAL_SCOPE: 'Yerel kapsam dışı',
  OTHER: 'Diğer',
}

export const REJECTION_REASON_CODES = Object.keys(REJECTION_REASON_LABELS) as CrawlerRejectionReason[]

export const EDITORIAL_PRIORITY_LABELS: Record<string, string> = {
  NORMAL: 'Normal',
  HIGH: 'Yüksek',
  BREAKING: 'Son Dakika',
}

export const QUALITY_STATUS_LABELS: Record<string, string> = {
  EXTRACTED: 'Çıkarıldı',
  GOOD: 'İyi',
  LOW_CONFIDENCE: 'Düşük güven',
  TOO_SHORT: 'Çok kısa',
  PARTIAL: 'Kısmi',
  EXTRACTION_FAILED: 'Çıkarım başarısız',
  FAILED: 'Başarısız',
  STALE: 'Eski',
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
  AI_READY: 'HAZIR',
  WAITING_FOR_MORE_SOURCES: 'Kaynak bekleniyor',
  LOW_QUALITY: 'Düşük kalite',
  TOO_THIN: 'Çok ince',
  DUPLICATE: 'Mükerrer',
  STALE: 'Eski',
  EDITOR_REJECTED: 'Editör reddi',
  ALREADY_DRAFTED: 'Taslak var',
  ALREADY_PUBLISHED: 'Yayınlandı',
  COST_BLOCKED: 'Maliyet engeli',
  MANUAL_ONLY: 'Yalnızca manuel',
  UPDATE_AVAILABLE: 'Güncelleme mevcut',
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
