/**
 * Phase P6 synthetic simulator tests.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { assertSyntheticAllowed } from '@/services/synthetic/SyntheticSimulatorService'
import { isSyntheticSimulatorEnabled } from '@/lib/seo/featureFlag'

describe('P6 synthetic prod reject', () => {
  const env = process.env
  beforeEach(() => {
    process.env = { ...env, NODE_ENV: 'production', SYNTHETIC_SIMULATOR_ENABLED: 'true' }
  })
  afterEach(() => {
    process.env = env
  })

  it('flag false in production even when env true', () => {
    expect(isSyntheticSimulatorEnabled()).toBe(false)
  })

  it('assertSyntheticAllowed throws in production', () => {
    expect(() => assertSyntheticAllowed()).toThrow(/production/i)
  })
})

describe('P6 synthetic dev gate', () => {
  const env = process.env
  beforeEach(() => {
    process.env = { ...env, NODE_ENV: 'development', SYNTHETIC_SIMULATOR_ENABLED: 'true' }
  })
  afterEach(() => {
    process.env = env
  })

  it('allowed when flag on in dev', () => {
    expect(isSyntheticSimulatorEnabled()).toBe(true)
    expect(() => assertSyntheticAllowed()).not.toThrow()
  })
})
