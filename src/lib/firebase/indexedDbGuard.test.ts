import { describe, expect, it } from 'vitest'
import { isIndexedDbBackingStoreError } from './indexedDbGuard'

describe('indexedDb backing store guard', () => {
  it('recognizes the Chromium IndexedDB open failure', () => {
    const error = new Error('Internal error opening backing store for indexedDB.open.')
    expect(isIndexedDbBackingStoreError(error)).toBe(true)
    expect(isIndexedDbBackingStoreError(error.message)).toBe(true)
  })

  it('ignores unrelated failures', () => {
    expect(isIndexedDbBackingStoreError(new Error('Kayıt başarısız'))).toBe(false)
    expect(isIndexedDbBackingStoreError(null)).toBe(false)
  })
})
