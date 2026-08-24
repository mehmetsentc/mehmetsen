import { describe, expect, it } from 'vitest'
import { getHardcodedTenant } from '@/lib/tenant'

describe('HARDCODED_TENANTS', () => {
  it('resolves Çanakkale city tenant', () => {
    expect(getHardcodedTenant('canakkale')).toEqual({
      slug: 'canakkale',
      displayName: 'Çanakkale',
      provinceSlug: 'canakkale',
      domain: 'canakkale.nahaber.com',
    })
  })

  it('resolves Antalya city tenant (mirrors Çanakkale)', () => {
    expect(getHardcodedTenant('antalya')).toEqual({
      slug: 'antalya',
      displayName: 'Antalya',
      provinceSlug: 'antalya',
      domain: 'antalya.nahaber.com',
    })
  })

  it('returns null for unknown slugs', () => {
    expect(getHardcodedTenant('izmir')).toBeNull()
    expect(getHardcodedTenant('')).toBeNull()
  })
})
