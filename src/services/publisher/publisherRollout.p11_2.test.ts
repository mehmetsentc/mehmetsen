/**
 * Phase P11.2 — studio page gate + placement labels + storage UX contract.
 */
import { describe, expect, it } from 'vitest'
import { AD_PLACEMENT_SCOPE_LABELS } from '@/types/publisherAdInventory'
import { isR2Configured } from '@/lib/storage'

describe('P11.2 owner UX contracts', () => {
  it('placement scopes have human Turkish labels (no raw enum as sole label)', () => {
    expect(AD_PLACEMENT_SCOPE_LABELS.PROFILE_INLINE).toBe('Profil içi')
    expect(AD_PLACEMENT_SCOPE_LABELS.ARTICLE_MID_BODY).toBe('Makale ortası')
    expect(AD_PLACEMENT_SCOPE_LABELS.VIDEO_PRE_ROLL).toBe('Video öncesi')
    for (const [key, label] of Object.entries(AD_PLACEMENT_SCOPE_LABELS)) {
      expect(label).not.toBe(key)
      expect(label.length).toBeGreaterThan(2)
    }
  })

  it('isR2Configured requires account + access + secret (names only asserted)', () => {
    const prev = {
      a: process.env.R2_ACCOUNT_ID,
      k: process.env.R2_ACCESS_KEY_ID,
      s: process.env.R2_SECRET_ACCESS_KEY,
    }
    delete process.env.R2_ACCOUNT_ID
    delete process.env.R2_ACCESS_KEY_ID
    delete process.env.R2_SECRET_ACCESS_KEY
    expect(isR2Configured()).toBe(false)
    if (prev.a !== undefined) process.env.R2_ACCOUNT_ID = prev.a
    if (prev.k !== undefined) process.env.R2_ACCESS_KEY_ID = prev.k
    if (prev.s !== undefined) process.env.R2_SECRET_ACCESS_KEY = prev.s
  })
})
