import { describe, expect, it } from 'vitest'
import { isWellFormedAccountId } from './accountStore'
import { accountIdFor } from './types'

describe('TIKTOK-1 account id', () => {
  it('a connected TikTok account id is well formed (scope save, post dialog, ledger)', () => {
    const id = accountIdFor('tiktok', '-000AbCdEf_123-xyz')
    expect(id).toBe('tiktok_-000AbCdEf_123-xyz')
    expect(isWellFormedAccountId(id)).toBe(true)
    expect(isWellFormedAccountId('tiktok_')).toBe(false)
    expect(isWellFormedAccountId('snapchat_123')).toBe(false)
  })
})
