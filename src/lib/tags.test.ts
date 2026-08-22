import { describe, expect, it } from 'vitest'
import {
  formatTagLabel,
  isValidTagSlug,
  parseTagSlug,
  tagLookupVariants,
  tagToSlug,
} from '@/lib/tags'
import { ROUTES } from '@/constants/routes'

describe('tagToSlug', () => {
  it('strips hash prefix and collapses spaces to hyphens', () => {
    expect(tagToSlug('# ilker lazoğlu')).toBe('ilker-lazoğlu')
    expect(tagToSlug('  # rusya ')).toBe('rusya')
    expect(tagToSlug('novorossiysk')).toBe('novorossiysk')
  })

  it('lowercases with Turkish locale rules', () => {
    expect(tagToSlug('İSTANBUL')).toBe('istanbul')
  })
})

describe('parseTagSlug', () => {
  it('decodes URL segments and normalizes to slug form', () => {
    expect(parseTagSlug('ilker%20lazo%C4%9Flu')).toBe('ilker-lazoğlu')
    expect(parseTagSlug('%23%20rusya')).toBe('rusya')
  })
})

describe('isValidTagSlug', () => {
  it('accepts slug-safe tags and rejects empty or spaced values', () => {
    expect(isValidTagSlug('ilker-lazoğlu')).toBe(true)
    expect(isValidTagSlug('')).toBe(false)
    expect(isValidTagSlug('bad tag')).toBe(false)
  })
})

describe('tagLookupVariants', () => {
  it('includes hyphen and space forms for Firestore matching', () => {
    const variants = tagLookupVariants('ilker-lazoğlu')
    expect(variants).toContain('ilker-lazoğlu')
    expect(variants).toContain('ilker lazoğlu')
  })
})

describe('formatTagLabel', () => {
  it('does not double-prefix hash labels', () => {
    expect(formatTagLabel('# rusya')).toBe('#rusya')
    expect(formatTagLabel('novorossiysk')).toBe('#novorossiysk')
  })
})

describe('ROUTES.TAG', () => {
  it('builds slug URLs for spaced or hashed tags', () => {
    expect(ROUTES.TAG('# ilker lazoğlu')).toBe('/etiket/ilker-lazo%C4%9Flu')
    expect(ROUTES.TAG('rusya')).toBe('/etiket/rusya')
  })
})
