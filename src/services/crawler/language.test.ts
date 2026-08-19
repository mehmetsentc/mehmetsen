import { describe, expect, it } from 'vitest'
import { detectLanguage, isValidLanguageTag } from './language'
import { evaluateAiCandidate } from './gate/aiCandidate'

describe('language handling', () => {
  it('keeps original language and does not translate', () => {
    expect(detectLanguage('Les deputes ont vote le texte hier soir dans l hemicycle.')).toBe('fr')
    expect(detectLanguage('The council approved the budget after a long debate last night.')).toBe('en')
    expect(detectLanguage('Городская дума приняла бюджет после долгих споров вечером.')).toBe('ru')
    expect(detectLanguage('أعلنت الوزارة عن الميزانية بعد اجتماع طويل في العاصمة.')).toBe('ar')
  })

  it('rejects undetermined tags for AI gate', () => {
    expect(isValidLanguageTag('und')).toBe(false)
    expect(isValidLanguageTag('tr')).toBe(true)
    expect(isValidLanguageTag('zh-CN')).toBe(true)
  })
})

describe('AI candidate gate', () => {
  const base = {
    source: { status: 'ACTIVE' as const },
    clusterHasBetterEligible: false,
    cacheHit: false,
    article: {
      title: 'Council vote',
      articleBodyText: 'x '.repeat(250),
      extractionConfidence: 0.8,
      language: 'en',
      publishedAt: new Date(),
      isExactDuplicate: false,
      fetchedAt: new Date(),
    },
  }

  it('skips duplicates, short text, cache hits, and never calls AI', () => {
    expect(evaluateAiCandidate({ ...base, article: { ...base.article, isExactDuplicate: true } }).reason).toBe(
      'duplicate'
    )
    expect(evaluateAiCandidate({ ...base, cacheHit: true }).reason).toBe('ai_cache_hit')
    expect(
      evaluateAiCandidate({ ...base, article: { ...base.article, articleBodyText: 'too short' } }).reason
    ).toBe('too_short')
    expect(evaluateAiCandidate(base).eligibility).toBe('ELIGIBLE')
    expect(evaluateAiCandidate(base).avoidedAi).toBe(false)
  })
})
