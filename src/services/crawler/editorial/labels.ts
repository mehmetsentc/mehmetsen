import type {
  ClusterEditorialDecision,
  CrawlerEditorialStatus,
  CrawlerRejectionReason,
} from '../types'
import { classifyCrawlerFailure, type CrawlerFailureClass } from '../failures/classify'

/** MOBILE-ADMIN-2: how the text was read from the source page, in plain Turkish. */
export function extractionMethodLabel(method: string | null | undefined): string {
  const m = (method || '').toLowerCase()
  if (!m) return '—'
  if (m.includes('jsonld') || m.includes('json-ld') || m.includes('schema')) return 'yapısal veri'
  if (m.includes('readability')) return 'sayfa metni'
  if (m.includes('rss') || m.includes('feed')) return 'RSS akışı'
  if (m.includes('amp')) return 'mobil sayfa'
  if (m.includes('browser') || m.includes('playwright')) return 'tarayıcıyla açıldı'
  if (m.includes('og') || m.includes('meta')) return 'sayfa özeti'
  return 'diğer'
}

/** Where the main photo came from (was «Provenance»). */
export function imageSourceLabel(source: string | null | undefined): string {
  const s = (source || '').toLowerCase()
  if (!s) return '—'
  if (s.includes('manual')) return 'elle seçildi'
  if (s.includes('og')) return 'sayfa paylaşım görseli'
  if (s.includes('jsonld') || s.includes('schema')) return 'yapısal veri'
  if (s.includes('rss') || s.includes('feed')) return 'RSS akışı'
  if (s.includes('body') || s.includes('content') || s.includes('article')) return 'haber metni içinden'
  return 'diğer'
}

/**
 * Why a raw story was not sent to AI — never show system codes («X_ENABLED=false») to editors.
 * Returns null when the reason is the global «automatic AI writing is off» switch: the page
 * says that once at the top instead of on every row.
 */
export function aiSkipReasonLabel(reason: string | null | undefined): string | null {
  const r = (reason || '').trim()
  if (!r) return null
  if (/CRAWLER_AI_DISPATCH_ENABLED\s*=\s*false/i.test(r)) return null
  if (/^[A-Z0-9_]+\s*=/.test(r) || /^[A-Z0-9_]{6,}$/.test(r)) return 'Sistem ayarı nedeniyle AI\'a gönderilmedi'
  return r
}

export const EDITORIAL_STATUS_LABELS: Record<CrawlerEditorialStatus, string> = {
  NEW: 'Yeni',
  IN_REVIEW: 'İncelemede',
  AI_CANDIDATE: 'AI için işaretli',
  REJECTED: 'Reddedildi',
  ARCHIVED: 'Arşiv',
  DELETED: 'Silindi',
  DRAFT: 'Taslak Oluşturuldu',
  EDITING: 'Düzenleniyor',
  PUBLISHED: 'Yayınlandı',
  SKIPPED: 'Atlandı',
  AI_QUEUED: 'AI Kuyruğu',
  AI_PROCESSING: 'AI İşleniyor',
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

export const MACHINE_DRAFT_ELIGIBILITY_LABELS: Record<string, string> = {
  AUTO_DRAFT_ELIGIBLE: 'Otomatik seçim — AI uygun',
  WAITING_FOR_MORE_SOURCES: 'Otomatik seçim — kaynak bekleniyor',
  LOW_QUALITY: 'Otomatik seçim — düşük kalite',
  TOO_THIN: 'Otomatik seçim — çok ince',
  DUPLICATE: 'Otomatik seçim — mükerrer',
  STALE: 'Otomatik seçim — eski',
  EDITOR_REJECTED: 'Otomatik seçim — editör engeli',
  ALREADY_DRAFTED: 'Otomatik seçim — taslak var',
  ALREADY_PUBLISHED: 'Otomatik seçim — yayınlandı',
  COST_BLOCKED: 'Otomatik seçim — maliyet engeli',
  MANUAL_ONLY: 'Otomatik seçim — yalnızca manuel',
  UPDATE_AVAILABLE: 'Otomatik seçim — güncelleme var',
  PROVIDER_BLOCKED: 'Otomatik seçim — provider engeli',
  BLOCKED: 'Otomatik seçim — engelli',
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
  AUTO_DRAFT_ELIGIBLE: 'Otomatik AI uygun',
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
  PROVIDER_BLOCKED: 'Provider engeli',
  BLOCKED: 'Engelli',
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
