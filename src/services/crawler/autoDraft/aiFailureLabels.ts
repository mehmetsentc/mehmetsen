/**
 * Phase 4E — human-readable Turkish reasons for AI job failures.
 * Technical codes remain in audit/detail.
 */

export const AI_JOB_FAILURE_REASON_TR: Record<string, string> = {
  BODY_TOO_SHORT: 'AI çıktısı kısa',
  BODY_ABSOLUTE_TOO_SHORT: 'AI çıktısı kısa',
  BODY_TOO_LONG: 'AI çıktısı çok uzun',
  INSUFFICIENT_SOURCE_MATERIAL: 'Kaynak metni yetersiz',
  SCHEMA_INVALID: 'Şema doğrulanamadı',
  NOT_JSON: 'Şema doğrulanamadı',
  GROUNDING_FAILED: 'Kaynaklara dayandırma başarısız',
  COST_UNKNOWN: 'Maliyet sınırı',
  EVENT_COST_LIMIT_EXCEEDED: 'Maliyet sınırı',
  HOURLY_REQUEST_LIMIT: 'Maliyet sınırı',
  DAILY_REQUEST_LIMIT: 'Maliyet sınırı',
  DAILY_BUDGET_EXCEEDED: 'Maliyet sınırı',
  MONTHLY_BUDGET_EXCEEDED: 'Maliyet sınırı',
  HOURLY_BUDGET_EXCEEDED: 'Maliyet sınırı',
  COST_BLOCKED: 'Maliyet sınırı',
  PROVIDER_BLOCKED: 'Sağlayıcı kullanılamıyor',
  PROVIDER_NOT_READY: 'Sağlayıcı kullanılamıyor',
  PROVIDER_DISABLED: 'Sağlayıcı kullanılamıyor',
  PROVIDER_ERROR: 'Sağlayıcı kullanılamıyor',
  EXECUTION_RESULT_UNCERTAIN: 'İşlem yarıda kaldı',
  PROVIDER_SUCCEEDED_FINALIZE_FAILED: 'İşlem yarıda kaldı',
  LEASE_EXPIRED: 'İşlem yarıda kaldı',
  TIMEOUT: 'İşlem yarıda kaldı',
  QUALITY_FAILED: 'Kalite kontrolü başarısız',
  VALIDATION_FAILED: 'Şema doğrulanamadı',
  SCHEMA_VALIDATION_FAILED: 'Şema doğrulanamadı',
  PRESPEND_READY: 'Harcama öncesi hazır',
  TOO_THIN: 'Metin çok kısa',
  LOW_CONFIDENCE: 'Düşük çıkarım güveni',
  LOW_SOURCE_HEALTH: 'Kaynak sağlığı düşük',
  MALFORMED_EXTRACTION: 'Bozuk çıkarım',
  BOILERPLATE_HEAVY: 'Şablon metin ağırlıklı',
  DUPLICATE_EVENT: 'Yinelenen olay',
  INSUFFICIENT_EVENT_EVIDENCE: 'Olay kanıtı yetersiz',
  BUDGET_BLOCKED: 'Bütçe engeli',
  HISTORICAL_BLOCKED: 'Kesim tarihi öncesi',
  WAITING_FOR_MORE_SOURCES: 'Daha fazla kaynak bekleniyor',
  WOULD_BLOCK: 'Gölge: harcama engellendi',
  WOULD_DISPATCH: 'Gölge: harcanırdı',
  CONCURRENCY_LIMIT: 'Eşzamanlılık sınırı',
  BUDGET_CAS_CONTENTION: 'Bütçe çakışması',
  PROMPT_INJECTION_SUSPECT: 'Kaynak metni güvenlik filtresine takıldı',
}

export function aiJobFailureReasonTr(input: {
  failureCode?: string | null
  failureReason?: string | null
  status?: string | null
}): string {
  const code = (input.failureCode || '').trim()
  if (code && AI_JOB_FAILURE_REASON_TR[code]) return AI_JOB_FAILURE_REASON_TR[code]
  const reason = (input.failureReason || '').toLowerCase()
  if (/cost|budget|ceiling/.test(reason)) return 'Maliyet sınırı'
  if (/provider|deepseek|credential|pricing/.test(reason)) return 'Sağlayıcı kullanılamıyor'
  if (/short|thin|insufficient/.test(reason)) return 'Kaynak metni yetersiz'
  if (/schema|json|validate/.test(reason)) return 'Şema doğrulanamadı'
  if (/lease|uncertain|heartbeat|timeout|finalize/.test(reason)) return 'İşlem yarıda kaldı'
  if (/ground/.test(reason)) return 'Kaynaklara dayandırma başarısız'
  if (input.status === 'FAILED' || input.status === 'BLOCKED') return 'İşlem başarısız'
  return 'İşlem başarısız'
}
