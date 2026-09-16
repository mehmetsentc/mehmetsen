/**
 * Publisher-only Profil nav + /profile gate.
 * AUTOMATED — NOT HUMAN GO / NOT deploy.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isPublisherProfilePath,
  resolvePublisherProfileHref,
} from '@/lib/nav/publisherProfileNav'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('resolvePublisherProfileHref', () => {
  it('returns null when user has no publisher membership', () => {
    expect(resolvePublisherProfileHref([])).toBeNull()
    expect(resolvePublisherProfileHref(null)).toBeNull()
  })

  it('routes single membership to public publisher profile', () => {
    expect(resolvePublisherProfileHref([{ slug: 'cumhuriyet' }])).toBe('/publisher/cumhuriyet')
  })

  it('routes multi membership to studio picker', () => {
    expect(
      resolvePublisherProfileHref([{ slug: 'a' }, { slug: 'b' }])
    ).toBe('/publisher-studio')
  })
})

describe('isPublisherProfilePath', () => {
  it('marks own publisher + studio + legacy profile paths', () => {
    expect(isPublisherProfilePath('/publisher/cumhuriyet', [{ slug: 'cumhuriyet' }])).toBe(true)
    expect(isPublisherProfilePath('/publisher-studio/cumhuriyet', [{ slug: 'cumhuriyet' }])).toBe(
      true
    )
    expect(isPublisherProfilePath('/profile/mehmet', [{ slug: 'cumhuriyet' }])).toBe(true)
    expect(isPublisherProfilePath('/publisher/other', [{ slug: 'cumhuriyet' }])).toBe(false)
  })
})

describe('Profil gate wiring', () => {
  it('MobileNav shows Profil only via publisher href helper', () => {
    const dock = read('src/components/layout/MobileNav.tsx')
    expect(dock).toContain('useMyPublishers')
    expect(dock).toContain('resolvePublisherProfileHref')
    expect(dock).toContain('publisherHref')
    expect(dock).not.toContain('ROUTES.PROFILE(user.username || user.uid)')
    expect(dock).not.toContain('listPublishersForUser')
  })

  it('useProfile refetches when SSR missed the user', () => {
    const hook = read('src/hooks/useProfile.ts')
    expect(hook).toContain('fromServer && Boolean(initialProfile)')
    expect(hook).not.toContain("fromServer && !initialProfile ? 'Kullanıcı bulunamadı'")
  })

  it('ProfilePageClient gates non-publishers and redirects own profile', () => {
    const page = read('src/components/profile/ProfilePageClient.tsx')
    expect(page).toContain('useMyPublishers')
    expect(page).toContain('Yayıncı profili gerekli')
    expect(page).toContain('Profil yalnızca yayıncılara açık')
    expect(page).toContain('resolvePublisherProfileHref')
    expect(page).toContain('router.replace')
  })

  it('Sidebar hides consumer Profilim; publishers get Yayıncı profilim', () => {
    const side = read('src/components/layout/Sidebar.tsx')
    expect(side).toContain('useMyPublishers')
    expect(side).toContain('Yayıncı profilim')
    expect(side).not.toContain('ROUTES.PROFILE(user.username || user.uid)')
    expect(side).not.toContain('ROUTES.PROFILE(user.username)')
  })

  it('useMyPublishers loads memberships without studio filter', () => {
    const hook = read('src/hooks/useMyPublishers.ts')
    expect(hook).toContain('/api/me/publishers')
    expect(hook).not.toContain('/api/publisher-studio/mine')
  })
})
