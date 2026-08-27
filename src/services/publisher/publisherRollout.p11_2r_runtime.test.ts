/**
 * P11.2R-RUNTIME — presence helper contract (no secrets).
 */
import { describe, expect, it } from 'vitest'
import { isR2Configured } from '@/lib/storage'
import { R2StorageProvider } from '@/lib/storage/r2Client'

describe('P11.2R-RUNTIME storage contracts', () => {
  it('R2StorageProvider exposes download for runtime diagnostic', () => {
    expect(typeof R2StorageProvider.prototype.download).toBe('function')
  })

  it('local empty R2 does not invent configuration', () => {
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
