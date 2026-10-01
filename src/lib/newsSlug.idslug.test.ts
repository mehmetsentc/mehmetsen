import { describe, expect, it } from 'vitest'
import { isDocIdLikeSlug, needsPublicSlug } from './newsSlug'

describe('id-shaped draft slugs', () => {
  it('detects Firestore ids used as slugs (as seen on crawler drafts)', () => {
    expect(isDocIdLikeSlug('sEDYp1z9ZwljxvUhQPUN')).toBe(true)
    expect(isDocIdLikeSlug('2nk2VfGWBtXjOA2i3zUo')).toBe(true)
    // CMS form lower-cases slugs before saving
    expect(isDocIdLikeSlug('sedyp1z9zwljxvuhqpun', 'sEDYp1z9ZwljxvUhQPUN')).toBe(true)
  })

  it('does not flag real Turkish slugs', () => {
    expect(isDocIdLikeSlug('konak-meclisinde-fon-krizi-tartismasi')).toBe(false)
    expect(isDocIdLikeSlug('biga-fuari-20-yilinda-yarin-aciliyor')).toBe(false)
    expect(isDocIdLikeSlug('canakkalespor')).toBe(false)
    expect(isDocIdLikeSlug('kayseridegunes2026yil')).toBe(false) // 21 chars
    expect(isDocIdLikeSlug('')).toBe(false)
  })

  it('needsPublicSlug covers placeholders and id slugs', () => {
    expect(needsPublicSlug('taslak-123')).toBe(true)
    expect(needsPublicSlug('')).toBe(true)
    expect(needsPublicSlug('sEDYp1z9ZwljxvUhQPUN')).toBe(true)
    expect(needsPublicSlug('abc', 'abc')).toBe(true)
    expect(needsPublicSlug('konak-meclisinde-fon-krizi')).toBe(false)
  })
})
