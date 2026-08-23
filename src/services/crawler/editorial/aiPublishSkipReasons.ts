/**
 * Pipeline skipReason → editör toast metni (Türkçe).
 * Bilinmeyen kodlar olduğu gibi gösterilir (ham İngilizce kod yerine anlaşılır).
 */
export function formatAiPublishSkipReasonTr(skipReason: string | undefined | null): string {
  const raw = skipReason?.trim() || ''
  if (!raw) return 'Atlandı (neden belirtilmedi — loglara bakın)'

  if (raw.startsWith('ai_rejected:')) {
    const detail = raw.slice('ai_rejected:'.length).trim()
    return detail ? `AI reddetti: ${detail}` : 'AI haberı reddetti'
  }

  const map: Record<string, string> = {
    already_published: 'Bu haber zaten yayınlanmış',
    already_drafted: 'Bu haber zaten taslakta (Onay Bekliyor)',
    story_library_duplicate: 'Benzer haber zaten yayında (hikâye kütüphanesi)',
    ai_duplicate: 'AI benzer haber olarak işaretledi',
    promotional_content: 'Tanıtım / kanal paylaşımı içeriği',
    live_broadcast: 'Canlı yayın / basın toplantısı linki',
    'quality:body_too_short': 'İçerik çok kısa',
    'quality:incomplete_text': 'Metin kesik veya eksik',
    'quality:fact_check_failed': 'Doğrulama başarısız',
    gate_skip: 'Kalite kapısı atladı',
    ai_output_too_short: 'AI çıktısı çok kısa',
    translation_failed: 'Çeviri yapılamadı',
    ai_unavailable: 'AI anahtarı yok',
    'görsel yok': 'Kapak görseli yok',
  }

  if (map[raw]) return map[raw]
  if (raw.startsWith('quality:')) return `Kalite filtresi: ${raw.slice('quality:'.length)}`
  return raw
}
