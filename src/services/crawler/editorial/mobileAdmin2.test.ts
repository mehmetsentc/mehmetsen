import { describe, expect, it } from 'vitest'
import { aiSkipReasonLabel, extractionMethodLabel, imageSourceLabel } from './labels'

describe('MOBILE-ADMIN-2 plain Turkish labels', () => {
  it('never shows system codes to editors', () => {
    expect(aiSkipReasonLabel('CRAWLER_AI_DISPATCH_ENABLED=false')).toBeNull()
    expect(aiSkipReasonLabel('SOME_FLAG=true')).toBe("Sistem ayarı nedeniyle AI'a gönderilmedi")
    expect(aiSkipReasonLabel('Kaynak bekleniyor')).toBe('Kaynak bekleniyor')
    expect(aiSkipReasonLabel(null)).toBeNull()
  })
  it('reads extraction / image source in Turkish', () => {
    expect(extractionMethodLabel('jsonld')).toBe('yapısal veri')
    expect(extractionMethodLabel(null)).toBe('—')
    expect(imageSourceLabel('manual')).toBe('elle seçildi')
    expect(imageSourceLabel('og:image')).toBe('sayfa paylaşım görseli')
  })
})
