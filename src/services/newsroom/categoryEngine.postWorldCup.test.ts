import { describe, expect, it } from 'vitest'
import { categoryEngine } from '@/services/newsroom/categoryEngine'

describe('post-World-Cup routing → futbol', () => {
  it('maps generic world-cup AI category aliases to futbol', () => {
    expect(categoryEngine.resolve('world cup', 'national')).toBe('futbol')
    expect(categoryEngine.resolve('dünya kupası', 'national')).toBe('futbol')
    expect(categoryEngine.resolve('fifa 2026', 'national')).toBe('futbol')
    // Explicit archive id still resolves; validate remaps to futbol
    expect(categoryEngine.resolve('dunya-kupasi-2026', 'national')).toBe('dunya-kupasi-2026')
  })

  it('remaps dunya-kupasi-2026 keyword hits to futbol', () => {
    const result = categoryEngine.validate({
      aiCategoryId: 'dunya-kupasi-2026',
      categoryConfidence: 95,
      aiIsBreaking: false,
      title: 'Dünya Kupası şampiyonu İspanya milli takım kampına başladı',
      body: '2026 dünya kupası finalinden sonra İspanya kadrosu yeni sezona hazırlanıyor.',
      editorType: 'national',
    })
    expect(result.categoryId).toBe('futbol')
    expect(result.overrides.some((o) => o.includes('post-wc → futbol'))).toBe(true)
  })

  it('sends club football world news to futbol not WC archive', () => {
    const result = categoryEngine.validate({
      aiCategoryId: 'gundem',
      categoryConfidence: 70,
      aiIsBreaking: false,
      title: 'Real Madrid Şampiyonlar Ligi kadrosunu açıkladı',
      body: 'İspanyol kulübü yeni sezonda dünya kupası yıldızlarını da kadroda tutmayı planlıyor.',
      editorType: 'national',
    })
    expect(result.categoryId).toBe('futbol')
  })
})
