import { describe, expect, it } from 'vitest'
import { toSpokenTurkish } from './ttsNormalize'

describe('REELS-17 kesme işaretli ekler seslendirmede ayrı okunmaz', () => {
  it('özel ad + ek kesmesiz okunur', () => {
    const s = toSpokenTurkish("Murat Kurum, Burak Yılmaz'ın kızlarıyla İstanbul'da buluştu.")
    expect(s).toContain('Burak Yılmazın kızlarıyla')
    expect(s).toContain('İstanbulda')
    expect(s).not.toContain("'")
  })
  it('kısaltma, sayı ve yüzde ekleri de birleşir', () => {
    expect(toSpokenTurkish("CHP'nin açıklaması")).toContain('Ce He Penin açıklaması')
    expect(toSpokenTurkish("NATO'nun zirvesi")).toContain('Natonun zirvesi')
    expect(toSpokenTurkish("2026'da açılacak")).not.toContain("'")
    expect(toSpokenTurkish("%15'i ayrıldı")).toContain('yüzde on beşi')
  })
  it('farklı kesme işaretleri (’ ‘ ʼ ´ `) de aynı okunur', () => {
    for (const ap of ['’', '‘', 'ʼ', '´', '`', "'"]) expect(toSpokenTurkish(`Yılmaz${ap}ın açıklaması`)).toContain('Yılmazın açıklaması')
  })
  it('eski kurallar bozulmaz', () => {
    expect(toSpokenTurkish("19.20'de başladı")).toContain('on dokuz yirmide')
    expect(toSpokenTurkish("15'inci kez")).toContain('on beşinci kez')
    expect(toSpokenTurkish('Y.D. (31) gözaltında')).toContain('Ye De')
  })
})
