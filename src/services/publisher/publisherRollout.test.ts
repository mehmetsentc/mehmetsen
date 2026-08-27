/**
 * Phase P11 — rollout matrix, dependency graph, allowlist validation.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  ALLOWLISTABLE_FEATURES,
  CONSUMER_STAGE_FEATURES,
  FEATURE_DEPENDENCIES,
  FEATURE_ENV_KEYS,
  dependencyClosure,
  getOperatorChecklist,
  resolveFeatureForPublisher,
  validateAllowlistGrant,
} from '@/lib/publisher/rolloutMatrix'
import { PUBLISHER_ROLLOUT_FEATURE_KEYS } from '@/types/publisherRollout'

const FLAG_KEYS = Object.values(FEATURE_ENV_KEYS)

describe('P11 feature inventory', () => {
  it('covers all rollout keys with env mapping', () => {
    for (const key of PUBLISHER_ROLLOUT_FEATURE_KEYS) {
      expect(FEATURE_ENV_KEYS[key]).toBeTruthy()
      expect(FEATURE_DEPENDENCIES[key]).toBeDefined()
    }
  })

  it('documents env keys as false in .env.example', async () => {
    const fs = await import('node:fs/promises')
    const env = await fs.readFile(`${process.cwd()}/.env.example`, 'utf8')
    for (const envKey of FLAG_KEYS) {
      expect(env).toContain(`${envKey}=`)
    }
    expect(env).toContain('COMMERCIAL_LEDGER_ENABLED=false')
    expect(env).toContain('PAYMENT_INTENT_ENABLED=false')
  })

  it('keeps consumer features out of allowlistable set', () => {
    for (const f of CONSUMER_STAGE_FEATURES) {
      expect(ALLOWLISTABLE_FEATURES.includes(f)).toBe(false)
    }
  })
})

describe('P11 dependency graph', () => {
  it('encodes brief dependencies', () => {
    expect(FEATURE_DEPENDENCIES.STUDIO).toEqual(['PLATFORM'])
    expect(FEATURE_DEPENDENCIES.PROFILE_COMPOSER).toEqual(['STUDIO'])
    expect(FEATURE_DEPENDENCIES.MANUAL_PUBLISH).toEqual(['CONTENT_STUDIO'])
    expect(FEATURE_DEPENDENCIES.SELF_MANAGED_ADS).toEqual(['AD_INVENTORY'])
    expect(FEATURE_DEPENDENCIES.AD_SERVING).toEqual(['SELF_MANAGED_ADS'])
    expect(FEATURE_DEPENDENCIES.VIDEO_PREROLL).toEqual(['AD_SERVING'])
    expect(FEATURE_DEPENDENCIES.SMART_FEED_RANKING).toEqual(['SMART_FEED'])
  })

  it('builds transitive closure for VIDEO_PREROLL', () => {
    const closure = dependencyClosure('VIDEO_PREROLL')
    expect(closure).toContain('PLATFORM')
    expect(closure).toContain('STUDIO')
    expect(closure).toContain('AD_INVENTORY')
    expect(closure).toContain('SELF_MANAGED_ADS')
    expect(closure).toContain('AD_SERVING')
  })
})

describe('P11 resolveFeatureForPublisher', () => {
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
  })

  it('blocks STUDIO when PLATFORM missing from allowlist', () => {
    const r = resolveFeatureForPublisher({
      featureKey: 'STUDIO',
      allowlistedKeys: new Set(['STUDIO']),
    })
    expect(r.enabled).toBe(false)
    expect(r.source).toBe('dependency_blocked')
    expect(r.missingDependencies).toContain('PLATFORM')
  })

  it('enables STUDIO when PLATFORM+STUDIO allowlisted', () => {
    const r = resolveFeatureForPublisher({
      featureKey: 'STUDIO',
      allowlistedKeys: new Set(['PLATFORM', 'STUDIO']),
    })
    expect(r.enabled).toBe(true)
    expect(r.source).toBe('allowlist')
  })

  it('rejects SMART_FEED allowlist grant', () => {
    const v = validateAllowlistGrant({
      featureKey: 'SMART_FEED',
      allowlistedKeys: new Set(),
    })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('NOT_ALLOWLISTABLE')
  })

  it('rejects SELF_MANAGED_ADS without AD_INVENTORY deps', () => {
    const v = validateAllowlistGrant({
      featureKey: 'SELF_MANAGED_ADS',
      allowlistedKeys: new Set(['PLATFORM', 'STUDIO']),
    })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toMatch(/^MISSING_DEPS/)
  })

  it('falls back off when nothing enabled', () => {
    const r = resolveFeatureForPublisher({
      featureKey: 'PLATFORM',
      allowlistedKeys: new Set(),
    })
    expect(r.enabled).toBe(false)
    expect(r.source).toBe('off')
  })
})

describe('P11 operator checklist', () => {
  it('stage 0–5 return non-empty checklists', () => {
    for (const stage of [0, 1, 2, 3, 4, 5] as const) {
      const list = getOperatorChecklist(stage)
      expect(list.length).toBeGreaterThan(3)
      expect(list.some((l) => l.toLowerCase().includes('payment') || l.includes('payment'))).toBe(
        true
      )
    }
  })
})

describe('P11 docs present', () => {
  it('has rollout doc', async () => {
    const fs = await import('node:fs/promises')
    const doc = await fs.readFile(
      `${process.cwd()}/docs/PHASE_P11_PUBLISHER_ROLLOUT.md`,
      'utf8'
    )
    expect(doc).toContain('| 0 | dark |')
    expect(doc).toContain('Allowlist')
    expect(doc).toContain('Payment')
    expect(doc).toContain('Pilot')
  })
})
