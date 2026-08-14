import { describe, expect, it } from 'vitest'
import { canAccessResource } from '@/lib/cms/rbacScope'
import type { ScopedPermissionGrant } from '@/types/newsroomOs'

describe('canAccessResource', () => {
  it('super_admin bypasses scopes', () => {
    expect(
      canAccessResource({
        role: 'super_admin',
        permission: 'news:edit',
        grants: [],
        resource: { citySlug: 'izmir' },
      })
    ).toBe(true)
  })

  it('falls back to role matrix without grants', () => {
    expect(
      canAccessResource({
        role: 'editor',
        permission: 'news:edit',
        resource: { citySlug: 'canakkale' },
      })
    ).toBe(true)
    expect(
      canAccessResource({
        role: 'author',
        permission: 'news:publish',
      })
    ).toBe(false)
  })

  it('enforces city scope when grants present', () => {
    const grants: ScopedPermissionGrant[] = [
      {
        permission: 'news:edit',
        scopes: [{ kind: 'city', citySlug: 'canakkale' }],
      },
    ]
    expect(
      canAccessResource({
        role: 'editor',
        permission: 'news:edit',
        grants,
        resource: { citySlug: 'canakkale' },
      })
    ).toBe(true)
    expect(
      canAccessResource({
        role: 'editor',
        permission: 'news:edit',
        grants,
        resource: { citySlug: 'istanbul' },
      })
    ).toBe(false)
  })

  it('matches category scope', () => {
    const grants: ScopedPermissionGrant[] = [
      { permission: 'news:edit', scopes: [{ kind: 'category', categoryId: 'spor' }] },
    ]
    expect(
      canAccessResource({
        role: 'editor',
        permission: 'news:edit',
        grants,
        resource: { categoryId: 'spor' },
      })
    ).toBe(true)
  })
})
