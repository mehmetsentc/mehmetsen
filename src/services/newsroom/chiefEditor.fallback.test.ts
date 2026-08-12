import { describe, expect, it } from 'vitest'
import { TEKRARLAYAN_CATEGORY_ID } from '@/constants/config'
import {
  chiefEditorFallback,
  findFallbackTitleDuplicate,
  type ChiefEditorInput,
} from '@/services/newsroom/chiefEditor'

function baseInput(overrides: Partial<ChiefEditorInput> = {}): ChiefEditorInput {
  return {
    title: 'Güngören’de kontrollü yıkım sırasında apartman çöktü',
    summary: 'İstanbul Güngören’de kontrollü yıkım sırasında bir apartman çöktü.',
    description:
      'İstanbul’un Güngören ilçesinde kontrollü yıkım sırasında bir apartman çöktü. Ekipler bölgede arama kurtarma çalışması başlattı.',
    categoryId: 'gundem',
    categoryConfidence: 80,
    tags: ['istanbul', 'gungoren'],
    wordCount: 220,
    factCheckScore: 70,
    ...overrides,
  }
}

describe('chiefEditorFallback duplicate matching', () => {
  it('marks near-duplicate recent titles as isDuplicate reject', () => {
    const input = baseInput({
      title: 'İstanbul Güngören kontrollü yıkım sırasında apartman çöktü',
      recentTitles: [
        'Ankara yeni metro hattı açıldı',
        'İstanbul Güngören kontrollü yıkım sırasında apartman çöktü',
        'Borsa güne yükselişle başladı',
      ],
    })

    const hit = findFallbackTitleDuplicate(input)
    expect(hit).not.toBeNull()
    expect(hit!.similarity).toBeGreaterThanOrEqual(0.52)
    expect(hit!.matchedTitle).toContain('Güngören')

    const result = chiefEditorFallback(input)
    expect(result.isDuplicate).toBe(true)
    expect(result.decision).toBe('reject')
    expect(result.categoryId).toBe(TEKRARLAYAN_CATEGORY_ID)
    expect(result.categoryReason).toMatch(/titleSimilarity:/)
    expect(result.issues).toContain('duplicate_title_match')
    expect(result.modelUsed).toBe('fallback')
  })

  it('flags high title-overlap paraphrases', () => {
    const input = baseInput({
      title: 'Galatasaray Fenerbahçe derbisinde 2-1 galip geldi',
      description: 'Süper Lig derbisinde Galatasaray Fenerbahçe karşısında 2-1 kazandı.',
      recentTitles: ['Galatasaray Fenerbahçe derbisinde 2-1 galip geldi'],
    })

    const result = chiefEditorFallback(input)
    expect(result.isDuplicate).toBe(true)
    expect(result.decision).toBe('reject')
  })

  it('does not flag unrelated titles', () => {
    const input = baseInput({
      recentTitles: [
        'Ankara yeni metro hattı açıldı',
        'Borsa güne yükselişle başladı',
        'Galatasaray derbi hazırlıklarını sürdürüyor',
      ],
    })

    expect(findFallbackTitleDuplicate(input)).toBeNull()

    const result = chiefEditorFallback(input)
    expect(result.isDuplicate).toBe(false)
    expect(result.decision).not.toBe('reject')
    expect(result.issues).toEqual(['chief_editor_fallback'])
  })

  it('skips duplicate check when recentTitles is empty', () => {
    const result = chiefEditorFallback(baseInput({ recentTitles: [] }))
    expect(result.isDuplicate).toBe(false)
    expect(findFallbackTitleDuplicate(baseInput())).toBeNull()
  })
})
