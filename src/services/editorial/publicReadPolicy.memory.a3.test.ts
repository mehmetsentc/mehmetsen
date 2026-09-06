import { describe, expect, it } from 'vitest'
import { canBeMemoryContext, memoryTrustTier, type PublicReadClass } from './publicReadPolicy'

const ALL_CLASSES: PublicReadClass[] = [
  'CANONICAL',
  'LEGACY_ALLOWED',
  'SYSTEM_ALERT',
  'LEGACY_QUARANTINED',
  'NOT_PUBLIC',
]

describe('Faz A3 Task 3 — canBeMemoryContext / memoryTrustTier (CANONICAL-only invariant)', () => {
  it('canBeMemoryContext is true ONLY for CANONICAL', () => {
    for (const cls of ALL_CLASSES) {
      expect(canBeMemoryContext(cls)).toBe(cls === 'CANONICAL')
    }
  })

  it('LEGACY_ALLOWED is architecturally anticipated but NOT eligible in A3 V1', () => {
    expect(canBeMemoryContext('LEGACY_ALLOWED')).toBe(false)
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
