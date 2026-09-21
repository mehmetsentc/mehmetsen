import { describe, expect, it } from 'vitest'
import { abortIfSuspiciousReinsert, classifyProposedMutation } from './occurrenceMutation'

describe('occurrence mutation classification', () => {
  it('labels a new provider id as NEW_SOURCE_OCCURRENCE', () => {
    expect(
      classifyProposedMutation({
        operation: 'INSERT',
        incoming: { id: 'biletix_new', source: 'biletix', externalId: 'NEW1', status: 'published' },
      })
    ).toBe('NEW_SOURCE_OCCURRENCE')
  })

  it('stops a suspicious reinsert of the same provider identity under a new doc id', () => {
    expect(
      classifyProposedMutation({
        operation: 'INSERT',
        incoming: { id: 'biletix_newhash', source: 'biletix', externalId: 'ABC', status: 'published' },
        existingByProviderKey: { id: 'biletix_oldhash' },
      })
    ).toBe('SUSPICIOUS_REINSERT')
    expect(abortIfSuspiciousReinsert(['NEW_SOURCE_OCCURRENCE', 'SUSPICIOUS_REINSERT'])).toEqual({
      ok: false,
      suspicious: 1,
    })
  })

  it('treats fingerprint updates as material and skips as expected refresh', () => {
    expect(
      classifyProposedMutation({
        operation: 'UPDATE',
        incoming: { id: 'biletix_a', source: 'biletix', externalId: 'A', status: 'published' },
        existingById: { id: 'biletix_a', status: 'published' },
      })
    ).toBe('MATERIAL_UPDATE')
    expect(
      classifyProposedMutation({
        operation: 'SKIP',
        incoming: { id: 'biletix_a', source: 'biletix', externalId: 'A', status: 'published' },
        existingById: { id: 'biletix_a', status: 'published' },
      })
    ).toBe('EXPECTED_REFRESH')
  })
})
