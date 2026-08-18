import { describe, expect, it } from 'vitest'
import { MIN_NEWS_BODY_WORDS } from '@/lib/contentQuality'
import {
  classifyContinuationTriggers,
  classifyQualityRetryTriggers,
  sanitizeRetryTriggers,
} from '@/lib/ai/usage/retryTriggers'

function words(n: number, word = 'haber'): string {
  return Array.from({ length: n }, () => word).join(' ')
}

describe('sanitizeRetryTriggers', () => {
  it('keeps closed enums and drops free text / article-like strings', () => {
    expect(
      sanitizeRetryTriggers([
        'body_too_short',
        'draft',
        'Sen NaHaber editörüsün',
        'İçerik: Belediye başkanı açıkladı',
        12,
        null,
        'publish_score_low',
        'body_too_short',
      ])
    ).toEqual(['body_too_short', 'draft', 'publish_score_low'])
  })

  it('rejects non-arrays', () => {
    expect(sanitizeRetryTriggers('body_too_short')).toEqual([])
    expect(sanitizeRetryTriggers({ draft: true })).toEqual([])
  })
})

describe('classifyContinuationTriggers', () => {
  it('flags body_too_short', () => {
    expect(
      classifyContinuationTriggers({
        title: 'Tam başlık',
        spot: 'Tam spot cümlesi burada biter.',
        summary: 'Tam özet cümlesi burada biter.',
        content: 'Kısa gövde.',
      })
    ).toContain('body_too_short')
  })

  it('flags title_incomplete', () => {
    expect(
      classifyContinuationTriggers({
        title: 'Belediye başkanı ve',
        content: `${words(MIN_NEWS_BODY_WORDS)} biter.`,
      })
    ).toContain('title_incomplete')
  })

  it('flags incomplete_segment on a cut paragraph', () => {
    const triggers = classifyContinuationTriggers({
      title: 'Tam başlık',
      content: `${words(MIN_NEWS_BODY_WORDS)} biter.\n\nBu paragraf yarım kaldı çünkü bağlaçla bitiyor ve`,
    })
    expect(triggers).toContain('incomplete_segment')
  })

  it('flags actual_truncation on a long body that does not end with a closer', () => {
    const triggers = classifyContinuationTriggers({
      title: 'Tam başlık',
      content: `${words(MIN_NEWS_BODY_WORDS)} kesilmis`,
    })
    expect(triggers).toContain('actual_truncation')
    expect(triggers).not.toContain('body_too_short')
  })
})

describe('classifyQualityRetryTriggers', () => {
  it('can attach multiple reasons without storing article text', () => {
    const triggers = classifyQualityRetryTriggers({
      gateDecision: 'draft',
      publishScore: 40,
      categoryConfidence: 0,
      title: 'Tam başlık',
      description: 'Kısa.',
    })
    expect(triggers).toEqual(
      expect.arrayContaining(['draft', 'publish_score_low', 'category_confidence_zero', 'body_short'])
    )
    expect(JSON.stringify(triggers)).not.toMatch(/Kısa/)
  })
})
