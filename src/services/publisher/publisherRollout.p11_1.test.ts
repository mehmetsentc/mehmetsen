/**
 * Phase P11.1 — allowlist overrides global-false (resolver contract).
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  FEATURE_ENV_KEYS,
  resolveFeatureForPublisher,
} from '@/lib/publisher/rolloutMatrix'
import { isFeatureEnabledForPublisher } from '@/lib/publisher/effectiveFlags'
import { publisherFeatureAccessService } from '@/services/publisher/publisherFeatureAccessService'

const FLAG_KEYS = Object.values(FEATURE_ENV_KEYS)

describe('P11.1 allowlist overrides global-false', () => {
  const prev: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of FLAG_KEYS) {
      prev[k] = process.env[k]
      process.env[k] = 'false'
    }
  })

  afterEach(() => {
    for (const k of FLAG_KEYS) {
      if (prev[k] === undefined) delete process.env[k]
      else process.env[k] = prev[k]
    }
    vi.restoreAllMocks()
  })

  it('resolves AD_SERVING via allowlist when all globals false', () => {
    const keys = new Set([
      'PLATFORM',
      'STUDIO',
      'AD_INVENTORY',
      'SELF_MANAGED_ADS',
      'AD_SERVING',
    ])
    const r = resolveFeatureForPublisher({
      featureKey: 'AD_SERVING',
      allowlistedKeys: keys,
    })
    expect(r.enabled).toBe(true)
    expect(r.source).toBe('allowlist')
  })

  it('denies AD_SERVING for empty allowlist when globals false', () => {
    const r = resolveFeatureForPublisher({
      featureKey: 'AD_SERVING',
      allowlistedKeys: new Set(),
    })
    expect(r.enabled).toBe(false)
  })

  it('isFeatureEnabledForPublisher uses DB allowlist when globals false', async () => {
    vi.spyOn(publisherFeatureAccessService, 'isEnabledForPublisher').mockResolvedValue(true)
    const enabled = await isFeatureEnabledForPublisher('pub_pilot', 'AD_SERVING')
    expect(enabled).toBe(true)

    vi.spyOn(publisherFeatureAccessService, 'isEnabledForPublisher').mockResolvedValue(false)
    const denied = await isFeatureEnabledForPublisher('pub_other', 'AD_SERVING')
    expect(denied).toBe(false)
  })
})
