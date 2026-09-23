import { describe, expect, it } from 'vitest'
import { canBeMemoryContext, memoryTrustTier, type PublicReadClass } from './publicReadPolicy'

const ALL_CLASSES: PublicReadClass[] = [
  'CANONICAL',
  'LEGACY_ALLOWED',
  'SYSTEM_ALERT',
  'LEGACY_QUARANTINED',
  'NOT_PUBLIC',
]

describe('Faz A3/P4 — canBeMemoryContext / memoryTrustTier (A2.1 Bölüm 2)', () => {
  it('canBeMemoryContext is true for CANONICAL and LEGACY_ALLOWED only', () => {
    for (const cls of ALL_CLASSES) {
      expect(canBeMemoryContext(cls)).toBe(cls === 'CANONICAL' || cls === 'LEGACY_ALLOWED')
    }
  })

  it('LEGACY_ALLOWED is eligible with LOW trust', () => {
    expect(canBeMemoryContext('LEGACY_ALLOWED')).toBe(true)
    expect(memoryTrustTier('LEGACY_ALLOWED')).toBe('LOW')
  })

  it('SYSTEM_ALERT, LEGACY_QUARANTINED and NOT_PUBLIC are always excluded', () => {
    expect(canBeMemoryContext('SYSTEM_ALERT')).toBe(false)
    expect(canBeMemoryContext('LEGACY_QUARANTINED')).toBe(false)
    expect(canBeMemoryContext('NOT_PUBLIC')).toBe(false)
  })

  it('memoryTrustTier is HIGH only for CANONICAL, LOW for everything else', () => {
    for (const cls of ALL_CLASSES) {
      expect(memoryTrustTier(cls)).toBe(cls === 'CANONICAL' ? 'HIGH' : 'LOW')
    }
  })
})
