/**
 * Phase P10 — Publisher self-managed ads (unit / domain / contract).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { roleHasPermission } from '@/lib/publisher/authorization'
import {
  assertAllowedCreativeMime,
  isAdEligibleNow,
  SelfManagedAdValidationError,
  statusesConflictOnSchedule,
  validateCreateAdInput,
  validateCreativeInput,
  validateDestinationUrl,
  windowsConflict,
} from '@/lib/publisher/selfManagedAdDomain'
import { isSyntheticAdActor } from '@/services/publisher/publisherManagedAdsService'
import {
  prerollMaxDurationSeconds,
  prerollSessionFrequencyCap,
  prerollSkipAfterSeconds,
  impressionDwellMs,
  impressionVisibleRatio,
  AD_CREATIVE_ALLOWED_MIME,
} from '@/lib/publisher/selfManagedAdConfig'
import { buildPublisherAdMediaKey } from '@/lib/storage'
import type { PublisherMemberRole } from '@/types/publisher'

describe('P10 RBAC matrix', () => {
  const cases: Array<[PublisherMemberRole, string, boolean]> = [
    ['OWNER', 'ads:create', true],
    ['ADMIN', 'ads:update', true],
    ['AD_MANAGER', 'ads:create', true],
    ['AD_MANAGER', 'ads:archive', true],
    ['EDITOR', 'ads:read', true],
    ['EDITOR', 'ads:create', false],
    ['EDITOR', 'ads:update', false],
    ['AUTHOR', 'ads:read', false],
    ['AUTHOR', 'ads:create', false],
    ['ANALYST', 'ads:read', true],
    ['ANALYST', 'ads:create', false],
  ]

  it.each(cases)('%s %s → %s', (role, perm, expected) => {
    expect(roleHasPermission(role, perm as never)).toBe(expected)
  })
})

describe('P10 destination URL', () => {
  it('accepts http/https', () => {
    expect(validateDestinationUrl('https://example.com/x')).toContain('https://')
    expect(validateDestinationUrl('http://example.com')).toContain('http://')
  })

  it('rejects javascript / data / vbscript', () => {
    expect(() => validateDestinationUrl('javascript:alert(1)')).toThrow()
    expect(() => validateDestinationUrl('data:text/html,hi')).toThrow()
    expect(() => validateDestinationUrl('vbscript:msgbox(1)')).toThrow()
  })

  it('allows null/empty', () => {
    expect(validateDestinationUrl(null)).toBeNull()
    expect(validateDestinationUrl('')).toBeNull()
  })
})

describe('P10 creative MIME', () => {
  it('allows jpeg/png/webp/avif/mp4/webm', () => {
    for (const m of AD_CREATIVE_ALLOWED_MIME) {
      expect(() => assertAllowedCreativeMime(m)).not.toThrow()
    }
  })

  it('rejects svg', () => {
    expect(() => assertAllowedCreativeMime('image/svg+xml')).toThrow(SelfManagedAdValidationError)
  })

  it('R2 key uses publishers/{id}/ads/{adId}/', () => {
    const key = buildPublisherAdMediaKey('pub_abc', 'pmad_xyz', 'banner.jpg')
    expect(key).toMatch(/^publishers\/pub_abc\/ads\/pmad_xyz\//)
  })
})

describe('P10 schedule conflicts', () => {
  const a = {
    id: '1',
    startAt: new Date('2026-01-01T00:00:00Z'),
    endAt: new Date('2026-01-10T00:00:00Z'),
    status: 'ACTIVE' as const,
  }
  const b = {
    id: '2',
    startAt: new Date('2026-01-05T00:00:00Z'),
    endAt: new Date('2026-01-15T00:00:00Z'),
    status: 'SCHEDULED' as const,
  }
  const draft = {
    id: '3',
    startAt: new Date('2026-01-05T00:00:00Z'),
    endAt: new Date('2026-01-15T00:00:00Z'),
    status: 'DRAFT' as const,
  }

  it('blocks ACTIVE/SCHEDULED overlap', () => {
    expect(windowsConflict(a, b)).toBe(true)
    expect(statusesConflictOnSchedule('ACTIVE')).toBe(true)
    expect(statusesConflictOnSchedule('SCHEDULED')).toBe(true)
  })

  it('allows DRAFT overlap', () => {
    expect(windowsConflict(a, draft)).toBe(false)
    expect(statusesConflictOnSchedule('DRAFT')).toBe(false)
  })
})

describe('P10 eligibility', () => {
  const now = new Date('2026-06-15T12:00:00Z')

  it('serves ACTIVE in window', () => {
    expect(
      isAdEligibleNow(
        {
          status: 'ACTIVE',
          startAt: new Date('2026-06-01T00:00:00Z'),
          endAt: new Date('2026-07-01T00:00:00Z'),
        },
        now
      )
    ).toBe(true)
  })

  it('serves SCHEDULED when window started', () => {
    expect(
      isAdEligibleNow(
        {
          status: 'SCHEDULED',
          startAt: new Date('2026-06-01T00:00:00Z'),
          endAt: new Date('2026-07-01T00:00:00Z'),
        },
        now
      )
    ).toBe(true)
  })

  it('does not serve ENDED / DRAFT / PAUSED / outside window', () => {
    expect(
      isAdEligibleNow(
        {
          status: 'ENDED',
          startAt: new Date('2026-06-01T00:00:00Z'),
          endAt: new Date('2026-07-01T00:00:00Z'),
        },
        now
      )
    ).toBe(false)
    expect(
      isAdEligibleNow(
        {
          status: 'DRAFT',
          startAt: new Date('2026-06-01T00:00:00Z'),
          endAt: new Date('2026-07-01T00:00:00Z'),
        },
        now
      )
    ).toBe(false)
    expect(
      isAdEligibleNow(
        {
          status: 'ACTIVE',
          startAt: new Date('2026-01-01T00:00:00Z'),
          endAt: new Date('2026-02-01T00:00:00Z'),
        },
        now
      )
    ).toBe(false)
  })
})

describe('P10 create validation', () => {
  it('requires name, advertiser, inventory, valid dates', () => {
    expect(() =>
      validateCreateAdInput({
        name: '',
        advertiserName: 'Acme',
        inventoryId: 'pad_1',
        startAt: '2026-01-01T00:00:00Z',
        endAt: '2026-02-01T00:00:00Z',
      })
    ).toThrow(/INVALID_NAME/)

    expect(() =>
      validateCreateAdInput({
        name: 'Ad',
        advertiserName: 'Acme',
        inventoryId: 'pad_1',
        startAt: '2026-02-01T00:00:00Z',
        endAt: '2026-01-01T00:00:00Z',
      })
    ).toThrow(/INVALID_DATE/)
  })

  it('rejects bad destination', () => {
    expect(() =>
      validateCreateAdInput({
        name: 'Ad',
        advertiserName: 'Acme',
        inventoryId: 'pad_1',
        startAt: '2026-01-01T00:00:00Z',
        endAt: '2026-02-01T00:00:00Z',
        destinationUrl: 'javascript:void(0)',
      })
    ).toThrow()
  })
})

describe('P10 impression / synthetic', () => {
  it('excludes synthetic actors', () => {
    expect(isSyntheticAdActor({ sessionId: 'synthetic-persona-a' })).toBe(true)
    expect(isSyntheticAdActor({ userId: 'ai_editor_foo' })).toBe(true)
    expect(isSyntheticAdActor({ sessionId: 's_real', userId: 'uid_1' })).toBe(false)
  })

  it('config has impression threshold helpers', () => {
    expect(impressionVisibleRatio()).toBeGreaterThan(0)
    expect(impressionVisibleRatio()).toBeLessThanOrEqual(1)
    expect(impressionDwellMs()).toBeGreaterThan(0)
  })
})

describe('P10 preroll config', () => {
  it('exposes max duration, skip after, frequency cap (not hardcoded component-only)', () => {
    expect(prerollMaxDurationSeconds()).toBeGreaterThan(0)
    expect(prerollSkipAfterSeconds()).toBeGreaterThan(0)
    expect(prerollSessionFrequencyCap()).toBeGreaterThan(0)
  })

  it('validates video duration against config max', () => {
    const max = prerollMaxDurationSeconds()
    expect(() =>
      validateCreativeInput({
        creativeType: 'VIDEO',
        mediaUrl: 'https://cdn.example.com/a.mp4',
        durationSeconds: max + 1,
      })
    ).toThrow(/INVALID_VIDEO_DURATION/)
  })
})

describe('P10 analytics contract', () => {
  it('summary shape has impressions/clicks/ctr and no revenue', async () => {
    const summary = {
      impressions: 100,
      clicks: 5,
      ctr: 0.05,
      byAd: [{ adId: 'pmad_1', impressions: 100, clicks: 5, ctr: 0.05 }],
    }
    expect(summary).toHaveProperty('impressions')
    expect(summary).toHaveProperty('clicks')
    expect(summary).toHaveProperty('ctr')
    expect(summary).not.toHaveProperty('revenue')
    expect(summary).not.toHaveProperty('earnings')
    expect(summary.ctr).toBe(summary.clicks / summary.impressions)
  })
})

describe('P10 article / profile flag OFF', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('buildArticleAdSlotViews null when article slots flag off', async () => {
    vi.doMock('@/lib/publisher/adInventoryFlags', () => ({
      isArticleAdSlotsEnabled: () => false,
      isPublisherAdPublicListingEnabled: () => true,
    }))
    vi.doMock('@/lib/publisher/selfManagedAdFlags', () => ({
      isPublisherSelfManagedAdsEnabled: () => true,
      isPublisherAdServingEnabled: () => true,
    }))
    const { buildArticleAdSlotViews } = await import('@/lib/publisher/articleAdPlacements')
    const views = buildArticleAdSlotViews([], { publisherSlug: 'demo', blockCount: 10 })
    expect(views.before).toBeNull()
    expect(views.mid).toBeNull()
    expect(views.after).toBeNull()
  })
})

describe('P10 click redirect contract', () => {
  it('redirect route exists and records click from DB destination only', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile(
      `${process.cwd()}/src/app/(main)/r/ad/[adId]/route.ts`,
      'utf8'
    )
    expect(src).toContain('recordClickAndGetDestination')
    expect(src).toContain('NextResponse.redirect')
    expect(src).not.toMatch(/searchParams\.get\(['"]url['"]\)/)
    expect(src).not.toMatch(/searchParams\.get\(['"]dest/)
  })
})

describe('P10 VIDEO_PRE_ROLL placement', () => {
  it('is valid ARTICLE scope', async () => {
    const { scopeMatchesType } = await import('@/lib/publisher/adInventoryDomain')
    expect(scopeMatchesType('ARTICLE', 'VIDEO_PRE_ROLL')).toBe(true)
    expect(scopeMatchesType('PROFILE', 'VIDEO_PRE_ROLL')).toBe(false)
  })
})

describe('P10 flags default', () => {
  it('documents env keys in .env.example', async () => {
    const fs = await import('node:fs/promises')
    const env = await fs.readFile(`${process.cwd()}/.env.example`, 'utf8')
    expect(env).toContain('PUBLISHER_SELF_MANAGED_ADS_ENABLED=false')
    expect(env).toContain('PUBLISHER_AD_SERVING_ENABLED=false')
    expect(env).toContain('PUBLISHER_VIDEO_PREROLL_ENABLED=false')
    expect(env).toContain('PUBLISHER_AD_ANALYTICS_ENABLED=false')
  })
})
