import { describe, expect, it } from 'vitest'
import { NAHABER_HEADLINE_STYLE, NAHABER_SOCIAL_SHARE_STYLE } from './headlineStyle'

describe('NAHABER_HEADLINE_STYLE', () => {
  it('asks for curiosity without cheap shock clickbait', () => {
    expect(NAHABER_HEADLINE_STYLE).toMatch(/çarpıcı/)
    expect(NAHABER_HEADLINE_STYLE).toMatch(/ŞOK/)
    expect(NAHABER_HEADLINE_STYLE).toMatch(/5 kişi hayatını kaybetti/)
    expect(NAHABER_HEADLINE_STYLE).toMatch(/Büyük kaza/)
    expect(NAHABER_HEADLINE_STYLE).toMatch(/haberi saklamaz/)
  })

  it('separates social headline from share summary', () => {
    expect(NAHABER_SOCIAL_SHARE_STYLE).toMatch(/socialHeadline/)
    expect(NAHABER_SOCIAL_SHARE_STYLE).toMatch(/PAYLAŞIM ÖZETİ/)
    expect(NAHABER_SOCIAL_SHARE_STYLE).toMatch(/socialCaption/)
  })
})

describe('ölüm dili (Karaman örneği)', () => {
  it('başlık ve spotta «öldü» → «hayatını kaybetti»; talimat yeni dili öğretir', async () => {
    const { neutralNewsLine, NAHABER_HEADLINE_STYLE } = await import('./headlineStyle')
    expect(neutralNewsLine("Karaman'da İl Özel İdaresi tırıyla çarpışan motokurye Şahin Yaşar öldü")).toBe("Karaman'da İl Özel İdaresi tırıyla çarpışan motokurye Şahin Yaşar hayatını kaybetti")
    expect(neutralNewsLine('Zincirleme kaza: 5 ölü')).toBe('Zincirleme kaza: 5 kişi hayatını kaybetti')
    expect(NAHABER_HEADLINE_STYLE).toContain('ÖLÜM DİLİ')
    expect(NAHABER_HEADLINE_STYLE).not.toContain('"5 ölü" yaz')
  })
})
