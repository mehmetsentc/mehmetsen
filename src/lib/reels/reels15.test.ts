import { describe, expect, it } from 'vitest'
import { toSpokenTurkish } from './ttsNormalize'

describe('REELS-15 baş harfler sıra sayısı / Roma rakamı olarak okunmaz', () => {
  it('«Y.D. (31)» harf harf okunur', () => {
    const s = toSpokenTurkish('Şüpheli Y.D. (31) gözaltına alındı.')
    expect(s).toContain('Ye De')
    expect(s).not.toMatch(/yüzüncü|Y\.|D\./)
    expect(s).toContain('otuz bir')
  })
  it('boşluklu, tek ve üç harfli baş harfler', () => {
    expect(toSpokenTurkish('Y. D. isimli kişi')).toContain('Ye De isimli')
    expect(toSpokenTurkish('Av. M. Demir açıklama yaptı')).toContain('Avukat Me Demir')
    expect(toSpokenTurkish('M.K.A. ve C.Ö. yaralandı')).toContain('Me Ka A ve Ce Ö yaralandı')
    expect(toSpokenTurkish('Y.D ile görüştü')).toContain('Ye De ile')
  })
  it('mevcut kısaltma ve sıra sayısı kuralları bozulmaz', () => {
    expect(toSpokenTurkish('T.C. vatandaşı')).toContain('Türkiye Cumhuriyeti')
    expect(toSpokenTurkish('Prof. Dr. A. Kaya')).toContain('Profesör Doktor A Kaya')
    expect(toSpokenTurkish('3. sırada')).toContain('üçüncü sırada')
    expect(toSpokenTurkish('ABD ve AB')).toContain('A Be De ve A Be')
    expect(toSpokenTurkish('Saat 19.20 de')).toContain('on dokuz yirmi')
  })
})
