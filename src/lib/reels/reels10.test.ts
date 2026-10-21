import { describe, expect, it } from 'vitest'
import { numberToTurkish, ordinalToTurkish, toSpokenTurkish } from './ttsNormalize'
import { speakable } from './timeline'

const s = toSpokenTurkish

describe('REELS-10 Turkish text for TTS', () => {
  it('numbers', () => {
    expect(numberToTurkish(2026)).toBe('iki bin yirmi altı')
    expect(numberToTurkish(1000)).toBe('bin')
    expect(numberToTurkish(1250000)).toBe('bir milyon iki yüz elli bin')
    expect(numberToTurkish(105)).toBe('yüz beş')
    expect(ordinalToTurkish(2)).toBe('ikinci')
    expect(ordinalToTurkish(15)).toBe('on beşinci')
  })
  it('clock times never become «nokta»', () => {
    expect(s('Toplantı saat 19.20\'de başlayacak.')).toBe('Toplantı saat on dokuz yirmide başlayacak.')
    expect(s('Maç 21:45\'te.')).toBe('Maç yirmi bir kırk beşte.')
    expect(s('Saat 09.00 itibarıyla kapandı.')).toBe('Saat dokuz itibarıyla kapandı.')
    expect(s('Saat 08.05\'te')).toBe('Saat sekiz sıfır beşte.')
  })
  it('dates, percent, money, decimals, thousands', () => {
    expect(s('21.10.2026 tarihinde')).toBe('yirmi bir Ekim iki bin yirmi altı tarihinde.')
    expect(s('Enflasyon %3,5 arttı.')).toBe('Enflasyon yüzde üç virgül beş arttı.')
    expect(s('Fiyat 1.250 TL oldu.')).toBe('Fiyat bin iki yüz elli lira oldu.')
    expect(s('2026\'da 15 km\'lik yol')).toBe('iki bin yirmi altıda on beş kilometrelik yol.')
  })
  it('scores, ordinals, abbreviations, acronyms', () => {
    expect(s('Göztepe 4-0 kazandı.')).toBe('Göztepe dört sıfır kazandı.')
    expect(s('Takım 3. sırada.')).toBe('Takım üçüncü sırada.')
    expect(s('Prof. Dr. Ayşe Kaya açıkladı.')).toBe('Profesör Doktor Ayşe Kaya açıkladı.')
    expect(s('CHP ve MHP grubu')).toBe('Ce He Pe ve Me He Pe grubu.')
    expect(s('ABD ve NATO')).toBe('A Be De ve Nato.')
    expect(s('TBMM\'de görüşüldü')).toBe("Te Be Me Me'de görüşüldü.")
  })
  it('noise and pauses', () => {
    expect(s('Son dakika 🚨 #deprem https://x.co')).toBe('Son dakika.')
    expect(s('Vali (açıklama yaptı) dedi')).toBe('Vali, açıklama yaptı, dedi.')
  })
  it('speakable keeps names readable and spells consonant acronyms', () => {
    expect(speakable('GESTAŞ seferleri')).toBe('Gestaş seferleri')
    expect(speakable('CHP açıkladı')).toBe('Ce He Pe açıkladı')
  })
})
