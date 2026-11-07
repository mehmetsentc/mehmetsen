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

import { parsePublishScope } from './publishScope'

describe('TIKTOK-1 publish scope', () => {
  const base = { geo: { kind: 'any' }, allCategories: true, formats: [] as string[], manualAccess: 'managers' }
  it('a video-only account (no post/story format) saves its scope without a format', () => {
    expect(parsePublishScope(base, []).ok).toBe(true)
  })
  it('accounts with image formats still need at least one', () => {
    expect(parsePublishScope(base, ['post', 'story'])).toMatchObject({ ok: false, message: 'En az bir biçim seçin' })
  })
})
