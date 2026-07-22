import { describe, expect, it } from 'vitest'
import { categoryEngine } from '@/services/newsroom/categoryEngine'

describe('categoryEngine local prior (no hard-lock)', () => {
  it('lets AI keep a specific non-local category for local editor feeds', () => {
    const resolved = categoryEngine.resolve('dunya', 'local', 'yerel-haber')
    expect(resolved).toBe('dunya')
  })

  it('falls back to yerel-haber when AI is generic gundem on local feeds', () => {
    const resolved = categoryEngine.resolve('gundem', 'local', 'yerel-haber')
    expect(resolved).toBe('yerel-haber')
  })

  it('revalidate keeps sport overrides after AI category swap', () => {
    const result = categoryEngine.validate({
      aiCategoryId: 'teknoloji',
      categoryConfidence: 80,
      aiIsBreaking: false,
      title: 'Galatasaray derbide 2-1 kazandı',
      body: 'Süper Lig maçında Galatasaray Fenerbahçe karşısında 2-1 galip geldi. Gol ve transfer konuşuluyor.',
      editorType: 'national',
    })
    expect(['futbol', 'spor']).toContain(result.categoryId)
  })
})
