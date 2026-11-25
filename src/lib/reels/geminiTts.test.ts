import { describe, expect, it } from 'vitest'
import { reasonOf } from './geminiTts'

describe('Gemini TTS hata nedenleri', () => {
  it('izin, kredi ve kapalı API ayrı söylenir; anahtar sızmaz', () => {
    expect(reasonOf(403, '{"error":{"message":"Permission aiplatform.endpoints.predict denied"}}')).toMatch(/aiplatform/)
    expect(reasonOf(402, 'Your prepayment credits are depleted')).toBe('kredi / faturalandırma yok')
    expect(reasonOf(403, 'SERVICE_DISABLED')).toBe('API bu projede açık değil')
    const r = reasonOf(400, '{"error":{"message":"bad key=AIzaSyA1234567890abcdefghij x"}}')
    expect(r).not.toMatch(/AIza/)
  })
})
