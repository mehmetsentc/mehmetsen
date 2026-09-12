import { describe, expect, it } from 'vitest'
import { hashTargetId } from './hashTarget'

describe('hashTargetId', () => {
  it('returns null for empty or bare hash', () => {
    expect(hashTargetId('')).toBeNull()
    expect(hashTargetId('#')).toBeNull()
    expect(hashTargetId('   ')).toBeNull()
  })

  it('strips the leading #', () => {
    expect(hashTargetId('#reklam-is-birligi')).toBe('reklam-is-birligi')
    expect(hashTargetId('iletisim-formu')).toBe('iletisim-formu')
  })

  it('decodes percent-encoded ids', () => {
    expect(hashTargetId('#reklam%20is')).toBe('reklam is')
  })
})
