import { describe, expect, it } from 'vitest'
import {
  isUserFacingNavProductEnabled,
  USER_NAV_PRODUCTS,
} from '@/lib/nav/userNavAvailability'
import { getSwipeableFeedDestinations } from '@/constants/config'
import { SIDEBAR_TOOLS } from '@/constants/sidebarNav'
import { ROUTES } from '@/constants/routes'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('user-facing Skor availability', () => {
  it('hides Skor from shared rail and hamburger tools without deleting the product', () => {
    expect(USER_NAV_PRODUCTS.skor.enabled).toBe(false)
    expect(isUserFacingNavProductEnabled('skor')).toBe(false)
    expect(getSwipeableFeedDestinations().some((d) => d.id === 'skor')).toBe(false)
    expect(SIDEBAR_TOOLS.some((d) => d.id === 'skor')).toBe(false)
    expect(ROUTES.SKOR).toBe('/skor')
  })

  it('keeps a reusable enable flag and does not delete taxonomy/schema', () => {
    const availability = readFileSync(
      join(process.cwd(), 'src/lib/nav/userNavAvailability.ts'),
      'utf8'
    )
    const config = readFileSync(join(process.cwd(), 'src/constants/config.ts'), 'utf8')
    expect(availability).toContain("reason: 'live-score-product-unavailable'")
    expect(config).toContain("isUserFacingNavProductEnabled('skor')")
    expect(config).toContain("id: 'skor'")
    expect(config).toContain('ROUTES.SKOR')
  })
})
