import { describe, expect, it } from 'vitest'
import { contentHashOf, titleHashOf, simhashOf, hammingHex64 } from './hash'
import { evaluateExactDuplicate } from './engine'

describe('duplicate engine', () => {
  it('hashes normalized content stably', () => {
    expect(contentHashOf('Hello, World!')).toBe(contentHashOf('hello world'))
    expect(titleHashOf('Budget Vote!!')).toBe(titleHashOf('budget vote'))
  })

  it('levels 1-4 fire in order', () => {
    const l1 = evaluateExactDuplicate({
      canonicalUrl: 'https://a.test/x',
      bodyText: 'long enough body text here',
      title: 'Hello',
      simhash: null,
      existingByNormalizedUrl: 'id-1',
    })
    expect(l1?.level).toBe(1)

    const l3 = evaluateExactDuplicate({
      canonicalUrl: null,
      bodyText: 'x'.repeat(90),
      title: 'Hello',
      simhash: null,
      existingByContentHash: 'id-3',
    })
    expect(l3?.reason).toBe('content_hash')
  })

  it('near-duplicate via similar titles', () => {
    const hit = evaluateExactDuplicate({
      canonicalUrl: null,
      bodyText: 'unused',
      title: 'Parliament approves the annual budget tonight',
      simhash: null,
      nearCandidates: [
        { id: 'other', title: 'Parliament approves the annual budget tonight', simhash: null },
      ],
    })
    expect(hit?.level).toBe(5)
  })

  it('simhash is close for overlapping text', () => {
    const a = simhashOf('the council voted to approve the city budget after midnight debate')
    const b = simhashOf('the council voted to approve the city budget after a midnight debate')
    expect(hammingHex64(a, b)).toBeLessThan(12)
  })
})
