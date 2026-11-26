import { describe, expect, it } from 'vitest'
import { toSpokenTurkish } from './ttsNormalize'

describe('seslendirmede ölüm / intihar dili (26.11.2026)', () => {
  it('ölü bulunan, ölüm ve intihar söylenmez', () => {
    const out = toSpokenTurkish('Evinde ölü bulunan adamın ölümü araştırılıyor. Genç kız intihar etti.')
    expect(out).toContain('hayatını kaybetmiş olarak bulunan')
    expect(out).toContain('vefatı')
    expect(out).toContain('yaşamına son verdi')
    expect(/(?<![\p{L}])(?:öl(?:ü|d|m|e)|intihar)/iu.test(out)).toBe(false)
  })
})
