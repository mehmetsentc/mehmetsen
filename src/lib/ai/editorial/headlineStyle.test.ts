import { describe, expect, it } from 'vitest'
import { NAHABER_HEADLINE_STYLE, NAHABER_SOCIAL_SHARE_STYLE } from './headlineStyle'

describe('NAHABER_HEADLINE_STYLE', () => {
  it('asks for curiosity without cheap shock clickbait', () => {
    expect(NAHABER_HEADLINE_STYLE).toMatch(/çarpıcı/)
    expect(NAHABER_HEADLINE_STYLE).toMatch(/ŞOK/)
    expect(NAHABER_HEADLINE_STYLE).toMatch(/5 ölü/)
    expect(NAHABER_HEADLINE_STYLE).toMatch(/Büyük kaza/)
    expect(NAHABER_HEADLINE_STYLE).toMatch(/haberi saklamaz/)
  })

  it('separates social headline from share summary', () => {
    expect(NAHABER_SOCIAL_SHARE_STYLE).toMatch(/socialHeadline/)
    expect(NAHABER_SOCIAL_SHARE_STYLE).toMatch(/PAYLAŞIM ÖZETİ/)
    expect(NAHABER_SOCIAL_SHARE_STYLE).toMatch(/socialCaption/)
  })
})
