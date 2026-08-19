import { describe, expect, it } from 'vitest'
import { articleTextStats, computeExtractionConfidence } from './confidence'

describe('extraction confidence', () => {
  it('scores a complete article higher than meta-only', () => {
    const stats = articleTextStats(
      'The council approved the budget after a long debate.\n\nOfficials said the plan starts next month for every district.\n\nResidents can comment at the follow-up hearing downtown.'
    )
    const full = computeExtractionConfidence({
      titleExists: true,
      bodyExists: true,
      ...stats,
      publishedAtExists: true,
      canonicalExists: true,
      mainImageExists: true,
      bodyTitleRatio: 12,
      boilerplateRatio: 0,
    })
    const thin = computeExtractionConfidence({
      titleExists: true,
      bodyExists: false,
      wordCount: 0,
      charCount: 0,
      paragraphCount: 0,
      publishedAtExists: false,
      canonicalExists: false,
      mainImageExists: false,
      bodyTitleRatio: 0,
      boilerplateRatio: 0.4,
    })
    expect(full).toBeGreaterThan(0.7)
    expect(thin).toBeLessThan(0.35)
  })
})
